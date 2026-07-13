# MCP 客户端验收回执 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让外部 AI 客户端能准确修正批量写入错误，并依据 MCP 返回的实际落库清单核验图片、白板、思维导图等每项内容，而非自行声称成功。

**Architecture:** 保留既有 `append_content` 的单事务与内容契约。输入规范化阶段为每个 `content` 项记录类型、输入下标、所生成的块与结构化对象；工具层把该清单返回给客户端。校验错误附带失败项的下标、类型和具体约束，工具描述补充资产支持及数据表标题字段的正确写法。

**Tech Stack:** Rust 1.96.1、Tauri 2、rmcp、schemars、rusqlite、serde_json、Cargo tests。

---

### Task 1: 复现并固定批次回执契约

**Files:**
- Modify: `src-tauri/src/mcp/mod.rs`
- Test: `src-tauri/src/mcp/mod.rs`

- [ ] **Step 1: 写失败测试，要求成功结果逐项列出真实保存的类型与 ID。**

```rust
let result = successful_value(server.append_content(Parameters(full_content_input())));
assert_eq!(result["createdContent"].as_array().unwrap().len(), 6);
assert_eq!(result["createdContent"][0]["type"], "markdown");
assert_eq!(result["createdContent"][2]["type"], "asset");
assert_eq!(result["createdContent"][4]["type"], "whiteboard");
assert_eq!(result["createdContent"][5]["type"], "mindmap");
```

- [ ] **Step 2: 运行定向测试，确认当前回执缺少 `createdContent` 而失败。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::tests::append_content_reports_each_persisted_content_item --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，断言找不到 `createdContent`。

- [ ] **Step 3: 为规范化批次保留逐项创建清单，并让工具成功结果返回该清单。**

```rust
"createdContent": result.created_content
```

每项包含 `index`、`type`、`blockIds` 与可选 `objectId`；资产项只返回资产 ID，不返回文件路径或原始 Base64。

- [ ] **Step 4: 重跑定向测试，确认六项内容均在回执中并与持久化资源一致。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::tests::append_content_reports_each_persisted_content_item --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

### Task 2: 让错误能定位到原始内容项

**Files:**
- Modify: `src-tauri/src/mcp/content.rs`
- Test: `src-tauri/src/mcp/content.rs`

- [ ] **Step 1: 写失败测试，要求非法数据表标题列错误指出对应 `content` 下标及类型。**

```rust
let error = normalize_content_batch(&invalid_batch(), "batch", NOW).unwrap_err();
assert_eq!(error.code, "invalid_payload");
assert!(error.message.contains("content[3] (dataTable)"));
assert!(error.message.contains("record title field"));
```

- [ ] **Step 2: 运行定向测试，确认当前错误只给出通用字段错误。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::content::tests::identifies_the_invalid_content_item_in_a_batch --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，消息不含内容项位置。

- [ ] **Step 3: 在逐项规范化边界包装 `StorageError`，保留错误码并补充 `content[index] (type)` 前缀；为数据表标题列提示正确字段。**

```rust
fn item_error(index: usize, item_type: &str, error: StorageError) -> StorageError {
    StorageError::new(error.code, format!("content[{index}] ({item_type}): {}", error.message))
}
```

- [ ] **Step 4: 重跑定向测试，确认错误能让客户端修正原请求，而不会误以为其他项写入。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::content::tests::identifies_the_invalid_content_item_in_a_batch --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

### Task 3: 补足外部 AI 的工具契约

**Files:**
- Modify: `src-tauri/src/mcp/mod.rs`
- Modify: `src-tauri/src/mcp/content.rs`
- Test: `src-tauri/src/mcp/mod.rs`

- [ ] **Step 1: 写失败测试，要求工具元信息描述资产写入、数据表记录标题和“按 `createdContent` 核对完整批次”的规则。**

```rust
let description = append_content_description();
assert!(description.contains("图片、视频、音频或附件"));
assert!(description.contains("record title"));
assert!(description.contains("createdContent"));
```

- [ ] **Step 2: 运行定向测试，确认旧描述遗漏资产与回执核验规则。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::tests::append_content_description_guides_external_clients --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，描述尚未包含这些约束。

- [ ] **Step 3: 使用单一共享常量更新 `append_content` 的工具说明；为 `ContentItem` 和数据表字段补充 schema 描述。**

不新增工具、不改变原有参数名称，避免破坏 Cherry Studio 与 Chatbox 的现有配置。

- [ ] **Step 4: 重跑定向测试，确认工具描述和 schema 可指导客户端完成完整重试。**

Run: `$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'; cargo test --locked mcp::tests::append_content_description_guides_external_clients --manifest-path src-tauri/Cargo.toml`

Expected: PASS。

### Task 4: 端到端回归与真实客户端验收

**Files:**
- Modify: `scripts/mcp-smoke-test.mjs`
- Modify: `README.md`
- Modify: `docs/updates.md`

- [ ] **Step 1: 扩展 smoke script：发送六项有效内容并断言 `createdContent` 精确含有六种类型；发送含非法数据表列的批次并断言错误下标，同时确认目标页无新增块。**

```js
assert.deepEqual(createdContent.map(item => item.type), [
  'markdown', 'table', 'asset', 'dataTable', 'whiteboard', 'mindmap'
])
```

- [ ] **Step 2: 运行脚本，确认它在修改前因缺失回执而失败。**

Run: `$env:ZHIXI_MCP_URL='http://127.0.0.1:PORT/mcp'; $env:ZHIXI_MCP_TOKEN='configured-token'; node scripts/mcp-smoke-test.mjs`

Expected: FAIL，缺少 `createdContent`；不得在输出中打印 token。

- [ ] **Step 3: 完成脚本实现并更新 README 的客户端重试规则与 `docs/updates.md` 的验证记录。**

- [ ] **Step 4: 重新构建调试版，用 Chatbox 发起六项完整写入；在知栖 UI 核对六种真实内容，并分别打开数据表、白板与思维导图。**

- [ ] **Step 5: 运行质量门禁。**

Run:

```powershell
npm test
npm run lint
npm run build
$env:CARGO_TARGET_DIR='E:\\BuildCache\\cargo-target\\zhixi\\mcp-client-reconciliation'
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Expected: 所有命令退出码为 0；既有 warnings 单独记录，不将 warning 当作错误。

### Plan Self-Review

- 覆盖：真实测试暴露的错误项定位、客户端说明、成功回执、原子回滚与六项真实验收均有明确任务。
- 范围：只强化既有 `append_content` 契约；不新增协议工具、不重构数据库、不改变 main。
- 一致性：所有成功结果均使用 `createdContent`，错误均使用既有 `StorageError`/`structured_error` 通道。
