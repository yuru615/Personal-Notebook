# AGENTS.md

本文件面向后续 AI 维护者。修改代码前先读本文件、`README.md`、相关源码和相邻测试；以现有架构为准，避免凭印象大范围改动。

## 项目概览

这是一个本地优先的类 Notion 个人知识库桌面应用，通过 Tauri 运行和打包。核心数据保存在本机 SQLite 数据库中，前端直接提供页面编辑、结构化内容、白板、数据表、思维导图和导入导出能力；桌面端通过 Tauri dialog/fs 插件提供原生文件打开和保存体验。

主要功能点：

- 页面系统：层级页面树、页面标题、图标、封面、面包屑、页面目录、全宽/小字号/字体/目录显示设置。
- 块编辑器：段落、标题、待办、无序/有序列表、代码、普通表格、子页面、白板入口、数据表入口、思维导图入口。
- 富文本：加粗、斜体、下划线、删除线、链接、文字颜色，以及部分块级文本样式。
- 普通表格：行列增删、单元格样式、对齐、列宽、行高等。
- 白板：独立白板页面和块入口，支持缩放、平移、选择、拖拽、连线、撤销重做，并保留 legacy 白板兼容逻辑。
- 数据表：独立数据表页面、内联数据表块、字段/视图/筛选/排序/分组、表格/看板/日历/Gantt 等视图。
- 思维导图：独立思维导图页面和块入口，包含静态打包资源与宿主增强脚本。
- 搜索与导入导出：工作区搜索、JSON 备份/恢复、Markdown 导入导出相关逻辑。
- 桌面端：Tauri 壳、SQLite 本地数据库、原生打开/保存对话框、HashRouter 路由适配，以及 macOS bundle/dmg、Windows NSIS/MSI 打包。

## 技术栈

- 构建与开发：Vite、TypeScript、React 19、React DOM。
- 桌面端：Tauri 2、Rust、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`、`@tauri-apps/plugin-sql`。
- 路由：`react-router-dom`。
- 状态管理：`zustand/vanilla`，React 侧通过 `useSyncExternalStore` 订阅。
- 本地存储：SQLite；前端通过 Tauri SQL 插件访问。
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
│   ├── app/                      # 应用入口、路由编排、顶层状态连接
│   ├── components/
│   │   ├── dataTable/            # 数据表页面、领域模型、store、视图组件
│   │   ├── editor/               # 块编辑器、块组件、浮层/菜单/页面头部
│   │   ├── export/               # 导入导出面板
│   │   ├── layout/               # 应用外壳布局
│   │   ├── mindmap/              # 思维导图页面、模型、静态 bundle 校验
│   │   ├── search/               # 搜索弹窗
│   │   ├── shared/               # 跨功能共享组件
│   │   ├── sidebar/              # 左侧页面树
│   │   └── whiteboard/           # 白板页面、模型、预览、legacy 兼容代码
│   ├── domain/                   # 全局领域类型、Markdown、搜索、富文本、种子数据
│   ├── lib/                      # SQLite 数据库连接和 WorkspaceRepository
│   ├── store/                    # 工作区状态和业务操作
│   ├── styles/                   # 全局 CSS 和样式回归测试
│   ├── test/                     # 测试初始化与内存仓库
│   ├── ui/                       # 文案常量
│   └── utils/                    # ID、块工厂、页面树、重排、文件名等工具
├── src-tauri/                    # Tauri 桌面应用配置、Rust 入口、capabilities 和图标
├── eslint.config.js
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

## 运行命令

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

命令用途：

- `npm run dev`：启动 Vite 开发服务器。
- `npm test`：以 `vitest run` 执行全部测试。
- `npm run lint`：执行 ESLint。
- `npm run build`：先 `tsc -b` 类型检查，再 `vite build`。
- `npm run preview`：预览生产构建。
- `npm run tauri:dev`：启动 Tauri 桌面开发模式。
- `npm run tauri:build`：构建并打包 Tauri 桌面应用。
- `npm run tauri:build:mac`：在 macOS 上打包 `.app` 和 `.dmg`。
- `npm run tauri:build:windows`：在 Windows 上打包 NSIS `.exe` 和 MSI `.msi`。
- `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。
- `npm run test:watch`：本地 watch 模式调试测试。

