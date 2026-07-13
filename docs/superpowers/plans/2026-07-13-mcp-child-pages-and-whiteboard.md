# MCP 子页面同步与完整白板写入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 MCP 创建子页面时同步写入父页面块，并让外部 AI 能够创建和增量编辑带完整布局、样式、连线、笔画与擦除能力的白板。

**Architecture:** 复用现有白板快照和 SQLite 存储。MCP 语义层把外部请求规范化为已有快照字段，存储层以事务方式创建或合并白板；前端收到既有工作区刷新事件后读取最新快照，不引入新的前端白板格式。

**Tech Stack:** Rust、rmcp、serde、serde_json、rusqlite、Tauri 2、Vitest。

---

### Task 1: 原子创建 MCP 子页面与父页面块

**Files:**
- Modify: `src-tauri/src/storage/mcp.rs`
- Modify: `src-tauri/src/mcp/mod.rs`
- Test: `src-tauri/src/storage/mcp.rs`
- Test: `src-tauri/src/mcp/mod.rs`

- [ ] **Step 1: 写失败测试**

在 `Storage` 的 MCP 测试中加入父页面和调用断言：创建后父页面包含唯一的 `child_page` 块，块的 `pageId` 指向新页面；在写入前验证父页面不存在时，子页面不会被持久化。

- [ ] **Step 2: 运行该测试并确认因缺少事务 API 失败**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp::tests::creates_child_page_and_parent_block_atomically`

Expected: FAIL，现有 `create_page` 只保存子页面。

- [ ] **Step 3: 实现最小事务 API**

在 `src-tauri/src/storage/mcp.rs` 新增接收 `PageRecord`、父页面 ID 和子页面块 ID 的方法；在同一 `with_transaction` 内加载父页面、追加：

```rust
json!({ "id": parent_block_id, "type": "child_page", "pageId": page.id })
```

再保存父页面和新子页面。`parentId` 为空时沿用现有单页保存路径。

- [ ] **Step 4: 让 MCP 调用新 API 并回传块 ID**

在 `create_page` 中生成 `block_mcp_*`，调用新事务 API，并在 `parentId` 非空时在回执中加入 `parentBlockId`。

- [ ] **Step 5: 运行相关 Rust 测试**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp::tests::creates_child_page`

Expected: PASS。

### Task 2: 扩展白板创建请求

**Files:**
- Modify: `src-tauri/src/mcp/semantic.rs`
- Modify: `src-tauri/src/mcp/content.rs`
- Test: `src-tauri/src/mcp/semantic.rs`
- Test: `src-tauri/src/mcp/content.rs`

- [ ] **Step 1: 写失败测试**

增加一个完整白板请求：上→下曲线和左→右直线、两种节点颜色、连接端方向与标记、两条笔画。断言生成的 snapshot 字段逐一保留；旧的最简节点/边请求仍使用默认值。

- [ ] **Step 2: 运行测试并确认字段被拒绝**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp::semantic::tests::preserves_complete_whiteboard_layout_style_and_strokes`

Expected: FAIL，新增字段当前触发未知字段或被固定值覆盖。

- [ ] **Step 3: 扩展输入与规范化**

为节点增加 `w`、`h`、`color`、`size`、`z`；为边增加 `fromSide`、`toSide`、锚点、`mode`、端点标记、`color`、`size`；增加带 `id`、`color`、`size`、`points` 的 `strokes`。仅接受现有白板支持的枚举值、有限数值、`#RRGGBB` 颜色与受限点数。

- [ ] **Step 4: 纳入请求体限制与兼容反序列化**

更新 `ContentItem::Whiteboard` 和手写 visitor 的字段表、变量和构造；把笔画文本/点数量纳入现有请求限制。

- [ ] **Step 5: 运行语义与内容测试**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp::semantic::tests::preserves_complete_whiteboard_layout_style_and_strokes mcp::content::tests`

Expected: PASS。

### Task 3: 读取与增量编辑白板

**Files:**
- Modify: `src-tauri/src/storage/mcp.rs`
- Modify: `src-tauri/src/mcp/mod.rs`
- Modify: `src-tauri/src/mcp/semantic.rs`
- Test: `src-tauri/src/storage/mcp.rs`
- Test: `src-tauri/src/mcp/mod.rs`

- [ ] **Step 1: 写失败测试**

构造已有白板，调用 `get_whiteboard` 后验证其返回快照；调用 `update_whiteboard` 追加笔画、擦除节点和笔画，验证关联连线一并删除，且不存在整板替换行为。

- [ ] **Step 2: 运行测试并确认工具不存在**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp::tests::reads_and_updates_whiteboard_by_element_id`

Expected: FAIL，当前 MCP 未注册读取或编辑白板工具。

- [ ] **Step 3: 实现白板补丁事务**

在存储层加载 `BoardRecord`，校验快照数组，按 ID 去重追加节点、连线和笔画；按 `eraseIds` 删除节点、便签、文本、笔画和连线，并删除引用被擦除节点的连线。更新后的 Board、审计记录和结果在一个事务内提交。

- [ ] **Step 4: 注册两个 MCP 工具**

`get_whiteboard(boardId)` 返回标题与 snapshot；`update_whiteboard(boardId, nodes?, edges?, strokes?, eraseIds?)` 调用补丁事务并发送 `workspace-updated` 事件。

- [ ] **Step 5: 运行完整 MCP Rust 测试**

Run: `cargo test --locked --manifest-path src-tauri/Cargo.toml mcp`

Expected: PASS。

### Task 4: 文档与回归验证

**Files:**
- Modify: `README.md`
- Modify: `docs/updates.md`

- [ ] **Step 1: 更新 MCP 使用说明**

记录 `parentBlockId`、完整白板字段、读取与编辑工具，以及擦除仅支持已知元素 ID 的限制。

- [ ] **Step 2: 记录更新和验证结果**

在 `docs/updates.md` 写明用户可感知改动与实际执行的验证。

- [ ] **Step 3: 运行发布级检查**

Run: `npm test; npm run lint; npm run build; cargo test --locked --manifest-path src-tauri/Cargo.toml`

Expected: 前端测试、构建、Rust 测试全部通过；lint 仅可保留现有 warning。

- [ ] **Step 4: 提交功能分支**

Run: `git add src-tauri/src/mcp src-tauri/src/storage README.md docs/updates.md docs/superpowers && git commit -m "feat: expand MCP whiteboard editing"`

Expected: 仅包含本功能文件的提交。
