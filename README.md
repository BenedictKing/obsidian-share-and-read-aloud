**English** | [中文](./README.zh.md)

# Share & Read Aloud

An Obsidian plugin that cleans Markdown into readable text for sharing/copying, or reads it aloud via TTS.

## Features

### Text cleaning & sharing

- Cleans Markdown (frontmatter, links, code blocks, tables, etc.) into readable plain text
- System share → clipboard fallback → preview modal

### TTS read aloud

- Synthesizes speech from the cloud TTS API for the current note or selected text
- Long text is split into balanced segments; subsequent segments are prefetched with at least 1s between request starts
- Playback controls: pause/resume, previous/next segment, progress slider, speed toggle (0.75x–2.0x)
- IndexedDB audio cache to avoid redundant API calls
- Save audio to vault (WAV)

## Commands

### Share / Copy

| Command | Description |
|---------|-------------|
| Share cleaned current note | Share the current note via system share sheet |
| Copy cleaned current note | Copy cleaned note text to clipboard |
| Share cleaned selected text | Share selected text via system share sheet |
| Copy cleaned selected text | Copy cleaned selected text to clipboard |

### TTS read aloud

| Command | Description |
|---------|-------------|
| Read note aloud | Read the entire current note |
| Read selection aloud | Read the selected text |
| Stop reading | Stop playback |
| Pause/Resume reading | Pause or resume playback |
| Save current TTS audio to vault | Export current audio to a WAV file in your vault |
| Clear TTS audio cache | Clear all cached audio |

## Settings

Configure under Obsidian Settings → Community plugins → Share & Read Aloud:

- **API key** — MiMo platform API key (get one at [platform.xiaomimimo.com](https://platform.xiaomimimo.com))
- **Model** — TTS model (preset voice / voice design / voice clone)
- **Voice** — Preset voice selection (Bingtang, Moli, Suda, Baihua, Mia, Chloe, etc.)
- **Style instruction** — Style directive (e.g., "read gently and steadily")
- **Default playback speed** — Initial playback speed
- **Target segment characters** — Target character count per group (recommended: 300–500)
- **Concurrent prefetch groups** — Number of segments to prefetch (default: 4; requests spaced ≥1s apart)
- **Cache** — Cache toggle and expiry days
- **UI** — Player bar and toast notification toggles

## Installation

### Community plugins

In Obsidian, go to Settings → Community plugins and search for **Share & Read Aloud**, then click Install.

### Manual

Copy these files into `.obsidian/plugins/share-and-read-aloud/`:

- `manifest.json`
- `main.js`
- `styles.css`

### Development

```bash
npm install
npm run build
```

## Project structure

```text
obsidian-share-and-read-aloud/
├── src/
│   ├── main.ts              # Plugin entry + command registration
│   ├── settings.ts          # Settings interface + settings tab
│   ├── constants.ts         # API config, voice presets
│   ├── normalize.ts         # Markdown text cleaning
│   ├── tts-client.ts        # MiMo TTS API client
│   ├── text-segmenter.ts    # Long text segmentation
│   ├── audio-player.ts      # Audio playback engine
│   ├── audio-cache.ts       # IndexedDB cache
│   ├── player-bar.ts        # Playback control bar UI
├── docs/
│   └── mimo-tts-api.md      # MiMo TTS API documentation
├── esbuild.config.mjs
├── eslint.config.mjs
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
└── versions.json
```

## MiMo TTS preset voices

| Voice | ID | Language | Gender |
|-------|-----|----------|--------|
| Bingtang | `冰糖` | Chinese | Female |
| Moli | `茉莉` | Chinese | Female |
| Suda | `苏打` | Chinese | Male |
| Baihua | `白桦` | Chinese | Male |
| Mia | `Mia` | English | Female |
| Chloe | `Chloe` | English | Female |
| Milo | `Milo` | English | Male |
| Dean | `Dean` | English | Male |

## Style control

Supports audio style tags in the text:

- `(Happy)What a beautiful day!`
- `(Lazy)Let me sleep five more minutes…`
- `(Deep)The night has fallen, but the city breathes on.`

Natural language style instructions are also supported — fill in the Style instruction field in settings.

## License

[MIT](./LICENSE)
