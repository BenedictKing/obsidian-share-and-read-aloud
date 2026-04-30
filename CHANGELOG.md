# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.6] - 2026-04-30

### Fixed

- 朗读控制栏新增退出按钮，停止朗读时同步隐藏控制栏，避免停留在朗读状态。

## [0.2.3] - 2026-04-30

### Added

- **ESLint + eslint-plugin-obsidianmd**: 安装 Obsidian 官方 ESLint 插件，创建 `eslint.config.mjs` flat config，本地可运行 `npx eslint src/` 进行与审核 bot 一致的检查

### Changed

- **TTS 请求改用 Obsidian `requestUrl`**: 替换 `fetch()` 为 Obsidian 原生 `requestUrl`，避免移动端 CORS 限制
- **文本分段兼容 iOS < 16.4**: 移除 lookbehind 正则，改用 capture-group 拆分 + 合并，兼容 Safari 旧版本
- **设置页面规范**: 标题使用 `Setting.setHeading()` 替代手动 `h3`；设置名称统一 sentence case；内联 `style.width` 替换为 CSS 类
- **ESLint 自动修复**: `document` → `activeDocument`、`createElement` → `createDiv`、`setTimeout` → `activeWindow.setTimeout()`、移除多余类型断言
- **Sentence case 补全**: MiMo→Mimo、TTS→Tts、IndexedDB→Indexeddb 等专有名词按 Obsidian 审核规则转小写

### Fixed

- 移除未使用的 `Notice` import、`RETRYABLE_HTTP_STATUSES` 常量
- 修复 `Object.assign` 返回 `any` 的类型安全问题

## [0.2.1] - 2026-04-29

### Added

- **MiMo TTS 朗读**: 集成 MiMo-V2.5-TTS 云端 API，支持朗读整篇笔记和选中文本
- **播放控制栏**: 底部悬浮控制栏，支持暂停/恢复、上一段/下一段、进度条拖拽、倍速切换（0.75x~2.0x）
- **长文本分段**: 段落→句子（CJK 感知）→逗号三级分段后，按目标字数均衡合并短段落
- **音频缓存**: IndexedDB 缓存已合成音频，避免重复 API 调用，支持过期自动清理
- **音频预加载**: 支持可配置并发预生成，默认 4 组；连续 2 组可播放后立即开始朗读
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
