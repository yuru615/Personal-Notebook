# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本仓库同时维护 `AGENTS.md`，其中已包含完整的功能清单、技术栈、目录结构、运行命令与代码规范。**先读 `AGENTS.md` 与 `README.md`，再读本文件。** 本文件只补充跨文件才能理解的架构脉络、关键业务约束，以及 Claude Code 专属的工作方式，不重复 `AGENTS.md` 已有内容。

## 常用命令

```bash
npm run dev          # Vite 开发服务器
npm test             # vitest run，跑全部测试
npm run lint         # ESLint
npm run build        # tsc -b 类型检查 + vite build（发布前必跑）
npm run tauri:dev    # Tauri 桌面开发模式
npm run tauri:build  # Tauri 桌面打包
npm run tauri:build:mac       # macOS .app/.dmg
npm run tauri:build:windows   # Windows NSIS .exe + MSI .msi
npm run tauri:build:windows:cross  # cargo-xwin cross-build NSIS
```

跑单个测试文件或用例（开发期最常用）：

```bash
npx vitest run src/store/createWorkspaceStore.test.ts     # 单文件
npx vitest run -t "merges block with previous"            # 按用例名过滤
npx vitest src/components/mindmap                          # watch 某目录
```

验证强度按风险分级：小改动跑相关测试；动到 `store`、`domain/types.ts`、`lib` 或导入导出跑 `npm test`；发布前跑 `npm run lint` 和 `npm run build`；动到 Tauri、文件访问、路由或打包配置时跑当前平台对应的 Tauri 打包命令。Windows 安装包优先在 Windows runner 上跑 `npm run tauri:build:windows`。若无法运行验证命令，需在最终回复中说明原因与剩余风险。

## 架构主线

### 单一数据源：WorkspaceStore

`src/store/createWorkspaceStore.ts`（~1800 行）是整个应用的中枢，用 `zustand/vanilla` 的 `createStore` 实现，React 侧通过 `useSyncExternalStore` 订阅。**所有工作区数据变更都必须经由 store 暴露的 action**，action 内部完成「更新内存 state → 调 `WorkspaceRepository` 持久化 → 维护 `saveStatus`」三件事。组件、领域模型、嵌入式子应用一律不直接写 SQL。

state 的形状就是 `WorkspaceSnapshot`（`boards / dataTables / mindmaps / pages / settings`）外加 `currentPageId / saveStatus`。理解任何 action 时，对照 `src/domain/types.ts` —— 它是页面、块、白板、数据表、思维导图、快照的全局契约源头，改任何数据结构都从这里开始。

### 持久化的两条路径

- **页面相关变更**直接 `repository.save({ boards, pages, settings, ... })`。
- **非页面资产**（boards / dataTables / mindmaps）走 `persistNonPageAssets()`：它用一个 promise 链 `nonPageAssetsPersistQueue` 串行化写入，并用单调递增的 `persistVersion` 决定哪次写入有资格把 `saveStatus` 改回 `saved`/`error`。这是为了避免嵌入式编辑器高频快照更新时出现写入竞态与状态闪烁。改这类资产时复用此函数，不要新开裸 `repository.save`。

`WorkspaceRepository`（`src/lib/workspaceRepository.ts`）通过 Tauri SQL 插件写入 SQLite。`replace` 会清空主工作区表再按 snapshot 顺序写回，`save` 是 `replace` 的便捷封装，并兼容旧 JSON 快照里缺省的 `dataTables / mindmaps`。`ensureSnapshot` 在首次启动时用 `createSeedWorkspace()` 落种子数据。

### 启动期归一化（normalize）

`bootstrap` 加载快照后会跑 `normalizeWorkspaceSnapshot`（合并相邻 list 块、补全 board 等），若 `didChange` 则把归一化结果写回 DB。导入 JSON 走 `normalizeImportedSnapshot`。**新增块类型或字段时，必须考虑旧快照在这里的兼容**——老数据缺字段不能崩，要给默认值或迁移。

### SQLite schema 与存储

SQLite 连接和建表逻辑集中在 `src/lib/sqliteDatabase.ts`。主工作区按 `pages / boards / data_tables / mindmaps / settings` 存储，关键字段单列，完整领域对象存 `record_json`；数组顺序通过内部 `position` 列保留。新增表或索引时要同步评估 JSON 导入兼容、normalize 兼容和旧 SQLite 库升级路径。

数据表子应用的独立状态不再使用第二套浏览器存储，统一保存在 SQLite 的 `standalone_data_table_state` 表中；调用入口位于 `src/components/dataTable/storage/sqliteRepo.ts`。

### 撤销/重做

store 内维护 `undoStack` / `redoStack`（各为 `WorkspaceSnapshot` 数组，上限 100）。会改变文档的 action 在变更前调用 `pushUndoSnapshot(state)`，并清空 redo 栈。新增「会改文档」的 action 时，记得接入这套快照栈，否则撤销链会断。

### 嵌入式子功能的统一集成模式

白板、数据表、思维导图三者都是「既能作为独立页面、又能作为页内块入口」的子功能，且都遵循同一种集成契约：

> 子功能持有自己的 `snapshot`（`unknown` 类型，对 store 不透明）；父层把 `snapshot` 作为 prop 传入，子功能通过 `onSnapshotChange`/`onChange` 回调把新快照交回 store，由 `update*Snapshot` action 落库。

三者的差异在于运行边界：

