# 收件箱拖拽导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持将操作系统文件拖入知栖窗口并以媒体块或附件块追加到收件箱。

**Architecture:** 在 `AppShell` 识别 `DataTransfer.files` 并展示独立落点遮罩，应用层负责把浏览器 `File` 写入现有资产库、映射为块；store 提供通用的收件箱批量追加操作。附件块沿用现有 `assetId` 契约，因此导出、导入和资产引用只需在已有资产扫描分支中加入 `file` 类型。

**Tech Stack:** React 19、TypeScript、Zustand vanilla store、Tauri 2 SQLite 资产存储、Vitest、Testing Library。

---

### Task 1: 定义附件块和资产引用契约

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/utils/blockFactory.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src-tauri/src/storage/mod.rs`
- Test: `src/utils/blockFactory.test.ts`
- Test: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: 写出附件块工厂和资产引用的失败测试**

```ts
expect(createBlock('file')).toMatchObject({
  type: 'file',
  assetId: null,
  name: '',
  mimeType: '',
})
```

在 Rust 内存存储测试中写入 `type: "file"`、`assetId` 为已存在资产的页面块，断言孤立资产清理返回 `0`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/utils/blockFactory.test.ts`

Expected: FAIL，因为 `file` 还不是有效块类型。

Run: `cargo test file_block_asset_reference`

Expected: FAIL，因为 Rust 资产引用扫描尚未识别附件块。

- [ ] **Step 3: 增加最小附件块实现**

```ts
export interface FileBlock extends BlockBase {
  type: 'file'
  assetId: string | null
  name: string
  mimeType: string
  caption: string
}
```

将 `file` 加入 `BlockRecord`、`BlockType`、块工厂、块文本提取和文本更新的现有媒体分支；Rust 的页面、同步块和页面包资产引用扫描从 `image | video | audio` 扩为同时包含 `file`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- src/utils/blockFactory.test.ts src/store/createWorkspaceStore.test.ts`

Expected: PASS。

Run: `cargo test file_block_asset_reference`

Expected: PASS。

### Task 2: 渲染附件块并复用资产写入

**Files:**
- Create: `src/components/editor/blocks/FileBlock.tsx`
- Modify: `src/components/editor/BlockEditor.tsx`
- Modify: `src/components/editor/blocks/MediaBlock.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/editor/blocks/FileBlock.test.tsx`
- Test: `src/components/editor/BlockEditor.test.tsx`

- [ ] **Step 1: 写出附件显示的失败测试**

```tsx
render(<FileBlock block={{ id: 'file_1', type: 'file', assetId: 'asset_1', name: 'brief.pdf', mimeType: 'application/pdf', caption: '' }} />)
expect(screen.getByText('brief.pdf')).toBeInTheDocument()
expect(screen.getByText('application/pdf')).toBeInTheDocument()
```

再断言 `BlockEditor` 对 `file` 块输出附件块而不是空白。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/editor/blocks/FileBlock.test.tsx src/components/editor/BlockEditor.test.tsx`

Expected: FAIL，因为尚未有附件组件和渲染分支。

- [ ] **Step 3: 编写最小附件 UI**

使用现有 `getAssetUrl` 和 `File` 图标显示文件名、MIME 类型与可选说明；保持块框架、手柄、删除和选中样式与其他块一致。不要在本任务实现 PDF 预览或系统打开文件。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- src/components/editor/blocks/FileBlock.test.tsx src/components/editor/BlockEditor.test.tsx src/styles/editorMultiSelectLayout.test.ts`

Expected: PASS。

### Task 3: 将文件转换为收件箱块并持久化

**Files:**
- Create: `src/domain/inboxFileImport.ts`
- Modify: `src/lib/assets.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/app/App.tsx`
- Test: `src/domain/inboxFileImport.test.ts`
- Test: `src/store/createWorkspaceStore.test.ts`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: 写出文件分类与收件箱追加的失败测试**

```ts
expect(createInboxFileBlock({ name: 'photo.png', mimeType: 'image/png', assetId: 'asset_1' })).toMatchObject({ type: 'image' })
expect(createInboxFileBlock({ name: 'brief.pdf', mimeType: 'application/pdf', assetId: 'asset_2' })).toMatchObject({ type: 'file' })
```

在 store 测试中追加两块并断言收件箱得到 `拖拽导入 ·` 标题、保持原块顺序和一个尾部空段落。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/domain/inboxFileImport.test.ts src/store/createWorkspaceStore.test.ts`

