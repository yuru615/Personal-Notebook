export const MINDMAP_STORAGE_KEY = 'mindmap-web.document.v1'
export const DEFAULT_MINDMAP_TITLE = '未命名导图'
export const MINDMAP_THEME_IDS = ['classic', 'mint', 'dusk', 'sunset'] as const

type MindmapThemeId = (typeof MINDMAP_THEME_IDS)[number]

const DEFAULT_ROOT_NODE_ID = 'node-root'
const DEFAULT_ROOT_TEXT = '中心主题'
const DEFAULT_VIEWPORT = { x: 0, y: 0, scale: 1 }
const DEFAULT_ROOT_LAYOUT_OFFSET = 120
const DEFAULT_NODE_MIN_WIDTH = 108
const DEFAULT_NODE_MAX_WIDTH = 260
const DEFAULT_NODE_MIN_HEIGHT = 44
const DEFAULT_NODE_HORIZONTAL_PADDING = 36
const DEFAULT_NODE_VERTICAL_PADDING = 20
const DEFAULT_NODE_CHARACTER_WIDTH = 14
const DEFAULT_NODE_LINE_HEIGHT = 20
const THEME_BRANCH_COLORS: Record<MindmapThemeId, string> = {
  classic: '#0f766e',
  mint: '#138a72',
  dusk: '#6d5bd0',
  sunset: '#ea580c',
}

export function pickRandomMindmapTheme(random = Math.random): MindmapThemeId {
  const index = Math.min(
    MINDMAP_THEME_IDS.length - 1,
    Math.max(0, Math.floor(random() * MINDMAP_THEME_IDS.length)),
  )

  return MINDMAP_THEME_IDS[index] ?? 'classic'
}

export function createEmptyMindmapSnapshot(options?: {
  themeId?: MindmapThemeId
  random?: () => number
}) {
  const themeId = options?.themeId ?? pickRandomMindmapTheme(options?.random)

  return {
    id: 'doc-root',
    title: DEFAULT_MINDMAP_TITLE,
    structure: 'mindmap',
    themeId,
    nodeShape: 'rounded',
    autoBalanceLayout: false,
    rootId: DEFAULT_ROOT_NODE_ID,
    viewport: { ...DEFAULT_VIEWPORT },
    updatedAt: new Date().toISOString(),
    nodes: {
      [DEFAULT_ROOT_NODE_ID]: {
        id: DEFAULT_ROOT_NODE_ID,
        parentId: null,
        childIds: [],
        text: DEFAULT_ROOT_TEXT,
        collapsed: false,
        style: {
          nodeColor: '#ffffff',
          branchColor: THEME_BRANCH_COLORS[themeId],
        },
      },
    },
  }
}

function estimateMindmapNodeSize(text: string) {
  const content = text.trim() || DEFAULT_ROOT_TEXT
  const width = clamp(
    content.length * DEFAULT_NODE_CHARACTER_WIDTH + DEFAULT_NODE_HORIZONTAL_PADDING,
    DEFAULT_NODE_MIN_WIDTH,
    DEFAULT_NODE_MAX_WIDTH,
  )
  const innerWidth = Math.max(1, width - DEFAULT_NODE_HORIZONTAL_PADDING)
  const charsPerLine = Math.max(1, Math.floor(innerWidth / DEFAULT_NODE_CHARACTER_WIDTH))
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine))

  return {
    width,
    height: Math.max(DEFAULT_NODE_MIN_HEIGHT, lines * DEFAULT_NODE_LINE_HEIGHT + DEFAULT_NODE_VERTICAL_PADDING),
  }
}

function isFiniteViewportSize(value: number) {
  return Number.isFinite(value) && value > 0
}

