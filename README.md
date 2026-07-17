# 🌿 知栖

知栖是一个本地优先的个人知识库桌面应用，使用 Tauri 2、React 和 SQLite 构建。它提供类 Notion 的层级页面、块编辑器、白板、数据表格、思维导图、搜索以及导入导出能力；知识库数据保存在本机，应用入口需要知栖账号登录。

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
- 📦 **跨平台打包与更新**：提供 macOS `.app`/`.dmg`、Windows NSIS `.exe`，并通过签名更新包完成应用内升级。

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
ZHIQI_API_BASE_URL=http://117.72.91.46 npm run tauri:dev
```

`npm run tauri:dev` 会启动 Vite 开发服务器并打开桌面窗口。只调试前端时可以运行：

```bash
npm run dev
```

首次启动会创建默认工作区。桌面端数据保存在 Tauri 应用数据目录中的 `zhiqi.db`；应用管理的文件资产保存在同目录下的 `zhiqi-assets/`。

## 🔐 账号登录

- 仅支持纯数字 QQ 邮箱注册，注册后需要通过邮件页面完成验证。
- 用户会话固定 24 小时。启动和窗口恢复时会在线校验；网络或服务临时不可用时，未过期的本机凭据可离线进入。
- 会话 Token 由 Rust 保存到 macOS Keychain 或 Windows Credential Manager，不写入知识库数据库、localStorage 或 React 状态。
- 未登录、账号停用或会话过期时不会初始化工作区，也不会启动本机 MCP；退出登录不会删除本地内容。

账号服务和更新服务 origin 在编译时通过 `ZHIQI_API_BASE_URL` 注入。Debug 构建允许 HTTP 联调；`npm run tauri:build` 会优先读取环境变量，否则读取 `~/.config/zhiqi/updater/` 中的本机 updater 密钥。当前未设置 API 地址时默认使用 `http://117.72.91.46`，包装脚本会显式开启仅供开发联调的 HTTP transport：

```bash
npm run tauri:build
```

正式构建应设置 HTTPS 地址；此时包装脚本不会开启不安全 transport：

```bash
ZHIQI_API_BASE_URL=https://account.example.com \
TAURI_SIGNING_PRIVATE_KEY='<private-key-content>' \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='<private-key-password>' \
npm run tauri:build:mac
```

单独运行 `npm run dev` 只用于前端静态调试，不提供真实账号或工作区访问；完整联调使用 `npm run tauri:dev`。

## 🔄 客户端更新与签名

客户端启动时在登录和工作区初始化前检查一次更新，设置中心“关于与更新”也可手动检查。普通更新允许稍后处理；服务端明确返回最低支持版本时显示更新门禁。检查服务不可用或下载失败时仍可本次离线进入，避免锁住本地知识库。

首次发布前生成并离线备份 Tauri updater 密钥：

```bash
npm run tauri -- signer generate -w ~/.config/zhiqi/updater.key
```

