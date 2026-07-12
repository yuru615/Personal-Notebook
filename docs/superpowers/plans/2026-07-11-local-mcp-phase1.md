# 本机 MCP 第一阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在知栖桌面应用中交付受令牌保护的本机 MCP 服务，支持页面搜索、创建页面及向明确页面追加 Markdown 和普通表格。

**Architecture:** Rust 侧的 MCP 服务管理器只绑定 `127.0.0.1`，使用既有 `StorageState` 读写工作区。请求先校验 Bearer 令牌，再经受限导入模块规范化为现有页面块；前端仅控制启用状态和复制连接配置。

**Tech Stack:** Tauri 2、Rust、Tokio、Axum、MCP Rust SDK、rusqlite、React 19、TypeScript、Vitest。

---

## 范围和文件

本计划只覆盖服务生命周期、设置/令牌、`search_pages`、`get_page`、`create_page` 与 `append_content` 的 Markdown/普通表格。资产、数据表、白板、导图与任何破坏性操作另行规划。

- Create: `src-tauri/src/mcp/mod.rs`、`auth.rs`、`content.rs`、`tools.rs`、`tests.rs`。
- Modify: `src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/src/storage/{models.rs,mod.rs,commands.rs,schema.rs}`。
- Modify: `src/domain/types.ts`、`src/lib/{storageClient.ts,appSettingsRepository.ts}`、`src/store/createWorkspaceStore.ts`、`src/app/App.tsx`。
- Modify: `src/components/settings/{SettingsCenter.tsx,SettingsCenter.test.tsx}`、`src/styles/index.css`、`README.md`、`docs/updates.md`。

### Task 1: 应用设置与认证边界

**Files:** `src-tauri/Cargo.toml`、`src-tauri/src/storage/models.rs`、`src-tauri/src/storage/mod.rs`、`src/domain/types.ts`、`src/lib/appSettingsRepository.ts`；tests: `src/lib/appSettingsRepository.test.ts`。

- [ ] **Step 1: 先写应用设置往返失败测试**

```rust
let settings = AppSettings {
    close_action: Some("hide_to_tray".into()),
    accent_theme: Some("blue_gray".into()),
    mcp: Some(McpSettings { enabled: true, port: 38472, token: "test-token".into() }),
};
storage.save_app_settings(&settings).expect("save");
assert_eq!(storage.load_app_settings().expect("load"), Some(settings));
```

- [ ] **Step 2: 确认测试失败**

Run: `cargo test app_settings_round_trip --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，`McpSettings` 和 `AppSettings.mcp` 不存在。

- [ ] **Step 3: 加入最小持久化模型与依赖**

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings { pub enabled: bool, pub port: u16, pub token: String }
```

在 Rust `AppSettings` 和 TypeScript `AppSettings` 中加可选 `mcp` 字段。前端归一化只保留端口在 `1024..=65535`、token 非空的设置。向 Cargo 加入与 Rust 1.77.2 兼容且经 `cargo check` 确认的 Tokio、Axum、随机数和 MCP SDK 直接依赖；锁定到 `Cargo.lock`。

- [ ] **Step 4: 实现回环及令牌校验并测试**

Create `src-tauri/src/mcp/auth.rs`:

```rust
pub fn authorize(peer: Option<SocketAddr>, authorization: Option<&str>, token: &str) -> StorageResult<()> {
    let expected = format!("Bearer {token}");
    if peer.is_some_and(|value| value.ip().is_loopback()) && authorization == Some(expected.as_str()) {
        Ok(())
    } else { Err(StorageError::new("unauthorized", "local MCP authorization failed")) }
}
```

Test one accepted `127.0.0.1` request, one LAN request and one wrong token. Run: `cargo test mcp::tests::authorize --manifest-path src-tauri/Cargo.toml`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/storage src-tauri/src/mcp/auth.rs src/domain/types.ts src/lib/appSettingsRepository.ts src/lib/appSettingsRepository.test.ts
git commit -m "feat: persist and authenticate local MCP settings"
```

### Task 2: 服务生命周期与 Tauri 配置命令

**Files:** Create `src-tauri/src/mcp/mod.rs`; modify `src-tauri/src/lib.rs` and `src-tauri/src/storage/commands.rs`; test `src-tauri/src/mcp/tests.rs`。

- [ ] **Step 1: 先写启动/停止失败测试**

```rust
let state = McpServerState::default();
state.apply(Some(&settings), storage_state, app_handle).expect("start");
assert!(state.is_running());
state.stop().expect("stop");
assert!(!state.is_running());
```

- [ ] **Step 2: 确认失败**

Run: `cargo test mcp::tests::starts_and_stops --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，服务状态不存在。

- [ ] **Step 3: 实现管理器和命令**

```rust
#[derive(Clone, Default)]
pub struct McpServerState { active: Arc<Mutex<Option<RunningMcpServer>>> }
impl McpServerState {
    pub fn apply(&self, settings: Option<&McpSettings>, storage: StorageState, app: AppHandle) -> StorageResult<()>;
    pub fn stop(&self) -> StorageResult<()>;
}
```

