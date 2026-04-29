// API configuration
export const MIMO_API_BASE = "https://token-plan-sgp.xiaomimimo.com/v1";
export const MIMO_TTS_PATH = "/chat/completions";

export function normalizeMimoApiBase(apiBase?: string): string {
  let normalized = (apiBase || MIMO_API_BASE).trim();
  if (!normalized) normalized = MIMO_API_BASE;
  normalized = normalized.replace(/\/+$/, "");
  if (normalized.endsWith(MIMO_TTS_PATH)) {
    normalized = normalized.slice(0, -MIMO_TTS_PATH.length).replace(/\/+$/, "");
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("Invalid MiMo API Base URL. Please enter a valid URL such as https://token-plan-sgp.xiaomimimo.com/v1.");
  }
}

export function buildMimoTtsEndpoint(apiBase?: string): string {
  return `${normalizeMimoApiBase(apiBase)}${MIMO_TTS_PATH}`;
}

// Models
export type MimoModel =
  | "mimo-v2.5-tts"
  | "mimo-v2.5-tts-voicedesign"
  | "mimo-v2.5-tts-voiceclone";

export const MIMO_MODELS: { id: MimoModel; name: string }[] = [
  { id: "mimo-v2.5-tts", name: "MiMo-V2.5-TTS (Preset Voice)" },
  { id: "mimo-v2.5-tts-voicedesign", name: "MiMo-V2.5-TTS (Voice Design)" },
  { id: "mimo-v2.5-tts-voiceclone", name: "MiMo-V2.5-TTS (Voice Clone)" },
];

// Preset voices for mimo-v2.5-tts
export interface VoicePreset {
  id: string;
  name: string;
  language: string;
  gender: string;
}

export const PRESET_VOICES: VoicePreset[] = [
  { id: "mimo_default", name: "MiMo Default", language: "auto", gender: "-" },
  { id: "冰糖", name: "冰糖 (Bingtang)", language: "zh", gender: "female" },
  { id: "茉莉", name: "茉莉 (Moli)", language: "zh", gender: "female" },
  { id: "苏打", name: "苏打 (Suda)", language: "zh", gender: "male" },
  { id: "白桦", name: "白桦 (Baihua)", language: "zh", gender: "male" },
  { id: "Mia", name: "Mia", language: "en", gender: "female" },
  { id: "Chloe", name: "Chloe", language: "en", gender: "female" },
  { id: "Milo", name: "Milo", language: "en", gender: "male" },
  { id: "Dean", name: "Dean", language: "en", gender: "male" },
];

// Playback speeds
export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

// Default settings
export const DEFAULT_MAX_SEGMENT_CHARS = 300;
export const DEFAULT_PREFETCH_COUNT = 2;
export const DEFAULT_CACHE_EXPIRY_DAYS = 7;

// Audio sample rate from MiMo
export const MIMO_SAMPLE_RATE = 24000;

// Style tag examples for settings UI
export const STYLE_TAG_EXAMPLES = [
  "(开心)今天天气真好！",
  "(慵懒)再让我睡五分钟……",
  "(磁性)夜已经深了，城市还在呼吸。",
  "(紧张，深呼吸)呼……冷静，冷静。",
];