私钥内容和密码只通过 `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 提供；本机构建包装脚本可从安全目录读取私钥内容后仅传给构建子进程。公钥固定在客户端 Tauri 配置中，并同时配置到服务端 `TAURI_UPDATER_PUBLIC_KEY`。私钥不得进入仓库、管理后台或服务器。首版发布后更换公钥会使旧客户端无法验证新更新包。

本地正式产物按平台构建：

```bash
npm run tauri:build:windows
npm run tauri:build:mac:aarch64
```

Windows 只发布 current-user NSIS `setup.exe` 及 `.sig`。macOS 只发布 Apple Silicon 的 `.app.tar.gz`、`.sig` 和 `.dmg`，不再构建或发布 Intel 版本。Apple 签名/公证和 Windows Authenticode 与 Tauri updater 签名相互独立，缺少系统签名的产物只用于开发联调。

## 🤖 本机 AI / MCP 接入

知栖桌面版可启动仅监听 `127.0.0.1` 的 Streamable HTTP MCP 服务。获得令牌的本机 AI 客户端可以搜索、读取和创建页面，并向页面原子写入 Markdown、普通表格、图片/视频/音频/附件、数据表、白板和思维导图；创建子页面时会同步在父页面追加对应的子页面块。

### 在 Chatbox 或 Cherry Studio 中配置

1. 打开知栖“设置”，启用“本机 MCP 接入”。
2. 点击“复制 MCP 配置”。复制内容已经包含当前端口和 Bearer 令牌，不需要手工拼接。
3. 在 Chatbox 或 Cherry Studio 的 MCP 设置中新增或导入服务，粘贴配置并刷新工具列表。
4. 确认客户端能看到 `search_pages`、`get_page`、`create_page`、`append_content`、`get_whiteboard`、`update_whiteboard` 六个工具。

复制出的配置使用下面的标准结构（占位符不是实际值）：

```json
{
  "mcpServers": {
    "zhixi": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:<端口>/mcp",
      "headers": {
        "Authorization": "Bearer <令牌>"
      }
    }
  }
}
```

### 页面与白板工具

- `search_pages` 搜索页面；`get_page(pageId)` 读取页面；`create_page` 创建页面。传入 `parentId` 创建子页面时，知栖会在同一事务中把 `child_page` 块追加到父页面，并在回执中返回 `parentBlockId`。
- `append_content` 只用于向页面原子追加内容；其中的 `whiteboard` 项用于新建白板。
- `get_whiteboard(boardId)` 返回白板标题和完整快照。AI 在引用元素或擦除前应先读取快照。
- `update_whiteboard(boardId, nodes?, edges?, strokes?, eraseIds?)` 仅作增量追加或局部擦除，不支持整板覆盖或清空。至少提供一种新增内容或 `eraseIds`。

白板节点使用 `nodes`：`kind` 可为 `rect`、`ellipse`、`diamond`、`triangle`、`note`、`text`；每个节点必须提供 `id` 和 `text`，并可指定 `x`、`y`、`w`、`h`、`color`、`size`、`z`。流程图和架构图可通过 `edges` 指定 `from`、`to`、`fromSide`、`toSide`（`n`/`e`/`s`/`w`）、精确锚点 `fromAnchor`/`toAnchor`、`mode`（`straight` 或 `curve`）、起止标记、颜色和线宽。`strokes` 是画笔权限，写入 `id`、`color`、`size` 和坐标 `points`；`eraseIds` 是橡皮擦权限，可擦除形状、便签、文本、连线和笔画，擦除节点会级联删除关联连线。

同一白板内的节点、连线和笔画 ID 必须全局唯一。历史图片可以作为连线已有端点，但目前 MCP 不新增或擦除图片；指定不存在、不可擦除或重复的 `eraseIds` 时，整次更新会以 `invalid_payload` 回滚，不写入快照或审计记录。

### `append_content` 完整批次规则

- `content` 中的所有项目在一个原子批次内处理；任意一项非法时，整批都不会写入。
- 数据表自带标题字段。每条记录的标题写在 `records[].title`；不要在 `columns` 中再定义 `type: "title"`。
- 成功结果会返回 `createdContent`。外部 AI 应逐项核对其中的 `index`、`type`、`blockIds` 和可选 `objectId`，只有类型与数量都和原请求一致时才能报告完整成功。
- 错误消息会指出 `content[index] (type)`。修正后必须重新发送完整原子批次，不能只补写出错的那一项。

示例：

```json
{
  "pageId": "page_id",
  "content": [
    { "type": "markdown", "markdown": "# 标题\n正文" },
    { "type": "table", "hasHeaderRow": true, "rows": [["名称", "状态"], ["验收", "通过"]] },
    { "type": "asset", "name": "示意图.png", "mimeType": "image/png", "dataBase64": "..." },
    {
      "type": "dataTable",
      "title": "任务",
      "columns": [{ "key": "status", "name": "状态", "type": "select" }],
      "records": [{ "title": "检查 MCP", "values": { "status": "完成" } }]
    },
    {
      "type": "whiteboard",
      "title": "流程",
      "nodes": [{ "id": "start", "kind": "ellipse", "text": "开始" }],
      "edges": []
    },
    {
      "type": "mindmap",
      "title": "结构",
      "root": { "text": "中心", "children": [{ "text": "分支" }] }
    }
  ]
}
```

### 安全与排障

- 令牌等同于对当前知栖工作区的本机写入权限。不要把完整配置粘贴到聊天、截图、日志或公开仓库。
- 服务不接受局域网或公网连接，也不提供页面删除、整页覆盖和移动工具；仅 `update_whiteboard` 允许受限的元素擦除。
- 点击“重新生成令牌”后，旧令牌立即失效；所有 AI 客户端都要重新粘贴配置。
- 客户端看不到工具时，先确认知栖仍在运行、MCP 已启用，再刷新客户端工具列表；更新知栖后建议重启客户端，使其重新读取工具描述和 schema。
- 出现 `401` 表示令牌缺失或已失效；出现 `content[n]` 错误时按提示修正第 `n` 项，并重发完整批次。
- 仓库中的 `scripts/mcp-smoke-test.mjs` 可用于协议回归。通过环境变量提供 URL 和令牌后运行，脚本不会打印令牌：

```powershell
$env:ZHIXI_MCP_URL='http://127.0.0.1:<端口>/mcp'
$env:ZHIXI_MCP_TOKEN='<令牌>'
node scripts/mcp-smoke-test.mjs
```

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
- 🪟 `npm run tauri:build:windows`：在 Windows 上生成 NSIS `.exe` 和 updater 签名产物。
- 🧳 `npm run tauri:build:windows:cross`：通过 `cargo-xwin` 交叉构建 x64 Windows NSIS 安装包。

运行单个测试示例：

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
npx vitest run src/lib/workspaceRepository.test.ts
```

## 🗄️ 数据与导入导出

工作区核心数据保存在本地 SQLite 数据库 `zhiqi.db` 中。新的页面包和完整工作区备份均使用 `.zhiqi` ZIP 归档，内含结构化内容和关联媒体文件；页面包导入会新增为顶层页面树，完整备份恢复会覆盖当前工作区并要求确认。应用仍可导入旧版 `.zip` 页面包和 `.json` 工作区备份，但旧 JSON 不含当时未随文件导出的媒体二进制内容。

## 📦 打包

Tauri 主配置位于 `src-tauri/tauri.conf.json`，Windows 覆盖配置位于 `src-tauri/tauri.windows.conf.json`。仓库提供 GitHub Actions 工作流 `.github/workflows/tauri-packages.yml`，可在 macOS 和 Windows runner 上生成安装包 artifact。
