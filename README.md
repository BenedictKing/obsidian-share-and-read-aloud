# Share & Read Aloud

Obsidian 插件：将笔记清洗为纯文本后分享/复制，或通过 TTS 朗读。

## 功能

### 文本清洗 & 分享

- 清洗 Markdown（frontmatter、链接、代码块、表格等）为可读纯文本
- 优先调用系统分享 → 回退剪贴板 → 最后弹出预览窗

### TTS 朗读

- 调用云端 TTS API 朗读笔记或选中文本
- 长文本按目标字数均衡分组，支持预生成后续音频，请求启动至少间隔 1 秒
- 播放控制栏：暂停/恢复、上一段/下一段、进度条、倍速切换（0.75x~2.0x）
- IndexedDB 音频缓存，避免重复 API 调用
- 保存音频到 vault（WAV 格式）

## 命令

### 分享/复制

| 命令 | 说明 |
|------|------|
| Share cleaned current note | 分享当前笔记 |
| Copy cleaned current note | 复制当前笔记 |
| Share cleaned selected text | 分享选中文本 |
| Copy cleaned selected text | 复制选中文本 |

### TTS 朗读

| 命令 | 说明 |
|------|------|
| Read note aloud | 朗读整篇笔记 |
| Read selection aloud | 朗读选中文本 |
| Stop reading | 停止播放 |
| Pause/Resume reading | 暂停/恢复 |
| Save current TTS audio to vault | 保存音频到 vault |
| Clear TTS audio cache | 清空缓存 |

## 设置

在 Obsidian Settings → Community plugins → Share & Read Aloud 中配置：

- **API Key** — MiMo 平台 API Key（从 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 获取）
- **Model** — TTS 模型（预置音色 / 音色设计 / 音色克隆）
- **Voice** — 预置音色选择（冰糖/茉莉/苏打/白桦/Mia/Chloe 等）
- **Style Instruction** — 风格指令（如"用温柔平稳的语调朗读"）
- **Playback Speed** — 默认播放倍速
- **Target Segment Characters** — 每组朗读目标字数，建议 300~500
- **Concurrent Prefetch Groups** — 预生成组数，默认 4；API 请求启动至少间隔 1 秒
- **Cache** — 缓存开关和过期天数
- **UI** — 播放控制栏、Toast 通知开关

## 安装

### 手动安装

复制以下文件到 `.obsidian/plugins/share-clean-text/`：

- `manifest.json`
- `main.js`
- `styles.css`
- `versions.json`

### 开发构建

```bash
pnpm install
pnpm run build
```

## 目录结构

```text
obsidian-share-clean-text/
├── src/
│   ├── main.ts              # 插件入口 + 命令注册
│   ├── settings.ts          # 设置接口 + 设置页面
│   ├── constants.ts         # API 配置、音色预设
│   ├── normalize.ts         # Markdown 文本清洗
│   ├── tts-client.ts        # MiMo TTS API 客户端
│   ├── text-segmenter.ts    # 长文本分段
│   ├── audio-player.ts      # 音频播放引擎
│   ├── audio-cache.ts       # IndexedDB 缓存
│   ├── player-bar.ts        # 播放控制栏 UI
├── docs/
│   └── mimo-tts-api.md      # MiMo TTS API 文档
├── esbuild.config.mjs
├── styles.css
├── manifest.json
├── package.json
├── tsconfig.json
└── versions.json
```

## MiMo TTS 预置音色

| 音色 | ID | 语言 | 性别 |
|------|-----|------|------|
| 冰糖 | `冰糖` | 中文 | 女 |
| 茉莉 | `茉莉` | 中文 | 女 |
| 苏打 | `苏打` | 中文 | 男 |
| 白桦 | `白桦` | 中文 | 男 |
| Mia | `Mia` | 英文 | 女 |
| Chloe | `Chloe` | 英文 | 女 |
| Milo | `Milo` | 英文 | 男 |
| Dean | `Dean` | 英文 | 男 |

## 风格控制

支持音频标签控制，在文本中加入风格标记：

- `(开心)今天天气真好！`
- `(慵懒)再让我睡五分钟……`
- `(磁性)夜已经深了，城市还在呼吸。`
- `(东北话)哎呀妈呀，这天儿也忒冷了吧！`

也支持自然语言指令，在设置页的 Style Instruction 中填写即可。
