# Direction 1 Page Properties and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight shared page-property system to normal pages and upgrade search so it understands property hits, media filenames, result grouping, and same-page multi-hit display.

**Architecture:** Keep page-property definitions as workspace-level metadata and page-property values on each page record. Persist definitions through the existing workspace settings storage boundary, persist page values alongside page content, and upgrade both the TypeScript search helpers and the Rust FTS index to emit richer hit metadata without turning normal pages into database records.

**Tech Stack:** React 19, TypeScript, Zustand vanilla store, Vitest, Testing Library, Tauri 2, Rust, rusqlite, SQLite FTS5.

---

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`: add page-property types and extend `PageRecord` / `WorkspaceSnapshot`.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\pageProperties.ts`: property defaults, normalization, and small search helpers.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\pageProperties.test.ts`: focused unit tests for page-property normalization and option handling.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`: seed default page-property definitions.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`: hold page-property definitions in state and add property actions.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`: cover property definition reuse and page value persistence.
- Create `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.tsx`: compact property panel rendered between title and body.
- Create `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.test.tsx`: UI coverage for adding and editing page properties.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\PageHeader.tsx`: add a dedicated slot for the property panel below the title area.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`: wire store actions into the page header and search dialog.
- Modify `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`: add user-facing labels for page properties and richer search result metadata.
- Modify `E:\Workspace\个人知识库-桌面端\src\styles\index.css`: style the compact property panel and richer search dialog sections/chips.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\search.ts`: emit property-aware search hits and search metadata for grouping/filtering.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\search.test.ts`: cover title/body/property/media hit sources and same-page multiple hits.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`: add grouping, source labels, and client-side filter chips.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`: cover groups, chips, and multiple results per page.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\workspaceRepository.ts`: keep snapshot compatibility when `pageProperties` is missing in older backups.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\workspaceRepository.test.ts`: verify old snapshots load and new snapshots round-trip.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.ts`: widen `SearchResult` payload compatibility only; no new commands required.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`: cover richer backend search result shape.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`: add page-property types to Rust snapshot models and enrich `SearchResult`.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\schema.rs`: add schema migration for page property persistence and richer search document fields.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`: read/write page property definitions and page property values.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\search.rs`: index title/body/property/media documents separately and return hit-source metadata.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`: keep command surface stable while returning the richer `SearchResult`.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`: record the user-visible behavior once implementation is complete.

---

### Task 1: Add page-property domain contracts and snapshot compatibility

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\pageProperties.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\pageProperties.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\workspaceRepository.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\workspaceRepository.test.ts`

- [ ] **Step 1: Write the failing domain and repository tests**

Add a new focused test file `src/domain/pageProperties.test.ts` with cases like:

```ts
import { describe, expect, it } from 'vitest'
import {
  createDefaultPagePropertyDefinitions,
  normalizePagePropertyDefinitions,
  normalizePagePropertyValue,
} from './pageProperties'