启用时仅绑定 `127.0.0.1:{port}`；禁用或配置变化时停止旧服务。先成功绑定新端口，再替换旧服务，端口占用返回 `mcp_unavailable` 且旧服务继续运行。`lib.rs` 在 setup 管理 `McpServerState` 并从保存的 AppSettings 恢复；新增 `configure_mcp` Tauri 命令保存设置后调用 `apply`。

- [ ] **Step 4: 验证服务状态**

Run: `cargo test mcp::tests --manifest-path src-tauri/Cargo.toml`

Expected: PASS，包含禁用、端口占用不替换和认证拒绝。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp src-tauri/src/lib.rs src-tauri/src/storage/commands.rs
git commit -m "feat: run local MCP service with Tauri"
```

### Task 3: MCP 页面工具、Markdown/表格导入和本机审计

**Files:** Create `src-tauri/src/mcp/{content.rs,tools.rs,tests.rs}`; modify `src-tauri/src/storage/{mod.rs,schema.rs}`。

- [ ] **Step 1: 写内容转换失败测试**

```rust
let blocks = normalize_append_content(AppendContent::Table {
    rows: vec![vec!["名称".into(), "金额".into()], vec!["机票".into(), "2000".into()]],
}).expect("valid table");
assert_eq!(blocks[0]["type"], "table");
assert!(normalize_append_content(AppendContent::Table { rows: vec![] }).is_err());
```

- [ ] **Step 2: 确认失败**

Run: `cargo test mcp::tests::normalizes_table --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，输入模型和转换函数不存在。

- [ ] **Step 3: 实现受限工具契约**

```rust
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AppendContent {
    Markdown { markdown: String },
    Table { rows: Vec<Vec<String>> },
}
pub fn normalize_append_content(input: AppendContent) -> StorageResult<Vec<Value>>;
```

表格必须非空、所有行列数相同且单元格总数不超过 10,000。Markdown 使用 `pulldown-cmark` 的表格与任务列表扩展解析标题、段落、待办、无序/有序列表、代码块和 GFM 表格，并生成既有块 JSON；不支持的 Markdown 降级为段落文本。为每个块通过现有 ID 格式生成唯一 ID。

在 schema 初始化中加入仅本机的 `zhixi_mcp_audit_log(id, created_at, client_name, tool_name, page_id, created_ids)` 表。实现 `search_pages`、`get_page`、`create_page` 与 `append_content`：搜索复用 `Storage::search_workspace` 并过滤为 page；写入在一个 `with_transaction` 内加载页面、追加全部块、更新时间、重建搜索索引并插入审计行。页面不存在时返回 `not_found`，不写入页面或审计记录。

- [ ] **Step 4: 验证工具和原子性**

Run: `cargo test mcp::tests::create_page_and_append_table --manifest-path src-tauri/Cargo.toml`

Expected: PASS；断言 Markdown 生成既有块类型、创建页仅含新表格块、失败请求不改变原页面块数，成功请求生成一行本机审计记录。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/mcp src-tauri/src/storage/mod.rs src-tauri/src/storage/schema.rs
git commit -m "feat: add local MCP page and table tools"
```

### Task 4: 设置页、前端刷新和验证

**Files:** modify `src/lib/storageClient.ts`、`src/store/createWorkspaceStore.ts`、`src/app/App.tsx`、`src/components/settings/SettingsCenter.tsx`、`src/components/settings/SettingsCenter.test.tsx`、`src/styles/index.css`、`README.md`、`docs/updates.md`。

- [ ] **Step 1: 写设置页失败测试**

```tsx
await user.click(screen.getByRole('button', { name: '实验功能' }))
await user.click(screen.getByRole('checkbox', { name: '启用本机 MCP 接入' }))
expect(onSetMcpSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
```

- [ ] **Step 2: 确认失败**

Run: `npm test -- src/components/settings/SettingsCenter.test.tsx`

Expected: FAIL，MCP 设置控件不存在。

- [ ] **Step 3: 实现最小用户界面与刷新事件**

在“实验功能”复用现有设置卡片新增开关、运行状态与“复制 MCP 配置”。完整 token 不渲染；复制内容为：

```json
{"url":"http://127.0.0.1:38472/mcp","headers":{"Authorization":"Bearer <token>"}}
```

写入成功后 Rust 发出 `zhixi://mcp-workspace-updated`，payload 是 `{ pageId, createdBlockIds }`。`App.tsx` 订阅该事件：当前页重新加载，其他页使缓存失效。剪贴板写入失败显示明确错误。更新 README 的本机 MCP 配置和能力限制，更新 `docs/updates.md` 的详细验证记录。

- [ ] **Step 4: 运行完整验证**

Run: `npm test; npm run lint; npm run build; cargo test --manifest-path src-tauri/Cargo.toml; npm run tauri:build:windows`

Expected: 全部 PASS；安装包手测启用 MCP、复制配置、创建测试页面并追加两行表格，重启后数据仍存在。

- [ ] **Step 5: Commit**

```bash
git add src/lib/storageClient.ts src/store/createWorkspaceStore.ts src/app/App.tsx src/components/settings/SettingsCenter.tsx src/components/settings/SettingsCenter.test.tsx src/styles/index.css README.md docs/updates.md
git commit -m "feat: configure local MCP access"
```
