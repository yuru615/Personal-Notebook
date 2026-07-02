# 知栖

知栖是一个本地优先的个人知识库桌面应用，使用 Tauri 2、React 和 SQLite 构建。它提供类 Notion 的层级页面、块编辑器、白板、数据表格、思维导图、搜索以及导入导出能力；数据默认保存在本机，不依赖后端服务。

## 功能

- 页面与块编辑：层级页面树、面包屑、页面目录、富文本、待办、列表、代码块、普通表格和子页面。
- 内嵌创作工具：白板、数据表格、思维导图均支持独立页面和页内入口。
- 数据管理：全局搜索、完整 ZIP 工作区备份/恢复。
- 桌面体验：Tauri 原生窗口、系统托盘、文件对话框、本地 SQLite 持久化和 macOS/Windows 打包。

## 技术栈

- 前端：Vite、TypeScript、React 19、React DOM、react-router-dom
- 桌面端：Tauri 2、Rust、Tauri dialog/fs 插件
- 状态管理：zustand/vanilla，React 侧通过 `useSyncExternalStore` 订阅
- 本地存储：SQLite，Rust 侧通过 `rusqlite` 访问，前端通过类型化 Tauri 命令读写
- 编辑辅助：@dnd-kit、lucide-react、clsx、expr-eval、jszip
- 质量保障：Vitest、Testing Library、jsdom、ESLint flat config

## 快速开始

先安装 Node.js 当前 LTS、npm、Rust 工具链，以及当前系统所需的 Tauri 平台依赖。

```bash
npm install
npm run tauri:dev
```

`npm run tauri:dev` 会启动 Vite 开发服务器并打开桌面窗口。只调试前端时可以运行：

```bash
npm run dev
```

首次启动会创建默认工作区。桌面端数据保存在 Tauri 应用数据目录中的 `personal-notebook-v2.db`；应用管理的文件资产保存在同目录下的 `personal-notebook-assets-v2/`。这两个路径是历史兼容文件名，用于保护已有本地数据。

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

- `npm test`：运行全部 Vitest 测试。
- `npm run lint`：运行 ESLint。
- `npm run build`：执行 TypeScript 构建检查并生成前端产物。
- `npm run tauri:build`：按当前平台打包桌面应用。
- `npm run tauri:build:mac`：在 macOS 上生成 `.app` 和 `.dmg`。
- `npm run tauri:build:windows`：在 Windows 上生成 NSIS `.exe` 和 MSI `.msi`。
- `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。

运行单个测试示例：

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
npx vitest run src/lib/workspaceRepository.test.ts
```

## 数据与导入导出

工作区核心数据保存在本地 SQLite 数据库 `personal-notebook-v2.db` 中。该文件名为历史兼容标识。完整 ZIP 导出会生成工作区备份并包含应用管理的文件资产；完整 ZIP 导入会覆盖当前本地工作区。执行导入或清理前建议先导出备份。

## 打包

Tauri 主配置位于 `src-tauri/tauri.conf.json`，Windows 覆盖配置位于 `src-tauri/tauri.windows.conf.json`。仓库提供 GitHub Actions 工作流 `.github/workflows/tauri-packages.yml`，可在 macOS 和 Windows runner 上生成安装包 artifact。
