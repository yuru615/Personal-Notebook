# 知栖本机 MCP 完整交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整交付仅限回环地址、受令牌保护的 MCP 服务，使桌面 AI 客户端可以搜索和读取页面、创建页面，并原子写入 Markdown、普通表格、图片、视频、音频、附件、数据表、白板与思维导图。

**Architecture:** `src-tauri/src/mcp/` 负责协议、输入校验和语义内容转换；`Storage` 提供一次事务写入页面块、复杂领域记录与审计日志的批处理边界；资产先进入知栖资产库，后续事务失败时只回滚本次新建且无引用的资产。前端只管理启用状态、连接配置、令牌轮换、错误提示和外部写入刷新，不接触 SQL。

**Tech Stack:** Tauri 2、Rust 1.96.1、rmcp、Axum、rusqlite、serde/schemars、pulldown-cmark、React 19、TypeScript、Vitest。

---

## 统一工具契约

`append_content` 保留当前 `text`/`table` 兼容输入，同时新增首选的 `content` 数组。数组项使用 `type` 判别：

```json
{
  "pageId": "page_id",
  "content": [
    { "type": "markdown", "markdown": "# 标题\n正文" },
    { "type": "table", "rows": [["名称", "金额"], ["机票", "2000"]], "hasHeaderRow": true },
    { "type": "asset", "name": "图.png", "mimeType": "image/png", "dataBase64": "...", "caption": "说明", "alt": "替代文本" },
    { "type": "asset", "localPath": "C:\\path\\clip.mp4", "mimeType": "video/mp4", "caption": "演示" },
    { "type": "dataTable", "title": "项目", "columns": [{ "key": "status", "name": "状态", "type": "select" }], "records": [{ "title": "事项 A", "values": { "status": "进行中" } }] },
    { "type": "whiteboard", "title": "流程", "nodes": [{ "id": "a", "kind": "rect", "text": "开始" }], "edges": [] },
    { "type": "mindmap", "title": "主题", "root": { "text": "中心", "children": [{ "text": "分支" }] } }
  ]
}
```

限制：一次最多 100 个内容项；普通表格最多 10,000 个单元格；Base64 解码后最多 20 MiB；资产必须且只能提供 `dataBase64` 或 `localPath` 之一；白板最多 500 个节点和 1,000 条边；思维导图最多 1,000 个节点、深度最多 32；数据表最多 100 列和 10,000 条记录。未知字段、无效引用、非有限坐标、超限内容在写入前失败。

### Task 1: 内容契约与 Markdown 转换

**Files:**
- Create: `src-tauri/src/mcp/content.rs`
- Modify: `src-tauri/src/mcp/mod.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/mcp/content.rs`

- [ ] **Step 1: 写失败测试**：覆盖 Markdown 标题、段落、待办、无序/有序列表、代码块和 GFM 表格；覆盖表格空输入、列数不一致和 10,000 单元格上限；覆盖 `content` 的 camelCase 反序列化和旧 `text`/`table` 输入兼容。
- [ ] **Step 2: 运行 `cargo test mcp::content --manifest-path src-tauri/Cargo.toml`，确认因类型/转换函数不存在而失败。**
- [ ] **Step 3: 实现 `AppendContentInput`、`ContentItem` 与 `normalize_content`**：使用 `pulldown-cmark` 生成现有块 JSON；每个块生成 `block_mcp_*` ID；空 Markdown 不产生块；所有输入先完整校验再返回规范化批次。
- [ ] **Step 4: 重新运行定向测试并确认通过。**

### Task 2: 资产写入与精确回滚

**Files:**
- Modify: `src-tauri/src/storage/assets.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/storage/models.rs`
- Test: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: 写失败测试**：Base64 图片生成 `image` 块；本机视频路径生成 `video` 块；20 MiB 超限、双来源和零来源被拒绝；目标页面不存在时本次新建资产文件与数据库行均被移除，但已存在/已引用的去重资产不受影响。
- [ ] **Step 2: 运行定向测试，确认缺少跟踪写入和精确回滚 API。**
- [ ] **Step 3: 新增跟踪资产写入结果 `{ meta, created }` 和 `remove_asset_if_unreferenced(asset_id)`**；只允许回滚本次 `created=true` 的资产；根据 MIME 生成 image/video/audio/file 块，不保存源路径。
- [ ] **Step 4: 运行资产与页面包回归测试，确认通过。**

### Task 3: 数据表、白板与思维导图语义转换

**Files:**
- Create: `src-tauri/src/mcp/semantic.rs`
- Modify: `src-tauri/src/mcp/content.rs`
- Test: `src-tauri/src/mcp/semantic.rs`

- [ ] **Step 1: 写失败测试**：数据表生成 `version: 1`、数据库、属性、记录和默认表格视图；白板生成当前 `WhiteboardSnapshot` 的节点/连线；思维导图生成当前宿主可编辑的递归节点快照；非法类型、重复节点 ID、悬空边、超限深度与记录类型不匹配均失败。
- [ ] **Step 2: 运行 `cargo test mcp::semantic --manifest-path src-tauri/Cargo.toml` 并确认失败。**
- [ ] **Step 3: 实现稳定语义转换**：仅接受编辑器已有的属性类型；select/multiSelect 由输入值生成去重选项；白板采用确定性网格布局并把边映射为 `connections`；导图递归生成唯一节点 ID 和 `childIds`。
- [ ] **Step 4: 运行定向测试并确认全部通过。**

### Task 4: 原子批处理、审计与 MCP 工具结果

**Files:**
- Create: `src-tauri/src/storage/mcp.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/mcp/mod.rs`
- Test: `src-tauri/src/storage/mcp.rs`
- Test: `src-tauri/src/mcp/mod.rs`

