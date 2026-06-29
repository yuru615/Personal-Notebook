interface MindmapPreviewNode {
  id: string
  parentId: string | null
  text: string
  childIds: string[]
  collapsed: boolean
  branchSide?: 'left' | 'right'
  nodeColor: string
  branchColor: string
}

interface MindmapPreviewSnapshot {
  rootId: string
  structure: 'mindmap' | 'logic' | 'tree' | 'org'
  themeId: string
  nodeShape: 'rounded' | 'rect' | 'pill'
  lineStyle?: 'curve' | 'elbow'
  nodes: Record<string, MindmapPreviewNode>
}

interface NodeSize {
  width: number
  height: number
}

interface VisibleLayoutNode {
  id: string
  parentId: string | null
  depth: number
  branchSide?: 'left' | 'right'
  size: NodeSize
  children: VisibleLayoutNode[]
  horizontalSpan?: number
  verticalSpan?: number
}

interface PositionedMindmapNode extends NodeSize {
  id: string
  parentId: string | null
  x: number
  y: number
  depth: number
  branchSide: 'left' | 'right' | 'center'
  nodeColor: string
  branchColor: string
}

interface PositionedMindmapEdgePoint {
  x: number
  y: number
}

interface PositionedMindmapEdge {
  id: string
  from: string
  to: string
  kind: 'curve' | 'elbow'
  points: PositionedMindmapEdgePoint[]
}

interface PreviewPalette {
  background: string
  border: string
  nodeBackground: string
  nodeBorder: string
  accent: string
  edge: string
}

const previewWidth = 320
const previewHeight = 200
const previewPadding = 18
const previewMaxNodes = 12

const measureMinWidth = 108
const measureMaxWidth = 260
const measureMinHeight = 44
const measureHorizontalPadding = 36
const measureVerticalPadding = 20
const measureCharacterWidth = 14
const measureLineHeight = 20

const primaryGap = 96
const secondaryGap = 28
const treeIndent = 92
const treeRowGap = 22

const themePalette: Record<string, PreviewPalette> = {
  classic: {
    background: '#ffffff',
    border: '#e9e9e7',
    nodeBackground: '#ffffff',
    nodeBorder: '#dce4ea',
    accent: '#0f766e',
    edge: '#8aa0b3',
  },
  mint: {
    background: '#f2fbf8',
    border: '#b7e4d4',
    nodeBackground: '#ffffff',
    nodeBorder: '#b7e4d4',
    accent: '#138a72',
    edge: '#55a39a',
  },
  dusk: {
    background: '#f8f5ff',
    border: '#d9ccff',
    nodeBackground: '#ffffff',
    nodeBorder: '#d9ccff',
    accent: '#6d5bd0',
    edge: '#8b7cc3',
  },
  sunset: {
    background: '#fff7ed',
    border: '#fed7aa',
    nodeBackground: '#ffffff',
    nodeBorder: '#fed7aa',
    accent: '#ea580c',
    edge: '#f08a5d',
  },
}

