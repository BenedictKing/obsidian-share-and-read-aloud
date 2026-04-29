import {
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  TFile,
  TextAreaComponent,
} from "obsidian";
import { normalizeMarkdown } from "./normalize";
import { MimoTtsClient } from "./tts-client";
import { AudioPlayer, type PlayerState } from "./audio-player";
import { AudioCache } from "./audio-cache";
import { TextSegment, segmentText } from "./text-segmenter";
import { PlayerBar } from "./player-bar";
import {
  MimoTtsSettings,
  DEFAULT_SETTINGS,
  MimoTtsSettingTab,
} from "./settings";

const PLUGIN_NAME = "Share Clean Text";

class TextPreviewModal extends Modal {
  private readonly text: string;

  constructor(app: Plugin["app"], text: string) {
    super(app);
    this.text = text;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Cleaned text" });
    contentEl.createEl("p", {
      text: "Automatic share/copy is unavailable in this environment. You can copy the cleaned text manually below.",
    });

    const textArea = new TextAreaComponent(contentEl);
    textArea.setValue(this.text);
    textArea.inputEl.readOnly = true;
    textArea.inputEl.rows = 16;
    textArea.inputEl.style.width = "100%";
    textArea.inputEl.select();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class ShareCleanTextPlugin extends Plugin {
  settings: MimoTtsSettings = DEFAULT_SETTINGS;

  private ttsClient!: MimoTtsClient;
  private audioCache!: AudioCache;
  private audioPlayer!: AudioPlayer;
  private playerBar!: PlayerBar;
  private currentSegments: TextSegment[] = [];

  async onload() {
    await this.loadSettings();

    // Initialize TTS components
    this.ttsClient = new MimoTtsClient(this.settings);
    this.audioCache = new AudioCache(this.settings.cacheExpiryDays);

    this.audioPlayer = new AudioPlayer(this.ttsClient, this.settings, {
      onStateChange: (state) => this.handlePlayerStateChange(state),
      onSegmentChange: (index, total) => this.handleSegmentChange(index, total),
      onError: (error) => this.handlePlayerError(error),
      onComplete: () => this.handlePlayerComplete(),
    });

    if (this.settings.cacheEnabled) {
      this.audioPlayer.setCache(this.audioCache);
      // Purge expired cache on load
      void this.audioCache.purgeExpired().catch(() => {});
    }

    // Settings tab
    this.addSettingTab(new MimoTtsSettingTab(this.app, this));

    // --- Existing share/copy commands ---
    this.addRibbonIcon("share", "Share cleaned current note", () => {
      void this.shareCurrentNote();
    });

    this.addCommand({
      id: "share-cleaned-current-note",
      name: "Share cleaned current note",
      callback: async () => {
        await this.shareCurrentNote();
      },
    });

    this.addCommand({
      id: "copy-cleaned-current-note",
      name: "Copy cleaned current note",
      callback: async () => {
        await this.copyCurrentNote();
      },
    });

    this.addCommand({
      id: "share-cleaned-selected-text",
      name: "Share cleaned selected text",
      editorCheckCallback: (checking, editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (!hasSelection) return false;
        if (!checking) {
          void this.shareSelection(editor);
        }
        return true;
      },
    });

    this.addCommand({
      id: "copy-cleaned-selected-text",
      name: "Copy cleaned selected text",
      editorCheckCallback: (checking, editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (!hasSelection) return false;
        if (!checking) {
          void this.copySelection(editor);
        }
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        const selectedText = editor.getSelection().trim();
        if (!selectedText) return;

        menu.addItem((item) => {
          item
            .setTitle("Share cleaned selection")
            .setIcon("share")
            .onClick(() => {
              void this.shareSelection(editor);
            });
        });

        menu.addItem((item) => {
          item
            .setTitle("Copy cleaned selection")
            .setIcon("copy")
            .onClick(() => {
              void this.copySelection(editor);
            });
        });
      })
    );

    // --- TTS commands ---
    this.addCommand({
      id: "read-note-aloud",
      name: "Read note aloud (MiMo TTS)",
      callback: async () => {
        await this.readCurrentNote();
      },
    });

    this.addCommand({
      id: "read-selection-aloud",
      name: "Read selection aloud",
      editorCheckCallback: (checking, editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (!hasSelection) return false;
        if (!checking) {
          void this.readSelection(editor);
        }
        return true;
      },
    });

    this.addCommand({
      id: "stop-reading",
      name: "Stop reading",
      checkCallback: (checking) => {
        const isActive = this.audioPlayer.getState() !== "idle";
        if (!isActive) return false;
        if (!checking) {
          this.audioPlayer.stop();
        }
        return true;
      },
    });

    this.addCommand({
      id: "pause-resume-reading",
      name: "Pause/Resume reading",
      checkCallback: (checking) => {
        const state = this.audioPlayer.getState();
        const isActive = state === "playing" || state === "paused";
        if (!isActive) return false;
        if (!checking) {
          this.audioPlayer.togglePause();
        }
        return true;
      },
    });

    this.addCommand({
      id: "save-audio-to-vault",
      name: "Save current TTS audio to vault",
      checkCallback: (checking) => {
        const isActive = this.audioPlayer.getState() !== "idle";
        if (!isActive) return false;
        if (!checking) {
          void this.saveAudioToVault();
        }
        return true;
      },
    });

    this.addCommand({
      id: "clear-tts-cache",
      name: "Clear TTS audio cache",
      callback: async () => {
        await this.audioCache.clear();
        new Notice("TTS audio cache cleared.");
      },
    });
  }

  onunload() {
    this.playerBar?.destroy();
    this.audioPlayer?.destroy();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update live components
    this.ttsClient?.updateSettings(this.settings);
    this.audioPlayer?.updateSettings(this.settings);
    if (this.settings.cacheEnabled) {
      this.audioCache?.setExpiryDays(this.settings.cacheExpiryDays);
      // Ensure player has cache reference when toggling from disabled to enabled
      this.audioPlayer?.setCache(this.audioCache);
    }
  }

  // --- TTS ---

  private async readCurrentNote(): Promise<void> {
    if (!this.settings.apiKey) {
      new Notice("Please configure MiMo API key in plugin settings first.");
      return;
    }

    try {
      await this.prepareVoiceCloneAudio();
      const { content, file } = await this.getCurrentNoteContext();
      const cleaned = normalizeMarkdown(content);
      const prepared = this.prependFrontmatterMetadata(file, cleaned);
      await this.synthesizeAndPlay(prepared);
    } catch (error) {
      this.showError(error);
    }
  }

  private async readSelection(editor: Editor): Promise<void> {
    if (!this.settings.apiKey) {
      new Notice("Please configure MiMo API key in plugin settings first.");
      return;
    }

    try {
      await this.prepareVoiceCloneAudio();
      const cleaned = normalizeMarkdown(editor.getSelection());
      if (!cleaned.trim()) {
        new Notice("No readable text in selection.");
        return;
      }
      await this.synthesizeAndPlay(cleaned);
    } catch (error) {
      this.showError(error);
    }
  }

  /**
   * Pre-load voice clone audio from vault when using voiceclone model.
   */
  private async prepareVoiceCloneAudio(): Promise<void> {
    if (this.settings.model !== "mimo-v2.5-tts-voiceclone") {
      this.settings.voiceCloneAudioHash = "";
      this.ttsClient.clearVoiceCloneAudio();
      return;
    }

    const audioPath = this.settings.voiceCloneAudioPath;
    if (!audioPath) {
      throw new Error("Voice clone model requires an audio sample. Please set 'Voice Clone Audio Path' in plugin settings.");
    }

    const file = this.app.vault.getAbstractFileByPath(audioPath);
    if (!(file instanceof TFile)) {
      throw new Error(`Voice clone audio file not found: ${audioPath}`);
    }

    const audioBuffer = await this.app.vault.readBinary(file);
    const ext = file.extension.toLowerCase();
    const mimeType = ext === "wav" ? "audio/wav" : "audio/mpeg";
    this.settings.voiceCloneAudioHash = hashArrayBuffer(audioBuffer);
    this.ttsClient.setVoiceCloneAudio(audioBuffer, mimeType);
  }

  private async synthesizeAndPlay(text: string, lineOffset = 0): Promise<void> {
    const segments = segmentText(text, this.settings.maxSegmentChars, lineOffset);

    if (segments.length === 0) {
      new Notice("No readable content found.");
      return;
    }

    this.currentSegments = segments;

    if (this.settings.showNotice) {
      new Notice(`Reading ${segments.length} segment(s)…`);
    }

    // Show player bar
    if (this.settings.showPlayerBar) {
      this.ensurePlayerBar();
      this.playerBar.show();
      this.playerBar.setSpeed(this.settings.playbackSpeed);
    }

    await this.audioPlayer.play(segments);
  }

  private ensurePlayerBar(): void {
    if (this.playerBar) return;

    const appContainer = document.querySelector(".app-container") as HTMLElement;
    if (!appContainer) return;

    this.playerBar = new PlayerBar(appContainer, {
      onPlayPause: () => this.audioPlayer.togglePause(),
      onStop: () => this.audioPlayer.stop(),
      onPrev: () => void this.audioPlayer.prevSegment(),
      onNext: () => void this.audioPlayer.nextSegment(),
      onSpeedChange: (speed) => {
        this.audioPlayer.setPlaybackRate(speed);
        this.playerBar.setSpeed(speed);
      },
      onSeek: (index) => {
        void this.seekToSegment(index);
      },
    });
  }

  private async seekToSegment(index: number): Promise<void> {
    const state = this.audioPlayer.getState();
    if (state === "idle" || state === "stopped") return;

    // Stop current and re-start from the target segment (full list, with offset)
    this.audioPlayer.stop();

    if (this.currentSegments.length > 0) {
      if (this.settings.showPlayerBar) {
        this.playerBar.show();
      }
      await this.audioPlayer.play(this.currentSegments, index);
    }
  }

  private handlePlayerStateChange(state: PlayerState): void {
    if (this.settings.showPlayerBar && this.playerBar) {
      this.playerBar.updateState(state);
    }
  }

  private handleSegmentChange(index: number, total: number): void {
    if (this.settings.showPlayerBar && this.playerBar) {
      this.playerBar.updateSegment(
        index,
        total,
        this.currentSegments[index]?.text
      );
    }
  }

  private handlePlayerError(error: Error): void {
    console.error(`${PLUGIN_NAME}: TTS error`, error);
    if (this.settings.showNotice) {
      new Notice(`TTS Error: ${error.message}`);
    }
  }

  private handlePlayerComplete(): void {
    if (this.settings.showNotice) {
      new Notice("Reading complete.");
    }
    // Auto-hide player bar after a delay
    setTimeout(() => {
      if (this.audioPlayer.getState() === "idle") {
        this.playerBar?.hide();
      }
    }, 2000);
  }

  private async saveAudioToVault(): Promise<void> {
    try {
      const audioData = await this.audioPlayer.getAudioForSave();
      if (!audioData) {
        new Notice("No audio data available to save.");
        return;
      }

      const blob = new Blob([audioData], { type: "audio/wav" });
      const buffer = await blob.arrayBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `tts-audio-${timestamp}.wav`;

      await this.app.vault.createBinary(filename, buffer);
      new Notice(`Audio saved to ${filename}`);
    } catch (error) {
      this.showError(error);
    }
  }

  // --- Existing share/copy (unchanged) ---

  private async shareSelection(editor: Editor) {
    const cleaned = normalizeMarkdown(editor.getSelection());
    await this.deliverText(cleaned, "share", "selection");
  }

  private async copySelection(editor: Editor) {
    const cleaned = normalizeMarkdown(editor.getSelection());
    await this.deliverText(cleaned, "copy", "selection");
  }

  private async shareCurrentNote() {
    const cleaned = await this.getPreparedCurrentNoteContent();
    await this.deliverText(cleaned, "share", "note");
  }

  private async copyCurrentNote() {
    const cleaned = await this.getPreparedCurrentNoteContent();
    await this.deliverText(cleaned, "copy", "note");
  }

  private async getPreparedCurrentNoteContent(): Promise<string> {
    const { content, file } = await this.getCurrentNoteContext();
    const cleaned = normalizeMarkdown(content);
    return this.prependFrontmatterMetadata(file, cleaned);
  }

  private async getCurrentNoteContext(): Promise<{ content: string; file: TFile }> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      throw new Error("No active Markdown view.");
    }

    const file = this.getActiveMarkdownFile(activeView);
    if (!file) {
      throw new Error("No active Markdown file.");
    }

    const editor = activeView.editor;
    if (editor) {
      return { content: editor.getValue(), file };
    }

    return {
      content: await this.app.vault.cachedRead(file),
      file,
    };
  }

