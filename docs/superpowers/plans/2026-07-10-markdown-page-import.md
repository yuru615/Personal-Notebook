# Markdown 页面导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单个 Markdown 文件导入为一个顶层、可编辑、包含本地图片的知栖页面。

**Architecture:** 在 `src/domain/markdownImport.ts` 中实现无副作用的 Markdown 结构解析，输出标题与待转换的块描述；应用层负责选择文件、导入相对图片资产、创建页面和导航。桌面端复用现有文件路径与资产写入能力，浏览器环境保留正文并跳过没有真实路径的相对图片导入。

**Tech Stack:** TypeScript、React、Vitest、Tauri dialog/fs、现有 Zustand store 与 SQLite 资产库。

---

### Task 1: Markdown 结构与行内文本解析

**Files:**
- Create: `src/domain/markdownImport.ts`
- Create: `src/domain/markdownImport.test.ts`

- [ ] **Step 1: 写入会失败的解析测试**

```ts
expect(parseMarkdownPage('Guide.md', '# 指南\n\n- [x] 完成\n\n```ts\nconst a = 1\n```')).toMatchObject({
  title: '指南',
  blocks: [
    { type: 'todo', text: '完成', checked: true },
    { type: 'code', language: 'ts', text: 'const a = 1' },
  ],
})
```

覆盖一级标题回退文件名、标题 1–3、段落、无序/有序列表、表格、待办、围栏代码、图片描述、加粗/斜体/删除线/行内代码/网页链接，以及未识别语法保留为段落。

- [ ] **Step 2: 运行解析测试确认失败**

Run: `npm run test -- src/domain/markdownImport.test.ts`

Expected: FAIL，提示 `parseMarkdownPage` 尚未定义。

- [ ] **Step 3: 实现最小的纯解析器**

```ts
export interface MarkdownPageImport {
  title: string
  blocks: MarkdownImportBlock[]
}

export function parseMarkdownPage(fileName: string, contents: string): MarkdownPageImport {
  // 逐行识别既有块类型；不识别的内容降级为 paragraph，绝不静默丢弃。
}
```

解析器不读取文件、不调用 Tauri，也不创建页面；相对图片仅输出图片候选描述和源地址。

- [ ] **Step 4: 运行解析测试确认通过**

Run: `npm run test -- src/domain/markdownImport.test.ts`

Expected: PASS。

### Task 2: 文件选择与相对图片资产导入

**Files:**
- Modify: `src/lib/fileAccess.ts`
- Modify: `src/lib/fileAccess.test.ts`
- Modify: `src/lib/assets.ts`
- Modify: `src/lib/assets.test.ts`

- [ ] **Step 1: 写入会失败的路径与图片导入测试**

测试 `openTextFile` 在桌面端返回可选 `path`，并测试 `importImageAssetFromPath` 只接收可识别图片扩展名。为 Markdown 相对路径新增测试：`C:\\notes\\guide.md` 中的 `./images/a.png` 会被解析为 `C:\\notes\\images\\a.png`；没有源路径或不是图片时返回 `null`。

- [ ] **Step 2: 运行文件访问与资产测试确认失败**

Run: `npm run test -- src/lib/fileAccess.test.ts src/lib/assets.test.ts`

Expected: FAIL，提示缺少 Markdown 相对图片导入入口或路径字段。

- [ ] **Step 3: 实现桌面端路径保留与图片导入**

```ts
export interface OpenedTextFile {
  name: string
  contents: string
  path?: string
}

export async function importMarkdownImageAsset(
  markdownPath: string | undefined,
  source: string,
) {
  // 仅解析相对本地图片路径；调用既有 importImageAssetFromPath。
}
```

不下载 `http:`/`https:` 图片；路径不存在、扩展名非图片或写入失败都返回 `null`，交给上层保留原 Markdown 行。

- [ ] **Step 4: 运行文件访问与资产测试确认通过**

Run: `npm run test -- src/lib/fileAccess.test.ts src/lib/assets.test.ts`

Expected: PASS。

### Task 3: 创建导入页面并接入导入菜单

**Files:**
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/components/export/ExportImportPanel.tsx`
- Modify: `src/components/export/ExportImportPanel.test.tsx`
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Modify: `src/components/settings/SettingsCenter.tsx`
- Modify: `src/components/settings/SettingsCenter.test.tsx`
- Modify: `src/ui/copy.ts`

- [ ] **Step 1: 写入会失败的 store 与应用交互测试**

```ts
await user.click(screen.getByRole('button', { name: '导入 Markdown' }))
expect(fileAccess.openTextFile).toHaveBeenCalledWith({
  filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
})
expect(await screen.findByDisplayValue('指南')).toBeInTheDocument()
```

测试创建的页面为顶层页面、第一层标题被移作页面标题、解析块被完整写入、导入后路由跳转，以及图片导入失败时原始图片 Markdown 仍显示为正文。

- [ ] **Step 2: 运行定向交互测试确认失败**

Run: `npm run test -- src/store/createWorkspaceStore.test.ts src/app/App.test.tsx src/components/export/ExportImportPanel.test.tsx src/components/sidebar/SidebarTree.test.tsx src/components/settings/SettingsCenter.test.tsx`

Expected: FAIL，提示不存在“导入 Markdown”入口或页面未创建。

- [ ] **Step 3: 在 store 中允许新页面带初始块**

```ts
interface CreatePageOptions {
  title?: string
  blocks?: BlockRecord[]
  setCurrent?: boolean
}
```

复用 `createPage` 的持久化和当前页面设置逻辑，不新增第二套页面写入 action。

- [ ] **Step 4: 在 App 中完成导入编排**

```ts
const file = await openTextFile({ filters: MARKDOWN_FILE_FILTER })
const imported = parseMarkdownPage(file.name, file.contents)
const blocks = await resolveMarkdownImportBlocks(imported.blocks, file.path)
const page = await store.getState().createPage(undefined, { title: imported.title, blocks, setCurrent: true })
navigate(`/pages/${page.id}`)
```

将同一个 `onImportMarkdown` 回调接入页面更多菜单、侧边栏更多菜单和设置中心；取消选择或任何未处理错误都不改变当前页面，并给出已有导入错误提示。

- [ ] **Step 5: 运行定向交互测试确认通过**

Run: `npm run test -- src/store/createWorkspaceStore.test.ts src/app/App.test.tsx src/components/export/ExportImportPanel.test.tsx src/components/sidebar/SidebarTree.test.tsx src/components/settings/SettingsCenter.test.tsx`

Expected: PASS。

### Task 4: 更新记录与完整验证

**Files:**
- Modify: `docs/todo.md`
- Modify: `docs/updates.md`

- [ ] **Step 1: 更新文档状态**

从待做清单中删除“Markdown 可选择导入为可编辑页面”的已完成描述，保留 PDF、跨文件链接与远程图片下载项目；在 `docs/updates.md` 记录简要描述、详细变更与实际验证命令。

- [ ] **Step 2: 运行验证**

Run: `npm run test -- src/domain/markdownImport.test.ts src/lib/fileAccess.test.ts src/lib/assets.test.ts src/store/createWorkspaceStore.test.ts src/app/App.test.tsx src/components/export/ExportImportPanel.test.tsx src/components/sidebar/SidebarTree.test.tsx src/components/settings/SettingsCenter.test.tsx`

Expected: PASS。

Run: `npm run build`

Expected: exit code 0。