export function buildMindmapPreviewSvgDataUrl(snapshot: unknown): string | null {
  const normalizedSnapshot = normalizeMindmapPreviewSnapshot(snapshot)
  if (!normalizedSnapshot) {
    return null
  }

  const visibleNodeIds = collectPreviewNodeIds(normalizedSnapshot)
  if (visibleNodeIds.length <= 1) {
    return null
  }

  const palette = themePalette[normalizedSnapshot.themeId] ?? themePalette.classic
  const layout = computePreviewLayout(normalizedSnapshot, visibleNodeIds)
  const layoutNodes = Object.values(layout.nodes)
  if (layoutNodes.length <= 1) {
    return null
  }

  const lineStyle = normalizedSnapshot.lineStyle ?? defaultLineStyle(normalizedSnapshot.structure)
  const rawEdges = buildEdges(layout.nodes, normalizedSnapshot.structure, lineStyle)
  const scaleTransform = createPreviewScaleTransform(layoutNodes)
  const scaledNodes = scaleNodesToPreview(layoutNodes, scaleTransform)
  const scaledEdges = scaleEdgesToPreview(rawEdges, scaleTransform)
  const scaledNodeMap = Object.fromEntries(scaledNodes.map((node) => [node.id, node]))
  const edges = scaledEdges
    .map((edge) => {
      const child = scaledNodeMap[edge.to]
      const stroke = escapeAttribute(child?.branchColor || palette.edge)
      return renderEdge(edge, stroke)
    })
    .join('')

  const cards = scaledNodes
    .map((node) => {
      const isRoot = node.id === normalizedSnapshot.rootId
      const fill = isRoot
        ? palette.accent
        : escapeAttribute(node.nodeColor || palette.nodeBackground || '#ffffff')
      const border = isRoot
        ? palette.accent
        : escapeAttribute(palette.nodeBorder || palette.accent)
      const radius = getNodeRadius(normalizedSnapshot.nodeShape, node.height)

      return `<rect data-node-id="${escapeAttribute(node.id)}" x="${formatNumber(node.x)}" y="${formatNumber(
        node.y,
      )}" width="${formatNumber(node.width)}" height="${formatNumber(node.height)}" rx="${formatNumber(
        radius,
      )}" fill="${fill}" stroke="${border}" stroke-width="${isRoot ? '1.4' : '1.2'}" />`
    })
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}" viewBox="0 0 ${previewWidth} ${previewHeight}" fill="none"><rect width="${previewWidth}" height="${previewHeight}" rx="14" fill="${palette.background}"/><rect x="0.5" y="0.5" width="${
    previewWidth - 1
  }" height="${previewHeight - 1}" rx="13.5" stroke="${palette.border}"/>${edges}${cards}</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function normalizeMindmapPreviewSnapshot(snapshot: unknown): MindmapPreviewSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null
  }

  const candidate = snapshot as {
    rootId?: unknown
    structure?: unknown
    themeId?: unknown
    nodeShape?: unknown
    lineStyle?: unknown
    nodes?: unknown
  }

  if (typeof candidate.rootId !== 'string' || !candidate.rootId.trim()) {
    return null
  }

  if (!candidate.nodes || typeof candidate.nodes !== 'object') {
    return null
  }

  const nodes = Object.entries(candidate.nodes as Record<string, unknown>).reduce<
    Record<string, MindmapPreviewNode>
  >((result, [id, value]) => {
    if (!value || typeof value !== 'object') {
      return result
    }

    const node = value as {
      text?: unknown
      childIds?: unknown
      collapsed?: unknown
      branchSide?: unknown
      style?: { nodeColor?: unknown; branchColor?: unknown } | null
      parentId?: unknown
    }

    result[id] = {
      id,
      parentId: typeof node.parentId === 'string' ? node.parentId : null,
      text: typeof node.text === 'string' && node.text.trim() ? node.text.trim() : 'Node',
      childIds: Array.isArray(node.childIds)
        ? node.childIds.filter((childId): childId is string => typeof childId === 'string')
        : [],
      collapsed: node.collapsed === true,
      branchSide: node.branchSide === 'left' || node.branchSide === 'right' ? node.branchSide : undefined,
      nodeColor: sanitizeColor(node.style?.nodeColor, '#ffffff'),
      branchColor: sanitizeColor(node.style?.branchColor, '#0f766e'),
    }

    return result
  }, {})

  if (!nodes[candidate.rootId]) {
    return null
  }

  return {
    rootId: candidate.rootId,
    structure: normalizeStructure(candidate.structure),
    themeId: typeof candidate.themeId === 'string' ? candidate.themeId : 'classic',
    nodeShape: normalizeNodeShape(candidate.nodeShape),
    lineStyle: normalizeLineStyle(candidate.lineStyle),
    nodes,
  }
}

function normalizeStructure(value: unknown): MindmapPreviewSnapshot['structure'] {
  return value === 'logic' || value === 'tree' || value === 'org' ? value : 'mindmap'
}

function normalizeNodeShape(value: unknown): MindmapPreviewSnapshot['nodeShape'] {
  return value === 'rect' || value === 'pill' ? value : 'rounded'
}