  private prependFrontmatterMetadata(file: TFile, body: string): string {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const title = this.getFrontmatterText(frontmatter, "title") ?? file.basename;
    const description = this.getFrontmatterText(frontmatter, "description");
    const parts = [title, description, body].filter(
      (part): part is string => Boolean(part && part.trim())
    );
    return parts.join("\n\n").trim();
  }

  private getFrontmatterText(
    frontmatter: Record<string, unknown> | undefined,
    key: "title" | "description"
  ): string | null {
    const value = frontmatter?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getActiveMarkdownFile(view?: MarkdownView | MarkdownFileInfo | null): TFile | null {
    const file = view?.file ?? this.app.workspace.getActiveFile();
    return file instanceof TFile ? file : null;
  }

  private async deliverText(text: string, mode: "share" | "copy", scope: "selection" | "note") {
    if (!text.trim()) {
      new Notice(`No readable ${scope} content found.`);
      return;
    }

    if (mode === "copy") {
      const copied = await this.copyToClipboard(text);
      if (copied) {
        new Notice(`Copied cleaned ${scope} text.`);
      } else {
        this.openPreview(text);
      }
      return;
    }

    const shared = await this.shareText(text);
    if (shared === "shared") {
      new Notice(`Shared cleaned ${scope} text.`);
      return;
    }

    if (shared === "cancelled") {
      new Notice("Share cancelled.");
      return;
    }

    const copied = await this.copyToClipboard(text);
    if (copied) {
      new Notice(this.buildFallbackNotice(mode, scope));
      return;
    }

    this.openPreview(text);
  }

  private async shareText(text: string): Promise<"shared" | "cancelled" | "unavailable"> {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return "unavailable";
    }

    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (this.isAbortError(error)) {
        return "cancelled";
      }
      console.warn(`${PLUGIN_NAME}: share failed`, error);
      return "unavailable";
    }
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn(`${PLUGIN_NAME}: clipboard write failed`, error);
      return false;
    }
  }

  private buildFallbackNotice(mode: "share" | "copy", scope: "selection" | "note"): string {
    if (mode === "share") {
      return `Native share is unavailable here. Copied cleaned ${scope} text to clipboard instead.`;
    }
    return `Copied cleaned ${scope} text.`;
  }

  private openPreview(text: string) {
    new TextPreviewModal(this.app, text).open();
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const maybeDomException = error as { name?: string };
    return maybeDomException.name === "AbortError";
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${PLUGIN_NAME}:`, error);
    if (this.settings.showNotice) {
      new Notice(`Error: ${message}`);
    }
  }
}

function hashArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return `voice-${(hash >>> 0).toString(36)}-${bytes.length}`;
}
