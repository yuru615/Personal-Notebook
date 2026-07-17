# 页面回收站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除页面后在 30 天内可恢复整棵页面树及其关联资源。

**Architecture:** 在现有 `PageRecord` 增加软删除元数据，不复制页面、块或资源。活跃页面在 UI 与搜索边界过滤；启动阶段只清除已过期的删除树，并复用现有物理清理逻辑。

**Tech Stack:** React、TypeScript、Zustand、Vitest、Tauri、Rust、SQLite。

---

### Task 1: 页面树软删除工具

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/utils/pageTree.ts`
- Test: `src/utils/pageTree.test.ts`

- [ ] 写入软删除、恢复、到期清理与回收站根列表的红测。
- [ ] 运行相关 Vitest 测试确认因缺少实现失败。
- [ ] 以最小纯函数实现分支标记、恢复与清理。
- [ ] 运行相关 Vitest 测试确认通过。

### Task 2: Store 与 SQLite 持久化

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Test: `src/store/createWorkspaceStore.test.ts`
- Modify: `src-tauri/src/storage/models.rs`
- Modify: `src-tauri/src/storage/schema.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/storage/search.rs`
- Test: relevant Rust storage tests

- [ ] 为删除后保留页面/资源、恢复、30 天清理写红测。
- [ ] 将删除改为软删除，增加恢复 action，并在启动时清理到期数据。
- [ ] 持久化删除字段，且删除页面不进入 FTS 搜索。
- [ ] 运行前端与 Rust 相关测试确认通过。

### Task 3: 回收站入口与页面

**Files:**
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Create: `src/components/recycleBin/RecycleBinPage.tsx`
- Create: `src/components/recycleBin/RecycleBinPage.test.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/styles/index.css`

- [ ] 为顶部回收站入口和恢复页写红测。
- [ ] 接入路由、入口、恢复按钮及删除确认文案。
- [ ] 运行相关 Vitest 测试确认通过。

### Task 4: 收尾

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/updates.md`

- [ ] 从待做清单移除已完成的回收站项。
- [ ] 更新本次更新记录，包含简述、详细说明和验证结果。
- [ ] 运行 `npm test`、`npm run build`、Rust 相关测试与 `git diff --check`。
