import { Notice } from "obsidian";
import type { TextSegment } from "./text-segmenter";
import type { MimoTtsClient } from "./tts-client";
import type { AudioCache } from "./audio-cache";
import { buildCacheKey } from "./audio-cache";
import type { MimoTtsSettings } from "./settings";
import { MIMO_MODELS, PRESET_VOICES, DEFAULT_PREFETCH_COUNT, buildMimoTtsEndpoint } from "./constants";

export type PlayerState = "idle" | "playing" | "paused" | "stopped";

export interface PlayerCallbacks {
  onStateChange: (state: PlayerState) => void;
  onSegmentChange: (segmentIndex: number, total: number) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

/**
 * Manages sequential playback of synthesized TTS segments.
 * Handles synthesis, caching, pre-fetching, and playback control.
 */
export class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private segments: TextSegment[] = [];
  private currentIndex = 0;
  private state: PlayerState = "idle";
  private playbackRate = 1.0;

  private ttsClient: MimoTtsClient;
  private cache: AudioCache | null = null;
  private settings: MimoTtsSettings;
  private callbacks: PlayerCallbacks;

  private prefetchCount = DEFAULT_PREFETCH_COUNT;
  private prefetchBuffer = new Map<number, ArrayBuffer>();
  private abortController: AbortController | null = null;
  private playGeneration = 0;

  constructor(
    ttsClient: MimoTtsClient,
    settings: MimoTtsSettings,
    callbacks: PlayerCallbacks
  ) {
    this.ttsClient = ttsClient;
    this.settings = settings;
    this.callbacks = callbacks;
    this.playbackRate = settings.playbackSpeed;
  }

  setCache(cache: AudioCache): void {
    this.cache = cache;
  }

  updateSettings(settings: MimoTtsSettings): void {
    this.settings = settings;
    this.playbackRate = settings.playbackSpeed;
    this.ttsClient.updateSettings(settings);
    if (this.cache) {
      this.cache.setExpiryDays(settings.cacheExpiryDays);
    }
  }

  getState(): PlayerState {
    return this.state;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }

  getTotalSegments(): number {
    return this.segments.length;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
  }

  async play(segments: TextSegment[], startIndex = 0): Promise<void> {
    if (segments.length === 0) {
      this.callbacks.onError(new Error("No text segments to read."));
      return;
    }

    // Stop any ongoing playback and abort in-flight requests
    this.stopInternal(false);

    // Bump generation to invalidate any in-flight requests from prior playback
    this.playGeneration++;
    const generation = this.playGeneration;

    this.segments = segments;
    this.currentIndex = startIndex;
    this.prefetchBuffer.clear();
    this.abortController = new AbortController();

    this.setState("playing");
    await this.playSegment(startIndex, generation);
  }

  async resume(): Promise<void> {
    if (this.state === "paused" && this.audio) {
      await this.audio.play();
      this.setState("playing");
    }
  }

  pause(): void {
    if (this.state === "playing" && this.audio) {
      this.audio.pause();
      this.setState("paused");
    }
  }

  togglePause(): void {
    if (this.state === "playing") {
      this.pause();
    } else if (this.state === "paused") {
      void this.resume();
    }
  }

  stop(): void {
    this.stopInternal(true);
  }

  async nextSegment(): Promise<void> {
    if (this.currentIndex < this.segments.length - 1) {
      // Use stop to abort in-flight requests and bump generation
      const nextIndex = this.currentIndex + 1;
      this.stopInternal(false);
      this.playGeneration++;
      this.abortController = new AbortController();
      this.setState("playing");
      await this.playSegment(nextIndex, this.playGeneration);
    }
  }

  async prevSegment(): Promise<void> {
    if (this.currentIndex > 0) {
      const prevIndex = this.currentIndex - 1;
      this.stopInternal(false);
      this.playGeneration++;
      this.abortController = new AbortController();
      this.setState("playing");
      await this.playSegment(prevIndex, this.playGeneration);
    }
  }

  /**
   * Get the audio data for saving to vault.
   */
  async getAudioForSave(): Promise<ArrayBuffer | null> {
    if (this.currentIndex < this.segments.length) {
      return await this.getSegmentAudio(this.segments[this.currentIndex]);
    }
    return null;
  }

