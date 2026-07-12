# Welcome Guide Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a detailed first-use manual that embeds editable data table, whiteboard, and mindmap examples without overwriting user-edited welcome content.

**Architecture:** Extend `src/domain/seed.ts` from a page-only seed into a small welcome guide resource bundle. The existing workspace bootstrap migration will use an explicit guide version and a legacy-content signature to decide whether to upgrade the system page, create a companion guide, or leave user content untouched. All examples use existing workspace resource records and normal editor blocks.

**Tech Stack:** TypeScript, React workspace store, existing whiteboard/mindmap/data-table models, Vitest.

---

### Task 1: Define the welcome guide bundle

**Files:**
- Modify: `src/domain/seed.ts`
- Modify: `src/domain/seed.test.ts`

- [ ] **Step 1: Write failing seed assertions for the three interactive examples**

```ts
const guide = createSeedWorkspace()
const welcomePage = guide.pages.find((page) => page.title === WELCOME_PAGE_TITLE)

expect(guide.boards).toHaveLength(1)
expect(guide.mindmaps).toHaveLength(1)
expect(guide.dataTables).toHaveLength(1)
expect(welcomePage?.blocks).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ type: 'whiteboard', boardId: guide.boards[0]?.id }),
    expect.objectContaining({ type: 'mindmap', mindmapId: guide.mindmaps[0]?.id }),
    expect.objectContaining({ type: 'data_table', databaseId: guide.dataTables?.[0]?.id }),
  ]),
)
```

- [ ] **Step 2: Run the seed test and verify it fails because no guide resources exist**

Run: `npm.cmd test -- src/domain/seed.test.ts`

Expected: FAIL on the board, mindmap, or data-table assertions.

- [ ] **Step 3: Add a resource-bundle factory in `seed.ts`**

Create `createWelcomeGuideBundle(now)` that returns a welcome `PageRecord`, one `BoardRecord`, one `MindmapRecord`, and one `DataTableRecord`. Reuse `createEmptyBoardSnapshot`, `createEmptyMindmapSnapshot`, `createDefaultAppState`, and `createId`; set the resource titles to `白板示例`、`项目规划导图`、`任务数据表`.

The page must contain headings and explanatory paragraphs for:

```ts
['开始记录', '页面与块', '组织与搜索', '媒体与导入', '数据表实操', '白板实操', '思维导图实操', '设置与备份']
```

Insert the three resource blocks directly after their corresponding headings, using the IDs from the bundle.

- [ ] **Step 4: Populate the example resource snapshots**

Use the existing snapshot contracts only:

```ts
board.snapshot = {
  ...createEmptyBoardSnapshot(),
  notes: [/* 收集、整理、行动便签 */],
  texts: [/* 操作提示 */],
  shapes: [/* 流程框 */],
  connections: [/* 收集 -> 整理 -> 行动 */],
}

mindmap.snapshot = {
  ...createEmptyMindmapSnapshot({ themeId: 'mint' }),
  title: '项目规划导图',
  nodes: {
    'node-root': { id: 'node-root', parentId: null, childIds: ['node-goal', 'node-tasks', 'node-review'], text: '项目规划', collapsed: false },
    'node-goal': { id: 'node-goal', parentId: 'node-root', childIds: ['node-goal-detail'], text: '目标', collapsed: false },
    // task and review branches use the same persisted node shape
  },
}
```

Create records for `收集资料`、`整理思路`、`完成复盘` in the data-table snapshot and give the records status, date, and note values using the existing data-table property and record shapes.

- [ ] **Step 5: Run the seed test and verify it passes**

Run: `npm.cmd test -- src/domain/seed.test.ts`

Expected: PASS.

