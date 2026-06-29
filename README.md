# Personal Notebook

一个本地优先的类 Notion 个人知识库桌面应用。应用通过 Tauri 运行和打包；核心工作区数据保存在本地 SQLite 数据库中，适合用来管理层级页面、结构化笔记、白板、数据表格、思维导图和可导入导出的个人资料库。

## 功能概览

- 页面系统：支持层级页面树、页面标题、图标、封面、面包屑、页面目录、最近打开页面和页面显示设置。
- 块编辑器：支持段落、标题、待办、无序列表、有序列表、代码块、简单表格、子页面、白板、数据表格和思维导图块。
- 富文本编辑：支持加粗、斜体、下划线、删除线、链接、文字颜色，以及部分块级文本样式。
- 简单表格：支持行列编辑、单元格背景、文字对齐、列宽和行高调整。
- 白板：支持独立白板页面和页内白板入口，包含缩放、平移、选择、拖拽、连线、撤销重做和旧版白板数据兼容。
- 数据表格：支持独立数据表页面、内联数据表块、字段配置、记录页面、筛选、排序、分组、表格视图、看板视图、日历视图和 Gantt 视图。
- 思维导图：支持独立思维导图页面和页内入口，通过静态 bundle 与宿主应用集成。
- 搜索：支持全局搜索页面内容、白板和数据表格，并可通过快捷键打开。
- 导入导出：支持 JSON 工作区备份/恢复，以及 Markdown 页面包导出/导入。
- 本地优先：数据默认保存在本机 SQLite 数据库中，不依赖后端服务。

## 技术栈

- 构建与开发：Vite、TypeScript、React 19、React DOM
- 桌面端：Tauri 2、Tauri dialog/fs/sql 插件
- 路由：react-router-dom
- 状态管理：zustand/vanilla，React 侧通过 useSyncExternalStore 订阅
- 本地存储：SQLite，前端通过 Tauri SQL 插件访问
- 拖拽排序：@dnd-kit/core、@dnd-kit/sortable、@dnd-kit/utilities
- UI 辅助：lucide-react、clsx
- 数据表格/公式/压缩包：expr-eval、jszip
- 测试：Vitest、Testing Library、jsdom、jest-dom matchers
- 静态检查：ESLint flat config、typescript-eslint、React Hooks lint、React Refresh lint

## 快速开始

请先安装 Node.js 当前 LTS 版本，并确保 npm 可用。

```bash
npm install
npm run tauri:dev
```

Tauri 开发模式会自动启动 Vite 开发服务器并打开桌面窗口。只调试前端页面时，也可以单独运行：

```bash
npm run dev
```

第一次打开应用时会自动创建一个“快速开始”页面。后续数据会保存在 Tauri 管理的本地 SQLite 数据库 `personal-notebook.db` 中。

桌面端开发和打包：

```bash
npm run tauri:dev
npm run tauri:build
npm run tauri:build:mac
npm run tauri:build:windows
```

运行 Tauri 命令前还需要安装 Rust 工具链和当前系统对应的 Tauri 平台依赖。`npm run tauri:build` 会按当前系统打包；也可以使用平台专用脚本：

- macOS：在 macOS 上运行 `npm run tauri:build:mac`，生成 `.app` 和 `.dmg`。
- Windows：在 Windows 上运行 `npm run tauri:build:windows`，生成 NSIS `.exe` 和 MSI `.msi`。Windows 配置位于 `src-tauri/tauri.windows.conf.json`，会自动合并。
- macOS/Linux 交叉构建 Windows：可先安装 `cargo-xwin`，再运行 `npm run tauri:build:windows:cross`，用于生成 x64 Windows NSIS 安装包。

桌面打包成功后，macOS 产物通常会生成在：

```text
src-tauri/target/release/bundle/macos/
src-tauri/target/release/bundle/dmg/
```

Windows 原生打包产物通常会生成在：

