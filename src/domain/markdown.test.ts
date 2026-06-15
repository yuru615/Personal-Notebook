import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from './types'
import { buildMarkdownZip } from './markdown'

function createSnapshot(): WorkspaceSnapshot {
  const now = '2026-06-15T00:00:00.000Z'

  return {
    pages: [
      {
        id: 'page-root',
        parentId: null,
        title: '产品规划',
        icon: '📝',
        cover: null,
        blocks: [
          {
            id: 'block-root-text',
            type: 'paragraph',
            text: '先整理本周重点。',
          },
          {
            id: 'block-root-child',
            type: 'child_page',
            pageId: 'page-child',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-child',
        parentId: 'page-root',
        title: '发布清单',
        icon: '📋',
        cover: null,
        blocks: [
          {
            id: 'block-child-todo',
            type: 'todo',
            text: '确认上线时间',
            checked: true,
          },
          {
            id: 'block-child-grandchild',
            type: 'child_page',
            pageId: 'page-grandchild',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-grandchild',
        parentId: 'page-child',
        title: '风险备注',
        icon: '⚠️',
        cover: null,
        blocks: [
          {
            id: 'block-grandchild-code',
            type: 'code',
            language: 'ts',
            text: 'console.log("ready")',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-root',
    },
  }
}

async function readZipFiles(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const files = await Promise.all(
    Object.entries(zip.files)
      .filter(([, file]) => !file.dir)
      .map(async ([path, file]) => [path, await file.async('string')] as const),
  )

  return Object.fromEntries(files)
}

describe('buildMarkdownZip', () => {
  it('exports the selected page and all descendants into a markdown zip', async () => {
    const snapshot = createSnapshot()
    const blob = await buildMarkdownZip({
      rootPage: snapshot.pages[0],
      allPages: snapshot.pages,
      reversible: false,
    })

    const files = await readZipFiles(blob)

    expect(Object.keys(files)).toEqual([
      '产品规划/index.md',
      '产品规划/发布清单/index.md',
      '产品规划/发布清单/风险备注/index.md',
    ])
    expect(files['产品规划/index.md']).toContain('# 产品规划')
    expect(files['产品规划/index.md']).toContain('先整理本周重点。')
    expect(files['产品规划/index.md']).toContain('[发布清单](./发布清单/index.md)')
    expect(files['产品规划/发布清单/index.md']).toContain('- [x] 确认上线时间')
    expect(files['产品规划/发布清单/风险备注/index.md']).toContain('```ts')
  })

  it('keeps import metadata only when reversible mode is enabled', async () => {
    const snapshot = createSnapshot()
    const plainBlob = await buildMarkdownZip({
      rootPage: snapshot.pages[0],
      allPages: snapshot.pages,
      reversible: false,
    })
    const reversibleBlob = await buildMarkdownZip({
      rootPage: snapshot.pages[0],
      allPages: snapshot.pages,
      reversible: true,
    })

    const plainFiles = await readZipFiles(plainBlob)
    const reversibleFiles = await readZipFiles(reversibleBlob)

    expect(plainFiles['产品规划/index.md']).not.toContain('pageId:')
    expect(reversibleFiles['产品规划/index.md']).toContain('pageId: "page-root"')
    expect(reversibleFiles['产品规划/index.md']).toContain('parentId: null')
  })
})
