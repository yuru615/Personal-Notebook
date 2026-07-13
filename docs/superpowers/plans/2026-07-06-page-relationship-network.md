# Page Relationship Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight internal page-link and page-mention layer to normal page rich text, surface backlinks at the page bottom, and make relation hits searchable and navigable in both the web and desktop paths.

**Architecture:** Keep v1 relation metadata directly on existing rich-text segments instead of inventing a standalone relation table. Derive backlinks and mentions by scanning page blocks, update relation display text on rename, degrade relation metadata on delete, and extend both the TypeScript and Rust search paths so relation hits keep their source block context.

**Tech Stack:** React 19, TypeScript, Zustand vanilla store, Vitest, Testing Library, Tauri 2, Rust, rusqlite, SQLite FTS5.

---

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`: extend `RichTextSegment` with internal page-relation metadata.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\richText.ts`: normalize relation segments and add rich-text range replacement for autocomplete insertion.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\richText.test.ts`: cover relation normalization and range replacement.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\pageRelations.ts`: relation display text, trigger parsing, backlinks derivation, rename sync, delete degradation.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\pageRelations.test.ts`: focused unit coverage for relation scanning and lifecycle helpers.
- Create `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationAutocomplete.tsx`: lightweight caret-anchored suggestion list for `[[` and `@`.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.tsx`: render relation spans, open internal pages, and host the autocomplete flow.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.test.tsx`: editor-level coverage for insert, create, and click flows.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\blocks\ParagraphBlock.tsx`: forward relation props into normal rich-text blocks.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\blocks\TodoBlock.tsx`: forward relation props into todo rich text.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\BlockEditor.tsx`: pass page lists and relation callbacks into supported block types.
- Create `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationsPanel.tsx`: bottom-of-page backlinks and mentions section.
- Create `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationsPanel.test.tsx`: focused UI coverage for the bottom relation panel.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`: display relation-specific hit labels while preserving source-block navigation.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`: verify relation hit labels and block-aware open behavior.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`: wire relation creation, opening, backlinks rendering, and block-focused navigation.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`: integration coverage for relation navigation from search and from the bottom relation panel.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`: create titled relation pages without stealing focus, sync relation labels on rename, strip deleted targets, and remap duplicated in-branch targets.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`: regression coverage for create/rename/delete/duplicate relation lifecycles.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\search.ts`: add `page_link` and `page_mention` hits with source block ids.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\search.test.ts`: cover relation matches and same-page multi-hit behavior.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`: verify richer backend relation hits pass through the Tauri client.
- Modify `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`: add user-facing copy for relation autocomplete, backlinks sections, and search hit labels.
- Modify `E:\Workspace\个人知识库-桌面端\src\styles\index.css`: style inline page relations, the autocomplete popover, and the bottom relation panel.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`: extend desktop search results with `block_id`.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\schema.rs`: migrate search documents to store `block_id` and rebuild the FTS table safely.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\search.rs`: emit relation-specific search documents from rich-text blocks.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`: rewrite imported rich-text relation targets and add Rust regression tests.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`: keep the command surface compiling with the richer `SearchResult`.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`: record the user-visible relationship feature once implementation is complete.

---

### Task 1: Add the rich-text relation model and pure domain helpers

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\richText.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\richText.test.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\pageRelations.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\pageRelations.test.ts`

- [ ] **Step 1: Write the failing pure-domain tests**

Add to `src/domain/richText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeRichText, replaceRichTextRange, richTextToPlainText } from './richText'

describe('richText page relations', () => {
  it('merges adjacent relation segments only when target and kind match', () => {
    expect(
      normalizeRichText([
        { text: 'Product', pageId: 'page_product', relationKind: 'link' },
        { text: ' Plan', pageId: 'page_product', relationKind: 'link' },
        { text: '@Roadmap', pageId: 'page_roadmap', relationKind: 'mention' },
      ]),
    ).toEqual([
      { text: 'Product Plan', pageId: 'page_product', relationKind: 'link' },
      { text: '@Roadmap', pageId: 'page_roadmap', relationKind: 'mention' },
    ])
  })

  it('replaces a typed trigger range with a relation segment', () => {
    expect(
      replaceRichTextRange(
        [{ text: 'See [[Prod' }],
        4,
        10,
        [{ text: 'Product Plan', pageId: 'page_product', relationKind: 'link' }],
      ),
    ).toEqual([{ text: 'See ' }, { text: 'Product Plan', pageId: 'page_product', relationKind: 'link' }])
  })
})
```

Create `src/domain/pageRelations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  collectPageRelationMatches,
  getPageRelationDisplayText,
  stripDeletedPageRelations,
  syncPageRelationTitles,
} from './pageRelations'
import type { PageRecord } from './types'

const now = '2026-07-06T00:00:00.000Z'

function createPage(id: string, title: string, blocks: PageRecord['blocks']): PageRecord {
  return {
    id,
    parentId: null,
    title,
    icon: null,
    cover: null,
    properties: {},
    blocks,
    createdAt: now,
    updatedAt: now,
  }
}

describe('pageRelations', () => {
  it('collects link and mention matches with source block context', () => {
    const pages = [
      createPage('page_target', 'Product Plan', []),
      createPage('page_source', 'Meeting Notes', [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'See Product Plan and @Product Plan',
          richText: [
            { text: 'See ' },
            { text: 'Product Plan', pageId: 'page_target', relationKind: 'link' },
            { text: ' and ' },
            { text: '@Product Plan', pageId: 'page_target', relationKind: 'mention' },
          ],
        },
      ]),
    ]

    expect(collectPageRelationMatches(pages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetPageId: 'page_target',
          sourcePageId: 'page_source',
          sourceBlockId: 'block_relation',
          kind: 'link',
        }),
        expect.objectContaining({
          targetPageId: 'page_target',
          sourcePageId: 'page_source',
          sourceBlockId: 'block_relation',
          kind: 'mention',
        }),
      ]),
    )
  })

  it('keeps visible text while stripping metadata for deleted targets', () => {
    const pages = stripDeletedPageRelations(
      [
        createPage('page_source', 'Source', [
          {
            id: 'block_relation',
            type: 'paragraph',
            text: 'Product Plan',
            richText: [{ text: 'Product Plan', pageId: 'page_target', relationKind: 'link' }],
          },
        ]),
      ],
      new Set(['page_target']),
    )

    expect(pages[0].blocks[0]).toMatchObject({
      richText: [{ text: 'Product Plan' }],
      text: 'Product Plan',
    })
  })

  it('recomputes canonical display text from the current target title', () => {
    const pages = syncPageRelationTitles([
      createPage('page_target', 'Renamed Plan', []),
      createPage('page_source', 'Source', [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'Old Plan @Old Plan',
          richText: [
            { text: 'Old Plan', pageId: 'page_target', relationKind: 'link' },
            { text: ' ' },
            { text: '@Old Plan', pageId: 'page_target', relationKind: 'mention' },
          ],
        },
      ]),
    ])

    expect(getPageRelationDisplayText('Renamed Plan', 'link')).toBe('Renamed Plan')
    expect(getPageRelationDisplayText('Renamed Plan', 'mention')).toBe('@Renamed Plan')
    expect(pages[1].blocks[0]).toMatchObject({
      text: 'Renamed Plan @Renamed Plan',
    })
  })
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/domain/richText.test.ts src/domain/pageRelations.test.ts
```

Expected: FAIL because relation metadata, range replacement, and page-relation helper functions do not exist yet.

- [ ] **Step 3: Add the minimal relation model and helpers**

In `src/domain/types.ts`, extend the rich-text contract:

```ts
export type PageRelationKind = 'link' | 'mention'

export interface RichTextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  link?: string
  pageId?: PageId
  relationKind?: PageRelationKind
  color?: TextColor
}
```

In `src/domain/richText.ts`, keep relation metadata canonical and add a reusable range splice helper:

```ts
function sameMarks(a: RichTextSegment, b: RichTextSegment) {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    Boolean(a.strike) === Boolean(b.strike) &&
    (a.link ?? '') === (b.link ?? '') &&
    (a.pageId ?? '') === (b.pageId ?? '') &&
    (a.relationKind ?? '') === (b.relationKind ?? '') &&
    (a.color ?? '') === (b.color ?? '')
  )
}

function normalizeSegment(segment: RichTextSegment): RichTextSegment {
  const hasPageRelation =
    typeof segment.pageId === 'string' &&
    segment.pageId.trim().length > 0 &&
    (segment.relationKind === 'link' || segment.relationKind === 'mention')

  return {
    text: segment.text,
    ...(segment.bold ? { bold: true } : {}),
    ...(segment.italic ? { italic: true } : {}),
    ...(segment.underline ? { underline: true } : {}),
    ...(segment.strike ? { strike: true } : {}),
    ...(segment.link ? { link: segment.link } : {}),
    ...(hasPageRelation ? { pageId: segment.pageId, relationKind: segment.relationKind } : {}),
    ...(segment.color ? { color: segment.color } : {}),
  }
}

export function replaceRichTextRange(
  segments: RichTextSegment[],
  start: number,
  end: number,
  replacement: RichTextSegment[],
): RichTextSegment[] {
  const next: RichTextSegment[] = []
  let offset = 0

  for (const segment of normalizeRichText(segments)) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd

    if (segmentEnd <= start || segmentStart >= end) {
      next.push(segment)
      continue
    }

    if (segmentStart < start) {
      next.push({ ...segment, text: segment.text.slice(0, start - segmentStart) })
    }

    if (segmentStart < end && segmentEnd >= end) {
      next.push(...replacement)
      if (end < segmentEnd) {
        next.push({ ...segment, text: segment.text.slice(end - segmentStart) })
      }
    }
  }

  return normalizeRichText(next)
}
```

Create `src/domain/pageRelations.ts` with the smallest reusable scan layer:

```ts
import { normalizeRichText, richTextToPlainText } from './richText'
import type { BlockRecord, PageRecord, PageRelationKind, RichTextSegment } from './types'

export interface PageRelationMatch {
  targetPageId: string
  sourcePageId: string
  sourcePageTitle: string
  sourcePageIcon: string | null
  sourceBlockId: string
  excerpt: string
  kind: PageRelationKind
}

export function getPageRelationDisplayText(title: string, kind: PageRelationKind) {
  return kind === 'mention' ? `@${title}` : title
}

function getRelationSegments(block: BlockRecord): RichTextSegment[] {
  switch (block.type) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'todo':
      return normalizeRichText(block.richText ?? [{ text: block.text }])
    default:
      return []
  }
}

export function collectPageRelationMatches(pages: PageRecord[]): PageRelationMatch[] {
  return pages.flatMap((page) =>
    page.blocks.flatMap((block) => {
      const excerpt = richTextToPlainText(getRelationSegments(block))
      return getRelationSegments(block)
        .filter((segment): segment is RichTextSegment & { pageId: string; relationKind: PageRelationKind } =>
          Boolean(segment.pageId && segment.relationKind),
        )
        .map((segment) => ({
          targetPageId: segment.pageId,
          sourcePageId: page.id,
          sourcePageTitle: page.title,
          sourcePageIcon: page.icon,
          sourceBlockId: block.id,
          excerpt,
          kind: segment.relationKind,
        }))
    }),
  )
}

export function syncPageRelationTitles(pages: PageRecord[]): PageRecord[] {
  const pageTitleById = new Map(pages.map((page) => [page.id, page.title]))

  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      const segments = getRelationSegments(block)
      if (segments.length === 0) {
        return block
      }

      const nextRichText = normalizeRichText(
        segments.map((segment) =>
          segment.pageId && segment.relationKind && pageTitleById.has(segment.pageId)
            ? {
                ...segment,
                text: getPageRelationDisplayText(
                  pageTitleById.get(segment.pageId) ?? segment.text,
                  segment.relationKind,
                ),
              }
            : segment,
        ),
      )
      const nextText = richTextToPlainText(nextRichText)

      return 'text' in block ? { ...block, text: nextText, richText: nextRichText } : block
    }),
  }))
}

export function stripDeletedPageRelations(
  pages: PageRecord[],
  deletedPageIds: Set<string>,
): PageRecord[] {
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      const segments = getRelationSegments(block)
      if (segments.length === 0) {
        return block
      }

      const nextRichText = normalizeRichText(
        segments.map((segment) =>
          segment.pageId && deletedPageIds.has(segment.pageId)
            ? { text: segment.text }
            : segment,
        ),
      )
      const nextText = richTextToPlainText(nextRichText)

      return 'text' in block ? { ...block, text: nextText, richText: nextRichText } : block
    }),
  }))
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/domain/richText.test.ts src/domain/pageRelations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/richText.ts src/domain/richText.test.ts src/domain/pageRelations.ts src/domain/pageRelations.test.ts
git commit -m "feat: add page relation domain helpers"
```

---

### Task 2: Add inline autocomplete and internal page-relation rendering in the editor

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationAutocomplete.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\blocks\ParagraphBlock.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\blocks\TodoBlock.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\BlockEditor.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`

- [ ] **Step 1: Write the failing editor tests**

Add to `src/components/editor/RichTextEditable.test.tsx`:

```tsx
it('shows page-link suggestions for [[ and inserts a confirmed relation segment', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()

  render(
    <RichTextEditable
      ariaLabel="body"
      className="block-input paragraph-block"
      value=""
      relationPages={[
        { id: 'page_product', title: 'Product Plan', icon: '📄', parentId: null },
        { id: 'page_roadmap', title: 'Roadmap', icon: '📘', parentId: null },
      ]}
      onChange={onChange}
    />,
  )

  const editor = screen.getByRole('textbox', { name: 'body' })
  await user.click(editor)
  await user.keyboard('[[Prod')

  expect(await screen.findByRole('listbox', { name: '页面链接建议' })).toBeInTheDocument()
  await user.keyboard('{Enter}')

  expect(onChange).toHaveBeenLastCalledWith({
    text: 'Product Plan',
    richText: [{ text: 'Product Plan', pageId: 'page_product', relationKind: 'link' }],
  })
})

it('opens an existing internal page relation on click', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onOpenPageRelation = vi.fn()

  render(
    <RichTextEditable
      ariaLabel="body"
      className="block-input paragraph-block"
      value="Launch Notes"
      richText={[{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }]}
      relationPages={[]}
      onOpenPageRelation={onOpenPageRelation}
      onChange={onChange}
    />,
  )

  await user.click(screen.getByRole('link', { name: '@Launch Notes' }))
  expect(onOpenPageRelation).toHaveBeenCalledWith('page_new')
})

