import { App, PluginSettingTab, Setting } from "obsidian";
import type ShareCleanTextPlugin from "./main";
import {
  MIMO_API_BASE,
  MIMO_MODELS,
  PRESET_VOICES,
  PLAYBACK_SPEEDS,
  DEFAULT_MAX_SEGMENT_CHARS,
  DEFAULT_PREFETCH_COUNT,
  MAX_PREFETCH_COUNT,
  MIN_TTS_REQUEST_INTERVAL_MS,
  DEFAULT_CACHE_EXPIRY_DAYS,
  STYLE_TAG_EXAMPLES,
  type MimoModel,
  type PlaybackSpeed,
} from "./constants";

export interface MimoTtsSettings {
  apiKey: string;
  apiBase: string;
  model: MimoModel;
  presetVoice: string;
  voiceDesignPrompt: string;
  voiceCloneAudioPath: string;
  voiceCloneAudioHash: string;
  styleInstruction: string;
  playbackSpeed: PlaybackSpeed;
  cacheEnabled: boolean;
  cacheExpiryDays: number;
  showPlayerBar: boolean;
  showNotice: boolean;
  maxSegmentChars: number;
  prefetchCount: number;
}

export const DEFAULT_SETTINGS: MimoTtsSettings = {
  apiKey: "",
  apiBase: MIMO_API_BASE,
  model: "mimo-v2.5-tts",
  presetVoice: "冰糖",
  voiceDesignPrompt: "",
  voiceCloneAudioPath: "",
  voiceCloneAudioHash: "",
  styleInstruction: "",
  playbackSpeed: 1.0,
  cacheEnabled: true,
  cacheExpiryDays: DEFAULT_CACHE_EXPIRY_DAYS,
  showPlayerBar: true,
  showNotice: true,
  maxSegmentChars: DEFAULT_MAX_SEGMENT_CHARS,
  prefetchCount: DEFAULT_PREFETCH_COUNT,
};

export class MimoTtsSettingTab extends PluginSettingTab {
  private plugin: ShareCleanTextPlugin;

  constructor(app: App, plugin: ShareCleanTextPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Share & Read Aloud" });

    this.renderApiSection(containerEl);
    this.renderVoiceSection(containerEl);
    this.renderPlaybackSection(containerEl);
    this.renderCacheSection(containerEl);
    this.renderUiSection(containerEl);
  }