function isPristineMindmapSnapshot(snapshot: unknown): snapshot is {
  id: string
  title: string
  structure: string
  themeId: MindmapThemeId
  nodeShape: string
  autoBalanceLayout: boolean
  rootId: string
  viewport: { x: number; y: number; scale: number }
  nodes: Record<
    string,
    {
      id: string
      parentId: string | null
      childIds: string[]
      text: string
      collapsed: boolean
      style?: { nodeColor?: string; branchColor?: string } | null
    }
  >
} {
  if (!snapshot || typeof snapshot !== 'object') {
    return false
  }

  const candidate = snapshot as {
    id?: unknown
    title?: unknown
    structure?: unknown
    themeId?: unknown
    nodeShape?: unknown
    autoBalanceLayout?: unknown
    rootId?: unknown
    viewport?: { x?: unknown; y?: unknown; scale?: unknown } | null
    nodes?: Record<string, unknown> | null
  }

  if (
    candidate.id !== 'doc-root' ||
    candidate.title !== DEFAULT_MINDMAP_TITLE ||
    candidate.structure !== 'mindmap' ||
    typeof candidate.themeId !== 'string' ||
    !MINDMAP_THEME_IDS.includes(candidate.themeId as MindmapThemeId) ||
    candidate.nodeShape !== 'rounded' ||
    candidate.autoBalanceLayout !== false ||
    candidate.rootId !== DEFAULT_ROOT_NODE_ID ||
    candidate.viewport?.x !== DEFAULT_VIEWPORT.x ||
    candidate.viewport?.y !== DEFAULT_VIEWPORT.y ||
    candidate.viewport?.scale !== DEFAULT_VIEWPORT.scale ||
    !candidate.nodes ||
    typeof candidate.nodes !== 'object'
  ) {
    return false
  }

  const nodeIds = Object.keys(candidate.nodes)
  if (nodeIds.length !== 1 || nodeIds[0] !== DEFAULT_ROOT_NODE_ID) {
    return false
  }

  const rootNode = candidate.nodes[DEFAULT_ROOT_NODE_ID] as {
    id?: unknown
    parentId?: unknown
    childIds?: unknown
    text?: unknown
    collapsed?: unknown
    style?: { nodeColor?: unknown; branchColor?: unknown } | null
  }

  return (
    rootNode?.id === DEFAULT_ROOT_NODE_ID &&
    rootNode.parentId === null &&
    Array.isArray(rootNode.childIds) &&
    rootNode.childIds.length === 0 &&
    rootNode.text === DEFAULT_ROOT_TEXT &&
    rootNode.collapsed === false &&
    rootNode.style?.nodeColor === '#ffffff' &&
    rootNode.style?.branchColor === THEME_BRANCH_COLORS[candidate.themeId as MindmapThemeId]
  )
}

export function prepareMindmapSnapshotForHost(
  snapshot: unknown,
  viewportSize: { width: number; height: number },
) {
  if (
    !isPristineMindmapSnapshot(snapshot) ||
    !isFiniteViewportSize(viewportSize.width) ||
    !isFiniteViewportSize(viewportSize.height)
  ) {
    return snapshot
  }

  const rootSize = estimateMindmapNodeSize(snapshot.nodes[snapshot.rootId]?.text ?? DEFAULT_ROOT_TEXT)
  const centeredViewport = {
    x: Number((viewportSize.width / 2 - (DEFAULT_ROOT_LAYOUT_OFFSET + rootSize.width / 2)).toFixed(2)),
    y: Number((viewportSize.height / 2 - (DEFAULT_ROOT_LAYOUT_OFFSET + rootSize.height / 2)).toFixed(2)),
    scale: DEFAULT_VIEWPORT.scale,
  }

  if (
    centeredViewport.x === snapshot.viewport.x &&
    centeredViewport.y === snapshot.viewport.y &&
    centeredViewport.scale === snapshot.viewport.scale
  ) {
    return snapshot
  }

  return {
    ...snapshot,
    viewport: centeredViewport,
  }
}

export function extractMindmapTitle(snapshot: { title?: unknown } | null | undefined): string {
  if (typeof snapshot?.title !== 'string') {
    return DEFAULT_MINDMAP_TITLE
  }

  const title = snapshot.title.trim()
  return title || DEFAULT_MINDMAP_TITLE
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
