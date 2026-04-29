import { PLAYBACK_SPEEDS, type PlaybackSpeed } from "./constants";
import type { PlayerState } from "./audio-player";

export interface PlayerBarCallbacks {
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  onSeek: (segmentIndex: number) => void;
}

/**
 * Floating bottom player bar for TTS playback control.
 * Renders using Obsidian's native DOM API.
 */
export class PlayerBar {
  private containerEl: HTMLElement | null = null;
  private rootEl: HTMLElement | null = null;
  private callbacks: PlayerBarCallbacks;

  // UI element references
  private playPauseBtn: HTMLButtonElement | null = null;
  private stopBtn: HTMLButtonElement | null = null;
  private prevBtn: HTMLButtonElement | null = null;
  private nextBtn: HTMLButtonElement | null = null;
  private segmentLabel: HTMLElement | null = null;
  private progressSlider: HTMLInputElement | null = null;
  private speedBtn: HTMLButtonElement | null = null;
  private textPreview: HTMLElement | null = null;

  private totalSegments = 0;
  private currentSpeed: PlaybackSpeed = 1.0;

  constructor(containerEl: HTMLElement, callbacks: PlayerBarCallbacks) {
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.currentSpeed = 1.0;
  }

  show(): void {
    if (this.rootEl) return; // already shown

    this.rootEl = document.createElement("div");
    this.rootEl.addClass("mimo-tts-player-bar");
    this.containerEl?.appendChild(this.rootEl);

    this.render();
  }

  hide(): void {
    this.rootEl?.remove();
    this.rootEl = null;
    this.playPauseBtn = null;
  }

  updateState(state: PlayerState): void {
    if (!this.playPauseBtn) return;

    switch (state) {
      case "playing":
        this.playPauseBtn.textContent = "⏸";
        this.playPauseBtn.setAttribute("aria-label", "Pause");
        break;
      case "paused":
        this.playPauseBtn.textContent = "▶";
        this.playPauseBtn.setAttribute("aria-label", "Resume");
        break;
      case "idle":
      case "stopped":
        this.playPauseBtn.textContent = "▶";
        this.playPauseBtn.setAttribute("aria-label", "Play");
        break;
    }
  }

  updateSegment(current: number, total: number, segmentText?: string): void {
    this.totalSegments = total;
    if (this.segmentLabel) {
      this.segmentLabel.textContent = `${current + 1}/${total}`;
    }
    if (this.progressSlider) {
      this.progressSlider.max = String(Math.max(total - 1, 0));
      this.progressSlider.value = String(current);
    }
    if (this.textPreview && segmentText) {
      // Show first 80 chars of current segment
      this.textPreview.textContent =
        segmentText.length > 80 ? segmentText.slice(0, 80) + "…" : segmentText;
    }
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.currentSpeed = speed;
    if (this.speedBtn) {
      this.speedBtn.textContent = `${speed}x`;
    }
  }

  destroy(): void {
    this.hide();
  }

  private render(): void {
    if (!this.rootEl) return;
    this.rootEl.empty();

    // Row 1: Controls
    const controlsRow = this.rootEl.createDiv("mimo-tts-controls");

    this.prevBtn = controlsRow.createEl("button", {
      text: "⏮",
      cls: "mimo-tts-btn",
    });
    this.prevBtn.setAttribute("aria-label", "Previous segment");
    this.prevBtn.onclick = () => this.callbacks.onPrev();

    this.playPauseBtn = controlsRow.createEl("button", {
      text: "⏸",
      cls: "mimo-tts-btn mimo-tts-btn-play",
    });
    this.playPauseBtn.setAttribute("aria-label", "Pause");
    this.playPauseBtn.onclick = () => this.callbacks.onPlayPause();

    this.stopBtn = controlsRow.createEl("button", {
      text: "⏹",
      cls: "mimo-tts-btn",
    });
    this.stopBtn.setAttribute("aria-label", "Stop");
    this.stopBtn.onclick = () => this.callbacks.onStop();

    this.nextBtn = controlsRow.createEl("button", {
      text: "⏭",
      cls: "mimo-tts-btn",
    });
    this.nextBtn.setAttribute("aria-label", "Next segment");
    this.nextBtn.onclick = () => this.callbacks.onNext();

    // Separator
    controlsRow.createSpan({ text: "│", cls: "mimo-tts-separator" });

    // Segment label
    this.segmentLabel = controlsRow.createSpan({
      text: "0/0",
      cls: "mimo-tts-segment-label",
    });

    // Separator
    controlsRow.createSpan({ text: "│", cls: "mimo-tts-separator" });

    // Progress slider
    this.progressSlider = controlsRow.createEl("input", {
      cls: "mimo-tts-progress",
    }) as HTMLInputElement;
    this.progressSlider.type = "range";
    this.progressSlider.min = "0";
    this.progressSlider.max = "0";
    this.progressSlider.value = "0";
    this.progressSlider.oninput = () => {
      const index = parseInt(this.progressSlider!.value, 10);
      this.callbacks.onSeek(index);
    };

    // Separator
    controlsRow.createSpan({ text: "│", cls: "mimo-tts-separator" });

    // Speed button
    this.speedBtn = controlsRow.createEl("button", {
      text: `${this.currentSpeed}x`,
      cls: "mimo-tts-btn mimo-tts-btn-speed",
    });
    this.speedBtn.setAttribute("aria-label", "Change playback speed");
    this.speedBtn.onclick = () => this.cycleSpeed();

    // Row 2: Text preview
    this.textPreview = this.rootEl.createDiv("mimo-tts-text-preview");
    this.textPreview.textContent = "";
  }

  private cycleSpeed(): void {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(this.currentSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    this.setSpeed(nextSpeed);
    this.callbacks.onSpeedChange(nextSpeed);
  }
}
