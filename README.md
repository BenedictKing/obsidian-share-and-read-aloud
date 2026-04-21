# Share Clean Text

一个面向 Obsidian 的极小插件：先把当前笔记或选中文本清洗成适合朗读的纯文本，再进行分享或复制，方便交给外部 TTS / 朗读 App。

当前临时目录：`obsidian-share-clean-text`

## 解决的问题

Obsidian 笔记里通常包含很多不适合直接朗读的内容，例如：

- YAML frontmatter
- Markdown 链接
- Obsidian wiki link
- 裸 URL
- 代码块 / 行内代码标记
- 表格
- callout 语法
- 图片语法

这个插件的目标是：

1. 提取当前笔记或选中的内容
2. 清洗成更适合 TTS 的可读文本
3. 优先调用系统分享
4. 不可分享时回退到剪贴板
5. 再不行则弹出只读文本框，便于手动复制

## 当前功能

### 命令面板命令

- `Share cleaned current note`
- `Share cleaned selected text`
- `Copy cleaned current note`
- `Copy cleaned selected text`

### 编辑器右键菜单

当存在选中文本时，会显示：

- `Share cleaned selection`
- `Copy cleaned selection`

## 清洗规则

当前版本会尽量保留正文语义，同时去掉朗读噪音：

- 去掉 frontmatter
- 去掉 HTML 注释和 `%%comment%%`
- 去掉 fenced code block
- 去掉大块数学公式和部分行内公式
- 去掉表格结构行
- 去掉脚注定义与脚注引用
- 去掉图片语法
- Markdown 链接保留显示文字，去掉 URL
- Wiki Link 保留显示文字
- 去掉裸 URL
- 去掉粗体 / 斜体 / 删除线 / 高亮标记
- 去掉标题、列表、引用等语法符号
- callout 保留正文，去掉 `> [!info]` 等包装语法
- 合并多余空白

## 平台行为

### Android / iOS

优先尝试：

- `navigator.share({ text })`

如果当前环境支持系统分享，会直接拉起原生分享面板，你可以把清洗后的文本发给：

- `@Voice Aloud Reader`
- `NaturalReader`
- `Evie`
- 其他支持文本接收的朗读 App

如果系统分享不可用，会自动回退：

- 复制清洗后的文本到剪贴板

如果剪贴板也不可用，会弹出只读文本框供手动复制。

### Desktop

桌面端通常更可能走回退路径：

- 复制到剪贴板
- 或打开只读预览框

## 安装方式

### 方式一：手动安装到你的 Vault

把下面这些文件复制到你的 vault 插件目录，例如：

`.obsidian/plugins/share-clean-text/`

需要的文件：

- `manifest.json`
- `main.js`
- `versions.json`

如果后续加入样式文件，再一起复制 `styles.css`。

然后在 Obsidian 中：

1. 打开 `Settings`
2. 进入 `Community plugins`
3. 打开 `Installed plugins`
4. 启用 `Share Clean Text`

### 方式二：开发态本地构建

```bash
npm install
npm run build
```

当前构建产物：

- `main.js`

## 当前目录结构

```text
obsidian-share-clean-text/
├── esbuild.config.mjs
├── main.ts
├── main.js
├── manifest.json
├── package.json
├── package-lock.json
├── tsconfig.json
└── versions.json
```

## 当前状态

这是一个可运行的 v0.1 原型，重点是把主流程先打通：

- 清洗文本
- 分享文本
- 复制文本
- 多平台尽力兼容

当前还没有做：

- 设置页
- 可配置清洗规则
- 单元测试
- 正式发布打包
- 社区插件商店发布信息

## 已知限制

1. `navigator.share` 在不同平台 / WebView / Obsidian 宿主中的支持并不完全一致，因此不能保证一定弹出系统分享。
2. 某些平台下剪贴板权限可能受限，此时会回退为弹窗展示纯文本。
3. 复杂 Markdown（尤其是嵌套表格、复杂数学公式、嵌入块）仍可能需要继续优化清洗规则。
4. 当前没有专门区分“适合阅读”和“适合朗读”的不同清洗策略，后续可以加配置。

## 后续可选增强

- 增加设置页，允许单独开关：
  - 是否保留链接文字
  - 是否去掉数学公式
  - 是否去掉表格
  - 是否保留列表层级
- 增加“复制并提示打开某个 TTS App”的工作流
- 增加“导出为 txt”命令
- 增加更细的 Markdown / Obsidian 语法清洗
- 增加正式命名与发布准备

## 适用场景

- 在手机上把 Obsidian 笔记交给外部朗读 App
- 在桌面端先复制纯文本，再粘贴到其它 TTS 工具
- 快速检查某段笔记被朗读时是否会读出 Markdown 噪音