Expected: FAIL，因为没有文件到块映射和通用收件箱追加操作。

- [ ] **Step 3: 实现文件导入映射与追加操作**

```ts
const asset = await writeFileAsset(file)
const block = createInboxFileBlock({
  assetId: asset.id,
  name: asset.name,
  mimeType: asset.mimeType,
})
```

媒体 MIME 映射到 `image`、`audio`、`video`，其他 MIME 映射到 `file`。将现有剪贴板追加内部逻辑提取为同一个私有收件箱批量追加函数，保留 `appendClipboardCaptureToInbox` 作为兼容入口；新增 `appendFileImportToInbox` 供拖拽使用。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- src/domain/inboxFileImport.test.ts src/store/createWorkspaceStore.test.ts src/app/App.test.tsx`

Expected: PASS。

### Task 4: 增加窗口级拖拽落点和导入遮罩

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/styles/index.css`
- Test: `src/components/layout/AppShell.test.tsx`
- Test: `src/app/App.test.tsx`

- [ ] **Step 1: 写出外部文件拖拽的失败测试**

```tsx
fireEvent.dragEnter(shell, { dataTransfer: { types: ['Files'], files: [file] } })
expect(screen.getByText('松开以导入到收件箱')).toBeInTheDocument()

fireEvent.drop(shell, { dataTransfer: { files: [file] } })
expect(onDropFiles).toHaveBeenCalledWith([file])
```

添加站内拖拽测试，断言没有 `Files` 类型时不显示遮罩、不调用导入。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test -- src/components/layout/AppShell.test.tsx src/app/App.test.tsx`

Expected: FAIL，因为 `AppShell` 尚未暴露文件拖入回调和落点提示。

- [ ] **Step 3: 实现最小外部文件落点**

在应用壳记录嵌套 `dragenter` / `dragleave` 深度，只对 `DataTransfer.types` 包含 `Files` 的事件阻止默认行为。落点时调用 `onDropFiles`，由 `App` 逐一写入资产、转换为块并批量追加收件箱；无文件或导入失败时仅清理遮罩，不改变当前路由。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm run test -- src/components/layout/AppShell.test.tsx src/app/App.test.tsx src/domain/inboxFileImport.test.ts src/store/createWorkspaceStore.test.ts`

Expected: PASS。

### Task 5: 全链路回归、更新记录与提交准备

**Files:**
- Modify: `docs/updates.md`
- Modify: `docs/todo.md`
- Test: `src/components/editor/BlockEditor.test.tsx`
- Test: `src/styles/mediaBlockLayout.test.ts`

- [ ] **Step 1: 运行针对性回归**

Run: `npm run test -- src/domain/inboxFileImport.test.ts src/components/layout/AppShell.test.tsx src/components/editor/blocks/FileBlock.test.tsx src/components/editor/BlockEditor.test.tsx src/store/createWorkspaceStore.test.ts src/app/App.test.tsx src/styles/mediaBlockLayout.test.ts`

Expected: PASS。

- [ ] **Step 2: 运行 Rust 资产引用回归**

Run: `cargo test file_block_asset_reference`

Expected: PASS。

- [ ] **Step 3: 运行构建**

Run: `npm run build`

Expected: exit code 0。

- [ ] **Step 4: 更新文档**

在 `docs/updates.md` 追加简要描述、详细描述和验证情况；从 `docs/todo.md` 移除本期已完成的拖拽导入项，仅保留 Markdown 解析、PDF 预览和原文件联动等后续增强。

- [ ] **Step 5: 提交前复核**

Run: `git diff --check`

Expected: 无空白错误；不提交 `.cargo-target*`、`.tmp` 或桌面构建产物。
