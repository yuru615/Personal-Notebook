# High School Chinese Teacher Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify an importable `.zhiqi` page package containing a complete high-school Chinese teacher preparation and knowledge workbench for the Grade 10 first-semester Unit 7 example.

**Architecture:** Keep the template as one typed source module that returns the page-package payload and its two embedded assets. A small Node script loads that module through the installed Vite runtime, validates all internal references, and writes the existing exchange archive v2 format with the installed `jszip`; the existing Rust importer remains the acceptance boundary and proves repeated imports are independent.

**Tech Stack:** TypeScript 6, existing workspace/domain models, existing data-table/whiteboard/mindmap factories, Vitest, Node.js standard library, Vite, JSZip, Rust `rusqlite` storage tests.

---

## File structure

- Create `src/domain/templates/highSchoolChineseTeacher.ts`: deterministic page-package data, page/resource helpers, teaching content, assets, and reference validation.
- Create `src/domain/templates/highSchoolChineseTeacher.test.ts`: page tree, lesson completeness, resource counts, privacy/copyright boundaries, and dangling-reference tests.
- Create `scripts/generate-teacher-template.mjs`: load the typed bundle, calculate asset metadata, and write the exchange archive.
- Modify `package.json`: add the `template:teacher` generation command only; do not add dependencies.
- Create `public/templates/high-school-chinese-teacher-workbench.zhiqi`: generated, directly importable page package.
- Modify `src-tauri/src/storage/mod.rs`: add one real-artifact import and repeated-import acceptance test.
- Modify `docs/updates.md`: replace the design-only verification note with exact implementation and verification results.

The implementation deliberately avoids a template registry, UI, generic template framework, separate content JSON, or new package dependency.

### Task 1: Build the complete page tree and teaching content

**Files:**
- Create: `src/domain/templates/highSchoolChineseTeacher.ts`
- Create: `src/domain/templates/highSchoolChineseTeacher.test.ts`

- [ ] **Step 1: Write the failing page-tree and lesson-content tests**

Create the test with these assertions:

```ts
import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../types'
import { createHighSchoolChineseTeacherTemplate } from './highSchoolChineseTeacher'

const lessonTitles = [
  '14-1《故都的秋》',
  '14-2《荷塘月色》',
  '15《我与地坛（节选）》',
  '16-1《赤壁赋》',
  '16-2《登泰山记》',
]

function blockText(block: BlockRecord) {
  const text = 'text' in block ? block.text : ''
  const items = 'items' in block ? block.items : []
  const rows = 'rows' in block ? block.rows.flat() : []

  return [text, ...items, ...rows]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

describe('createHighSchoolChineseTeacherTemplate', () => {
  it('creates the approved single-root teacher page tree', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const root = template.pages.find((page) => page.id === template.rootPageId)
    const pageTitles = template.pages.map((page) => page.title)

    expect(template.pages).toHaveLength(36)
    expect(root).toMatchObject({
      parentId: null,
      title: '高中语文教师工作台｜高一上学期',
      icon: '📚',
      cover: 'forest',
    })
    expect(pageTitles).toEqual(expect.arrayContaining([
      '00 模板使用说明',
      '01 教师工作台',
      '02 教学规划',
      '第七单元｜自然情怀',
      '03 教学执行',
      '04 资源与知识库',
      '05 作业与学情',
      '06 复盘与成长',
      '情景交融',
      '通感',
      '比喻与拟人',
      '文言虚词“而”',
      '移步换景',
      '散文的情感线索',
      ...lessonTitles,
    ]))
  })

  it.each(lessonTitles)('%s contains a complete reusable lesson structure', (title) => {
    const template = createHighSchoolChineseTeacherTemplate()
    const lesson = template.pages.find((page) => page.title === title)
    const text = lesson?.blocks.map(blockText).join('\n') ?? ''

    expect(text).toContain('学习目标')
    expect(text).toContain('教学重点与难点')
    expect(text).toContain('教学流程')
    expect(text).toContain('核心问题链')
    expect(text).toContain('作业设计')
    expect(text).toContain('课后复盘')
  })

  it('makes 荷塘月色 the complete two-period demonstration lesson', () => {
    const template = createHighSchoolChineseTeacherTemplate()
    const lesson = template.pages.find((page) => page.title === '14-2《荷塘月色》')
    const text = lesson?.blocks.map(blockText).join('\n') ?? ''

    expect(text).toContain('第一课时')
    expect(text).toContain('第二课时')
    expect(text).toContain('朗读设计')
    expect(text).toContain('通感')
    expect(text).toContain('微写作')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: FAIL because `highSchoolChineseTeacher.ts` does not exist.

- [ ] **Step 3: Add the deterministic bundle contract and page helpers**

Use stable package-local IDs so regenerated archives have reviewable content. Imported copies still receive fresh IDs from the existing Rust importer.

```ts
import { createDefaultDatabaseView } from '../../components/dataTable/domain/factory'
import type { AppState, DatabaseView, Property, PropertyType } from '../../components/dataTable/domain/types'
import { createEmptyMindmapSnapshot } from '../../components/mindmap/mindmapModel'
import { createEmptyBoardSnapshot } from '../../components/whiteboard/whiteboardModel'
import type {
  BlockRecord,
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageRecord,
  SyncedBlockGroupRecord,
} from '../types'