it('creates a new mention target when there is no existing page match', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  const onCreatePageRelation = vi.fn().mockResolvedValue({
    id: 'page_new',
    title: 'Launch Notes',
    icon: null,
    parentId: null,
  })

  render(
    <RichTextEditable
      ariaLabel="body"
      className="block-input paragraph-block"
      value=""
      relationPages={[]}
      onCreatePageRelation={onCreatePageRelation}
      onChange={onChange}
    />,
  )

  const editor = screen.getByRole('textbox', { name: 'body' })
  await user.click(editor)
  await user.keyboard('@Launch Notes')
  await user.click(await screen.findByRole('button', { name: '新建页面“Launch Notes”' }))

  expect(onCreatePageRelation).toHaveBeenCalledWith('Launch Notes')
  expect(onChange).toHaveBeenLastCalledWith({
    text: '@Launch Notes',
    richText: [{ text: '@Launch Notes', pageId: 'page_new', relationKind: 'mention' }],
  })
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/components/editor/RichTextEditable.test.tsx
```

Expected: FAIL because the editor does not recognize `[[` / `@`, does not render internal relation spans, and cannot open internal page targets.

- [ ] **Step 3: Implement the autocomplete flow and internal relation rendering**

Create `src/components/editor/PageRelationAutocomplete.tsx`:

```tsx
import type { PageRelationKind } from '../../domain/types'

export interface PageRelationSuggestion {
  id: string
  title: string
  icon: string | null
  pathLabel: string
}

interface PageRelationAutocompleteProps {
  kind: PageRelationKind
  suggestions: PageRelationSuggestion[]
  activeIndex: number
  createLabel?: string
  position: { top: number; left: number }
  onSelect: (pageId: string) => void
  onCreate: () => void
}

export function PageRelationAutocomplete({
  kind,
  suggestions,
  activeIndex,
  createLabel,
  position,
  onSelect,
  onCreate,
}: PageRelationAutocompleteProps) {
  return (
    <div
      className="page-relation-autocomplete"
      role="listbox"
      aria-label={kind === 'mention' ? '页面提及建议' : '页面链接建议'}
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          type="button"
          className={index === activeIndex ? 'page-relation-option page-relation-option-active' : 'page-relation-option'}
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion.id)}
        >
          <span className="page-relation-option-icon">{suggestion.icon ?? '📄'}</span>
          <span className="page-relation-option-body">
            <span className="page-relation-option-title">{suggestion.title}</span>
            <span className="page-relation-option-path">{suggestion.pathLabel}</span>
          </span>
        </button>
      ))}
      {createLabel ? (
        <button type="button" className="page-relation-create-option" onMouseDown={(event) => event.preventDefault()} onClick={onCreate}>
          {createLabel}
        </button>
      ) : null}
    </div>
  )
}
```

Extend `RichTextEditable` with relation props and caret-trigger handling:

```tsx
interface RelationPageOption {
  id: string
  title: string
  icon: string | null
  parentId: string | null
}

