# CLAUDE.md

This file provides guidance to Claude Code and Codex-style agents when working with this repository.

> 先读 `AGENTS.md` 和 `README.md`。`AGENTS.md` 是通用维护手册；本文件只补充更具体的架构脉络、Tauri 桌面边界和执行习惯。

## 工作方式

- 先用 `rg`/`rg --files` 找调用链，再读相邻源码和测试。`src/store/createWorkspaceStore.ts`、`src/app/App.tsx`、`src/domain/markdown.ts` 都很大，按关键词和片段阅读。
- 修改前看 `git status --short`。不要覆盖用户未提交改动；相关改动上继续，非相关改动忽略。
- 保持小步聚焦，不做无关重构、全仓格式化或依赖升级。
- 编辑文件用现有风格：无分号、单引号、两空格缩进，中文文案尽量集中到 `src/ui/copy.ts` 或相邻既有文案处。
- 不要直接编辑 `package-lock.json`、`public/mindmap-web/assets/*`、白板静态资源，除非任务明确要求。
- 不要提交或整理 `src-tauri/target/`、`.app`、`.dmg`、`.msi`、NSIS `.exe` 等本地构建产物。

## 验证策略

按风险选择验证强度：

- 文档或注释：通常检查 diff 即可。
- 单个工具/组件：跑相邻测试，例如 `npx vitest run src/lib/fileAccess.test.ts`。
- store、领域类型、导入导出、SQLite：跑相关测试，必要时跑 `npm test`。
- 发布前或共享逻辑改动：跑 `npm run lint` 和 `npm run build`。
- Tauri、文件访问、外部链接、路由、capability、打包配置：除前端测试外，按当前平台跑 `npm run tauri:build` 或平台专用打包命令。
- Windows 安装包优先在 Windows runner 上验证 `npm run tauri:build:windows`；macOS 本机只能验证 macOS bundle/dmg 或 cargo-xwin 交叉 NSIS。

最终回复必须说明已跑的验证；没跑则说明原因和剩余风险。

## 架构主线

### WorkspaceStore 是单一业务入口

`src/store/createWorkspaceStore.ts` 是应用中枢，用 `zustand/vanilla` 的 `createStore` 实现，React 侧通过 `useSyncExternalStore` 订阅。所有工作区数据变更都应经由 store action：先更新内存 state，再调用 `WorkspaceRepository` 持久化，并维护 `saveStatus`。

`WorkspaceSnapshot` 来自 `src/domain/types.ts`，包含 `boards`、`dataTables`、`mindmaps`、`pages`、`settings`。新增字段或块类型时先改领域契约，再补工厂、store、渲染、导入导出、搜索、normalize 和测试。

### 持久化走 Rust storage service

桌面端业务读写集中在 `src-tauri/src/storage/`。Rust 侧通过 `rusqlite` 独占 SQLite 连接，数据库文件是 `personal-notebook-v2.db`，大文件资产进入 app-managed `personal-notebook-assets-v2/`，SQLite 只保存元数据和引用。前端通过 `src/lib/storageClient.ts` 调 typed Tauri commands，不直接发 SQL。

核心表包括：

- `settings`
- `pages` / `page_contents` / `block_refs`
- `boards` / `board_snapshots`
- `mindmaps` / `mindmap_snapshots`
- `data_tables` 及其 properties/views/records/record pages/blocks
- `assets` / `asset_refs`
- `search_documents` / `search_documents_fts`

`src/lib/workspaceRepository.ts` 是前端持久化适配层，负责 `load/save/replace` 并尽量把单对象变化映射为 Rust 增量命令；跨对象变化应回退到 Rust 的事务型 `replace_workspace_backup`，避免前端并发拆写造成半成功状态。

`ensureSnapshot` 在首次启动时使用 `src/domain/seed.ts` 写入默认工作区。`bootstrap` 后会跑 normalize，若内容被规范化会写回数据库。JSON 导入也要经过 normalize。

### 高频资产写入有队列

白板、数据表、思维导图这类非页面资产会高频更新。store 内的 `persistNonPageAssets()` 使用 `nonPageAssetsPersistQueue` 串行化写入，并用 `persistVersion` 避免过期写入把 `saveStatus` 错改回 saved/error。修改 `update*Snapshot` 或新增加类似资产时复用这套路径，不要新开裸 `repository.save`。

### 撤销/重做

store 内维护 `undoStack` / `redoStack`，上限 100，存的是 `WorkspaceSnapshot`。会改变文档的 action 在变更前调用 `pushUndoSnapshot(state)` 并清空 redo。新增改文档 action 时要接入，否则撤销链会断。

## Tauri 桌面边界

### 配置和打包

`src-tauri/tauri.conf.json` 是主配置：

- `beforeDevCommand`: `npm run dev`
- `beforeBuildCommand`: `npm run build`
- `devUrl`: `http://localhost:5173`
- `frontendDist`: `../dist`
- 默认窗口：1280x800，最小 960x640，`dragDropEnabled: false`
- bundle 图标：`src-tauri/icons/*`