function normalizeLineStyle(value: unknown): MindmapPreviewSnapshot['lineStyle'] | undefined {
  return value === 'curve' || value === 'elbow' ? value : undefined
}

function collectPreviewNodeIds(snapshot: MindmapPreviewSnapshot) {
  const queue = [snapshot.rootId]
  const visited = new Set<string>()
  const nodeIds: string[] = []

  while (queue.length > 0 && nodeIds.length < previewMaxNodes) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId)) {
      continue
    }

    const node = snapshot.nodes[currentId]
    if (!node) {
      continue
    }

    visited.add(currentId)
    nodeIds.push(currentId)

    if (node.collapsed) {
      continue
    }

    for (const childId of node.childIds) {
      if (!visited.has(childId) && snapshot.nodes[childId]) {
        queue.push(childId)
      }
    }
  }

  return nodeIds
}

function computePreviewLayout(snapshot: MindmapPreviewSnapshot, visibleNodeIds: string[]) {
  const visibleIdSet = new Set(visibleNodeIds)
  const buildVisibleNode = (nodeId: string, depth: number): VisibleLayoutNode => {
    const node = snapshot.nodes[nodeId]!
    const children = node.collapsed
      ? []
      : node.childIds
          .map((childId) =>
            visibleIdSet.has(childId) && snapshot.nodes[childId] ? buildVisibleNode(childId, depth + 1) : null,
          )
          .filter((child): child is VisibleLayoutNode => child !== null)

    return {
      id: node.id,
      parentId: node.parentId,
      depth,
      branchSide: node.branchSide,
      size: estimateNodeSize(node.text),
      children,
    }
  }

  const root = buildVisibleNode(snapshot.rootId, 0)
  const positions: Record<string, PositionedMindmapNode> = {}

  if (snapshot.structure === 'tree') {
    placeTree(root, 0, 0, positions, snapshot)
  } else if (snapshot.structure === 'org') {
    placeVertical(root, 0, 0, positions, 'center', snapshot)
  } else if (snapshot.structure === 'logic') {
    placeHorizontal(root, 0, 0, 1, positions, 'center', snapshot)
  } else {
    placeMindmap(root, positions, snapshot)
  }

  if (snapshot.structure !== 'org' && snapshot.structure !== 'logic') {
    anchorRootAtOrigin(positions, snapshot.rootId)
  }

  return {
    structure: snapshot.structure,
    nodes: positions,
  }
}

function estimateNodeSize(text: string): NodeSize {
  const content = text.trim() || '新建节点'
  const width = clamp(content.length * measureCharacterWidth + measureHorizontalPadding, measureMinWidth, measureMaxWidth)
  const innerWidth = Math.max(1, width - measureHorizontalPadding)
  const charsPerLine = Math.max(1, Math.floor(innerWidth / measureCharacterWidth))
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine))

  return {
    width,
    height: Math.max(measureMinHeight, lines * measureLineHeight + measureVerticalPadding),
  }
}

function horizontalSpan(node: VisibleLayoutNode): number {
  if (node.horizontalSpan !== undefined) {
    return node.horizontalSpan
  }

  if (node.children.length === 0) {
    node.horizontalSpan = node.size.height
    return node.horizontalSpan
  }

  const childSpan = node.children.reduce((sum, child) => sum + horizontalSpan(child), 0)
  const gapSpan = secondaryGap * Math.max(0, node.children.length - 1)
  node.horizontalSpan = Math.max(node.size.height, childSpan + gapSpan)
  return node.horizontalSpan
}

function verticalSpan(node: VisibleLayoutNode): number {
  if (node.verticalSpan !== undefined) {
    return node.verticalSpan
  }

  if (node.children.length === 0) {
    node.verticalSpan = node.size.width
    return node.verticalSpan
  }

  const childSpan = node.children.reduce((sum, child) => sum + verticalSpan(child), 0)
  const gapSpan = primaryGap * Math.max(0, node.children.length - 1)
  node.verticalSpan = Math.max(node.size.width, childSpan + gapSpan)
  return node.verticalSpan
}

