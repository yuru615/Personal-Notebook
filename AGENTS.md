# AGENTS.md

本文件面向后续 AI 维护者。修改代码前先读本文件、`README.md`、相关源码和相邻测试；以现有架构为准，避免凭印象大范围改动。

## 项目定位

知栖是一个本地优先的类 Notion 个人知识库桌面应用。当前主运行形态是 Tauri 2 桌面应用：React 前端负责编辑体验和业务逻辑，Tauri 壳提供原生窗口、托盘、文件对话框、文件读写、SQLite 持久化和安装包构建。

核心数据保存在本机 SQLite 数据库 `zhiqi.db` 中，不依赖后端服务。文件资产由应用管理在 `zhiqi-assets/`。导入、导出、删除和清理类改动必须保护 JSON 备份契约和用户本地数据。

主要功能：

- 页面系统：层级页面树、页面标题、图标、封面、面包屑、页面目录、最近打开页面和页面显示设置。
- 块编辑器：段落、标题、待办、列表、代码、普通表格、子页面、白板入口、数据表入口、思维导图入口。
- 富文本：加粗、斜体、下划线、删除线、链接、文字颜色，以及部分块级文本样式。
- 白板：独立白板页面和块入口，支持缩放、平移、选择、拖拽、连线、撤销重做。
- 数据表：独立数据表页面、内联数据表块、字段、视图、筛选、排序、分组、表格、看板、日历、Gantt 等视图。
- 思维导图：独立思维导图页面和块入口，通过 `public/mindmap-web/` 静态 bundle 与宿主应用集成。
- 搜索与导入导出：工作区搜索、JSON 备份/恢复、Markdown 页面包导入导出、孤立资源清理。

## 技术栈

- 构建与开发：Vite、TypeScript、React 19、React DOM。
- 桌面端：Tauri 2、Rust、`@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`、`rusqlite`。
- 路由：`react-router-dom`，桌面打包默认使用 `HashRouter`。
- 状态管理：`zustand/vanilla`，React 侧通过 `useSyncExternalStore` 订阅。
- 本地存储：SQLite，Rust 侧通过 `rusqlite` 访问，前端通过类型化 Tauri 命令读写。
- 拖拽：`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`。
- UI 辅助：`lucide-react`、`clsx`。
- 数据表/公式/导出辅助：`expr-eval`、`jszip`。
- 测试：Vitest、Testing Library、jsdom、jest-dom matchers。
- 静态检查：ESLint flat config、typescript-eslint、React Hooks lint、React Refresh lint。

## 目录结构

```text
.
├── docs/                         # 设计说明和实施计划文档
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── mindmap-web/              # 思维导图静态 bundle、宿主覆盖和增强脚本
├── src/
│   ├── app/                      # 应用入口、HashRouter 路由编排、顶层状态连接
│   ├── components/
│   │   ├── dataTable/            # 数据表页面、领域模型、store、视图组件
│   │   ├── editor/               # 块编辑器、块组件、浮层/菜单/页面头部
│   │   ├── export/               # 导入导出面板
│   │   ├── layout/               # 应用外壳布局
│   │   ├── mindmap/              # 思维导图页面、iframe 宿主、静态 bundle 校验
│   │   ├── search/               # 搜索弹窗
│   │   ├── shared/               # 跨功能共享组件
│   │   ├── sidebar/              # 左侧页面树
│   │   └── whiteboard/           # 白板页面、模型、预览和数据处理
│   ├── domain/                   # 全局领域类型、Markdown、搜索、富文本、种子数据
│   ├── lib/                      # Tauri storage client、文件访问边界和 WorkspaceRepository
│   ├── store/                    # 工作区状态和业务操作
│   ├── styles/                   # 全局 CSS 和样式回归测试
│   ├── test/                     # 测试初始化和内存仓库
│   ├── ui/                       # 文案常量
│   └── utils/                    # ID、块工厂、页面树、重排、文件名等工具
├── src-tauri/
│   ├── capabilities/             # Tauri 权限声明
│   ├── icons/                    # 桌面应用图标
│   ├── src/                      # Rust 入口、插件注册、托盘、storage commands
│   ├── tauri.conf.json           # 主 Tauri 配置
│   ├── tauri.windows.conf.json   # Windows 打包覆盖配置
│   ├── Cargo.toml
│   └── Cargo.lock
├── eslint.config.js
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

## 常用命令

```bash
npm install
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

