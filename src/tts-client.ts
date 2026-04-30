import {
  MIN_TTS_REQUEST_INTERVAL_MS,
  buildMimoTtsEndpoint,
  type MimoModel,
} from "./constants";
import type { MimoTtsSettings } from "./settings";
import { requestUrl } from "obsidian";

export interface TtsRequestOptions {
  text: string;
  styleInstruction?: string;
  model?: MimoModel;
  voice?: string;
  format?: "wav" | "pcm16";
  signal?: AbortSignal;
}

export interface TtsSynthesisResult {
  audioData: ArrayBuffer;
  format: string;
}

const MAX_SYNTHESIS_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 800;
const RETRY_BACKOFF_FACTOR = 2;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * MiMo TTS API client.
 * Uses Obsidian's `requestUrl` to call the chat/completions endpoint and
 * decodes base64 audio from the response.
 */
export class MimoTtsClient {
  private settings: MimoTtsSettings;
  private voiceCloneDataUri: string | null = null;
  private nextRequestStartAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();

  constructor(settings: MimoTtsSettings) {
    this.settings = settings;
  }

  updateSettings(settings: MimoTtsSettings): void {
    this.settings = settings;
  }

  /**
   * Pre-load voice clone audio as a data URI for the voiceclone model.
   * Call this before synthesize() when using mimo-v2.5-tts-voiceclone.
   */
  setVoiceCloneAudio(audioBytes: ArrayBuffer, mimeType: string): void {
    const base64 = arrayBufferToBase64(audioBytes);
    this.voiceCloneDataUri = `data:${mimeType};base64,${base64}`;
  }

  clearVoiceCloneAudio(): void {
    this.voiceCloneDataUri = null;
  }

  async synthesize(options: TtsRequestOptions): Promise<TtsSynthesisResult> {
    const {
      text,
      styleInstruction,
      model = this.settings.model,
      voice,
      format = "wav",
      signal,
    } = options;

    if (!this.settings.apiKey) {
      throw new Error("MiMo API key is not configured. Please set it in plugin settings.");
    }

    if (!text.trim()) {
      throw new Error("Cannot synthesize empty text.");
    }

    const messages = this.buildMessages(text, styleInstruction, model);
    const audioConfig = this.buildAudioConfig(model, voice, format);

    const body = JSON.stringify({
      model,
      messages,
      audio: audioConfig,
    });

    const endpoint = buildMimoTtsEndpoint(this.settings.apiBase);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_SYNTHESIS_ATTEMPTS; attempt++) {
      try {
        await this.waitForRequestSlot(signal);
        const json = await fetchTtsBody(endpoint, this.settings.apiKey, body);

        const audioBase64 = json?.choices?.[0]?.message?.audio?.data;

        if (!audioBase64) {
          const error = new Error("No audio data in MiMo TTS response.");
          lastError = error;

          if (attempt === MAX_SYNTHESIS_ATTEMPTS) {
            throw error;
          }

          await waitBeforeRetry(attempt, signal);
          continue;
        }

        return {
          audioData: base64ToArrayBuffer(audioBase64),
          format,
        };
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          throw error;
        }

        if (!isRetryableNetworkError(error) || attempt === MAX_SYNTHESIS_ATTEMPTS) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        await waitBeforeRetry(attempt, signal);
      }
    }

    throw lastError || new Error("MiMo TTS synthesis failed.");
  }

  private async waitForRequestSlot(signal?: AbortSignal): Promise<void> {
    const previous = this.requestQueue.catch(() => undefined);
    const current = previous.then(async () => {
      throwIfAborted(signal);

      const delayMs = Math.max(0, this.nextRequestStartAt - Date.now());
      if (delayMs > 0) {
        await wait(delayMs, signal);
      }

      throwIfAborted(signal);
      this.nextRequestStartAt = Date.now() + MIN_TTS_REQUEST_INTERVAL_MS;
    });

    this.requestQueue = current.catch(() => undefined);
    return current;
  }

  private buildMessages(
    text: string,
    styleInstruction: string | undefined,
    model: MimoModel
  ): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];

    // User message: style instruction (or voice design prompt)
    if (model === "mimo-v2.5-tts-voicedesign") {
      // VoiceDesign model requires user message as voice description
      const prompt = this.settings.voiceDesignPrompt || styleInstruction || "";
      if (!prompt.trim()) {
        throw new Error("VoiceDesign model requires a voice description. Please set 'Voice description' in plugin settings.");
      }
      messages.push({ role: "user", content: prompt });
    } else if (styleInstruction || this.settings.styleInstruction) {
      messages.push({
        role: "user",
        content: styleInstruction || this.settings.styleInstruction,
      });
    }

    // Assistant message: text to synthesize
    messages.push({ role: "assistant", content: text });

    return messages;
  }

  private buildAudioConfig(
    model: MimoModel,
    voice: string | undefined,
    format: string
  ): Record<string, string> {
    const audio: Record<string, string> = { format };

    if (model === "mimo-v2.5-tts") {
      audio.voice = voice || this.settings.presetVoice || "冰糖";
    } else if (model === "mimo-v2.5-tts-voicedesign") {
      // VoiceDesign: voice field not needed
    } else if (model === "mimo-v2.5-tts-voiceclone") {
      // VoiceClone: voice should be a data URI with base64 audio sample
      // Format: data:{MIME_TYPE};base64,{BASE64_AUDIO}
      const cloneVoice = voice || this.voiceCloneDataUri;
      if (!cloneVoice) {
        throw new Error(
          "VoiceClone model requires a loaded audio sample. Please configure a valid 'Voice clone audio path' in plugin settings."
        );
      }
      audio.voice = cloneVoice;
    }

    return audio;
  }
}

// MiMo API response types
interface MimoApiResponse {
  choices?: {
    message?: {
      audio?: {
        data?: string;
      };
    };
  }[];
}

async function fetchTtsBody(
  url: string,
  apiKey: string,
  body: string
): Promise<MimoApiResponse> {
  const response = await requestUrl({
    url,
    method: "POST",
    contentType: "application/json",
    headers: {
      "api-key": apiKey,
    },
    body,
    throw: false,
  });

  const status: number = response.status;

  if (!isSuccessStatus(status)) {
    const errorText = response.text || "Unknown error";
    throw new Error(`MiMo TTS API error (${status}): ${errorText}`);
  }

  const json = response.json as MimoApiResponse | undefined;

  if (!json) {
    throw new Error("Invalid JSON in MiMo TTS response.");
  }

  return json;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function isRetryableNetworkError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof SyntaxError;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeAbortError = error as { name?: string };
  return maybeAbortError.name === "AbortError";
}

function waitBeforeRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
  return wait(delayMs, signal);
}

function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);

    const abort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}