const TEMPLATE_NOW = '2026-07-16T00:00:00.000Z'

export interface TeacherTemplateAsset {
  id: string
  name: string
  mimeType: string
  relativePath: string
  bytes: Uint8Array
}

export interface TeacherTemplateBundle {
  rootPageId: string
  pages: PageRecord[]
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  syncedBlockGroups: SyncedBlockGroupRecord[]
  assets: TeacherTemplateAsset[]
}

const id = (kind: string, name: string) => `teacher-template-${kind}-${name}`
const blockId = (page: string, index: number) => id('block', `${page}-${index}`)

function page(
  name: string,
  parentId: string | null,
  title: string,
  icon: string,
  blocks: BlockRecord[],
  cover: string | null = null,
): PageRecord {
  return {
    id: id('page', name),
    parentId,
    title,
    icon,
    cover,
    properties: {},
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
    showProperties: false,
    blocks,
    createdAt: TEMPLATE_NOW,
    updatedAt: TEMPLATE_NOW,
  }
}
```

Add small private helpers for `heading_1`, `heading_2`, `paragraph`, `todo`, `bulleted_list`, `numbered_list`, `table`, `code`, `child_page`, and rich-text page mentions. Each helper receives the page slug and block index and returns a real `BlockRecord`; do not add a general block factory outside this template module.

- [ ] **Step 4: Add the exact 36-page hierarchy**

Create the parent/child records in the order from the approved specification. The page count by section is fixed:

| Branch | Page count including branch page |
| --- | ---: |
| Root | 1 |
| 00 模板使用说明 | 1 |
| 01 教师工作台 | 1 |
| 02 教学规划 | 10 |
| 03 教学执行 | 4 |
| 04 资源与知识库 | 11 |
| 05 作业与学情 | 4 |
| 06 复盘与成长 | 4 |
| Total | 36 |

Every parent page must contain `child_page` blocks for its direct children. Add the two anonymous classes only as `高一（3）班` and `高一（6）班`.

- [ ] **Step 5: Populate all five reusable lesson pages**

Use one private `LessonSpec` data shape and one `createLessonBlocks(spec)` function. The five specs must carry these exact focuses:

| Lesson | Focus | Required distinctive content |
| --- | --- | --- |
| 故都的秋 | 景物选择与情感基调 | 清、静、悲凉；色彩语言；南北秋景比较 |
| 荷塘月色 | 两课时文本细读 | 朗读；景物层次；通感；情感变化；微写作 |
| 我与地坛（节选） | 生命体验与母亲形象 | 地坛景物；生命思考；文本证据 |
| 赤壁赋 | 文言知识与主客问答 | 文言词句；乐—悲—达；水月意象 |
| 登泰山记 | 游踪与写景层次 | 登山路线；时空变化；日出描写 |

The shared lesson block order is fixed: 教材定位、学情分析、学习目标、教学重点与难点、课前准备、教学流程、核心问题链、板书设计、作业设计、课后复盘. Add a real table block for each teaching flow and a plain-text code block for each board/projection layout.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: PASS for page count, hierarchy titles, all five lesson structures, and the two-period demonstration lesson.

- [ ] **Step 7: Commit the page content**

```bash
git add src/domain/templates/highSchoolChineseTeacher.ts src/domain/templates/highSchoolChineseTeacher.test.ts
git commit -m "feat: add high school Chinese teacher template content"
```

### Task 2: Add data tables, whiteboards, mindmaps, synced blocks, links, and assets

**Files:**
- Modify: `src/domain/templates/highSchoolChineseTeacher.ts`
- Modify: `src/domain/templates/highSchoolChineseTeacher.test.ts`

- [ ] **Step 1: Write failing structured-resource assertions**

Add these tests before changing the builder:

```ts
import type { AppState } from '../../components/dataTable/domain/types'

