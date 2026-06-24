export const MINDMAP_STORAGE_KEY = 'mindmap-web.document.v1'
export const DEFAULT_MINDMAP_TITLE = '未命名导图'

export function createEmptyMindmapSnapshot() {
  return {
    id: 'doc-root',
    title: DEFAULT_MINDMAP_TITLE,
    structure: 'mindmap',
    themeId: 'classic',
    nodeShape: 'rounded',
    autoBalanceLayout: false,
    rootId: 'node-root',
    viewport: { x: 0, y: 0, scale: 1 },
    updatedAt: new Date().toISOString(),
    nodes: {
      'node-root': {
        id: 'node-root',
        parentId: null,
        childIds: [],
        text: '中心主题',
        collapsed: false,
        style: {
          nodeColor: '#ffffff',
          branchColor: '#0f766e',
        },
      },
    },
  }
}

export function extractMindmapTitle(snapshot: { title?: unknown } | null | undefined): string {
  if (typeof snapshot?.title !== 'string') {
    return DEFAULT_MINDMAP_TITLE
  }

  const title = snapshot.title.trim()
  return title || DEFAULT_MINDMAP_TITLE
}