- `npm run dev`：启动 Vite 开发服务器，仅调试前端。
- `npm test`：以 `vitest run` 执行全部测试。
- `npm run lint`：执行 ESLint。
- `npm run build`：先 `tsc -b` 类型检查，再 `vite build`。
- `npm run tauri:dev`：启动 Tauri 桌面开发模式，会自动拉起 Vite。
- `npm run tauri:build`：按当前平台构建并打包桌面应用。
- `npm run tauri:build:mac`：在 macOS 上打包 `.app` 和 `.dmg`。
- `npm run tauri:build:windows`：在 Windows 上打包 NSIS `.exe` 和 MSI `.msi`。
- `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。

运行单个测试示例：

```bash
npx vitest run src/lib/fileAccess.test.ts
npx vitest run src/lib/workspaceRepository.test.ts
npx vitest run -t "restores window"
```

## 桌面端边界

- Tauri 配置集中在 `src-tauri/tauri.conf.json`。其中 `beforeDevCommand`/`beforeBuildCommand` 连接 Vite 构建，`devUrl` 是 `http://localhost:5173`，`frontendDist` 指向 `../dist`。
- Windows 打包覆盖配置在 `src-tauri/tauri.windows.conf.json`，包含 NSIS/MSI、WebView2 bootstrapper、WiX upgrade code、安装语言和 currentUser 安装模式。
- Rust 入口在 `src-tauri/src/lib.rs`，注册 dialog/fs 插件和自定义 storage commands，声明 `open_external_url` 命令，创建系统托盘，并把主窗口关闭行为改为隐藏到托盘。
- Tauri 权限集中在 `src-tauri/capabilities/default.json`。新增或收紧前端可调用能力时，同步检查 capability、插件注册、前端调用和打包。
- 外部链接统一走 `src/lib/externalLinks.ts`：桌面端调用 Rust `open_external_url`，只允许 `http://`、`https://`、`mailto:`；浏览器环境回退到 `window.open`。
- 文件打开/保存统一走 `src/lib/fileAccess.ts`：桌面端用 Tauri dialog/fs 插件，浏览器环境回退到 `<input type="file">` 和 Blob 下载。业务组件不要直接调用 Tauri dialog/fs API。
- SQLite 连接、schema、事务、FTS 搜索和文件资产管理集中在 `src-tauri/src/storage/`。前端通过 `src/lib/storageClient.ts` 和 `src/lib/workspaceRepository.ts` 访问，不要在组件里直接写 SQL 或调用存储 command。
- `src/app/App.tsx` 默认使用 `HashRouter`，避免桌面打包后静态资源路径和刷新问题；测试可注入 `MemoryRouter`。

## 数据与持久化

- `src/domain/types.ts` 是页面、块、白板、数据表、思维导图和工作区快照的全局契约源头。
- `src/store/createWorkspaceStore.ts` 是工作区状态中枢。数据变更应通过这里暴露的 action 完成，并由 `WorkspaceRepository` 持久化。
- SQLite schema 当前包含 `pages`、`page_contents`、`block_refs`、`boards`、`board_snapshots`、`data_tables` 及其子表、`mindmaps`、`mindmap_snapshots`、`assets`、`asset_refs`、`search_documents`、`search_documents_fts`、`settings`。
- 页面内容、白板快照、数据表记录和思维导图快照分表持久化；顺序通过 `position` 保留。
- 首次启动时，如果 storage 里没有 settings，`ensureSnapshot` 会写入 `src/domain/seed.ts` 的默认工作区。
- JSON 导入会覆盖当前本地工作区。修改导入、导出、清理孤儿资源时要补测试，并确认 JSON 备份可 normalize。

## 代码规范