it('contains the approved structured teaching resources', () => {
  const template = createHighSchoolChineseTeacherTemplate()
  const recordCounts = template.dataTables.map(
    (table) => Object.keys((table.snapshot as AppState).records).length,
  )

  expect(template.dataTables.map((table) => table.title)).toEqual([
    '教学任务库',
    '教学资源库',
    '学情观察库',
  ])
  expect(recordCounts).toEqual([22, 16, 8])
  expect(template.boards.map((board) => board.title)).toEqual([
    '第七单元教学设计白板',
    '《荷塘月色》课堂流程白板',
  ])
  expect(template.mindmaps.map((mindmap) => mindmap.title)).toEqual([
    '第七单元知识导图',
    '《荷塘月色》文本细读导图',
  ])
  expect(template.syncedBlockGroups).toHaveLength(2)
  expect(template.assets.map((asset) => asset.name)).toEqual([
    '荷塘月色意象示意图.svg',
    '朗读停连标记示例.txt',
  ])
})

it('uses all four supported task-table layouts', () => {
  const template = createHighSchoolChineseTeacherTemplate()
  const taskTable = template.dataTables.find((table) => table.title === '教学任务库')
  const snapshot = taskTable?.snapshot as AppState
  const layouts = snapshot.database.viewOrder.map((viewId) => snapshot.database.views[viewId]?.layout)

  expect(layouts).toEqual(['table', 'board', 'calendar', 'gantt', 'table'])
})

