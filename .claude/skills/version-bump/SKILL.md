---
name: version-bump
description: 升级 Obsidian 插件版本号，自动同步 manifest.json、package.json、package-lock.json、versions.json，并校验构建
version: 1.0.0
author: BenedictKing
allowed-tools: Bash, Read, Write, Edit
context: fork
---

# Obsidian 插件版本升级技能

## 触发条件

当用户输入包含以下关键词时，执行版本升级流程：

### 中文触发

- "升级版本"
- "版本号"
- "发布版本"
- "更新版本"
- "版本升级"
- "bump version"
- "release"

### 参数说明

- 无参数或 `patch`: patch 版本 +1
- `minor`: minor 版本 +1，patch 归零
- `major`: major 版本 +1，minor 和 patch 归零
- 具体版本号（如 `0.2.0`、`v0.2.0`）: 直接使用该版本号（文件中写入不带 `v` 的 semver）

## 重要原则

1. **不要自动 commit / tag / push**，除非用户明确要求。
2. 版本号必须保持 Obsidian 插件文件一致：
   - `manifest.json`
   - `package.json`
   - `package-lock.json`（如果存在）
   - `versions.json`
3. 升级后必须运行验证：
   - `npx tsc -noEmit -skipLibCheck`
   - `node esbuild.config.mjs production`
4. 不要把 `.claude/worktrees/` 或临时文件加入 git。
5. 修改前先读取相关文件，修改后检查 git diff / status。

## 项目版本文件

### manifest.json

字段：

```json
"version": "0.2.0"
```

### package.json

字段：

```json
"version": "0.2.0"
```

### package-lock.json

如果存在，需同步两处：

```json
"version": "0.2.0"
```

以及：

```json
"packages": {
  "": {
    "version": "0.2.0"
  }
}
```

### versions.json

Obsidian 插件需要记录每个插件版本对应的最低 Obsidian 版本。

格式：

```json
{
  "0.1.0": "1.7.0",
  "0.2.0": "1.7.0"
}
```

新版本的最低 Obsidian 版本应默认沿用 `manifest.json` 的 `minAppVersion`。

## 执行步骤

### 1. 检查工作区状态

```bash
git status --short
```

记录当前是否已有未提交改动。不要因为版本升级而覆盖用户现有改动。

### 2. 读取当前版本

优先从 `manifest.json` 读取当前版本：

```bash
node -e "console.log(require('./manifest.json').version)"
```

同时读取：

```bash
node -e "console.log(require('./package.json').version)"
node -e "console.log(require('./manifest.json').minAppVersion)"
```

如果 `manifest.json` 与 `package.json` 版本不一致，先报告并询问用户是否继续；不要猜测。

### 3. 计算新版本号

根据用户参数计算：

| 当前版本 | 升级类型 | 新版本 |
|----------|----------|--------|
| 0.1.0 | patch | 0.1.1 |
| 0.1.0 | minor | 0.2.0 |
| 0.1.0 | major | 1.0.0 |
| 0.1.0 | 0.3.0 | 0.3.0 |

规则：

- 文件中使用不带 `v` 的 semver，例如 `0.2.0`
- git tag（如果用户明确要求）使用 `v0.2.0`

### 4. 更新版本文件

必须同步更新：

- `manifest.json`
- `package.json`
- `package-lock.json`（如果存在）
- `versions.json`

推荐使用专用编辑工具 `Edit` / `Write`，不要用 `sed -i`。

#### versions.json 更新规则

1. 读取现有 `versions.json`
2. 保留旧版本条目
3. 新增：

```json
"{newVersion}": "{manifest.minAppVersion}"
```

4. 保持 JSON 格式化为 2 空格缩进

### 5. 更新 CHANGELOG.md（如果存在）

如果 `CHANGELOG.md` 存在：

- 如果已有 `## [Unreleased]` 区块且有内容：将其改为：

```markdown
## [0.2.0] - YYYY-MM-DD
```

- 如果没有 `Unreleased` 内容，则新增一个简短版本区块，说明版本升级。

如果当前工作包含功能改动，优先保留已有变更描述，不要覆盖。

日期使用当前本地日期，格式 `YYYY-MM-DD`。

### 6. 验证构建

必须执行：

```bash
npx tsc -noEmit -skipLibCheck
node esbuild.config.mjs production
```

如果验证失败，停止并修复失败原因；不要继续提交或 tag。

### 7. 查看改动

```bash
git diff --stat HEAD
git status --short
```

确认：

- 版本文件已更新
- 没有意外加入 `.claude/worktrees/`、临时文件、密钥文件
- `main.js` 如果构建后变更，应保留，因为 Obsidian 插件发布需要它

### 8. 暂存文件（仅在用户要求提交或 review 前）

如果用户没有要求提交，只需要报告变更，不要自动 commit。

如果需要暂存用于 review，可以暂存：

```bash
git add manifest.json package.json package-lock.json versions.json CHANGELOG.md main.js
```

不要使用 `git add -A`，除非用户明确要求把所有改动一起提交。

### 9. Git commit / tag / push（仅用户明确要求）

默认不执行。

如果用户明确要求提交：

```bash
git commit -m "chore: bump version to {newVersion}"
```

如果用户明确要求 tag：

```bash
git tag v{newVersion}
```

如果用户明确要求 push：

```bash
git push origin main
git push origin v{newVersion}
```

执行 push/tag 前必须再次确认，因为这是影响远端共享状态的操作。

## 输出格式

完成后输出：

```text
版本升级完成：
- 原版本：0.1.0
- 新版本：0.2.0
- 升级类型：minor
- 已更新：manifest.json, package.json, package-lock.json, versions.json
- 验证：tsc 通过，esbuild 通过
```

如未提交 git，明确说明：

```text
未创建 commit/tag/push。如需提交，请明确说“提交版本升级”。
```

## 当前项目注意事项

- 当前插件版本文件使用不带 `v` 的 semver。
- `versions.json` 的值应沿用 `manifest.json.minAppVersion`。
- `main.js` 是 esbuild 产物，构建后需要随插件一起发布。
- `.claude/worktrees/` 是 Claude Code 工作区目录，不应纳入插件发布或版本提交。