function placeHorizontal(
  node: VisibleLayoutNode,
  yTop: number,
  x: number,
  direction: 1 | -1,
  positions: Record<string, PositionedMindmapNode>,
  branchSide: PositionedMindmapNode['branchSide'],
  snapshot: MindmapPreviewSnapshot,
) {
  const span = horizontalSpan(node)
  const y = yTop + (span - node.size.height) / 2
  const sourceNode = snapshot.nodes[node.id]!
  positions[node.id] = {
    ...node.size,
    id: node.id,
    parentId: node.parentId,
    x,
    y,
    depth: node.depth,
    branchSide,
    nodeColor: sourceNode.nodeColor,
    branchColor: sourceNode.branchColor,
  }

  if (node.children.length === 0) {
    return
  }

  const childSpan = node.children.reduce((sum, child) => sum + horizontalSpan(child), 0)
  const totalHeight = childSpan + secondaryGap * Math.max(0, node.children.length - 1)
  let childY = yTop + (span - totalHeight) / 2

  for (const child of node.children) {
    const childSize = horizontalSpan(child)
    const childX = direction === 1 ? x + node.size.width + primaryGap : x - primaryGap - child.size.width
    const childBranchSide = branchSide === 'center' ? (direction === -1 ? 'left' : 'right') : branchSide
    placeHorizontal(child, childY, childX, direction, positions, childBranchSide, snapshot)
    childY += childSize + secondaryGap
  }
}

function placeVertical(
  node: VisibleLayoutNode,
  xLeft: number,
  y: number,
  positions: Record<string, PositionedMindmapNode>,
  branchSide: PositionedMindmapNode['branchSide'],
  snapshot: MindmapPreviewSnapshot,
) {
  const span = verticalSpan(node)
  const x = xLeft + (span - node.size.width) / 2
  const sourceNode = snapshot.nodes[node.id]!
  positions[node.id] = {
    ...node.size,
    id: node.id,
    parentId: node.parentId,
    x,
    y,
    depth: node.depth,
    branchSide,
    nodeColor: sourceNode.nodeColor,
    branchColor: sourceNode.branchColor,
  }

  if (node.children.length === 0) {
    return
  }

  const childSpan = node.children.reduce((sum, child) => sum + verticalSpan(child), 0)
  const totalWidth = childSpan + primaryGap * Math.max(0, node.children.length - 1)
  let childX = xLeft + (span - totalWidth) / 2

  for (const child of node.children) {
    const childSize = verticalSpan(child)
    placeVertical(child, childX, y + node.size.height + primaryGap, positions, 'right', snapshot)
    childX += childSize + primaryGap
  }
}

function placeTree(
  node: VisibleLayoutNode,
  x: number,
  y: number,
  positions: Record<string, PositionedMindmapNode>,
  snapshot: MindmapPreviewSnapshot,
): number {
  const sourceNode = snapshot.nodes[node.id]!
  positions[node.id] = {
    ...node.size,
    id: node.id,
    parentId: node.parentId,
    x,
    y,
    depth: node.depth,
    branchSide: node.depth === 0 ? 'center' : 'right',
    nodeColor: sourceNode.nodeColor,
    branchColor: sourceNode.branchColor,
  }

  let nextY = y + node.size.height
  if (node.children.length === 0) {
    return nextY
  }

  nextY += treeRowGap
  for (let index = 0; index < node.children.length; index += 1) {
    nextY = placeTree(node.children[index], x + treeIndent, nextY, positions, snapshot)
    if (index < node.children.length - 1) {
      nextY += treeRowGap
    }
  }

  return nextY
}

function getMindmapRootSide(child: VisibleLayoutNode, index: number): 'left' | 'right' {
  return child.branchSide ?? (index % 2 === 1 ? 'left' : 'right')
}