  private renderApiSection(container: HTMLElement): void {
    container.createEl("h3", { text: "MiMo TTS API" });

    new Setting(container)
      .setName("API Key")
      .setDesc("Your MiMo API key from platform.xiaomimimo.com")
      .addText((text) => {
        text
          .setPlaceholder("Enter API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
        text.inputEl.style.width = "320px";
      });

    new Setting(container)
      .setName("API Base URL")
      .setDesc("Base URL ending at /v1. The plugin appends /chat/completions automatically. Token-plan keys usually use https://token-plan-sgp.xiaomimimo.com/v1")
      .addText((text) => {
        text
          .setPlaceholder(MIMO_API_BASE)
          .setValue(this.plugin.settings.apiBase)
          .onChange(async (value) => {
            this.plugin.settings.apiBase = value.trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = "420px";
      });

    new Setting(container)
      .setName("Model")
      .setDesc("TTS model to use")
      .addDropdown((dropdown) => {
        for (const m of MIMO_MODELS) {
          dropdown.addOption(m.id, m.name);
        }
        dropdown.setValue(this.plugin.settings.model);
        dropdown.onChange(async (value) => {
          this.plugin.settings.model = value as MimoModel;
          await this.plugin.saveSettings();
          this.display(); // re-render to show/hide voice options
        });
      });
  }

  private renderVoiceSection(container: HTMLElement): void {
    container.createEl("h3", { text: "Voice" });
    const { model } = this.plugin.settings;

    if (model === "mimo-v2.5-tts") {
      new Setting(container)
        .setName("Preset Voice")
        .setDesc("Select a preset voice for synthesis")
        .addDropdown((dropdown) => {
          for (const v of PRESET_VOICES) {
            dropdown.addOption(v.id, `${v.name} (${v.language}, ${v.gender})`);
          }
          dropdown.setValue(this.plugin.settings.presetVoice);
          dropdown.onChange(async (value) => {
            this.plugin.settings.presetVoice = value;
            await this.plugin.saveSettings();
          });
        });
    }

    if (model === "mimo-v2.5-tts-voicedesign") {
      new Setting(container)
        .setName("Voice Description")
        .setDesc("Describe the voice you want (e.g., '温柔的年轻女性，语速适中')")
        .addTextArea((text) => {
          text
            .setPlaceholder("A warm young female voice speaking at a moderate pace")
            .setValue(this.plugin.settings.voiceDesignPrompt)
            .onChange(async (value) => {
              this.plugin.settings.voiceDesignPrompt = value;
              await this.plugin.saveSettings();
            });
          text.inputEl.style.width = "100%";
          text.inputEl.rows = 3;
        });
    }

    if (model === "mimo-v2.5-tts-voiceclone") {
      new Setting(container)
        .setName("Voice Clone Audio Path")
        .setDesc("Path to an audio sample file in your vault (.mp3 or .wav) for voice cloning")
        .addText((text) => {
          text
            .setPlaceholder("e.g., voices/sample.mp3")
            .setValue(this.plugin.settings.voiceCloneAudioPath)
            .onChange(async (value) => {
              this.plugin.settings.voiceCloneAudioPath = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.style.width = "320px";
        });
    }

    new Setting(container)
      .setName("Style Instruction")
      .setDesc("Optional natural language style control (placed in user message)")
      .addTextArea((text) => {
        text
          .setPlaceholder(
            "e.g., 用温柔平稳的语调朗读，语速稍慢"
          )
          .setValue(this.plugin.settings.styleInstruction)
          .onChange(async (value) => {
            this.plugin.settings.styleInstruction = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = "100%";
        text.inputEl.rows = 2;
      });

    container.createEl("p", {
      text: `Style tag examples: ${STYLE_TAG_EXAMPLES.join("  |  ")}`,
      cls: "setting-item-description",
    });
  }

  private renderPlaybackSection(container: HTMLElement): void {
    container.createEl("h3", { text: "Playback" });

    new Setting(container)
      .setName("Default Playback Speed")
      .setDesc("Initial playback speed for TTS audio")
      .addDropdown((dropdown) => {
        for (const speed of PLAYBACK_SPEEDS) {
          dropdown.addOption(String(speed), `${speed}x`);
        }
        dropdown.setValue(String(this.plugin.settings.playbackSpeed));
        dropdown.onChange(async (value) => {
          this.plugin.settings.playbackSpeed = parseFloat(value) as PlaybackSpeed;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("Target Segment Characters")
      .setDesc("Target character count per TTS group. Short paragraphs are balanced into groups near this size; 300-500 is recommended.")
      .addText((text) => {
        text
          .setPlaceholder("300")
          .setValue(String(this.plugin.settings.maxSegmentChars))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxSegmentChars = num;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(container)
      .setName("Concurrent Prefetch Groups")
      .setDesc(`How many TTS groups to prepare ahead of playback. API request starts are spaced by at least ${MIN_TTS_REQUEST_INTERVAL_MS / 1000}s. Default: ${DEFAULT_PREFETCH_COUNT}; max: ${MAX_PREFETCH_COUNT}.`)
      .addText((text) => {
        text
          .setPlaceholder(String(DEFAULT_PREFETCH_COUNT))
          .setValue(String(this.plugin.settings.prefetchCount))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 1 && num <= MAX_PREFETCH_COUNT) {
              this.plugin.settings.prefetchCount = num;
              await this.plugin.saveSettings();
            }
          });
      });
  }

  private renderCacheSection(container: HTMLElement): void {
    container.createEl("h3", { text: "Cache" });

    new Setting(container)
      .setName("Enable Audio Cache")
      .setDesc("Cache synthesized audio in IndexedDB to avoid redundant API calls")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.cacheEnabled);
        toggle.onChange(async (value) => {
          this.plugin.settings.cacheEnabled = value;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (this.plugin.settings.cacheEnabled) {
      new Setting(container)
        .setName("Cache Expiry (days)")
        .setDesc("Auto-remove cached audio older than this many days")
        .addText((text) => {
          text
            .setPlaceholder("7")
            .setValue(String(this.plugin.settings.cacheExpiryDays))
            .onChange(async (value) => {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num > 0) {
                this.plugin.settings.cacheExpiryDays = num;
                await this.plugin.saveSettings();
              }
            });
        });
    }
  }

  private renderUiSection(container: HTMLElement): void {
    container.createEl("h3", { text: "User Interface" });

    new Setting(container)
      .setName("Show Player Bar")
      .setDesc("Display a floating player bar at the bottom during playback")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showPlayerBar);
        toggle.onChange(async (value) => {
          this.plugin.settings.showPlayerBar = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(container)
      .setName("Show Notices")
      .setDesc("Display toast notifications for TTS events (start, error, etc.)")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showNotice);
        toggle.onChange(async (value) => {
          this.plugin.settings.showNotice = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
