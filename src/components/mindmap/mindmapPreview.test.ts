import { describe, expect, it } from 'vitest'
import { buildMindmapPreviewSvgDataUrl } from './mindmapPreview'

const snapshot = {
  title: 'Strategy map',
  structure: 'mindmap',
  themeId: 'sunset',
  nodeShape: 'rounded',
  rootId: 'node-root',
  nodes: {
    'node-root': {
      id: 'node-root',
      parentId: null,
      childIds: ['node-a', 'node-b'],
      text: 'Root topic',
      collapsed: false,
      style: {
        nodeColor: '#fff7ed',
        branchColor: '#ea580c',
      },
    },
    'node-a': {
      id: 'node-a',
      parentId: 'node-root',
      childIds: ['node-a-1'],
      text: 'Research',
      collapsed: false,
      style: {
        nodeColor: '#ffffff',
        branchColor: '#f97316',
      },
    },
    'node-a-1': {
      id: 'node-a-1',
      parentId: 'node-a',
      childIds: [],
      text: 'Interviews',
      collapsed: false,
      style: {
        nodeColor: '#ffffff',
        branchColor: '#fb923c',
      },
    },
    'node-b': {
      id: 'node-b',
      parentId: 'node-root',
      childIds: [],
      text: 'Design',
      collapsed: false,
      style: {
        nodeColor: '#ffffff',
        branchColor: '#ea580c',
      },
    },
  },
}

function decodePreview(preview: string | null) {
  return decodeURIComponent(preview ?? '')
}

describe('mindmapPreview', () => {
  it('builds an svg preview data url for non-empty mindmaps', () => {
    const preview = buildMindmapPreviewSvgDataUrl(snapshot)

    expect(preview?.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodePreview(preview)).toContain('<svg')
    expect(decodePreview(preview)).not.toContain('Research')
    expect(decodePreview(preview)).not.toContain('Design')
  })

  it('renders the root node with the theme accent and follows the real default branch side split', () => {
    const preview = decodePreview(buildMindmapPreviewSvgDataUrl(snapshot))

    expect(preview).toContain('data-node-id="node-root"')
    expect(preview).toContain('fill="#ea580c"')
    expect(preview).toContain('fill="#ffffff"')

    const rootX = Number(preview.match(/data-node-id="node-root"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)
    const leftX = Number(preview.match(/data-node-id="node-a"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)
    const rightX = Number(preview.match(/data-node-id="node-b"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)

    expect(leftX).toBeGreaterThan(rootX)
    expect(rightX).toBeLessThan(rootX)
  })

  it('uses stored branch sides from the real mindmap document when laying out preview branches', () => {
    const preview = decodePreview(
      buildMindmapPreviewSvgDataUrl({
        ...snapshot,
        nodes: {
          ...snapshot.nodes,
          'node-a': {
            ...snapshot.nodes['node-a'],
            branchSide: 'right',
          },
          'node-b': {
            ...snapshot.nodes['node-b'],
            branchSide: 'left',
          },
        },
      }),
    )

    const rootX = Number(preview.match(/data-node-id="node-root"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)
    const aX = Number(preview.match(/data-node-id="node-a"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)
    const bX = Number(preview.match(/data-node-id="node-b"[^>]*?\bx="([^"]+)"/)?.[1] ?? Number.NaN)

    expect(aX).toBeGreaterThan(rootX)
    expect(bX).toBeLessThan(rootX)
  })

  it('preserves curve tension by scaling precomputed edges instead of recomputing them after thumbnail scaling', () => {
    const preview = decodePreview(
      buildMindmapPreviewSvgDataUrl({
        title: 'Curve map',
        structure: 'logic',
        themeId: 'sunset',
        nodeShape: 'rounded',
        lineStyle: 'curve',
        rootId: 'node-root',
        nodes: {
          'node-root': {
            id: 'node-root',
            parentId: null,
            childIds: ['node-a'],
            text: 'Root topic',
            collapsed: false,
            style: {
              nodeColor: '#fff7ed',
              branchColor: '#ea580c',
            },
          },
          'node-a': {
            id: 'node-a',
            parentId: 'node-root',
            childIds: [],
            text: 'Child topic',
            collapsed: false,
            style: {
              nodeColor: '#ffffff',
              branchColor: '#ea580c',
            },
          },
        },
      }),
    )

    const match = preview.match(
      /<path d="M ([\d.]+) ([\d.]+) C ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/,
    )

    expect(match).not.toBeNull()

    const startX = Number(match?.[1] ?? Number.NaN)
    const control1X = Number(match?.[3] ?? Number.NaN)
    const control2X = Number(match?.[5] ?? Number.NaN)
    const endX = Number(match?.[7] ?? Number.NaN)

    expect(startX).toBeLessThan(control1X)
    expect(control1X).toBeLessThanOrEqual(control2X)
    expect(control2X).toBeLessThan(endX)
  })

  it('returns null for empty mindmaps', () => {
    expect(
      buildMindmapPreviewSvgDataUrl({
        title: 'Untitled',
        structure: 'mindmap',
        themeId: 'classic',
        rootId: 'node-root',
        nodes: {
          'node-root': {
            id: 'node-root',
            parentId: null,
            childIds: [],
            text: 'Root topic',
            collapsed: false,
            style: {
              nodeColor: '#ffffff',
              branchColor: '#0f766e',
            },
          },
        },
      }),
    ).toBeNull()
  })
})