describe('page properties', () => {
  it('creates stable default definitions for tags, status, date, and notes', () => {
    const definitions = createDefaultPagePropertyDefinitions('2026-07-05T00:00:00.000Z')

    expect(definitions.map((item) => [item.key, item.type])).toEqual([
      ['tags', 'multiSelect'],
      ['status', 'select'],
      ['date', 'date'],
      ['notes', 'text'],
    ])
  })

  it('normalizes multi-select and select values against definition type', () => {
    expect(
      normalizePagePropertyValue(
        { id: 'prop_tags', key: 'tags', name: '标签', type: 'multiSelect', config: {}, createdAt: '', updatedAt: '' },
        ['产品', '搜索'],
      ),
    ).toEqual(['产品', '搜索'])

    expect(
      normalizePagePropertyValue(
        { id: 'prop_status', key: 'status', name: '状态', type: 'select', config: {}, createdAt: '', updatedAt: '' },
        ['进行中'],
      ),
    ).toBeNull()
  })
})
```

Add a compatibility test to `src/lib/workspaceRepository.test.ts`:

```ts
it('loads old snapshots without pageProperties and preserves new snapshots with pageProperties', async () => {
  const repository = createStorageWorkspaceRepository({
    client: {
      exportWorkspaceBackup: vi
        .fn()
        .mockResolvedValueOnce({
          boards: [],
          dataTables: [],
          mindmaps: [],
          pages: [],
          settings: { lastOpenedPageId: null },
        })
        .mockResolvedValueOnce(null),
      replaceWorkspaceBackup: vi.fn(async () => undefined),
      savePage: vi.fn(async () => undefined),
      saveBoard: vi.fn(async () => undefined),
      saveDataTable: vi.fn(async () => undefined),
      saveMindmap: vi.fn(async () => undefined),
      cleanupOrphanAssets: vi.fn(async () => 0),
      writeAsset: vi.fn(),
      importAssetFile: vi.fn(),
      readAsset: vi.fn(),
      getAssetFilePath: vi.fn(),
      searchWorkspace: vi.fn(async () => []),
      exportPagePackageToPath: vi.fn(async () => undefined),
      exportPagePackage: vi.fn(async () => new Uint8Array()),
      importPagePackage: vi.fn(async () => ({ rootPageId: 'page_1' })),
      importPagePackageFromPath: vi.fn(async () => ({ rootPageId: 'page_1' })),
    },
  })

  await expect(repository.load()).resolves.toMatchObject({
    pageProperties: [],
  })
})
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npx vitest run src/domain/pageProperties.test.ts src/lib/workspaceRepository.test.ts
```

Expected: FAIL because page-property helpers, snapshot fields, and repository defaults do not exist yet.

- [ ] **Step 3: Add the minimal domain model**

In `src/domain/types.ts`, add:

```ts
export type PagePropertyType = 'text' | 'select' | 'multiSelect' | 'date'

export interface PagePropertyOption {
  id: string
  label: string
  color: string
}

export interface PagePropertyDefinition {
  id: string
  key: string
  name: string
  type: PagePropertyType
  config: {
    options?: PagePropertyOption[]
  }
  createdAt: string
  updatedAt: string
}

export type PagePropertyValue = string | string[] | null

export type PagePropertyValueMap = Record<string, PagePropertyValue>
```

Extend the snapshot and page contracts:

```ts
export interface PageRecord {
  // existing fields...
  properties?: PagePropertyValueMap
}

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  pages: PageRecord[]
  pageProperties?: PagePropertyDefinition[]
  settings: WorkspaceSettings
}
```

Create `src/domain/pageProperties.ts` with the smallest reusable helpers:

```ts
import type {
  PagePropertyDefinition,
  PagePropertyType,
  PagePropertyValue,
  PagePropertyValueMap,
} from './types'
import { createId } from '../utils/id'

export function createDefaultPagePropertyDefinitions(now: string): PagePropertyDefinition[] {
  return [
    createDefinition('tags', '标签', 'multiSelect', now),
    createDefinition('status', '状态', 'select', now),
    createDefinition('date', '日期', 'date', now),
    createDefinition('notes', '备注', 'text', now),
  ]
}