  destroy(): void {
    this.stopInternal(false);
    this.cache?.close();
  }

  // --- Private ---

  private async playSegment(index: number, generation?: number): Promise<void> {
    const gen = generation ?? this.playGeneration;
    if (index >= this.segments.length) {
      this.setState("idle");
      this.callbacks.onComplete();
      return;
    }

    // Discard stale results from a previous playback session
    if (gen !== this.playGeneration) return;

    this.currentIndex = index;
    this.callbacks.onSegmentChange(index, this.segments.length);

    try {
      const audioData = await this.getSegmentAudio(this.segments[index]);
      // Re-check generation after async fetch
      if (gen !== this.playGeneration) return;

      await this.playAudioData(audioData);
      if (gen !== this.playGeneration) return;

      // Prefetch next segments in background
      void this.prefetchNext(index);

      // When this segment ends, play next
      if (this.audio) {
        this.audio.onended = () => {
          void this.playSegment(index + 1, gen);
        };
      }
    } catch (error) {
      if (gen !== this.playGeneration) return;
      // Transition to idle so user can restart playback
      this.setState("idle");
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async getSegmentAudio(segment: TextSegment): Promise<ArrayBuffer> {
    // Check prefetch buffer
    const prefetched = this.prefetchBuffer.get(segment.index);
    if (prefetched) {
      this.prefetchBuffer.delete(segment.index);
      return prefetched;
    }

    // Check cache
    if (this.settings.cacheEnabled && this.cache) {
      const cacheKey = this.buildSegmentCacheKey(segment);
      const cached = await this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Synthesize via API
    const result = await this.ttsClient.synthesize({
      text: segment.text,
      signal: this.abortController?.signal,
    });

    // Store in cache
    if (this.settings.cacheEnabled && this.cache) {
      const cacheKey = this.buildSegmentCacheKey(segment);
      void this.cache.set(cacheKey, result.audioData, result.format).catch(() => {
        // Cache write failure is non-fatal
      });
    }

    return result.audioData;
  }

  private async playAudioData(audioData: ArrayBuffer): Promise<void> {
    this.stopAudio();

    const blob = new Blob([audioData], { type: "audio/wav" });
    this.currentBlobUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.currentBlobUrl);
    this.audio.playbackRate = this.playbackRate;

    return new Promise((resolve, reject) => {
      if (!this.audio) {
        reject(new Error("Failed to create audio element."));
        return;
      }

      this.audio.onerror = () => {
        reject(new Error("Audio playback error."));
      };

      this.audio.oncanplaythrough = () => {
        void this.audio!.play().then(resolve).catch(reject);
      };
    });
  }

  private async prefetchNext(currentIndex: number): Promise<void> {
    if (!this.settings.cacheEnabled) return;

    for (let i = 1; i <= this.prefetchCount; i++) {
      const nextIndex = currentIndex + i;
      if (nextIndex >= this.segments.length) break;
      if (this.prefetchBuffer.has(nextIndex)) continue;

      const segment = this.segments[nextIndex];
      try {
        const audioData = await this.getSegmentAudio(segment);
        if (this.state !== "stopped") {
          this.prefetchBuffer.set(nextIndex, audioData);
        }
      } catch {
        // Prefetch failure is non-fatal
      }
    }
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }

  private stopInternal(notify: boolean): void {
    this.stopAudio();
    // Invalidate all in-flight requests so their results are discarded
    this.playGeneration++;
    this.abortController?.abort();
    this.abortController = null;
    this.prefetchBuffer.clear();
    if (notify) {
      this.setState("stopped");
    }
  }

  private setState(state: PlayerState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private buildSegmentCacheKey(segment: TextSegment): string {
    const voice =
      this.settings.model === "mimo-v2.5-tts"
        ? this.settings.presetVoice
        : this.settings.model === "mimo-v2.5-tts-voicedesign"
          ? this.settings.voiceDesignPrompt
          : this.settings.voiceCloneAudioHash || this.settings.voiceCloneAudioPath || "clone";

    return buildCacheKey(
      segment.text,
      this.settings.model,
      voice,
      this.settings.styleInstruction,
      "wav",
      buildMimoTtsEndpoint(this.settings.apiBase)
    );
  }
}
