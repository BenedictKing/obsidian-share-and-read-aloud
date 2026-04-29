# MiMo TTS API Documentation (v2.5)

> Source: [MiMo Platform Docs](https://platform.xiaomimimo.com/#/docs/api/tts)

## Endpoint

```
POST https://token-plan-sgp.xiaomimimo.com/v1/chat/completions
```

For token-plan API keys with the `tp-` prefix, use the token-plan regional endpoint above. The generic OpenAI-compatible endpoint is `https://api.xiaomimimo.com/v1/chat/completions`.

In plugin settings, set **API Base URL** to the base path only, for example `https://token-plan-sgp.xiaomimimo.com/v1`. The plugin appends `/chat/completions` automatically.

## Authentication

```
Header: api-key: <your-api-key>
```

Note: Uses `api-key` header, NOT `Authorization: Bearer`.

## Request Body

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    {
      "role": "user",
      "content": "Style instruction (optional)"
    },
    {
      "role": "assistant",
      "content": "Text to synthesize"
    }
  ],
  "audio": {
    "format": "wav",
    "voice": "Chloe"
  }
}
```

### Key Rules

- Synthesis text MUST be in `role: assistant` message.
- `role: user` message is optional — use for style control via natural language.
- For `mimo-v2.5-tts-voicedesign`, user message is REQUIRED (voice description).
- Audio tag control goes in assistant content prefix: `(happy)Text content here`.

## Response

```json
{
  "choices": [
    {
      "message": {
        "audio": {
          "data": "<base64-encoded-audio>"
        }
      }
    }
  ]
}
```

## Models

| Model | Model ID | Features |
|-------|----------|----------|
| MiMo-V2.5-TTS | `mimo-v2.5-tts` | Preset voices, style control |
| MiMo-V2.5-TTS-VoiceDesign | `mimo-v2.5-tts-voicedesign` | Text-described voice design |
| MiMo-V2.5-TTS-VoiceClone | `mimo-v2.5-tts-voiceclone` | Audio sample voice cloning |

## Preset Voices

| Name | Voice ID | Language | Gender |
|------|----------|----------|--------|
| MiMo Default | `mimo_default` | CN cluster: 冰糖, others: Mia | |
| 冰糖 | `冰糖` | Chinese | Female |
| 茉莉 | `茉莉` | Chinese | Female |
| 苏打 | `苏打` | Chinese | Male |
| 白桦 | `白桦` | Chinese | Male |
| Mia | `Mia` | English | Female |
| Chloe | `Chloe` | English | Female |
| Milo | `Milo` | English | Male |
| Dean | `Dean` | English | Male |

## Audio Formats

- `wav` — Direct playback, recommended for non-streaming
- `pcm16` — Raw PCM16LE 24kHz mono, recommended for streaming (needs WAV header for playback)

## Style Control

### Natural Language (in user message)
```
"用轻快上扬的语调向领导报喜，语速稍快，带着查到成绩后压抑不住的激动与小骄傲"
```

### Audio Tags (in assistant content prefix)
```
(happy 活泼)Hello world!
(慵懒)再让我睡五分钟……
(紧张，深呼吸)呼……冷静，冷静。
```

Supported tag categories:
- **Emotion**: 开心/悲伤/愤怒/恐惧/惊讶/兴奋/委屈/平静/冷漠
- **Compound**: 怅然/欣慰/无奈/愧疚/释然/嫉妒/厌倦/忐忑/动情
- **Tone**: 温柔/高冷/活泼/严肃/慵懒/俏皮/深沉/干练/凌厉
- **Timbre**: 磁性/醇厚/清亮/空灵/稚嫩/苍老/甜美/沙哑/醇雅
- **Character**: 夹子音/御姐音/正太音/大叔音/台湾腔
- **Dialect**: 东北话/四川话/河南话/粤语
- **Roleplay**: 孙悟空/林黛玉
- **Singing**: 唱歌/sing/singing

## Streaming

Low-latency streaming is NOT yet available. Streaming mode currently degrades to compatibility mode (returns complete result in one stream chunk). Use `pcm16` format for streaming.

## Pricing

Currently free (limited time).

## Director Mode

For complex voice acting, use a structured prompt in user message:

```
角色：百年门阀岑家的现任大当家。
场景：在祠堂的阴影里，看着不顾一切来找她的男人。
指导：冰冷、慵懒却极具威压的低音御姐。语速极慢，每个字都像是在舌尖滚过才吐出来。
```