`src-tauri/tauri.windows.conf.json` 覆盖 Windows 打包，定义 NSIS/MSI、WebView2 download bootstrapper、WiX upgrade code、安装语言、currentUser 安装模式。修改 Windows 安装行为时必须读这个文件和 README 打包说明。

### Rust 入口

`src-tauri/src/lib.rs` 做这些事：

- 注册 `tauri-plugin-dialog`、`tauri-plugin-fs`，初始化 Rust storage state。
- 注册 `storage::commands::*` 和 `open_external_url` 命令；外部链接只允许 `http://`、`https://`、`mailto:`。
- 创建系统托盘，菜单含“显示窗口”“隐藏到托盘”“退出”。
- 主窗口关闭时 `prevent_close()` 并隐藏窗口；托盘左键点击或双击恢复窗口。

修改 Tauri 命令或窗口生命周期时，同步补 Rust 单测、前端调用测试和 capability。

### Capability

`src-tauri/capabilities/default.json` 限定 `main` 窗口权限。当前允许 core default、dialog default、fs 读写文件和 storage command invoke。新增插件或命令时不要只改前端，必须同时检查：

- Rust 插件注册或 `invoke_handler`
- capability 权限
- 前端封装
- 测试
- 打包构建

### 前端封装

- `src/lib/fileAccess.ts` 是唯一的打开/保存文件适配层。桌面端动态 import Tauri dialog/fs；浏览器环境回退到 file input 和 Blob 下载。
- `src/lib/externalLinks.ts` 是唯一的外部链接适配层。桌面端 `invoke('open_external_url')`；浏览器环境 `window.open`。
- `src/lib/storageClient.ts` 和 repository 是唯一桌面存储通道。组件不要直接 import Tauri invoke，也不要直接访问 SQLite。
- `src/app/App.tsx` 默认用 `HashRouter`。不要随意改成 `BrowserRouter`，桌面静态资源和刷新会受影响。

## 嵌入式子功能

白板、数据表、思维导图都同时支持独立页面和页内块入口。它们与父层的契约是：子功能持有自己的 `snapshot`，父层传入 snapshot，子功能通过 `onSnapshotChange`/`onChange` 回调交回 store，由 `update*Snapshot` action 落库。

- 白板：`src/components/whiteboard`，纯 React/Canvas。`whiteboardModel.ts` 是模型；数据处理代码和相关测试不要随手改。
- 数据表：`src/components/dataTable`，有自己的 `domain/`、`store/AppStore.tsx`、`storage/`、`styles.css`。嵌入工作区的快照是内部 `AppState`；桌面端经 `src/lib/storageClient.ts`/Rust storage 保存，测试和浏览器轻量路径使用内存 fake。
- 思维导图：`src/components/mindmap` 通过 iframe 加载 `public/mindmap-web/`。宿主和 iframe 通过按 `mindmapId` scope 的 `localStorage` + `storage` 事件同步，`beforeunload` 时 flush；`mindmapStaticBundle.test.ts` 校验静态 bundle 完整性。

改任一子功能时，同时验证独立页面入口和块入口。

## 常见改动清单

新增或修改块类型：

`src/domain/types.ts` → `src/utils/blockFactory.ts` → store action 和 `turnBlockInto`/`duplicateBlock` → `src/components/editor` 渲染 → `src/domain/markdown.ts` → `src/domain/search.ts` → normalize → 相邻测试。

修改导入导出：

`src/app/App.tsx` → `src/components/export` → `src/domain/markdown.ts` → `src/lib/fileAccess.ts` → store import/export action → JSON 备份回归测试。桌面端和浏览器回退路径都要考虑。

修改文件或外部链接：

`src/lib/fileAccess.ts` 或 `src/lib/externalLinks.ts` → 对应测试 → `src-tauri/capabilities/default.json` → `src-tauri/src/lib.rs`。不要在业务组件里散落 Tauri API。

修改 SQLite schema：

`src-tauri/src/storage/schema.rs` → `src-tauri/src/storage/models.rs`/`commands.rs` → `src/lib/storageClient.ts`/repository → Rust storage 测试和前端 repository/client 测试 → JSON 导入和 normalize。

修改路由或导航：

`src/app/App.tsx` → 页面树/面包屑/最近打开页 → `restoreMissing*Reference` 和 `cleanupOrphan*` → `HashRouter` 下的路径行为。

修改编辑器交互：

检查键盘输入、IME 组合输入、富文本同步、浮层关闭、拖拽、撤销重做、焦点移动。

修改样式：

沿用 `src/styles/index.css` 和现有类名；涉及布局、层级、尺寸、边框要补样式测试。至少检查桌面宽屏和窄屏，避免按钮文字溢出、浮层遮挡、嵌套卡片和单色调过重。