### Task 2: Migrate existing system welcome pages safely

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`

- [ ] **Step 1: Write failing bootstrap tests for system and user-edited pages**

```ts
it('upgrades the unmodified legacy welcome page to the current guide', async () => {
  const repository = createCountingRepository(workspaceWithLegacyWelcomePage())
  const store = createWorkspaceStore(repository.repository)
  await store.getState().bootstrap()

  expect(store.getState().boards).toHaveLength(1)
  expect(store.getState().pages.find((page) => page.id === 'page_welcome')?.blocks).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'whiteboard' })]),
  )
})

it('keeps an edited legacy welcome page and creates a separate guide', async () => {
  const repository = createCountingRepository(workspaceWithEditedLegacyWelcomePage())
  const store = createWorkspaceStore(repository.repository)
  await store.getState().bootstrap()

  expect(store.getState().pages.find((page) => page.id === 'page_welcome')?.blocks[0]).toMatchObject({
    text: '我的内容',
  })
  expect(store.getState().pages.some((page) => page.title === '知栖使用手册')).toBe(true)
})
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `npm.cmd test -- src/store/createWorkspaceStore.test.ts`

Expected: FAIL because the migration does not have a guide version or resource bundle.

- [ ] **Step 3: Persist the guide version in workspace settings**

Add `welcomeGuideVersion?: number` to `WorkspaceSettings`. Preserve it through `normalizeSettings`, `createSettings`, bootstrap, and every setting update path that currently rebuilds `WorkspaceSettings`.

- [ ] **Step 4: Implement the migration decision**

In `ensureWelcomePageInSnapshot`, use `createWelcomeGuideBundle()` and this decision:

```ts
if (settings.welcomeGuideVersion === CURRENT_WELCOME_GUIDE_VERSION) return snapshot
if (!welcomePage) return addGuideBundleAsWelcome(snapshot)
if (matchesLegacyWelcomePage(welcomePage)) return replaceWelcomePageWithGuide(snapshot, welcomePage.id)
return appendGuideBundleAsCompanionPage(snapshot)
```

`matchesLegacyWelcomePage` must compare title, icon, and the fixed legacy block type/text sequence, not generated IDs. All added resources append to the existing `boards`, `mindmaps`, and `dataTables` arrays. Preserve all unrelated records and existing settings.

- [ ] **Step 5: Run the store regression test and verify it passes**

Run: `npm.cmd test -- src/store/createWorkspaceStore.test.ts`

Expected: PASS, including the existing deletion rule that a deliberately removed welcome page is not recreated.

### Task 3: Validate the example models and document the release

**Files:**
- Modify: `docs/updates.md`
- Test: `src/components/whiteboard/whiteboardModel.test.ts`
- Test: `src/components/mindmap/mindmapModel.test.ts`
- Test: `src/components/dataTable/domain/factory.test.ts`

- [ ] **Step 1: Add focused model assertions for the seeded snapshots**

```ts
expect(normalizeWhiteboardSnapshot(seed.boards[0]?.snapshot).notes).toHaveLength(3)
expect(Object.keys(seed.mindmaps?.[0]?.snapshot.nodes ?? {})).toHaveLength(7)
expect(Object.keys(seed.dataTables?.[0]?.snapshot.records ?? {})).toHaveLength(3)
```

- [ ] **Step 2: Run the focused model and seed tests**

Run: `npm.cmd test -- src/domain/seed.test.ts src/components/whiteboard/whiteboardModel.test.ts src/components/mindmap/mindmapModel.test.ts src/components/dataTable/domain/factory.test.ts`

Expected: PASS.

- [ ] **Step 3: Update `docs/updates.md`**

Add a concise release entry describing the detailed manual, the three editable examples, and the safe upgrade behavior for existing workspaces. Include the exact test and build commands used.

- [ ] **Step 4: Run the full frontend verification**

Run: `npm.cmd test`

Expected: all Vitest suites pass.

Run: `npm.cmd run build`

Expected: TypeScript check and Vite build exit with code 0.

- [ ] **Step 5: Open the desktop build and perform a visual check**

Start the current Tauri development build, open the welcome page, then confirm the inline data table, whiteboard, and mindmap blocks all render and can be opened for editing.