interface RichTextEditableProps {
  value: string
  richText?: RichTextSegment[]
  relationPages?: RelationPageOption[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (title: string) => Promise<RelationPageOption>
  // existing props...
}
```

Render internal relations distinctly before external links:

```ts
if (segment.pageId && segment.relationKind) {
  const relationClass =
    segment.relationKind === 'mention'
      ? 'rich-text-page-relation rich-text-page-relation-mention'
      : 'rich-text-page-relation'
  html = `<a href="#/pages/${escapeAttribute(segment.pageId)}" class="${relationClass}" data-page-id="${escapeAttribute(segment.pageId)}" data-page-relation-kind="${escapeAttribute(segment.relationKind)}">${html}</a>`
} else if (segment.link) {
  html = `<a href="${escapeAttribute(segment.link)}">${html}</a>`
}
```

Read the metadata back from the DOM:

```ts
if (tagName === 'a') {
  const pageId = element.getAttribute('data-page-id')
  const relationKind = element.getAttribute('data-page-relation-kind')

  if (pageId && (relationKind === 'link' || relationKind === 'mention')) {
    nextMarks.pageId = pageId
    nextMarks.relationKind = relationKind
  } else {
    const href = element.getAttribute('href')
    if (href) {
      nextMarks.link = href
    }
  }
}
```

Keep raw typing plain text until the suggestion list confirms a target:

```ts
const nextSegments = replaceRichTextRange(currentSegments, trigger.start, trigger.end, [
  {
    text: getPageRelationDisplayText(selectedPage.title, trigger.kind),
    pageId: selectedPage.id,
    relationKind: trigger.kind,
  },
])
```

In `BlockEditor.tsx`, forward relation props only to supported blocks:

```tsx
<ParagraphBlock
  value={block.text}
  richText={block.richText}
  relationPages={allPages.map(({ id, title, icon, parentId }) => ({ id, title, icon, parentId }))}
  onOpenPageRelation={onOpenChildPage}
  onCreatePageRelation={onCreatePageRelation}
  onChange={(next) => onUpdateBlock(block.id, { ...block, ...next })}
  onKeyDown={(event) => handleTextBlockKeyDown(event, block)}
/>
```

Add only the CSS needed for a light inline relation style and popover:

```css
.rich-text-page-relation {
  color: #2563eb;
  text-decoration: none;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.08);
  padding: 0 2px;
}

