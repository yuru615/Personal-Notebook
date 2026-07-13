# 🌿 知栖

知栖是一个本地优先的个人知识库桌面应用，使用 Tauri 2、React 和 SQLite 构建。它提供类 Notion 的层级页面、块编辑器、白板、数据表格、思维导图、搜索以及导入导出能力；数据默认保存在本机，不依赖后端服务。

## ✨ 功能总览

### 🗂️ 页面与知识组织

- 🌳 **层级页面树**：在侧边栏管理父子页面，支持展开、折叠和快速新建页面。
- 🧭 **页面导航**：提供面包屑、最近打开页面、缺失资源恢复和页面目录。
- 🎨 **页面外观**：支持页面标题、图标、封面、小字号正文、字体切换、目录开关和自适应正文宽度。
- 🧱 **子页面块**：可以把子页面作为页面内容的一部分嵌入，适合拆分长文档和项目资料。

### ✍️ 块编辑器

- 📝 **基础文本块**：段落、一级/二级/三级标题、待办、无序列表、有序列表和代码块。
- 📊 **普通表格**：适合轻量表格记录，支持行列编辑、单元格样式、列宽和行高。
- 🖼️ **媒体块**：支持图片、视频、音频等本地文件资产，并保存在应用管理的资源目录中。
- ⚡ **斜杠菜单**：输入 `/` 快速插入不同类型的块，并支持关键词筛选。
- 🧲 **块级操作**：支持块插入、转换、拖拽排序、删除，以及文本块颜色和对齐等样式。

### 🖋️ 富文本与样式

- **行内富文本**：支持加粗、斜体、下划线、删除线、链接和文字颜色。
- **块级样式**：支持文字颜色、背景色、居中对齐等常用页面排版能力。
- **Markdown 友好**：富文本内容可转换为 Markdown 兼容表达，便于备份和迁移。

### 🧩 内嵌创作工具

- 🧠 **思维导图**：支持独立思维导图页面和页内导图入口，导图标题、主题、节点结构和视口状态会持久化。
- 🧮 **数据表格**：支持独立数据表页面和内联数据表块，既能作为页面入口，也能直接在当前页面中编辑。
- 🧑‍🎨 **白板**：支持独立白板页面和白板卡片入口，适合草图、流程图、灵感整理和视觉化思考。

### 🧑‍🎨 白板

- ✏️ **自由绘制**：支持画笔、便签、文本、图片和多种基础图形。
- 🔗 **连线关系**：支持直线/曲线连接、方向标记和连接点，适合流程图与关系图。
- 🔍 **画布操作**：支持缩放、平移、选择、拖拽、层级和撤销重做。
- 💾 **本地快照**：白板内容作为结构化快照保存，可从页面块或独立页面继续编辑。

### 🧮 数据表格

- 🧾 **字段类型**：支持标题、文本、数字、单选、多选、日期、复选框和公式字段。
- 👁️ **多视图**：支持表格、看板、日历和甘特图视图，并可为同一数据表创建多个视图。
- 🔎 **筛选排序**：支持筛选、排序、分组、隐藏字段、冻结首列、单元格换行和表格宽度模式。
- 🪟 **记录页面**：记录可用侧边预览、居中预览或完整页面打开，并支持记录内块内容编辑。
- 🧹 **孤立数据清理**：提供孤立数据表格清理入口，减少无引用资源残留。

### 🔍 搜索、备份与数据保护

- 🔎 **全局搜索**：可搜索页面内容，并覆盖白板、数据表和记录等结构化内容。
- 📦 **页面包导出**：支持导出当前页面及其子页面，包含页面引用的结构化资源和文件资产。
- ♻️ **页面包导入**：支持把页面包导入为新的顶层页面，不覆盖现有本地内容。
- 🧹 **资源清理**：支持清理孤立白板和孤立数据表格，减少无引用内容残留。

### 🖥️ 桌面与本地优先体验

- 🗄️ **SQLite 本地持久化**：核心数据保存在本机 `zhiqi.db`，无需后端服务。
- 📁 **本地资源管理**：文件资产由应用管理在 `zhiqi-assets/`，减少外部路径失效风险。
- 🪟 **Tauri 原生能力**：支持原生窗口、系统托盘、文件对话框、文件读写和外部链接安全打开。
- 📦 **跨平台打包**：提供 macOS `.app`/`.dmg` 和 Windows NSIS `.exe`/MSI `.msi` 打包命令。

## 🧰 技术栈

- ⚛️ 前端：Vite、TypeScript、React 19、React DOM、react-router-dom
- 🖥️ 桌面端：Tauri 2、Rust、Tauri dialog/fs 插件
- 🧠 状态管理：zustand/vanilla，React 侧通过 `useSyncExternalStore` 订阅
- 🗄️ 本地存储：SQLite，Rust 侧通过 `rusqlite` 访问，前端通过类型化 Tauri 命令读写
- 🧩 编辑辅助：@dnd-kit、lucide-react、clsx、expr-eval、jszip
- ✅ 质量保障：Vitest、Testing Library、jsdom、ESLint flat config

## 🚀 快速开始

先安装 Node.js 当前 LTS、npm、Rust 工具链，以及当前系统所需的 Tauri 平台依赖。

```bash
npm install
npm run tauri:dev
```

`npm run tauri:dev` 会启动 Vite 开发服务器并打开桌面窗口。只调试前端时可以运行：

```bash
npm run dev
```

首次启动会创建默认工作区。桌面端数据保存在 Tauri 应用数据目录中的 `zhiqi.db`；应用管理的文件资产保存在同目录下的 `zhiqi-assets/`。

## 🛠️ 常用命令

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

- 🧪 `npm test`：运行全部 Vitest 测试。
- 🧹 `npm run lint`：运行 ESLint。
- 🏗️ `npm run build`：执行 TypeScript 构建检查并生成前端产物。
- 📦 `npm run tauri:build`：按当前平台打包桌面应用。
- 🍎 `npm run tauri:build:mac`：在 macOS 上生成 `.app` 和 `.dmg`。
- 🪟 `npm run tauri:build:windows`：在 Windows 上生成 NSIS `.exe` 和 MSI `.msi`。
- 🧳 `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。

运行单个测试示例：

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
npx vitest run src/lib/workspaceRepository.test.ts
```

## 🗄️ 数据与导入导出

工作区核心数据保存在本地 SQLite 数据库 `zhiqi.db` 中。页面包 ZIP 导出会生成页面包清单和相关文件资产；页面包导入会新增为顶层页面树，不覆盖现有页面。删除和清理资源前仍建议谨慎确认。

## 📦 打包

Tauri 主配置位于 `src-tauri/tauri.conf.json`，Windows 覆盖配置位于 `src-tauri/tauri.windows.conf.json`。仓库提供 GitHub Actions 工作流 `.github/workflows/tauri-packages.yml`，可在 macOS 和 Windows runner 上生成安装包 artifact。