- 使用 TypeScript 和 React 函数组件；保持现有无分号、单引号、两空格缩进风格。
- 优先复用现有领域类型和工具函数，避免在组件中复制领域逻辑。
- 新增或修改块类型时，同步检查 `src/domain/types.ts`、`src/utils/blockFactory.ts`、store 操作、编辑器渲染、导入导出、搜索、normalize 和相关测试。
- 工作区数据变更必须经 store action 和 repository；不要在组件、子应用或视图层直接写 SQL。
- 桌面文件访问必须经 `src/lib/fileAccess.ts`；外部链接必须经 `src/lib/externalLinks.ts`。
- SQLite schema 变更集中在 `src-tauri/src/storage/schema.rs`；新增表或索引时考虑 JSON 导入导出、Rust storage 测试和跨平台打包。
- 组件层保持职责清晰：`src/app/App.tsx` 负责顶层编排，具体交互逻辑尽量放到所属组件、领域模型或 store。
- UI 文案优先放在 `src/ui/copy.ts` 或相邻既有文案位置，避免相同中文文案散落多处。
- 样式优先沿用 `src/styles/index.css` 的现有类名与布局约定；涉及布局、层级、尺寸、边框等视觉回归时补充或更新 `src/styles/*.test.ts`。
- 测试文件与被测文件就近放置，命名为 `*.test.ts` 或 `*.test.tsx`；前端持久化测试使用 storage client fake，Rust 持久化测试使用内存 SQLite。
- 不要为了通过 lint 删除仍有语义价值的类型或测试；先理解调用链，再做最小改动。

## 改动联动清单

- 修改白板、数据表、思维导图时，同时验证独立页面入口和块入口。
- 修改路由或导航时，同时检查页面树、面包屑、最近打开页面、缺失资源恢复逻辑，以及桌面端 `HashRouter` 下的路径行为。
- 修改导入导出或文件访问时，同时验证浏览器路径和 Tauri 桌面路径。
- 修改编辑器交互时，同时检查键盘输入、组合输入、富文本、浮层关闭、拖拽、撤销重做。
- 修改外部链接、安全边界或 Tauri 命令时，同时检查 Rust 允许列表、前端封装、测试和 capability。
- 修改 Tauri 配置、插件、capability、图标、bundle 或 Rust 入口时，按当前平台至少运行相关 Rust/前端测试；发布前运行 Tauri 打包。
- 修改样式时至少检查桌面和窄屏布局，避免按钮文字溢出、浮层遮挡、嵌套卡片和不必要的单色调视觉。

## AI 维护约束

- 改动前先用 `rg`/`rg --files` 定位相关代码，阅读相邻实现和测试后再编辑。
- 保持改动小而聚焦，不做无关重构、格式化全仓或依赖升级，除非用户明确要求。
- 不要覆盖用户未提交的改动；若工作区已有变化，先辨认是否相关，相关时在现有改动上继续，非相关则忽略。
- 不要直接编辑 `package-lock.json`、`public/mindmap-web/assets/*` 或静态 bundle 资源，除非任务明确涉及依赖安装、静态 bundle 更新或相关修复。
- 不要提交 `src-tauri/target/`、`.app`、`.dmg`、`.msi`、NSIS `.exe` 等构建产物；Tauri schema、capabilities、平台配置、图标和 `Cargo.lock` 这类源码/配置文件可以随代码提交。
- 对本地优先数据保持谨慎：导入、导出、删除、清理孤儿资源等操作要补测试，并保护 JSON 备份契约。
- 完成代码改动后按风险运行验证：小改动至少运行相关测试；共享逻辑或数据模型改动运行 `npm test`；发布前运行 `npm run lint` 和 `npm run build`；涉及 Tauri、文件访问、路由或打包配置时运行当前平台对应的 Tauri 打包命令。Windows 产物优先用 Windows runner 验证 `npm run tauri:build:windows`。
- 如果不能运行验证命令，要在最终回复中明确说明原因和剩余风险。

## 更新记录维护

- 每次提交包含功能、体验、数据、打包、架构或用户可感知变化时，提交前必须更新 `docs/updates.md`。
- 更新记录先写简要描述，再写详细描述，并补充验证情况；小修复可合并进同一天同一主题。