.rich-text-page-relation-mention {
  color: #7c3aed;
  background: rgba(124, 58, 237, 0.08);
}

.page-relation-autocomplete {
  position: fixed;
  z-index: 60;
  width: 280px;
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/components/editor/RichTextEditable.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/PageRelationAutocomplete.tsx src/components/editor/RichTextEditable.tsx src/components/editor/RichTextEditable.test.tsx src/components/editor/blocks/ParagraphBlock.tsx src/components/editor/blocks/TodoBlock.tsx src/components/editor/BlockEditor.tsx src/styles/index.css src/ui/copy.ts
git commit -m "feat: add rich text page relation autocomplete"
```

---

### Task 3: Wire creation flow into the store and keep relations stable across create, rename, delete, and duplicate

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`

- [ ] **Step 1: Write the failing lifecycle tests**

Add to `src/store/createWorkspaceStore.test.ts`:

```ts
it('creates a titled relation target page without changing currentPageId when setCurrent is false', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  const created = await store.getState().createPage(undefined, {
    title: 'Launch Notes',
    setCurrent: false,
  })

  expect(created.title).toBe('Launch Notes')
  expect(store.getState().currentPageId).toBe('page_1')
  expect(counted.getSnapshot()?.pages.at(-1)).toMatchObject({ title: 'Launch Notes' })
})

it('renames relation labels everywhere the target page is referenced', async () => {
  const counted = createCountingRepository({
    ...createWorkspace(),
    pages: [
      {
        ...createWorkspace().pages[0],
        id: 'page_target',
        title: 'Old Plan',
      },
      {
        ...createWorkspace().pages[0],
        id: 'page_source',
        title: 'Source',
        blocks: [
          {
            id: 'block_relation',
            type: 'paragraph',
            text: 'Old Plan',
            richText: [{ text: 'Old Plan', pageId: 'page_target', relationKind: 'link' }],
          },
        ],
      },
    ],
    settings: { lastOpenedPageId: 'page_source' },
  })
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().renamePage('page_target', 'Renamed Plan')

  expect(store.getState().pages.find((page) => page.id === 'page_source')?.blocks[0]).toMatchObject({
    text: 'Renamed Plan',
    richText: [{ text: 'Renamed Plan', pageId: 'page_target', relationKind: 'link' }],
  })
})

it('strips relation metadata when the target page is deleted', async () => {
  const counted = createCountingRepository({
    ...createWorkspace(),
    pages: [
      {
        ...createWorkspace().pages[0],
        id: 'page_target',
        title: 'Product Plan',
      },
      {
        ...createWorkspace().pages[0],
        id: 'page_source',
        title: 'Source',
        blocks: [
          {
            id: 'block_relation',
            type: 'paragraph',
            text: 'Product Plan',
            richText: [{ text: 'Product Plan', pageId: 'page_target', relationKind: 'link' }],
          },
        ],
      },
    ],
    settings: { lastOpenedPageId: 'page_source' },
  })
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().deletePage('page_target')

  expect(store.getState().pages[0].blocks[0]).toMatchObject({
    text: 'Product Plan',
    richText: [{ text: 'Product Plan' }],
  })
})

it('remaps duplicated in-branch relation targets to the duplicated page ids', async () => {
  const workspace = createWorkspace()
  workspace.pages = [
    {
      ...workspace.pages[0],
      id: 'page_parent',
      title: 'Parent',
      blocks: [{ id: 'block_child_page', type: 'child_page', pageId: 'page_child' }],
    },
    {
      ...workspace.pages[0],
      id: 'page_child',
      parentId: 'page_parent',
      title: 'Child',
      blocks: [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'Parent',
          richText: [{ text: 'Parent', pageId: 'page_parent', relationKind: 'link' }],
        },
      ],
    },
  ]

  const store = createWorkspaceStore(createMemoryRepository(workspace))
  await store.getState().bootstrap()
  const duplicatedParent = await store.getState().duplicatePage('page_parent')
  const duplicatedChild = store.getState().pages.find((page) => page.parentId === duplicatedParent?.id)

  expect(duplicatedChild?.blocks[0]).toMatchObject({
    richText: [
      expect.objectContaining({
        pageId: duplicatedParent?.id,
        relationKind: 'link',
      }),
    ],
  })
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
```

Expected: FAIL because page creation cannot keep focus on the current page, rename does not sync relation labels, delete does not strip relation metadata, and duplicate does not remap in-branch relation targets.

- [ ] **Step 3: Implement store lifecycle syncing and app wiring**

Widen the store contract in `src/store/createWorkspaceStore.ts`:

```ts
createPage: (
  parentId?: PageId,
  options?: { title?: string; setCurrent?: boolean },
) => Promise<PageRecord>
```

Update `createPageRecord` and `createPage` so relation-created pages can be titled immediately and stay in the root without stealing focus:

```ts
function createPageRecord(parentId?: PageId, title = UNTITLED_PAGE_TITLE): PageRecord {
  const now = new Date().toISOString()

  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title: title.trim() || UNTITLED_PAGE_TITLE,
    icon: null,
    cover: null,
    properties: {},
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}

createPage: async (parentId, options) => {
  const state = get()
  const page = createPageRecord(parentId, options?.title)
  const nextCurrentPageId = options?.setCurrent === false ? state.currentPageId : page.id
  const nextSettings = createSettings(
    nextCurrentPageId,
    state.settings.sidebarLayout ?? 'compact',
    state.settings.sidebarWidth ?? 272,
    state.settings.pinnedSidebarItems ?? [],
  )
  // persist like the current createPage path, but use nextCurrentPageId
}
```

Keep relation display text canonical on rename:

```ts
renamePage: async (pageId, title) => {
  const state = get()
  const nextTitle = title.trim() || UNTITLED_PAGE_TITLE
  const renamedPages = state.pages.map((page) =>
    page.id === pageId ? { ...page, title: nextTitle, updatedAt: new Date().toISOString() } : page,
  )
  const nextPages = syncPageRelationTitles(renamedPages)
  // save nextPages exactly once
}
```

Strip deleted target metadata and preserve readable text:

```ts
deletePage: async (pageId) => {
  const state = get()
  const remainingPages = deletePageBranch(state.pages, pageId)
  const remainingPageIds = new Set(remainingPages.map((page) => page.id))
  const deletedPageIds = new Set(
    state.pages.filter((page) => !remainingPageIds.has(page.id)).map((page) => page.id),
  )
  const nextPages = stripDeletedPageRelations(remainingPages, deletedPageIds)
  const nextResources = filterResourcesReferencedByPages(state, nextPages)
  // keep the current delete flow after swapping in nextPages
}
```

Remap in-branch targets during duplication, then run one title sync pass so copied root-title suffixes are reflected too:

```ts
const blocks = sourceBranchPage.blocks.map((block) => {
  if (!('richText' in block) || !Array.isArray(block.richText)) {
    return { ...structuredClone(block), id: createId('block') }
  }

  const nextRichText = block.richText.map((segment) =>
    segment.pageId && nextPageIdBySourceId.has(segment.pageId)
      ? {
          ...segment,
          pageId: nextPageIdBySourceId.get(segment.pageId) ?? segment.pageId,
        }
      : segment,
  )

  return {
    ...structuredClone(block),
    id: createId('block'),
    richText: nextRichText,
  }
})

const syncedPages = syncPageRelationTitles(nextPages)
```

Wire the editor callbacks in `src/app/App.tsx`:

```tsx
<BlockEditor
  page={page}
  allPages={pages}
  onCreatePageRelation={(title) =>
    onCreatePage(undefined, { title, setCurrent: false })
  }
  onOpenChildPage={(targetPageId) => {
    navigate(`/pages/${targetPageId}`)
  }}
  // existing props...
/>
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/store/createWorkspaceStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/app/App.tsx
git commit -m "feat: stabilize page relation lifecycle updates"
```

---

### Task 4: Add the bottom backlinks and mentions panel

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationsPanel.tsx`
- Create: `E:\Workspace\个人知识库-桌面端\src\components\editor\PageRelationsPanel.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`

- [ ] **Step 1: Write the failing UI and integration tests**

Create `src/components/editor/PageRelationsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageRelationsPanel } from './PageRelationsPanel'