- **白板**（`src/components/whiteboard`）：纯 React/Canvas 组件，`whiteboardModel.ts` 是模型；`legacy/` 与多个 `legacy*.test.ts` 保留旧白板格式的兼容与几何/工具栏 parity，**不要随手改动 legacy 资产**。
- **数据表**（`src/components/dataTable`）：自成一体的子应用，有自己的 `domain/`（types/database/query/factory）、`store/AppStore.tsx`、`storage/`、`styles.css`。快照即其内部 `AppState`。
- **思维导图**（`src/components/mindmap`）：唯一通过 `<iframe>` 加载 `public/mindmap-web/` 静态 bundle 的功能。父子通信**不走 postMessage，而是走 `localStorage` + `storage` 事件**：`MindmapFrame.tsx` 把快照写入按 `mindmapId` scope 的 storage key，iframe 内的 `host-enhancements.js` 读写同一 key，`storage` 事件触发 `onSnapshotChange`，`beforeunload` 时 flush。`mindmapStaticBundle.test.ts` 校验静态 bundle 完整性。

改任一子功能时，**独立页面入口和页内块入口都要验证**。

### 路由与导航

`src/app/App.tsx`（~1300 行）负责顶层编排与 `react-router-dom` 路由。主要路由：

- `/pages/:pageId` —— 页面编辑器
- `/pages/:pageId/boards/:boardId` —— 白板独立页（隐藏侧栏）
- `/pages/:pageId/data-tables/:databaseId`（及 `/records/:recordId`）—— 数据表
- `/pages/:pageId/mindmaps/:mindmapId` —— 思维导图独立页（隐藏侧栏）

store 里有一组 `restoreMissing*Reference` 与 `cleanupOrphan*` action，处理「块引用的资产不存在」和「孤儿资产清理」。改路由或导航时，同步检查页面树、面包屑、最近打开页（`settings.lastOpenedPageId`）、以及这套缺失资源恢复逻辑。

### Tauri 桌面端边界

桌面壳位于 `src-tauri/`：`tauri.conf.json` 定义窗口、dev/build 命令、SQL preload 和默认 bundle 目标；`src-tauri/tauri.windows.conf.json` 定义 Windows NSIS/MSI 打包、WebView2 bootstrapper、WiX upgrade code 和安装器语言；`src-tauri/src/lib.rs` 注册 dialog/fs/sql 插件；`src-tauri/capabilities/default.json` 控制前端可调用的 Tauri 权限。新增桌面 API 时，Rust 插件注册、capability 和前端调用要一起检查。

前端不要直接散落调用 Tauri API。文件访问统一走 `src/lib/fileAccess.ts`，SQLite 访问统一走 `src/lib/sqliteDatabase.ts` 和对应 repository。`App.tsx` 固定使用 `HashRouter`，避免打包后的静态资源路径和刷新问题。

`src-tauri/target/`、`.app`、`.dmg`、`.msi`、NSIS `.exe` 是本地构建产物，不应提交；`Cargo.lock`、capabilities、平台配置、schema、图标属于桌面端源码/配置，可以随改动提交。

## 改动时的连锁检查清单

**新增/修改块类型**（最容易漏）——一条改动要扫一圈：
`domain/types.ts`（`BlockType` 与 `BlockRecord` 联合）→ `utils/blockFactory.ts` → store 的增删改/`turnBlockInto`/`duplicateBlock` → 编辑器渲染（`src/components/editor`）→ `domain/markdown.ts` 导入导出 → `domain/search.ts` → normalize 兼容 → 相邻测试。

**富文本**：`RichTextSegment` 是行内样式契约，`domain/richText.ts` 负责序列化；`InlineRichText.richText` 与块的 `text` 字段并存，两者要保持一致。

**编辑器交互**：改键盘/输入时一并验证组合输入（IME）、富文本、浮层关闭、@dnd-kit 拖拽、撤销重做。

**样式**：沿用 `src/styles/index.css` 现有类名；涉及布局/层级/尺寸/边框的视觉回归，补或改 `src/styles/*.test.ts`（数据表样式回归在 `src/components/dataTable/styles.test.ts`）。至少检查桌面与窄屏两套布局。

**UI 文案**：优先放 `src/ui/copy.ts` 或相邻既有文案处，避免同一中文文案散落多处。

**桌面端文件访问**：改 JSON/Markdown/白板导入导出时，同时扫 `src/lib/fileAccess.ts`、`src/app/App.tsx`、`src-tauri/capabilities/default.json` 和相关测试。Tauri dialog 选中的路径会进入临时 fs scope，但读写命令本身仍需要 capability。

## Claude Code 专属约束

- **定位优先用搜索工具**：用 Grep/Glob/Explore 子代理先读相邻实现与测试，再编辑；`createWorkspaceStore.ts`、`App.tsx`、`domain/markdown.ts` 都是大文件，按需 offset 读，别整文件硬塞上下文。
- **保持改动小而聚焦**：不做无关重构、全仓格式化、依赖升级，除非用户明确要求。保持现有无分号、单引号、两空格缩进风格。
- **不要覆盖用户未提交的改动**：工作区若已有变化，先辨认是否相关——相关则在其上继续，不相关则不动。
- **不要直接编辑** `package-lock.json`、`public/mindmap-web/assets/*`、白板 `legacy/` 等静态/生成资产，除非任务明确涉及依赖安装、bundle 更新或 legacy 兼容修复。
- **不要提交桌面构建产物**：`src-tauri/target/`、macOS `.app`、`.dmg` 等保持忽略；需要交付安装包时只在最终回复中说明产物路径。
- **本地优先数据要谨慎**：导入、导出、迁移、删除、孤儿清理类改动必须补测试，并保护旧快照兼容性。
- 测试就近放置，命名 `*.test.ts(x)`；SQLite repository 测试使用 `src/test/sqliteTestDatabase.ts` 的内存 fake，普通 store 测试继续使用 `src/test/memoryRepository.ts`。
- 不要为了过 lint 删掉仍有语义价值的类型或测试；先看懂调用链再做最小改动。