function placeMindmap(
  root: VisibleLayoutNode,
  positions: Record<string, PositionedMindmapNode>,
  snapshot: MindmapPreviewSnapshot,
) {
  const rootSourceNode = snapshot.nodes[root.id]!
  positions[root.id] = {
    ...root.size,
    id: root.id,
    parentId: root.parentId,
    x: 0,
    y: 0,
    depth: root.depth,
    branchSide: 'center',
    nodeColor: rootSourceNode.nodeColor,
    branchColor: rootSourceNode.branchColor,
  }

  const leftChildren = root.children.filter((child, index) => getMindmapRootSide(child, index) === 'left')
  const rightChildren = root.children.filter((child, index) => getMindmapRootSide(child, index) === 'right')

  const placeSide = (children: VisibleLayoutNode[], direction: 1 | -1) => {
    if (children.length === 0) {
      return
    }

    const spans = children.map(horizontalSpan)
    const total = spans.reduce((sum, value) => sum + value, 0) + secondaryGap * Math.max(0, children.length - 1)
    let yTop = root.size.height / 2 - total / 2

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]
      const childX = direction === 1 ? root.size.width + primaryGap : -primaryGap - child.size.width
      placeHorizontal(child, yTop, childX, direction, positions, direction === -1 ? 'left' : 'right', snapshot)
      yTop += spans[index] + secondaryGap
    }
  }

  placeSide(leftChildren, -1)
  placeSide(rightChildren, 1)
}

function anchorRootAtOrigin(positions: Record<string, PositionedMindmapNode>, rootId: string) {
  const root = positions[rootId]
  if (!root || (root.x === 0 && root.y === 0)) {
    return
  }

  for (const node of Object.values(positions)) {
    node.x -= root.x
    node.y -= root.y
  }
}

function createPreviewScaleTransform(nodes: PositionedMindmapNode[]) {
  const left = Math.min(...nodes.map((node) => node.x))
  const top = Math.min(...nodes.map((node) => node.y))
  const right = Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = Math.max(...nodes.map((node) => node.y + node.height))
  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)
  const scale = Math.min(
    (previewWidth - previewPadding * 2) / width,
    (previewHeight - previewPadding * 2) / height,
  )
  const offsetX = (previewWidth - width * scale) / 2 - left * scale
  const offsetY = (previewHeight - height * scale) / 2 - top * scale

  return { scale, offsetX, offsetY }
}

function scaleNodesToPreview(
  nodes: PositionedMindmapNode[],
  transform: { scale: number; offsetX: number; offsetY: number },
) {
  return nodes.map((node) => ({
    ...node,
    x: node.x * transform.scale + transform.offsetX,
    y: node.y * transform.scale + transform.offsetY,
    width: node.width * transform.scale,
    height: node.height * transform.scale,
  }))
}

function scaleEdgesToPreview(
  edges: PositionedMindmapEdge[],
  transform: { scale: number; offsetX: number; offsetY: number },
) {
  return edges.map((edge) => ({
    ...edge,
    points: edge.points.map((point) => ({
      x: point.x * transform.scale + transform.offsetX,
      y: point.y * transform.scale + transform.offsetY,
    })),
  }))
}

function buildEdges(
  nodes: Record<string, PositionedMindmapNode>,
  structure: MindmapPreviewSnapshot['structure'],
  lineStyle: NonNullable<MindmapPreviewSnapshot['lineStyle']>,
) {
  const makeEdge =
    lineStyle === 'curve'
      ? createCurveEdge
      : structure === 'tree'
        ? createTreeEdge
        : structure === 'org'
          ? createElbowEdge
          : createSideElbowEdge

  return Object.values(nodes)
    .filter((node) => node.parentId !== null)
    .map((node) => makeEdge(nodes[node.parentId!], node))
}