export function createDefinition(
  key: string,
  name: string,
  type: PagePropertyType,
  now: string,
): PagePropertyDefinition {
  return {
    id: createId('page_property'),
    key,
    name,
    type,
    config: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizePagePropertyDefinitions(
  value: PagePropertyDefinition[] | undefined,
): PagePropertyDefinition[] {
  return Array.isArray(value) ? value : []
}

export function normalizePagePropertyValue(
  definition: PagePropertyDefinition,
  value: unknown,
): PagePropertyValue {
  if (definition.type === 'multiSelect') {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  if (definition.type === 'text' || definition.type === 'select' || definition.type === 'date') {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  return null
}

export function normalizePagePropertyValues(
  definitions: PagePropertyDefinition[],
  value: PagePropertyValueMap | undefined,
): PagePropertyValueMap {
  const entries = definitions.map((definition) => [
    definition.id,
    normalizePagePropertyValue(definition, value?.[definition.id]),
  ] as const)

  return Object.fromEntries(entries)
}
```

Update `src/domain/seed.ts` so the seed workspace contains:

```ts
pageProperties: createDefaultPagePropertyDefinitions(now),
```

Update `src/lib/workspaceRepository.ts` to default missing `pageProperties`:

```ts
async load() {
  await writeQueue
  const snapshot = await client.exportWorkspaceBackup()

  if (!snapshot) {
    return null
  }

  return {
    ...snapshot,
    pageProperties: snapshot.pageProperties ?? [],
    pages: snapshot.pages.map((page) => ({
      ...page,
      properties: page.properties ?? {},
    })),
  }
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx vitest run src/domain/pageProperties.test.ts src/lib/workspaceRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/seed.ts src/domain/pageProperties.ts src/domain/pageProperties.test.ts src/lib/workspaceRepository.ts src/lib/workspaceRepository.test.ts
git commit -m "feat: add page property domain model"
```

---

### Task 2: Add store actions and the compact page-properties panel

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.tsx`
- Create: `E:\Workspace\个人知识库-桌面端\src\components\editor\PagePropertiesPanel.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PageHeader.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`

- [ ] **Step 1: Write the failing store and panel tests**

Add store coverage to `src/store/createWorkspaceStore.test.ts`:

```ts
it('reuses workspace property definitions across pages and persists page values', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  const tagsDefinition = store.getState().pageProperties.find((item) => item.key === 'tags')
  expect(tagsDefinition).toBeTruthy()

  await store.getState().setPagePropertyValue('page_1', tagsDefinition!.id, ['产品', '搜索'])
  await store.getState().createPage()

  const nextPageId = store.getState().pages.at(-1)?.id
  await store.getState().setPagePropertyValue(nextPageId!, tagsDefinition!.id, ['搜索'])

  expect(store.getState().pageProperties.filter((item) => item.key === 'tags')).toHaveLength(1)
  expect(counted.getSnapshot()?.pages[0].properties?.[tagsDefinition!.id]).toEqual(['产品', '搜索'])
})
```

Create `src/components/editor/PagePropertiesPanel.test.tsx`:

```tsx
it('renders compact property rows and allows editing default properties', async () => {
  const user = userEvent.setup()
  const onSetValue = vi.fn()

  render(
    <PagePropertiesPanel
      definitions={[
        { id: 'prop_tags', key: 'tags', name: '标签', type: 'multiSelect', config: {}, createdAt: '', updatedAt: '' },
        { id: 'prop_status', key: 'status', name: '状态', type: 'select', config: {}, createdAt: '', updatedAt: '' },
      ]}
      values={{ prop_tags: ['产品'], prop_status: '进行中' }}
      onSetValue={onSetValue}
      onAddDefaultProperty={vi.fn()}
    />,
  )

  expect(screen.getByText('标签')).toBeInTheDocument()
  expect(screen.getByText('状态')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '添加属性' }))
})
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts src/components/editor/PagePropertiesPanel.test.tsx
```

Expected: FAIL because `pageProperties` state, page-property actions, and the panel component do not exist.

- [ ] **Step 3: Implement store state and compact UI**

Extend `WorkspaceState` in `src/store/createWorkspaceStore.ts`:

```ts
pageProperties: PagePropertyDefinition[]
setPagePropertyValue: (
  pageId: PageId,
  propertyId: string,
  value: PagePropertyValue,
) => Promise<void>
appendDefaultPageProperty: (key: 'tags' | 'status' | 'date' | 'notes') => Promise<void>
renamePageProperty: (propertyId: string, name: string) => Promise<void>
setPagePropertyOptions: (propertyId: string, options: PagePropertyOption[]) => Promise<void>
```

On bootstrap, normalize page-property definitions and page values:

```ts
const snapshot = await ensureSnapshot(repository, createSeedWorkspace())
const pageProperties = normalizePagePropertyDefinitions(snapshot.pageProperties)
const pages = snapshot.pages.map((page) => ({
  ...page,
  properties: normalizePagePropertyValues(pageProperties, page.properties),
}))
```

Implement the minimal update action:

```ts
async function setPagePropertyValue(pageId: PageId, propertyId: string, value: PagePropertyValue) {
  updateState((current) => ({
    ...current,
    pages: current.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            updatedAt: new Date().toISOString(),
            properties: {
              ...(page.properties ?? {}),
              [propertyId]: value,
            },
          }
        : page,
    ),
  }))
}
```

Add a `meta` slot in `src/components/editor/PageHeader.tsx`:

```tsx
interface PageHeaderProps {
  page: PageRecord
  bodyClassName?: string
  meta?: ReactNode
  onRename: (title: string) => void
  // existing props...
}
```

Render it between the title input and the editor body boundary:

```tsx
{meta ? <div className="page-header-meta">{meta}</div> : null}
```

Create `src/components/editor/PagePropertiesPanel.tsx` as a compact row list:

```tsx
export function PagePropertiesPanel({
  definitions,
  values,
  onSetValue,
  onAddDefaultProperty,
}: PagePropertiesPanelProps) {
  return (
    <section className="page-properties-panel" aria-label="页面属性">
      {definitions.map((definition) => (
        <div key={definition.id} className="page-property-row">
          <span className="page-property-name">{definition.name}</span>
          <button
            type="button"
            className="page-property-value"
            onClick={() => {
              if (definition.type === 'select') {
                onSetValue(definition.id, '进行中')
              }
            }}
          >
            {renderPropertyValue(definition, values[definition.id])}
          </button>
        </div>
      ))}
      <button type="button" className="page-property-add" onClick={() => onAddDefaultProperty('tags')}>
        添加属性
      </button>
    </section>
  )
}
```

Wire it in `src/app/App.tsx` inside the normal page header:

```tsx
<PageHeader
  page={page}
  meta={
    <PagePropertiesPanel
      definitions={state.pageProperties}
      values={page.properties ?? {}}
      onSetValue={(propertyId, value) =>
        store.getState().setPagePropertyValue(page.id, propertyId, value)
      }
      onAddDefaultProperty={(key) => store.getState().appendDefaultPageProperty(key)}
    />
  }
  onRename={(title) => void store.getState().renamePage(page.id, title)}
  onChangeIcon={(icon) => void store.getState().setPageIcon(page.id, icon)}
  onChangeCover={(cover) => void store.getState().setPageCover(page.id, cover)}
/>
```

Add compact copy and styles only:

```ts
pageProperties: {
  title: '页面属性',
  add: '添加属性',
  empty: '暂无属性',
  tags: '标签',
  status: '状态',
  date: '日期',
  notes: '备注',
}
```

```css
.page-header-meta {
  margin-top: 12px;
}

.page-properties-panel {
  display: grid;
  gap: 8px;
}

.page-property-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts src/components/editor/PagePropertiesPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/components/editor/PagePropertiesPanel.tsx src/components/editor/PagePropertiesPanel.test.tsx src/components/editor/PageHeader.tsx src/app/App.tsx src/ui/copy.ts src/styles/index.css
git commit -m "feat: add page properties panel"
```

---

### Task 3: Upgrade the TypeScript search model and dialog UI

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\search.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\search.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`

- [ ] **Step 1: Write failing search-domain and dialog tests**

Extend `src/domain/search.test.ts`:

```ts
it('emits property hits with source labels and keeps multiple hits from the same page', () => {
  const pageWithProperties: PageRecord = {
    id: 'page-search',
    parentId: null,
    title: 'Search Notes',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-1', type: 'paragraph', text: 'customer interview summary' }],
    properties: {
      prop_tags: ['产品', '搜索'],
      prop_status: '进行中',
    },
    createdAt: now,
    updatedAt: now,
  }

  const results = searchPages(
    [pageWithProperties],
    [
      { id: 'prop_tags', key: 'tags', name: '标签', type: 'multiSelect', config: {}, createdAt: now, updatedAt: now },
      { id: 'prop_status', key: 'status', name: '状态', type: 'select', config: {}, createdAt: now, updatedAt: now },
    ],
    '搜索',
  )

  expect(results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        pageId: 'page-search',
        matchSource: 'property',
        matchKey: 'tags',
        sourceLabel: '标签',
      }),
    ]),
  )
})
```

Extend `src/components/search/SearchDialog.test.tsx`:

```tsx
it('renders grouped results and filters tags/status hits with chips', async () => {
  const user = userEvent.setup()

  render(
    <SearchDialog
      open
      pages={[]}
      onClose={vi.fn()}
      onOpenPage={vi.fn()}
      onSearch={vi.fn().mockResolvedValue([
        {
          kind: 'page',
          pageId: 'page-1',
          title: '产品规划',
          icon: '📄',
          excerpt: '产品 / 搜索',
          matchSource: 'property',
          matchKey: 'tags',
          sourceLabel: '标签',
        },
        {
          kind: 'page',
          pageId: 'page-1',
          title: '产品规划',
          icon: '📄',
          excerpt: '进行中',
          matchSource: 'property',
          matchKey: 'status',
          sourceLabel: '状态',
        },
      ])}
    />,
  )

  await user.type(screen.getByPlaceholderText('搜索页面或内容'), '产品')
  await user.click(await screen.findByRole('button', { name: '标签' }))

  expect(screen.getByText('页面')).toBeInTheDocument()
  expect(screen.getByText('产品 / 搜索')).toBeInTheDocument()
  expect(screen.queryByText('进行中')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npx vitest run src/domain/search.test.ts src/components/search/SearchDialog.test.tsx
```

Expected: FAIL because `SearchResult` has no hit-source metadata and the dialog has no grouping/filter chips.

- [ ] **Step 3: Implement richer frontend search results**

Extend `SearchResult` in `src/domain/search.ts`:

```ts
export interface SearchResult {
  kind: 'page' | 'whiteboard' | 'data_table' | 'data_table_record'
  pageId: string
  boardId?: string
  databaseId?: string
  recordId?: string
  title: string
  icon: string | null
  excerpt: string
  matchSource:
    | 'title'
    | 'body'
    | 'property'
    | 'media'
    | 'whiteboard'
    | 'data_table'
    | 'data_table_record'
  matchKey?: string
  sourceLabel: string
}
```

Change `searchPages` to accept definitions:

```ts
export function searchPages(
  pages: PageRecord[],
  definitions: PagePropertyDefinition[],
  query: string,
): SearchResult[] {
  // existing body + title matches
  // add per-property entries using page.properties
}
```

Add property entries beside blocks:

```ts
const propertyEntries = definitions.flatMap((definition) => {
  const rawValue = page.properties?.[definition.id]
  const excerpt =
    Array.isArray(rawValue) ? rawValue.join(' / ') : typeof rawValue === 'string' ? rawValue : ''

  if (!excerpt) {
    return []
  }

  return [{
    excerpt,
    searchText: excerpt,
    matchSource: 'property' as const,
    matchKey: definition.key,
    sourceLabel: definition.name,
  }]
})
```

In `src/components/search/SearchDialog.tsx`, keep backend `onSearch` but add display grouping:

```tsx
const [activeFilter, setActiveFilter] = useState<'all' | 'page' | 'whiteboard' | 'data_table' | 'tags' | 'status'>('all')

const filteredResults = useMemo(() => {
  if (activeFilter === 'all') {
    return results
  }
  if (activeFilter === 'tags' || activeFilter === 'status') {
    return results.filter((result) => result.matchKey === activeFilter)
  }
  return results.filter((result) => result.kind === activeFilter)
}, [activeFilter, results])
```

Build grouped sections:

```tsx
const groupedResults = [
  ['page', filteredResults.filter((item) => item.kind === 'page')],
  ['whiteboard', filteredResults.filter((item) => item.kind === 'whiteboard')],
  ['data_table', filteredResults.filter((item) => item.kind === 'data_table' || item.kind === 'data_table_record')],
] as const
```

Render source labels in each result row:

```tsx
<span className="search-result-meta">
  <span className="search-result-source">{result.sourceLabel}</span>
</span>
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx vitest run src/domain/search.test.ts src/components/search/SearchDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/search.ts src/domain/search.test.ts src/components/search/SearchDialog.tsx src/components/search/SearchDialog.test.tsx src/ui/copy.ts src/styles/index.css
git commit -m "feat: add property-aware search UI"
```

---

### Task 4: Persist page properties in SQLite and emit richer backend search hits

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\schema.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\search.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`

- [ ] **Step 1: Write the failing Rust and storage-client tests**

Add a storage-client shape test to `src/lib/storageClient.test.ts`:

```ts
it('maps richer backend search results with source metadata', async () => {
  const client = createTauriStorageClient()
  eventApi.invoke.mockResolvedValueOnce([
    {
      kind: 'page',
      pageId: 'page_1',
      title: '产品规划',
      icon: '📄',
      excerpt: '产品 / 搜索',
      matchSource: 'property',
      matchKey: 'tags',
      sourceLabel: '标签',
    },
  ])

  await expect(client.searchWorkspace('产品')).resolves.toEqual([
    expect.objectContaining({
      matchSource: 'property',
      matchKey: 'tags',
      sourceLabel: '标签',
    }),
  ])
})
```

Add Rust tests in `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn workspace_backup_round_trips_page_properties() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let mut snapshot = sample_snapshot();
    snapshot.page_properties = vec![PagePropertyDefinition {
        id: "prop_tags".to_string(),
        key: "tags".to_string(),
        name: "标签".to_string(),
        property_type: "multiSelect".to_string(),
        config: serde_json::json!({ "options": [] }),
        created_at: "2026-07-05T00:00:00.000Z".to_string(),
        updated_at: "2026-07-05T00:00:00.000Z".to_string(),
    }];
    snapshot.pages[0].properties = Some(serde_json::json!({
        "prop_tags": ["产品", "搜索"]
    }));

    storage.replace_workspace_backup(snapshot.clone()).expect("replace snapshot");

    let exported = storage.export_workspace_backup().expect("export snapshot");
    assert_eq!(exported.page_properties, snapshot.page_properties);
    assert_eq!(exported.pages[0].properties, snapshot.pages[0].properties);
}

#[test]
fn search_returns_property_hit_metadata_and_multiple_page_hits() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let mut snapshot = sample_snapshot();
    snapshot.page_properties = vec![PagePropertyDefinition {
        id: "prop_tags".to_string(),
        key: "tags".to_string(),
        name: "标签".to_string(),
        property_type: "multiSelect".to_string(),
        config: serde_json::json!({ "options": [] }),
        created_at: "2026-07-05T00:00:00.000Z".to_string(),
        updated_at: "2026-07-05T00:00:00.000Z".to_string(),
    }];
    snapshot.pages[0].title = "产品规划".to_string();
    snapshot.pages[0].properties = Some(serde_json::json!({
        "prop_tags": ["产品", "搜索"]
    }));
    snapshot.pages[0].blocks = vec![
        serde_json::json!({ "id": "block_1", "type": "paragraph", "text": "产品发布说明" }),
        serde_json::json!({ "id": "block_2", "type": "image", "name": "Capture001.png", "mimeType": "image/png", "caption": "", "alt": "" }),
    ];

    storage.replace_workspace_backup(snapshot).expect("replace snapshot");

    let results = storage.search_workspace("产品", 20).expect("search");
    assert!(results.iter().any(|result| result.match_source == "property" && result.source_label == "标签"));
    assert!(results.iter().filter(|result| result.page_id == "page_1").count() >= 2);
}
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npx vitest run src/lib/storageClient.test.ts
cd src-tauri && cargo test workspace_backup_round_trips_page_properties search_returns_property_hit_metadata_and_multiple_page_hits
```

Expected: FAIL because Rust models, schema fields, and search documents do not store page properties or hit-source metadata.

- [ ] **Step 3: Add snapshot fields, schema migration, and richer search documents**

In `src-tauri/src/storage/models.rs`, add:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePropertyDefinition {
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub property_type: String,
    pub config: Value,
    pub created_at: String,
    pub updated_at: String,
}
```

Extend `WorkspaceSnapshot`, `PageRecord`, and `SearchResult`:

```rust
pub struct WorkspaceSnapshot {
    pub boards: Vec<BoardRecord>,
    #[serde(default)]
    pub data_tables: Vec<DataTableRecord>,
    #[serde(default)]
    pub mindmaps: Vec<MindmapRecord>,
    pub pages: Vec<PageRecord>,
    #[serde(default)]
    pub page_properties: Vec<PagePropertyDefinition>,
    pub settings: WorkspaceSettings,
}

pub struct PageRecord {
    // existing fields...
    #[serde(default)]
    pub properties: Option<Value>,
}

pub struct SearchResult {
    pub kind: String,
    pub page_id: String,
    // existing ids...
    pub title: String,
    pub icon: Option<String>,
    pub excerpt: String,
    pub match_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_key: Option<String>,
    pub source_label: String,
}
```

In `src-tauri/src/storage/schema.rs`, bump the schema version and add explicit migration:

```rust
pub const SCHEMA_VERSION: i64 = 2;
```

Add a post-creation migration helper that runs:

```rust
ALTER TABLE zhixi_page_contents ADD COLUMN properties_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE zhixi_search_documents ADD COLUMN match_source TEXT NOT NULL DEFAULT 'body';
ALTER TABLE zhixi_search_documents ADD COLUMN match_key TEXT;
ALTER TABLE zhixi_search_documents ADD COLUMN source_label TEXT NOT NULL DEFAULT '正文';
```

Store shared property definitions in the existing settings table with a second row key:

```rust
const SETTINGS_ID: &str = "workspace";
const PAGE_PROPERTIES_SETTINGS_ID: &str = "page_properties";
```

In `src-tauri/src/storage/mod.rs`, add:

```rust
fn save_page_properties(&self, definitions: &[PagePropertyDefinition]) -> StorageResult<()> {
    self.connection.execute(
        "INSERT INTO zhixi_settings (id, record_json) VALUES (?1, ?2)
          ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
        params![PAGE_PROPERTIES_SETTINGS_ID, serde_json::to_string(definitions)?],
    )?;
    Ok(())
}

fn load_page_properties(&self) -> StorageResult<Vec<PagePropertyDefinition>> {
    self.connection
        .query_row(
            "SELECT record_json FROM zhixi_settings WHERE id = ?1",
            [PAGE_PROPERTIES_SETTINGS_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .map(|json| serde_json::from_str(&json).map_err(Into::into))
        .transpose()?
        .map(Ok)
        .unwrap_or_else(|| Ok(Vec::new()))
}
```

Update page-content persistence to store both blocks and properties:

```rust
"INSERT INTO zhixi_page_contents (page_id, blocks_json, properties_json) VALUES (?1, ?2, ?3)
  ON CONFLICT(page_id) DO UPDATE SET
    blocks_json = excluded.blocks_json,
    properties_json = excluded.properties_json"
```

In `src-tauri/src/storage/search.rs`, replace single page documents with multiple per-page documents:

```rust
insert_document(connection, &SearchDocument {
    document_id: format!("page:{}:title", page.id),
    kind: "page".to_string(),
    page_id: page.id.clone(),
    title: page.title.clone(),
    icon: page.icon.clone(),
    excerpt: page.title.clone(),
    body: page.title.clone(),
    match_source: "title".to_string(),
    match_key: None,
    source_label: "标题".to_string(),
    // ids...
})?;
```

Add property documents:

```rust
for property_document in property_documents(page, page_property_definitions) {
    insert_document(connection, &property_document)?;
}
```

Add media/body documents with explicit source labels instead of only one merged `body`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx vitest run src/lib/storageClient.test.ts
cd src-tauri && cargo test workspace_backup_round_trips_page_properties search_returns_property_hit_metadata_and_multiple_page_hits
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storageClient.ts src/lib/storageClient.test.ts src-tauri/src/storage/models.rs src-tauri/src/storage/schema.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/search.rs src-tauri/src/storage/commands.rs
git commit -m "feat: persist page properties and enrich search index"
```

---

### Task 5: Integrate end-to-end, document the change, and run verification

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\PageHeader.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Add final integration tests**

Add one app-level test that proves the normal page path is wired:

```tsx
it('shows page properties below the title and lets search surface property hits', async () => {
  const user = userEvent.setup()
  const snapshot: WorkspaceSnapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pageProperties: [
      { id: 'prop_tags', key: 'tags', name: '标签', type: 'multiSelect', config: {}, createdAt: now, updatedAt: now },
    ],
    pages: [
      {
        id: 'page_1',
        parentId: null,
        title: '产品规划',
        icon: null,
        cover: null,
        properties: { prop_tags: ['产品', '搜索'] },
        blocks: [{ id: 'block_1', type: 'paragraph', text: '发布节奏' }],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: { lastOpenedPageId: 'page_1' },
  }

  render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_1']} />)

  expect(await screen.findByText('标签')).toBeInTheDocument()

  await user.keyboard('{Control>}k{/Control}')
  await user.type(screen.getByPlaceholderText('搜索页面或内容'), '产品')

  expect(await screen.findByText('产品 / 搜索')).toBeInTheDocument()
  expect(screen.getByText('标签')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run integration tests to verify they fail**

Run:

```bash
npx vitest run src/app/App.test.tsx src/components/editor/PageHeader.test.tsx
```

Expected: FAIL until the property panel is mounted in the real page path and search UI renders the richer metadata.

- [ ] **Step 3: Finish wiring and update the changelog**

Ensure `src/app/App.tsx` passes `state.pageProperties` into both:

```tsx
<PagePropertiesPanel ... />
<SearchDialog
  open={isSearchOpen}
  pages={state.pages}
  boards={state.boards}
  dataTables={state.dataTables}
  onSearch={(query) => searchWorkspace(query, 30)}
  // existing props...
/>
```

Update `docs/updates.md` with a new entry that explicitly lists:

```md
## 2026-07-05 页面属性与搜索升级

提交：未提交

简要描述：

为普通页面增加轻量页面属性，并让搜索支持属性命中、结果分组、标签/状态筛选和同页多命中展示。

详细描述：

- 普通页面新增标签、状态、日期、备注四类共享页面属性。
- 页面属性显示在标题下方、正文上方，保持紧凑元信息层。
- 搜索支持标题、正文、媒体文件名和页面属性命中来源展示。
- 搜索结果支持按页面/白板/数据表分组，并增加标签/状态筛选入口。
- 同一页面的多个命中片段现在会直接显示出来，不再只保留单条摘要。
- SQLite 和页面备份结构已兼容页面属性定义与页面属性值。

验证情况：

- 待运行 `npm test`
- 待运行 `npm run build`
```

- [ ] **Step 4: Run final verification**

Run:

```bash
npx vitest run src/domain/pageProperties.test.ts src/store/createWorkspaceStore.test.ts src/domain/search.test.ts src/components/editor/PagePropertiesPanel.test.tsx src/components/search/SearchDialog.test.tsx src/app/App.test.tsx src/lib/workspaceRepository.test.ts src/lib/storageClient.test.ts
cd src-tauri && cargo test
cd .. && npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/components/editor/PageHeader.test.tsx docs/updates.md
git commit -m "feat: ship page properties and search upgrade"
```

---

## Self-Review

- Spec coverage: shared page-property definitions, page-level values, compact property panel, property-aware search hits, result grouping, tag/status filters, media filename search, same-page multiple hits, SQLite persistence, import/export snapshot compatibility, and regression protection are all explicitly covered.
- Placeholder scan: no `TODO`, `TBD`, or “similar to previous task” placeholders remain; each task names exact files, concrete tests, and specific commands.
- Type consistency: `pageProperties` is the workspace-level array in both TypeScript and Rust, `properties` is the per-page value map in both TypeScript and Rust, and `SearchResult` uses the same `matchSource`, `matchKey`, and `sourceLabel` fields from storage through UI.
- Scope guard: this plan intentionally does not include formulas, backlinks, page-database table views, or advanced query syntax.