- [ ] **Step 1: 写失败测试**：一次请求同时写入页面块、数据表、白板和导图；任何对象校验或数据库写入失败时四类记录、页面内容和审计日志均不变化；成功时审计记录包含 client、工具、目标页和全部创建 ID。
- [ ] **Step 2: 运行定向测试并确认当前 `append_mcp_page_blocks` 无法覆盖复杂对象。**
- [ ] **Step 3: 实现 `McpWriteBatch` 与 `Storage::append_mcp_content`**：在一个 `BEGIN IMMEDIATE` 中调用私有 insert helpers、更新页面、重建索引、维护资产引用并写审计；工具返回结构化 JSON，错误返回可操作的 MCP 错误而不是伪成功字符串。
- [ ] **Step 4: 工具层接入完整 `content` 联合体，成功后发出 `zhixi://mcp-workspace-updated`；运行原子性和工具测试。**

### Task 5: 生命周期、安全和设置体验

**Files:**
- Modify: `src-tauri/src/mcp/mod.rs`
- Modify: `src-tauri/src/storage/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/storageClient.ts`
- Modify: `src/lib/appSettingsRepository.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/components/settings/SettingsCenter.tsx`
- Modify: `src/components/settings/SettingsCenter.test.tsx`
- Modify: `src/app/App.tsx`
- Test: adjacent `*.test.ts(x)` and Rust MCP tests

- [ ] **Step 1: 写失败测试**：启用中、启用失败、禁用、重启恢复、端口占用保留旧服务、重新生成令牌使旧令牌立即 401；前端显示进行中/运行/失败状态并可重试。
- [ ] **Step 2: 写失败测试**：复制内容使用 Cherry Studio 兼容的标准外层结构 `{"mcpServers":{"zhixi":{"type":"streamableHttp","url":"...","headers":{"Authorization":"Bearer ..."}}}}`；令牌不渲染到 DOM；复制失败显示错误；“重新生成令牌”需要确认。
- [ ] **Step 3: 实现 `regenerate_local_mcp_token` 命令与前端 action**，先成功启动新配置再保存，失败保留旧服务和旧设置；令牌轮换后旧令牌立即失效。
- [ ] **Step 4: 完善开关异步状态和错误反馈，复制标准 JSON，并在写入事件后刷新工作区。**
- [ ] **Step 5: 运行前端与 Rust 定向测试并确认通过。**

### Task 6: 外部写入与本地编辑冲突安全

**Files:**
- Modify: `src-tauri/src/storage/commands.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src/lib/storageClient.ts`
- Modify: `src/lib/workspaceRepository.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/app/App.tsx`
- Test: adjacent Rust and TypeScript tests

- [ ] **Step 1: 写失败测试**：本地块编辑已进入延迟保存队列时 MCP 追加块，两个变更最终都存在；外部创建页面后侧栏出现新页；外部刷新不清空现有撤销历史。
- [ ] **Step 2: 写失败测试**：`save_page` 带调用方读到的 `expectedUpdatedAt`；MCP 在读取与保存之间更新页面时返回 `conflict`，不会覆盖 MCP 内容。
- [ ] **Step 3: 实现乐观并发保存与三方合并重试**：以调用前持久化页为 base、本地页为 local、冲突后重载页为 remote；保留 remote 新增块、local 修改和 local 明确删除；MCP 只追加，不修改既有块，因此同 ID 双向修改直接报冲突而不猜测。
- [ ] **Step 4: 把工作区事件改为判别联合体 `{ operation, pageId, createdPageIds, createdBlockIds, createdObjectIds }`；create_page 与 append_content 均发事件；store 只增量载入/合并受影响记录，不再调用全量 bootstrap。**
- [ ] **Step 5: 运行竞态、撤销历史、创建页刷新和现有 repository 全量回归测试。**

### Task 7: 文档、协议探针与真实客户端验收

**Files:**
- Create: `scripts/mcp-smoke-test.mjs`
- Modify: `README.md`
- Modify: `docs/updates.md`
- Modify: `package.json`

- [ ] **Step 1: 编写无第三方依赖的 Streamable HTTP 探针**：从环境变量读取 URL/token，完成 initialize、tools/list、search_pages、create_page、append_content、get_page；严禁打印 token；测试页面标题带唯一时间戳。
- [ ] **Step 2: 用探针验证无 token/错误 token 为 401，正确 token 可调用全部工具；重启知栖后读取刚创建页面，证明持久化。**
- [ ] **Step 3: 在至少一个本机已安装 AI 客户端导入标准配置，刷新并确认显示四个工具；让客户端创建页面并写入 Markdown、普通表格、图片或附件、数据表、白板和思维导图。**
- [ ] **Step 4: 在知栖 UI 打开各对象，确认可继续编辑；导出完整 JSON 备份并恢复到临时测试工作区，确认全部引用可还原。**
- [ ] **Step 5: 更新 README 的客户端配置、权限边界、内容示例、故障排查与令牌安全说明；更新 `docs/updates.md` 的精确验证记录。**

### Task 8: 完整质量门禁与交付审计

- [ ] **Step 1: 运行 `npm test`。**
- [ ] **Step 2: 运行 `npm run lint` 并清除所有 error；既有 warning 必须逐条确认与本功能无关。**
- [ ] **Step 3: 运行 `npm run build`。**
- [ ] **Step 4: 运行 `cargo test --manifest-path src-tauri/Cargo.toml`。**
- [ ] **Step 5: 运行 `npm run tauri:build:windows`，安装/启动产物并重复真实客户端验收。**
- [ ] **Step 6: 对照设计逐项审计文本、表格、四类资产、数据表、白板、导图、认证、令牌轮换、审计、原子性、刷新、备份恢复和客户端接入；证据缺失的项目不得标记完成。**