function createCurveEdge(fromNode: PositionedMindmapNode, toNode: PositionedMindmapNode): PositionedMindmapEdge {
  const fromOnLeft = toNode.x < fromNode.x
  const fromPoint = {
    x: fromOnLeft ? fromNode.x : fromNode.x + fromNode.width,
    y: fromNode.y + fromNode.height / 2,
  }
  const toPoint = {
    x: fromOnLeft ? toNode.x + toNode.width : toNode.x,
    y: toNode.y + toNode.height / 2,
  }
  const horizontalDistance = Math.abs(toPoint.x - fromPoint.x)
  const controlOffset = Math.max(48, horizontalDistance * 0.38)
  const direction = fromOnLeft ? -1 : 1

  return {
    id: `${fromNode.id}-${toNode.id}`,
    from: fromNode.id,
    to: toNode.id,
    kind: 'curve',
    points: [
      fromPoint,
      { x: fromPoint.x + controlOffset * direction, y: fromPoint.y },
      { x: toPoint.x - controlOffset * direction, y: toPoint.y },
      toPoint,
    ],
  }
}

function createElbowEdge(fromNode: PositionedMindmapNode, toNode: PositionedMindmapNode): PositionedMindmapEdge {
  const fromPoint = {
    x: fromNode.x + fromNode.width / 2,
    y: fromNode.y + fromNode.height,
  }
  const toPoint = {
    x: toNode.x + toNode.width / 2,
    y: toNode.y,
  }
  const midY = (fromPoint.y + toPoint.y) / 2

  return {
    id: `${fromNode.id}-${toNode.id}`,
    from: fromNode.id,
    to: toNode.id,
    kind: 'elbow',
    points: [fromPoint, { x: fromPoint.x, y: midY }, { x: toPoint.x, y: midY }, toPoint],
  }
}

function createSideElbowEdge(fromNode: PositionedMindmapNode, toNode: PositionedMindmapNode): PositionedMindmapEdge {
  const toLeft = toNode.x < fromNode.x
  const fromPoint = {
    x: toLeft ? fromNode.x : fromNode.x + fromNode.width,
    y: fromNode.y + fromNode.height / 2,
  }
  const toPoint = {
    x: toLeft ? toNode.x + toNode.width : toNode.x,
    y: toNode.y + toNode.height / 2,
  }
  const midX = (fromPoint.x + toPoint.x) / 2

  return {
    id: `${fromNode.id}-${toNode.id}`,
    from: fromNode.id,
    to: toNode.id,
    kind: 'elbow',
    points: [fromPoint, { x: midX, y: fromPoint.y }, { x: midX, y: toPoint.y }, toPoint],
  }
}

function createTreeEdge(fromNode: PositionedMindmapNode, toNode: PositionedMindmapNode): PositionedMindmapEdge {
  const trunkX = fromNode.x + Math.min(30, fromNode.width * 0.32)
  const fromPoint = {
    x: trunkX,
    y: fromNode.y + fromNode.height,
  }
  const toPoint = {
    x: toNode.x,
    y: toNode.y + toNode.height / 2,
  }

  return {
    id: `${fromNode.id}-${toNode.id}`,
    from: fromNode.id,
    to: toNode.id,
    kind: 'elbow',
    points: [fromPoint, { x: trunkX, y: toPoint.y }, toPoint],
  }
}

function renderEdge(edge: PositionedMindmapEdge, stroke: string) {
  if (edge.kind === 'curve' && edge.points.length === 4) {
    const [start, controlStart, controlEnd, end] = edge.points
    return `<path d="M ${formatNumber(start.x)} ${formatNumber(start.y)} C ${formatNumber(
      controlStart.x,
    )} ${formatNumber(controlStart.y)} ${formatNumber(controlEnd.x)} ${formatNumber(
      controlEnd.y,
    )} ${formatNumber(end.x)} ${formatNumber(
      end.y,
    )}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" />`
  }

  return `<path d="${edge.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(' ')}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`
}

function getNodeRadius(nodeShape: MindmapPreviewSnapshot['nodeShape'], height: number) {
  if (nodeShape === 'pill') {
    return height / 2
  }
  if (nodeShape === 'rect') {
    return 2
  }
  return 8
}

function defaultLineStyle(structure: MindmapPreviewSnapshot['structure']) {
  return structure === 'tree' || structure === 'org' ? 'elbow' : 'curve'
}

function sanitizeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatNumber(value: number) {
  return Number(value.toFixed(2)).toString()
}