it('keeps example observations anonymous and copyright resources explicit', () => {
  const template = createHighSchoolChineseTeacherTemplate()
  const serialized = JSON.stringify(template)

  expect(serialized).not.toMatch(/张三|李四|王五|学号[：:]?\s*\d+/)
  expect(serialized).toContain('待补充')
  expect(serialized).not.toContain('教材扫描件')
  expect(serialized).not.toContain('商业课件附件')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: FAIL because the initial bundle has no structured resources or assets.

- [ ] **Step 3: Build three deterministic data-table snapshots**

Inside the template module, add private `createProperty`, `createView`, `createRecord`, and `createDataTable` helpers. Reuse `createDefaultDatabaseView(layout)` for the complete view shape, then overwrite IDs, names, dates, grouping fields, filters, and date fields deterministically.

Use these field keys and views:

```ts
const taskFields = [
  ['name', '任务名称', 'title'],
  ['status', '状态', 'select'],
  ['taskType', '任务类型', 'select'],
  ['lesson', '所属课文', 'select'],
  ['className', '班级', 'multiSelect'],
  ['startDate', '开始日期', 'date'],
  ['dueDate', '截止日期', 'date'],
  ['priority', '优先级', 'select'],
  ['notes', '备注', 'text'],
] as const satisfies ReadonlyArray<readonly [string, string, PropertyType]>

const taskViews = [
  { id: 'all', name: '全部任务', layout: 'table' },
  { id: 'board', name: '备课看板', layout: 'board', groupKey: 'status' },
  { id: 'calendar', name: '教学日历', layout: 'calendar', dateKey: 'dueDate' },
  { id: 'gantt', name: '单元进度', layout: 'gantt', startKey: 'startDate', endKey: 'dueDate' },
  { id: 'week', name: '本周待办', layout: 'table', filterKey: 'status' },
] as const
```

Build the resource fields from `name, resourceType, lesson, scene, source, tags, readiness, notes`. Build the observation fields from `name, className, lesson, observationType, frequency, evidence, strategy, status, reviewDate`.

All record pages must exist with empty `blockIds`; all property IDs referenced by records and views must exist in `properties` and `database.propertyOrder`.

Use these exact record titles and counts:

**Teaching tasks (22):**

1. 完成第七单元整体设计
2. 整理单元学习任务单
3. 制作《故都的秋》课件
4. 高一（3）班《故都的秋》授课
5. 高一（6）班《故都的秋》授课
6. 完成《荷塘月色》第一课时备课
7. 高一（3）班《荷塘月色》第一课时
8. 高一（6）班《荷塘月色》第一课时
9. 完成《荷塘月色》第二课时备课
10. 高一（3）班《荷塘月色》第二课时
11. 高一（6）班《荷塘月色》第二课时
12. 完成《我与地坛（节选）》备课
13. 高一（3）班《我与地坛（节选）》授课
14. 高一（6）班《我与地坛（节选）》授课
15. 整理《赤壁赋》文言知识清单
16. 高一（3）班《赤壁赋》授课
17. 高一（6）班《赤壁赋》授课
18. 制作《登泰山记》游踪图
19. 高一（3）班《登泰山记》授课
20. 高一（6）班《登泰山记》授课
21. 批改单元微写作
22. 完成第七单元教学复盘

Use example dates from `2026-10-19` through `2026-11-13`, ordered by the list above. Give completed setup tasks `已完成`, current lesson work `进行中`, review-dependent work `待反馈`, and later work `未开始`.

**Teaching resources (16):**

1. 第七单元整体教学设计
2. 第七单元比较阅读任务单
3. 《故都的秋》景物与色彩整理
4. 《故都的秋》南北秋景比较表
5. 《荷塘月色》教师朗读提示
6. 《荷塘月色》意象示意图
7. 通感知识卡片
8. 《我与地坛》关键语段研读提示
9. 史铁生生平背景资料入口
10. 《赤壁赋》重点实词与虚词清单
11. 《赤壁赋》主客问答结构图
12. 《登泰山记》游踪图
13. 《登泰山记》日出描写赏析表
14. 写景散文微写作提示
15. 单元写作评价量规
16. 单元复习与自测题

Mark only the bundled SVG, text file, knowledge-card pages, and template-authored tables as `已包含`; mark external audio, video, background reading, and teacher-owned courseware as `待补充`.

**Learning observations (8):**

1. 高一（3）班对通感和比喻辨析不清
2. 高一（6）班朗读能够感知节奏但缺少文本依据
3. 《故都的秋》景物特点概括停留在形容词罗列
4. 《我与地坛》母亲形象分析缺少细节证据
5. 《赤壁赋》主客问答结构理解困难
6. 文言虚词“而”的关系判断不稳定
7. 《登泰山记》游踪与时间线容易混淆
8. 写景练习存在景物堆砌且缺少情感线索

- [ ] **Step 4: Build the two editable whiteboards**

Start each from `createEmptyBoardSnapshot()` and set notes, shapes, texts, and connections directly.

- Unit board: six left-to-right stages, five movable lesson notes, separate colors for modern prose and classical landscape texts, plus one blank “课堂生成” note.
- 荷塘月色 board: four labeled regions for 第一课时、第二课时、板书布局、课堂生成; at least eight activity notes with suggested minutes and arrow connections.

Every connection endpoint must reference an existing note or shape ID.

- [ ] **Step 5: Build the two editable mindmaps**

Start from `createEmptyMindmapSnapshot({ themeId: 'mint' })` for the unit map and `{ themeId: 'dusk' }` for the lesson map. Replace the root text/title, set `updatedAt: TEMPLATE_NOW`, and add the exact first-level branches from the specification. Each node must have matching `parentId` and `childIds`; no node may be unreachable from `node-root`.

- [ ] **Step 6: Add the two synced groups and all instances**

Create stable groups:

```ts
const unitGoalGroupId = id('synced-group', 'unit-goals')
const reflectionGroupId = id('synced-group', 'reflection-questions')
```

- Unit goals: one primary instance on `01 教师工作台`, reference instances on `单元总览` and all five lesson pages; seven instances total.
- Reflection questions: one primary instance on `课后复盘`, reference instances on all five lesson pages; six instances total.

The group block text must contain the four approved unit goals and the four approved reflection questions. Synced-group blocks must not contain nested `synced_block` blocks.

Use these exact unit goals:

1. 梳理写景顺序，概括不同文本的景物特征。
2. 结合具体语句，分析语言特点和情景关系。
3. 比较现代散文与古代山水文章中的自然观照和生命感受。
4. 完成赏析札记与写景片段，并依据评价量规修改表达。

Use these exact reflection questions:

1. 学习目标达成了吗？
2. 哪个课堂证据最能说明问题？
3. 哪个环节需要删减或调整？
4. 下次教学最先改变什么？

- [ ] **Step 7: Add page mentions and the two embedded assets**

Use rich-text segments with `pageId` and `relationKind: 'mention'` to connect each lesson to relevant knowledge cards. Keep all relation targets inside the 36-page tree.

Generate the SVG and text bytes inside the template builder with `TextEncoder`; do not add separate source asset files:

```ts
const lotusPondSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17324d"/>
      <stop offset="1" stop-color="#446b6a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#sky)"/>
  <circle cx="930" cy="120" r="58" fill="#f5efcf" opacity="0.92"/>
  <path d="M0 440 Q250 395 480 445 T920 430 T1200 445 V675 H0Z" fill="#183f48"/>
  <g fill="#4f806d" stroke="#9bc4a7" stroke-width="4">
    <ellipse cx="250" cy="470" rx="120" ry="38"/>
    <ellipse cx="520" cy="505" rx="145" ry="42"/>
    <ellipse cx="820" cy="470" rx="130" ry="40"/>
  </g>
  <g fill="#d7a6b2">
    <circle cx="250" cy="430" r="25"/>
    <circle cx="520" cy="458" r="28"/>
    <circle cx="820" cy="425" r="24"/>
  </g>
  <g stroke="#b8d2c8" stroke-width="3" opacity="0.55">
    <path d="M110 560 H1080"/>
    <path d="M170 600 H1010"/>
  </g>
  <text x="60" y="90" fill="#f7f5e8" font-size="38" font-family="serif">荷塘 · 月色 · 心境</text>
</svg>`.trim()

const readingPauseText = `朗读符号说明
/  短停顿
// 较长停顿
↑ 语调上扬
↓ 语调下降
· 轻读

练习方法：先按句意划分停连，再用重音和语调呈现景物层次与情绪变化。`

const encoder = new TextEncoder()
const assets: TeacherTemplateAsset[] = [
  {
    id: id('asset', 'lotus-pond'),
    name: '荷塘月色意象示意图.svg',
    mimeType: 'image/svg+xml',
    relativePath: 'teacher-template/lotus-pond.svg',
    bytes: encoder.encode(lotusPondSvg),
  },
  {
    id: id('asset', 'reading-pauses'),
    name: '朗读停连标记示例.txt',
    mimeType: 'text/plain',
    relativePath: 'teacher-template/reading-pauses.txt',
    bytes: encoder.encode(readingPauseText),
  },
]
```

Embed the image and file blocks on the 荷塘月色 page. The image block must have a non-empty `caption` and `alt`.

- [ ] **Step 8: Run the structured-resource test and verify GREEN**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: PASS with record counts `[22, 16, 8]`, all four supported layouts, two boards, two maps, two synced groups, two assets, and anonymous example data.

- [ ] **Step 9: Commit the structured template resources**

```bash
git add src/domain/templates/highSchoolChineseTeacher.ts src/domain/templates/highSchoolChineseTeacher.test.ts
git commit -m "feat: add interactive teacher template resources"
```

### Task 3: Validate and generate the importable page package

**Files:**
- Modify: `src/domain/templates/highSchoolChineseTeacher.ts`
- Modify: `src/domain/templates/highSchoolChineseTeacher.test.ts`
- Create: `scripts/generate-teacher-template.mjs`
- Modify: `package.json`
- Create: `public/templates/high-school-chinese-teacher-workbench.zhiqi`
- Modify: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: Write a failing validator test**

```ts
import {
  createHighSchoolChineseTeacherTemplate,
  validateHighSchoolChineseTeacherTemplate,
} from './highSchoolChineseTeacher'

it('rejects dangling resource references before packaging', () => {
  const template = createHighSchoolChineseTeacherTemplate()
  const broken = structuredClone(template)
  const root = broken.pages.find((page) => page.id === broken.rootPageId)

  root?.blocks.push({
    id: 'broken-board-block',
    type: 'whiteboard',
    boardId: 'missing-board',
  })

  expect(() => validateHighSchoolChineseTeacherTemplate(broken)).toThrow(
    'missing board: missing-board',
  )
})

it('accepts the complete teacher template', () => {
  expect(() =>
    validateHighSchoolChineseTeacherTemplate(createHighSchoolChineseTeacherTemplate()),
  ).not.toThrow()
})
```

- [ ] **Step 2: Run the validator test and verify RED**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: FAIL because `validateHighSchoolChineseTeacherTemplate` does not exist.

- [ ] **Step 3: Implement the package-local validator**

Validate these invariants and throw messages that identify the missing or duplicate ID:

- IDs are unique within pages, boards, data tables, mindmaps, synced groups, and assets.
- `rootPageId` exists and has `parentId: null`; every other page has a parent in the page set and is reachable from the root.
- `child_page`, whiteboard, data-table, mindmap, synced-block, image/file, and rich-text page references resolve inside the bundle.
- Synced-group primary instances occur in page blocks and group blocks do not nest synced blocks.
- Every data-table view property reference resolves against its own `properties` object.
- Asset relative paths are unique and bytes are non-empty.
- Each whiteboard connection endpoint resolves to a note or shape.
- Each mindmap node's parent/children references are reciprocal and all nodes are reachable from `rootId`.

Keep `createHighSchoolChineseTeacherTemplate()` as a pure data builder. The generation script must call `validateHighSchoolChineseTeacherTemplate()` explicitly before writing any file.

- [ ] **Step 4: Run the validator test and verify GREEN**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: PASS, including the deliberate missing-board rejection.

- [ ] **Step 5: Add the Rust acceptance test before the artifact exists**

Append this test in the existing `#[cfg(test)]` storage test module:

```rust
#[test]
fn teacher_workbench_page_package_imports_twice_as_independent_trees() {
    let package_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../public/templates/high-school-chinese-teacher-workbench.zhiqi");
    let archive = fs::read(package_path).expect("teacher template package exists");
    let target = Storage::open_in_memory_for_tests().expect("target opens");

    let first = target
        .import_page_package(archive.clone())
        .expect("first teacher template import");
    let second = target
        .import_page_package(archive)
        .expect("second teacher template import");
    let imported = target.export_workspace_backup().expect("export imported workspace");

    assert_ne!(first.root_page_id, second.root_page_id);
    assert_eq!(imported.pages.len(), 72);
    assert_eq!(imported.boards.len(), 4);
    assert_eq!(imported.data_tables.len(), 6);
    assert_eq!(imported.mindmaps.len(), 4);
    assert_eq!(imported.synced_block_groups.len(), 4);
    assert_eq!(
        imported
            .pages
            .iter()
            .filter(|page| page.title == "高中语文教师工作台｜高一上学期")
            .count(),
        2
    );

    let first_ids = target
        .descendant_page_ids(&first.root_page_id)
        .expect("first imported tree");
    let second_ids = target
        .descendant_page_ids(&second.root_page_id)
        .expect("second imported tree");
    assert_eq!(first_ids.len(), 36);
    assert_eq!(second_ids.len(), 36);
    assert!(first_ids.iter().all(|id| !second_ids.contains(id)));
}
```

- [ ] **Step 6: Run the Rust acceptance test and verify RED**

Run:

```powershell
$env:CARGO_TARGET_DIR='E:\BuildCache\cargo-target\zhixi\teacher-template'
cargo test teacher_workbench_page_package_imports_twice_as_independent_trees --manifest-path src-tauri/Cargo.toml
```

Expected: FAIL at `teacher template package exists` because the generated file is absent.

- [ ] **Step 7: Implement the generator script**

Use only Node standard-library modules, Vite, and JSZip:

```js
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/templates/high-school-chinese-teacher-workbench.zhiqi')
const temporaryOutput = `${output}.tmp`
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const server = await createServer({
  root,
  appType: 'custom',
  server: { middlewareMode: true },
})

try {
  const module = await server.ssrLoadModule('/src/domain/templates/highSchoolChineseTeacher.ts')
  const template = module.createHighSchoolChineseTeacherTemplate()
  module.validateHighSchoolChineseTeacherTemplate(template)

  const assets = template.assets.map((asset) => ({
    id: asset.id,
    sha256: createHash('sha256').update(asset.bytes).digest('hex'),
    name: asset.name,
    mimeType: asset.mimeType,
    byteSize: asset.bytes.byteLength,
    relativePath: asset.relativePath,
    createdAt: '2026-07-16T00:00:00.000Z',
  }))
  const zip = new JSZip()
  const archiveDate = new Date('2026-07-16T00:00:00.000Z')
  zip.file('manifest.json', JSON.stringify({
    format: 'zhiqi.exchange',
    formatVersion: 2,
    kind: 'page-package',
    createdWith: packageJson.version,
    createdAt: '2026-07-16T00:00:00.000Z',
  }, null, 2), { date: archiveDate })
  zip.file('payload.json', JSON.stringify({
    rootPageId: template.rootPageId,
    pages: template.pages,
    boards: template.boards,
    dataTables: template.dataTables,
    mindmaps: template.mindmaps,
    syncedBlockGroups: template.syncedBlockGroups,
  }, null, 2), { date: archiveDate })
  zip.file('assets/manifest.json', JSON.stringify(assets, null, 2), { date: archiveDate })
  for (const asset of template.assets) {
    zip.file(`assets/${asset.relativePath}`, asset.bytes, { date: archiveDate })
  }

  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(temporaryOutput, bytes)
  await rm(output, { force: true })
  await rename(temporaryOutput, output)
} finally {
  await rm(temporaryOutput, { force: true })
  await server.close()
}
```

Add to `package.json`:

```json
"template:teacher": "node scripts/generate-teacher-template.mjs"
```

- [ ] **Step 8: Generate the page package**

Run: `npm.cmd run template:teacher`

Expected: exit code 0 and a non-empty `public/templates/high-school-chinese-teacher-workbench.zhiqi`.

- [ ] **Step 9: Run TypeScript and Rust package verification**

Run: `npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts`

Expected: PASS.

Run:

```powershell
$env:CARGO_TARGET_DIR='E:\BuildCache\cargo-target\zhixi\teacher-template'
cargo test teacher_workbench_page_package_imports_twice_as_independent_trees --manifest-path src-tauri/Cargo.toml
```

Expected: PASS; two imports produce 72 pages, four boards, six data tables, four mindmaps, and four synced groups with disjoint page IDs.

- [ ] **Step 10: Prove deterministic regeneration**

Record the SHA-256 of the generated package, rerun `npm.cmd run template:teacher`, and record it again:

```powershell
Get-FileHash 'public\templates\high-school-chinese-teacher-workbench.zhiqi' -Algorithm SHA256
npm.cmd run template:teacher
Get-FileHash 'public\templates\high-school-chinese-teacher-workbench.zhiqi' -Algorithm SHA256
```

Expected: both hashes are identical because IDs, timestamps, asset order, and ZIP entry order are fixed.

- [ ] **Step 11: Commit the generator, artifact, and acceptance test**

```bash
git add src/domain/templates/highSchoolChineseTeacher.ts src/domain/templates/highSchoolChineseTeacher.test.ts scripts/generate-teacher-template.mjs package.json public/templates/high-school-chinese-teacher-workbench.zhiqi src-tauri/src/storage/mod.rs
git commit -m "feat: add importable teacher workbench template"
```

### Task 4: Verify the real desktop experience and document the result

**Files:**
- Modify: `docs/updates.md`

- [ ] **Step 1: Run focused frontend and Rust tests**

Run:

```powershell
npm.cmd test -- src/domain/templates/highSchoolChineseTeacher.test.ts src/domain/seed.test.ts
$env:CARGO_TARGET_DIR='E:\BuildCache\cargo-target\zhixi\teacher-template'
cargo test teacher_workbench_page_package --manifest-path src-tauri/Cargo.toml
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full frontend verification**

Run: `npm.cmd test`

Expected: all Vitest suites pass.

Run: `npm.cmd run lint`

Expected: exit code 0; existing warnings may remain, but no new warning may point to template files.

Run: `npm.cmd run build`

Expected: TypeScript build and Vite production build pass.

- [ ] **Step 3: Run the complete Rust storage suite**

Run:

```powershell
$env:CARGO_TARGET_DIR='E:\BuildCache\cargo-target\zhixi\teacher-template'
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 4: Import the package in the Windows desktop app**

Start `npm.cmd run tauri:dev`, open “导入内容” → “导入页面包”, and select `public/templates/high-school-chinese-teacher-workbench.zhiqi`.

Confirm:

- One 36-page root tree appears without changing the welcome page or existing pages.
- The workbench dashboard and all five lesson pages render without missing blocks.
- The three data tables open and expose their planned table/board/calendar/gantt views.
- Both whiteboards and both mindmaps open and remain editable.
- Synced goals and reflection questions render at every planned instance.
- The SVG image and text file open from their media blocks.
- Global search finds `通感`, `自然情怀`, `赤壁赋`, and `课堂证据` across pages and structured resources.

- [ ] **Step 5: Perform visual QA at desktop and narrow widths**

Capture and inspect the workbench dashboard, unit overview, 荷塘月色 lesson, three data-table layouts, two whiteboards, and two mindmaps. Check text overflow, card height, block spacing, page outline placement, board readability, and mindmap node overlap. Resize to a narrow desktop window and repeat the dashboard and lesson checks.

If a defect is found, add the smallest failing model/style test that reproduces it before changing source data or styles. Do not refactor unrelated UI.

- [ ] **Step 6: Update the existing `docs/updates.md` entry**

Change the “高中语文教师工作台页面包设计” entry to the completed feature name, preserve its content summary, and replace the design-only verification line with the exact test counts, Rust result, lint/build result, desktop import result, and visual QA result from Steps 1–5.

- [ ] **Step 7: Commit documentation and any verified minimal corrections**

```bash
git add docs/updates.md
git commit -m "docs: record teacher template verification"
```

## Completion checklist

- [ ] The generated page package exists and regenerates to the same SHA-256.
- [ ] The welcome workspace and template UI remain unchanged.
- [ ] The template contains 36 pages, 3 data tables, 2 boards, 2 mindmaps, 2 synced groups, and 2 embedded assets.
- [ ] The record counts are exactly 22, 16, and 8.
- [ ] All internal references validate before packaging.
- [ ] The Rust importer accepts the artifact twice and produces independent trees.
- [ ] Full frontend and Rust tests, lint, and build pass.
- [ ] Windows desktop import and visual QA pass.
- [ ] `docs/updates.md` reports the exact verification evidence.