```text
src-tauri/target/release/bundle/msi/
src-tauri/target/release/bundle/nsis/
```

交叉构建的 Windows x64 NSIS 产物通常会生成在：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

仓库内提供了 GitHub Actions 工作流 `.github/workflows/tauri-packages.yml`，可以手动触发或推送 `v*` tag 后在 macOS 与 Windows runner 上分别打包并上传安装包 artifact。

## 常用命令

```bash
npm run dev
npm test
npm run lint
npm run build
npm run preview
npm run tauri:dev
npm run tauri:build
npm run tauri:build:mac
npm run tauri:build:windows
npm run tauri:build:windows:cross
npm run test:watch
```

命令说明：

- `npm run dev`：启动 Vite 开发服务器。
- `npm test`：以 `vitest run` 执行全部测试。
- `npm run lint`：运行 ESLint。
- `npm run build`：先执行 `tsc -b` 类型检查，再执行 `vite build`。
- `npm run preview`：预览生产构建结果。
- `npm run tauri:dev`：启动 Tauri 桌面开发模式。
- `npm run tauri:build`：构建并打包 Tauri 桌面应用。
- `npm run tauri:build:mac`：在 macOS 上打包 `.app` 和 `.dmg`。
- `npm run tauri:build:windows`：在 Windows 上打包 NSIS `.exe` 和 MSI `.msi`。
- `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。
- `npm run test:watch`：以 watch 模式运行 Vitest。

运行单个测试文件示例：

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
npx vitest run src/components/editor/BlockEditor.test.tsx
```

## 数据与存储

主工作区数据保存在 Tauri 本地 SQLite 数据库 `personal-notebook.db` 中，主要包含：

- `pages`：页面、层级关系、页面设置和页面内块。
- `boards`：白板资产及其快照。
- `dataTables`：嵌入主工作区的数据表格资产及其快照。
- `mindmaps`：思维导图资产及其快照。
- `settings`：工作区级设置，例如最近打开页面。
- `standalone_data_table_state`：数据表格子应用的独立状态。

首次启动时，如果本地没有工作区数据，应用会通过 `src/domain/seed.ts` 创建默认页面。JSON 导入会覆盖当前本地工作区内容，使用前建议先导出备份。

旧版浏览器数据不会自动迁移到 SQLite。如需保留旧数据，请先在旧版中导出 JSON 备份，再在新版桌面应用中导入。

## 路由

主要路由由 `src/app/App.tsx` 维护：

- `/`：跳转到最近打开页面。
- `/pages/:pageId`：页面编辑器。
- `/pages/:pageId/boards/:boardId`：白板独立页面。
- `/pages/:pageId/data-tables/:databaseId`：数据表格页面。
- `/pages/:pageId/data-tables/:databaseId/records/:recordId`：数据表格记录页面。
- `/pages/:pageId/mindmaps/:mindmapId`：思维导图独立页面。

白板和思维导图独立页面会隐藏侧边栏，让画布获得更大的编辑区域。

## 导入导出

页面右上角菜单提供导入导出能力：

- JSON 备份：导出完整工作区快照，可用于恢复本地数据。
- JSON 导入：导入备份并覆盖当前工作区。
- Markdown 页面包：导出当前页面及其子页面为 zip 包。
- 兼容后续导入：开启后，Markdown 页面包会保留必要元信息，并包含可恢复的白板资产。
- Markdown 页面包导入：导入 zip 格式页面包并写入当前工作区。
- 孤立资源清理：可清理不再被页面块引用的白板或数据表格资产。

导入导出在 Tauri 桌面端使用系统原生打开/保存对话框。

## 快捷键

- `Ctrl/⌘ + K`：打开全局搜索。
- `Ctrl/⌘ + P`：打开全局搜索。
- `Ctrl/⌘ + Z`：撤销。
- `Ctrl/⌘ + Shift + Z`：重做。
- `Ctrl/⌘ + Y`：重做。
- 在编辑器中输入 `/`：打开块命令菜单。
