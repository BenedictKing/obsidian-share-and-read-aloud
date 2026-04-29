# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- **MiMo TTS 朗读**: 集成 MiMo-V2.5-TTS 云端 API，支持朗读整篇笔记和选中文本
- **播放控制栏**: 底部悬浮控制栏，支持暂停/恢复、上一段/下一段、进度条拖拽、倍速切换（0.75x~2.0x）
- **长文本分段**: 段落→句子（CJK 感知）→逗号三级分段策略，自动适配 API 限制
- **音频缓存**: IndexedDB 缓存已合成音频，避免重复 API 调用，支持过期自动清理
- **音频预加载**: 播放时后台预加载下 2 段，减少段间停顿
- **保存音频到 vault**: 将当前播放的音频导出为 WAV 文件到 vault
- **设置页面**: 完整的 PluginSettingTab，配置 API Key、模型、音色、风格指令、缓存、UI 选项等
- **6 个新命令**: Read note aloud / Read selection aloud / Stop reading / Pause-Resume / Save audio / Clear cache
- **MiMo TTS API 文档**: 整理官方 API 文档保存到 `docs/mimo-tts-api.md`

### Changed

- **项目结构重构**: 从单文件 `main.ts` 拆分为 `src/` 目录下 9 个模块文件
- **构建入口**: `esbuild.config.mjs` entryPoints 从 `main.ts` 改为 `src/main.ts`
- **插件描述**: 更新为支持 TTS 朗读功能的描述
- 新增 `styles.css` 样式文件（播放控制栏样式）

### Affected Files

- `src/main.ts` — 插件主入口，整合所有模块
- `src/settings.ts` — 设置接口和设置页面
- `src/constants.ts` — API 配置、音色预设、类型定义
- `src/normalize.ts` — Markdown 文本清洗（从旧 main.ts 提取）
- `src/tts-client.ts` — MiMo TTS REST API 客户端
- `src/text-segmenter.ts` — 长文本分段器
- `src/audio-player.ts` — 分段串行播放引擎
- `src/audio-cache.ts` — IndexedDB 音频缓存
- `src/player-bar.ts` — 底部播放控制栏 UI
- `styles.css` — 播放控制栏样式
- `docs/mimo-tts-api.md` — MiMo TTS API 官方文档整理