describe('PageRelationsPanel', () => {
  it('renders separate link and mention sections and opens the source block', async () => {
    const user = userEvent.setup()
    const onOpenSource = vi.fn()

    render(
      <PageRelationsPanel
        links={[
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: '📄',
            sourceBlockId: 'block_link',
            excerpt: 'See Product Plan',
            kind: 'link',
          },
        ]}
        mentions={[
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: '📄',
            sourceBlockId: 'block_mention',
            excerpt: '@Product Plan came up again',
            kind: 'mention',
          },
        ]}
        onOpenSource={onOpenSource}
      />,
    )

    expect(screen.getByRole('heading', { name: '链接到此页面' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '提及此页面' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'See Product Plan' }))
    expect(onOpenSource).toHaveBeenCalledWith('page_source', 'block_link')
  })

  it('renders nothing when there are no relation hits', () => {
    const { container } = render(
      <PageRelationsPanel links={[]} mentions={[]} onOpenSource={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
```

Add to `src/app/App.test.tsx`:

```tsx
it('opens the source block when a bottom backlinks entry is clicked', async () => {
  const user = userEvent.setup()
  const scrollIntoView = vi.fn()
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scrollIntoView

  try {
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      dataTables: [],
      mindmaps: [],
      pageProperties: [],
      pages: [
        {
          id: 'page_target',
          parentId: null,
          title: 'Product Plan',
          icon: null,
          cover: null,
          properties: {},
          blocks: [],
          createdAt: '2026-07-06T00:00:00.000Z',
          updatedAt: '2026-07-06T00:00:00.000Z',
        },
        {
          id: 'page_source',
          parentId: null,
          title: 'Meeting Notes',
          icon: null,
          cover: null,
          properties: {},
          blocks: [
            {
              id: 'block_relation',
              type: 'paragraph',
              text: 'See Product Plan',
              richText: [{ text: 'Product Plan', pageId: 'page_target', relationKind: 'link' }],
            },
          ],
          createdAt: '2026-07-06T00:00:00.000Z',
          updatedAt: '2026-07-06T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: 'page_target' },
    }

    render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_target']} />)

    await user.click(await screen.findByRole('button', { name: 'See Product Plan' }))

    await screen.findByDisplayValue('Meeting Notes')
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  }
})
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/components/editor/PageRelationsPanel.test.tsx src/app/App.test.tsx
```

Expected: FAIL because there is no bottom relation panel and the page route does not derive or render backlinks yet.

- [ ] **Step 3: Render backlinks and mentions below the page body**

Create `src/components/editor/PageRelationsPanel.tsx`:

```tsx
import type { PageRelationMatch } from '../../domain/pageRelations'

interface PageRelationsPanelProps {
  links: PageRelationMatch[]
  mentions: PageRelationMatch[]
  onOpenSource: (pageId: string, blockId?: string) => void
}

export function PageRelationsPanel({ links, mentions, onOpenSource }: PageRelationsPanelProps) {
  if (links.length === 0 && mentions.length === 0) {
    return null
  }

  return (
    <section className="page-relations-panel" aria-label="页面关系">
      {renderSection('链接到此页面', links, onOpenSource)}
      {renderSection('提及此页面', mentions, onOpenSource)}
    </section>
  )
}

function renderSection(
  title: string,
  items: PageRelationMatch[],
  onOpenSource: (pageId: string, blockId?: string) => void,
) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="page-relations-section">
      <h2 className="page-relations-title">{title}</h2>
      <div className="page-relations-list">
        {items.map((item) => (
          <button
            key={`${item.sourcePageId}:${item.sourceBlockId}:${item.kind}`}
            type="button"
            className="page-relations-item"
            onClick={() => onOpenSource(item.sourcePageId, item.sourceBlockId)}
          >
            <span className="page-relations-item-icon">{item.sourcePageIcon ?? '📄'}</span>
            <span className="page-relations-item-body">
              <span className="page-relations-item-title">{item.sourcePageTitle}</span>
              <span className="page-relations-item-excerpt">{item.excerpt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

In `src/app/App.tsx`, derive the current page’s backlinks and render them after the editor:

```tsx
const relationMatches = useMemo(
  () => collectPageRelationMatches(pages).filter((item) => item.targetPageId === page.id),
  [page.id, pages],
)
const linkMatches = relationMatches.filter((item) => item.kind === 'link')
const mentionMatches = relationMatches.filter((item) => item.kind === 'mention')
```

```tsx
<div className={pageContentClassName}>
  <BlockEditor /* existing props */ />
  <PageRelationsPanel
    links={linkMatches}
    mentions={mentionMatches}
    onOpenSource={(sourcePageId, sourceBlockId) => {
      navigate(
        `/pages/${sourcePageId}`,
        sourceBlockId ? { state: { focusBlockId: sourceBlockId } } : undefined,
      )
    }}
  />
</div>
```

Add only the lightweight panel styling needed for v1:

```css
.page-relations-panel {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  display: grid;
  gap: 18px;
}

.page-relations-item {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/components/editor/PageRelationsPanel.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/PageRelationsPanel.tsx src/components/editor/PageRelationsPanel.test.tsx src/app/App.tsx src/app/App.test.tsx src/styles/index.css src/ui/copy.ts
git commit -m "feat: add backlinks and mentions panel"
```

---

### Task 5: Make relation hits searchable in both TypeScript and desktop storage

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\search.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\search.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\search\SearchDialog.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\schema.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\search.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`

- [ ] **Step 1: Write the failing search tests**

Add to `src/domain/search.test.ts`:

```ts
it('emits page-link and page-mention hits with source block ids', () => {
  const now = '2026-07-06T00:00:00.000Z'
  const pages: PageRecord[] = [
    {
      id: 'page_target',
      parentId: null,
      title: 'Product Plan',
      icon: null,
      cover: null,
      properties: {},
      blocks: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'page_source',
      parentId: null,
      title: 'Meeting Notes',
      icon: null,
      cover: null,
      properties: {},
      blocks: [
        {
          id: 'block_relation',
          type: 'paragraph',
          text: 'See Product Plan and @Product Plan',
          richText: [
            { text: 'See ' },
            { text: 'Product Plan', pageId: 'page_target', relationKind: 'link' },
            { text: ' and ' },
            { text: '@Product Plan', pageId: 'page_target', relationKind: 'mention' },
          ],
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ]

  expect(searchPages(pages, [], 'Product Plan')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        pageId: 'page_source',
        blockId: 'block_relation',
        matchSource: 'page_link',
        sourceLabel: '页面链接',
      }),
      expect.objectContaining({
        pageId: 'page_source',
        blockId: 'block_relation',
        matchSource: 'page_mention',
        sourceLabel: '页面提及',
      }),
    ]),
  )
})
```

Add to `src/components/search/SearchDialog.test.tsx`:

```tsx
it('shows relation hit labels from async desktop search results', async () => {
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
          pageId: 'page_source',
          blockId: 'block_relation',
          title: 'Meeting Notes',
          icon: '📄',
          excerpt: 'See Product Plan',
          matchSource: 'page_link',
          sourceLabel: '页面链接',
        },
      ])}
    />,
  )

  await user.type(screen.getByPlaceholderText('搜索页面或内容'), 'Product')
  expect(await screen.findByText('页面链接')).toBeInTheDocument()
})
```

Add to `src/lib/storageClient.test.ts`:

```ts
it('passes through relation hits with block ids from the backend', async () => {
  const { createTauriStorageClient } = await import('./storageClient')
  eventApi.invoke.mockResolvedValueOnce([
    {
      kind: 'page',
      pageId: 'page_source',
      blockId: 'block_relation',
      title: 'Meeting Notes',
      icon: '📄',
      excerpt: 'See Product Plan',
      matchSource: 'page_link',
      sourceLabel: '页面链接',
    },
  ])

  const client = createTauriStorageClient()

  await expect(client.searchWorkspace('Product')).resolves.toEqual([
    expect.objectContaining({
      blockId: 'block_relation',
      matchSource: 'page_link',
    }),
  ])
})
```

Add Rust regression tests in `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn search_workspace_returns_relation_hits_with_block_ids() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let snapshot = WorkspaceSnapshot {
        boards: vec![],
        data_tables: vec![],
        mindmaps: vec![],
        page_properties: vec![],
        pages: vec![
            PageRecord {
                id: "page_target".to_string(),
                parent_id: None,
                title: "Product Plan".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
            PageRecord {
                id: "page_source".to_string(),
                parent_id: None,
                title: "Meeting Notes".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![serde_json::json!({
                    "id": "block_relation",
                    "type": "paragraph",
                    "text": "See Product Plan",
                    "richText": [
                        { "text": "See " },
                        { "text": "Product Plan", "pageId": "page_target", "relationKind": "link" }
                    ]
                })],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
        ],
        settings: WorkspaceSettings { last_opened_page_id: Some("page_source".to_string()) },
    };

    storage.replace_workspace_backup(snapshot).expect("replace snapshot");

    let results = storage.search_workspace("Product Plan", 20).expect("search");
    assert!(results.iter().any(|result| {
        result.page_id == "page_source" &&
        result.block_id.as_deref() == Some("block_relation") &&
        result.match_source == "page_link"
    }));
}
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```bash
npx vitest run src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/lib/storageClient.test.ts
cd src-tauri && cargo test search_workspace_returns_relation_hits_with_block_ids
```

Expected: FAIL because relation-specific hit sources do not exist, desktop results do not expose `blockId`, and the Rust search index does not emit relation documents.

- [ ] **Step 3: Extend both search pipelines with relation-aware block results**

In `src/domain/search.ts`, extend the source union and emit relation-backed hits from rich-text blocks:

```ts
export interface SearchResult {
  kind: 'page' | 'whiteboard' | 'mindmap' | 'data_table' | 'data_table_record'
  pageId: string
  blockId?: string
  // existing ids...
  title: string
  icon: string | null
  excerpt: string
  matchSource:
    | 'title'
    | 'body'
    | 'property'
    | 'media'
    | 'page_link'
    | 'page_mention'
    | 'whiteboard'
    | 'whiteboard_title'
    | 'whiteboard_content'
    | 'mindmap_title'
    | 'mindmap_node'
    | 'data_table'
    | 'data_table_record'
  matchKey?: string
  sourceLabel: string
}
```

Build relation search entries before falling back to body text so relation matches are labeled correctly:

```ts
function getRichTextRelationEntries(block: BlockRecord): SearchEntry[] {
  if (
    block.type !== 'paragraph' &&
    block.type !== 'heading_1' &&
    block.type !== 'heading_2' &&
    block.type !== 'heading_3' &&
    block.type !== 'todo'
  ) {
    return []
  }

  const richText = normalizeRichText(block.richText ?? [{ text: block.text }])
  const excerpt = richTextToPlainText(richText)

  return richText.flatMap((segment) => {
    if (!segment.pageId || !segment.relationKind) {
      return []
    }

    return [
      {
        excerpt,
        searchText: segment.text,
        blockId: block.id,
        matchSource: segment.relationKind === 'mention' ? 'page_mention' : 'page_link',
        sourceLabel: segment.relationKind === 'mention' ? '页面提及' : '页面链接',
      },
    ]
  })
}
```

In `src/components/search/SearchDialog.tsx`, recognize the new source labels:

```ts
if (matchSource === 'page_link') {
  return '页面链接'
}

if (matchSource === 'page_mention') {
  return '页面提及'
}
```

In `src-tauri/src/storage/models.rs`, add `block_id` to the desktop result:

```rust
pub struct SearchResult {
    pub kind: String,
    pub page_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub excerpt: String,
    pub match_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_key: Option<String>,
    pub source_label: String,
}
```

In `src-tauri/src/storage/schema.rs`, use a safe v3 migration that recreates the FTS table instead of trying to alter it in place:

```rust
pub const SCHEMA_VERSION: i64 = 3;

fn migrate_to_v3(connection: &Connection) -> StorageResult<()> {
    ensure_column(connection, "zhiqi_search_documents", "block_id", "TEXT")?;
    connection.execute_batch(
        "
        DROP TABLE IF EXISTS zhiqi_search_documents_fts;
        CREATE VIRTUAL TABLE zhiqi_search_documents_fts USING fts5(
          document_id UNINDEXED,
          kind UNINDEXED,
          page_id UNINDEXED,
          block_id UNINDEXED,
          board_id UNINDEXED,
          database_id UNINDEXED,
          record_id UNINDEXED,
          title,
          icon UNINDEXED,
          excerpt UNINDEXED,
          body
        );
        DELETE FROM zhiqi_search_documents;
        ",
    )?;
    Ok(())
}
```

In `src-tauri/src/storage/search.rs`, carry `block_id` through the index and create relation documents from rich-text blocks:

```rust
struct SearchDocument {
    document_id: String,
    kind: String,
    page_id: String,
    block_id: Option<String>,
    board_id: Option<String>,
    database_id: Option<String>,
    record_id: Option<String>,
    title: String,
    icon: Option<String>,
    excerpt: String,
    body: String,
    match_source: String,
    match_key: Option<String>,
    source_label: String,
}
```

```rust
let mut statement = connection.prepare(
    "SELECT d.kind, d.page_id, d.block_id, d.board_id, d.database_id, d.record_id, d.title, d.icon,
      d.excerpt, d.match_source, d.match_key, d.source_label
      FROM zhiqi_search_documents_fts f
      JOIN zhiqi_search_documents d ON d.document_id = f.document_id
      WHERE zhiqi_search_documents_fts MATCH ?1
      ORDER BY rank
      LIMIT ?2",
)?;
```

```rust
Some(SearchDocument {
    document_id: format!("page:{}:block:{}:relation:{}", page.id, block_id, relation_index),
    kind: "page".to_string(),
    page_id: page.id.clone(),
    block_id: Some(block_id.clone()),
    board_id: None,
    database_id: None,
    record_id: None,
    title: page.title.clone(),
    icon: page.icon.clone(),
    excerpt: block_excerpt.clone(),
    body: segment_text.clone(),
    match_source: if relation_kind == "mention" { "page_mention".to_string() } else { "page_link".to_string() },
    match_key: None,
    source_label: if relation_kind == "mention" { "页面提及".to_string() } else { "页面链接".to_string() },
})
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```bash
npx vitest run src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/lib/storageClient.test.ts
cd src-tauri && cargo test search_workspace_returns_relation_hits_with_block_ids
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/search.ts src/domain/search.test.ts src/components/search/SearchDialog.tsx src/components/search/SearchDialog.test.tsx src/lib/storageClient.test.ts src-tauri/src/storage/models.rs src-tauri/src/storage/schema.rs src-tauri/src/storage/search.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/commands.rs
git commit -m "feat: add relation-aware search hits"
```

---

### Task 6: Rewrite imported relation targets, update the changelog, and run full verification

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Write the failing import regression test**

Add to `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn import_page_package_rewrites_rich_text_page_relations() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    let target = Storage::open_in_memory_for_tests().expect("target opens");
    let snapshot = WorkspaceSnapshot {
        boards: vec![],
        data_tables: vec![],
        mindmaps: vec![],
        page_properties: vec![],
        pages: vec![
            PageRecord {
                id: "page_root".to_string(),
                parent_id: None,
                title: "Root".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![
                    serde_json::json!({
                        "id": "block_link_child",
                        "type": "paragraph",
                        "text": "Child",
                        "richText": [{ "text": "Child", "pageId": "page_child", "relationKind": "link" }]
                    }),
                    serde_json::json!({
                        "id": "block_link_external",
                        "type": "paragraph",
                        "text": "Outside",
                        "richText": [{ "text": "Outside", "pageId": "page_external", "relationKind": "link" }]
                    }),
                ],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
            PageRecord {
                id: "page_child".to_string(),
                parent_id: Some("page_root".to_string()),
                title: "Child".to_string(),
                icon: None,
                cover: None,
                properties: Some(serde_json::json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            },
        ],
        settings: WorkspaceSettings { last_opened_page_id: Some("page_root".to_string()) },
    };

    source.replace_workspace_backup(snapshot).expect("replace source snapshot");
    let archive = source.export_page_package("page_root").expect("export page package");
    let result = target.import_page_package(archive).expect("import page package");
    let imported = target.export_workspace_backup().expect("export target snapshot");
    let root = imported
        .pages
        .iter()
        .find(|page| page.id == result.root_page_id)
        .expect("imported root page");
    let child = imported
        .pages
        .iter()
        .find(|page| page.parent_id.as_deref() == Some(result.root_page_id.as_str()))
        .expect("imported child page");

    let rich_text = root.blocks[0].get("richText").and_then(serde_json::Value::as_array).expect("rich text");
    assert_eq!(rich_text[0].get("pageId").and_then(serde_json::Value::as_str), Some(child.id.as_str()));

    let degraded = root.blocks[1].get("richText").and_then(serde_json::Value::as_array).expect("degraded rich text");
    assert!(degraded[0].get("pageId").is_none());
    assert_eq!(degraded[0].get("text").and_then(serde_json::Value::as_str), Some("Outside"));
}
```

- [ ] **Step 2: Run the focused Rust test to verify it fails**

Run:

```bash
cd src-tauri && cargo test import_page_package_rewrites_rich_text_page_relations
```

Expected: FAIL because page-package import only rewrites top-level block refs and ignores `richText[].pageId`.

- [ ] **Step 3: Rewrite imported relation targets, update the changelog, and keep relation text safe**

In `src-tauri/src/storage/mod.rs`, extend `rewrite_block_ids_and_refs` with a rich-text segment pass:

```rust
fn rewrite_rich_text_relation_segments(
    rich_text: &mut [Value],
    page_id_map: &std::collections::HashMap<String, String>,
) {
    for segment in rich_text {
        let Some(object) = segment.as_object_mut() else {
            continue;
        };

        let Some(page_id) = object.get("pageId").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };

        if let Some(next_id) = page_id_map.get(&page_id) {
            object.insert("pageId".to_string(), Value::String(next_id.clone()));
            continue;
        }

        object.remove("pageId");
        object.remove("relationKind");
    }
}
```

Call it from `rewrite_block_ids_and_refs`:

```rust
if let Some(rich_text) = object.get_mut("richText").and_then(Value::as_array_mut) {
    rewrite_rich_text_relation_segments(rich_text, page_id_map);
}
```

Update `docs/updates.md` with a new entry:

```md
## 2026-07-06 页面关系化 v1

提交：未提交

简要描述：

普通页面正文支持 `[[页面]]` 和 `@页面`，页面底部新增 backlinks / mentions，搜索新增页面链接与页面提及命中来源，并且桌面端结果可以跳回来源块。

详细描述：

- 段落、标题、待办支持通过联想面板创建内部页面链接和页面提及。
- 关系绑定 `pageId`，页面改名后关系显示会自动同步。
- 删除目标页面后，正文保留可见文字，但关系元数据会安全降级为普通文本。
- 页面底部新增“链接到此页面”“提及此页面”两个关系区，可直接跳回来源块。
- 搜索新增“页面链接”“页面提及”命中来源，桌面端和网页端都保留来源块上下文。
- 页面包导入时会重写包内 relation target，包外 target 会自动降级为普通文本，避免坏链接。

验证情况：

- 待运行 `npm test`
- 待运行 `cd src-tauri && cargo test`
- 待运行 `npm run build`
- 待运行 `npm run tauri:build:windows`
```

- [ ] **Step 4: Run the final verification**

Run:

```bash
npx vitest run src/domain/richText.test.ts src/domain/pageRelations.test.ts src/components/editor/RichTextEditable.test.tsx src/store/createWorkspaceStore.test.ts src/components/editor/PageRelationsPanel.test.tsx src/domain/search.test.ts src/components/search/SearchDialog.test.tsx src/app/App.test.tsx src/lib/storageClient.test.ts
cd src-tauri && cargo test
cd .. && npm test
npm run build
npm run tauri:build:windows
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/storage/mod.rs docs/updates.md
git commit -m "feat: ship page relationship network v1"
```

---

## Self-Review

- Spec coverage: `[[页面]]` and `@页面` input, existing-page selection, create-on-miss, bottom backlinks and mentions, search labels, source-block navigation, rename sync, delete degradation, same-page multi-hit results, and page-package import rewriting are all explicitly covered.
- Placeholder scan: no `TODO`, `TBD`, “handle later”, or “similar to previous task” placeholders remain; every task names exact files, concrete test cases, explicit commands, and concrete code shapes.
- Type consistency: rich-text metadata uses `pageId` plus `relationKind` end-to-end, derived matches use `PageRelationMatch`, search hit sources use `page_link` and `page_mention`, and desktop search exposes `block_id` all the way back to `SearchDialog`.
- Scope guard: this plan intentionally does not include list-item relation editing, whiteboard or mindmap inline relation editing, page-relation properties, sync blocks, hover previews, or graph visualization.
