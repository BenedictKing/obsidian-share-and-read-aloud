import { buildMimoTtsEndpoint, type MimoModel } from "./constants";
import type { MimoTtsSettings } from "./settings";

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

/**
 * MiMo TTS API client.
 * Calls the chat/completions endpoint and decodes base64 audio from the response.
 */
export class MimoTtsClient {
  private settings: MimoTtsSettings;
  private voiceCloneDataUri: string | null = null;

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
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.settings.apiKey,
      },
      body,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`MiMo TTS API error (${response.status}): ${errorText}`);
    }

    const json = await response.json() as MimoApiResponse;
    const audioBase64 = json?.choices?.[0]?.message?.audio?.data;

    if (!audioBase64) {
      throw new Error("No audio data in MiMo TTS response.");
    }

    return {
      audioData: base64ToArrayBuffer(audioBase64),
      format,
    };
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
        throw new Error("VoiceDesign model requires a voice description. Please set 'Voice Description' in plugin settings.");
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
          "VoiceClone model requires a loaded audio sample. Please configure a valid 'Voice Clone Audio Path' in plugin settings."
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
