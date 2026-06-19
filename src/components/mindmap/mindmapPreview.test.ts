import { describe, expect, it } from 'vitest'
import type { MindmapRecord } from '../../domain/types'
import { buildMindmapPreviewSvgDataUrl } from './mindmapPreview'

function createMindmap(overrides: Partial<MindmapRecord> = {}): MindmapRecord {
  return {
    id: 'mindmap-preview',
    title: 'Preview',
    rootNodeId: 'root',
    layoutMode: 'right',
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        text: '中心主题',
        order: 0,
      },
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    createdAt: '2026-06-20T00:00:00.000Z',
    updatedAt: '2026-06-20T00:00:00.000Z',
    ...overrides,
  }
}

function decodePreviewSvg(mindmap: MindmapRecord): string {
  return decodeURIComponent(buildMindmapPreviewSvgDataUrl(mindmap).split(',')[1] ?? '')
}

describe('buildMindmapPreviewSvgDataUrl', () => {
  it('includes the root text and layout mode on the svg root', () => {
    const svg = decodePreviewSvg(createMindmap())

    expect(svg).toContain('<svg')
    expect(svg).toContain('data-layout="right"')
    expect(svg).toContain('中心主题')
  })

  it('escapes root text before embedding it in the svg', () => {
    const svg = decodePreviewSvg(
      createMindmap({
        nodes: {
          root: {
            id: 'root',
            parentId: null,
            text: 'A < B & C',
            order: 0,
          },
        },
      }),
    )

    expect(svg).toContain('A &lt; B &amp; C')
    expect(svg).not.toContain('A < B & C')
  })

  it('defaults missing layout mode to balanced', () => {
    const mindmap = createMindmap({ layoutMode: undefined as never })
    const svg = decodePreviewSvg(mindmap)

    expect(svg).toContain('data-layout="balanced"')
  })
})