## 代码规范

- 使用 TypeScript 和 React 函数组件；保持现有无分号、单引号、两空格缩进风格。
- 优先复用现有领域类型：`src/domain/types.ts` 是页面、块、白板、数据表、思维导图和工作区快照的全局契约源头。
- 新增或修改块类型时，同步检查类型定义、`utils/blockFactory.ts`、store 操作、编辑器渲染、导入导出、搜索和相关测试。
- 工作区数据变更应通过 `src/store/createWorkspaceStore.ts` 暴露的操作完成，并经 `WorkspaceRepository` 持久化；不要在组件里直接写 SQL。
- 桌面文件访问应通过 `src/lib/fileAccess.ts` 统一适配；不要在业务组件里直接调用 Tauri fs/dialog API。
- Tauri 权限集中在 `src-tauri/capabilities/*.json`；新增桌面端 API 时同步检查 capability、插件注册和桌面打包。
- SQLite schema 变更集中在 `src/lib/sqliteDatabase.ts`；新增表或索引时要考虑 JSON 导入兼容和旧 SQLite 库升级。
- 组件层保持职责清晰：`src/app/App.tsx` 负责顶层编排，具体交互逻辑尽量放到所属组件、领域模型或 store。
- UI 文案优先放在 `src/ui/copy.ts` 或相邻既有文案位置，避免相同中文文案散落多处。
- 样式优先沿用 `src/styles/index.css` 的现有类名与布局约定；涉及布局、层级、尺寸、边框等视觉回归时补充或更新 `src/styles/*.test.ts`。
- 测试文件与被测文件就近放置，命名为 `*.test.ts` 或 `*.test.tsx`；SQLite 持久化测试使用 `src/test/sqliteTestDatabase.ts` 的内存 fake。
- 不要为了通过 lint 删除仍有语义价值的类型或测试；先理解调用链，再做最小改动。

## AI 维护约束

- 改动前先用 `rg`/`rg --files` 定位相关代码，阅读相邻实现和测试后再编辑。
- 保持改动小而聚焦，不做无关重构、格式化全仓或依赖升级，除非用户明确要求。
- 不要覆盖用户未提交的改动；若工作区已有变化，先辨认是否相关，相关时在现有改动上继续，非相关则忽略。
- 不要直接编辑 `package-lock.json`、`public/mindmap-web/assets/*` 或 legacy 静态资源，除非任务明确涉及依赖安装、静态 bundle 更新或 legacy 兼容修复。
- 不要提交 `src-tauri/target/`、`.app`、`.dmg`、`.msi`、NSIS `.exe` 等构建产物；Tauri schema、capabilities、平台配置、图标和 `Cargo.lock` 这类源码/配置文件可以随代码提交。
- 对本地优先数据保持谨慎：导入、导出、迁移、删除、清理孤儿资源等操作要补测试，并保护旧快照兼容性。
- 修改白板、数据表、思维导图这类嵌入式功能时，同时验证独立页面入口和块入口。
- 修改路由或导航时，同时检查页面树、面包屑、最近打开页面、缺失资源恢复逻辑，以及桌面端 `HashRouter` 下的路径行为。
- 修改导入导出或文件访问时，同时验证浏览器路径和 Tauri 桌面路径。
- 修改编辑器交互时，同时检查键盘输入、组合输入、富文本、浮层关闭、拖拽、撤销重做。
- 修改样式时至少检查桌面和窄屏布局，避免按钮文字溢出、浮层遮挡、嵌套卡片和不必要的单色调视觉。
- 完成代码改动后按风险运行验证：小改动至少运行相关测试；共享逻辑或数据模型改动运行 `npm test`；发布前运行 `npm run lint` 和 `npm run build`；涉及 Tauri、文件访问、路由或打包配置时运行当前平台对应的 Tauri 打包命令。Windows 产物优先用 Windows runner 验证 `npm run tauri:build:windows`。
- 如果不能运行验证命令，要在最终回复中明确说明原因和剩余风险。
