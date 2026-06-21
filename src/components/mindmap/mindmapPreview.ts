import {
  isMindmapSnapshot,
  normalizeMindmapSnapshot,
  type MindmapConnection,
  type MindmapImage,
  type MindmapNote,
  type MindmapShape,
  type MindmapSnapshot,
  type MindmapStroke,
  type MindmapText,
} from './mindmapModel'

interface MindmapSummary {
  elementCount: number
  isEmpty: boolean
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface ConnectableCenter {
  x: number
  y: number
}

const previewWidth = 320
const previewHeight = 200
const previewPadding = 20

export function summarizeMindmapSnapshot(snapshot: MindmapSnapshot): MindmapSummary {
  const elementCount =
    snapshot.notes.length +
    snapshot.texts.length +
    snapshot.images.length +
    snapshot.shapes.length +
    snapshot.strokes.length +
    snapshot.connections.length

  return {
    elementCount,
    isEmpty: elementCount === 0,
  }
}

export function buildMindmapPreviewSvgDataUrl(snapshot: unknown): string | null {
  if (!isMindmapSnapshot(snapshot)) {
    return null
  }

  const normalizedSnapshot = normalizeMindmapSnapshot(snapshot)

  const summary = summarizeMindmapSnapshot(normalizedSnapshot)
  if (summary.isEmpty) {
    return null
  }

  const bounds = getSnapshotBounds(normalizedSnapshot)
  const scale = Math.min(
    (previewWidth - previewPadding * 2) / Math.max(bounds.right - bounds.left, 1),
    (previewHeight - previewPadding * 2) / Math.max(bounds.bottom - bounds.top, 1),
  )
  const offsetX = (previewWidth - (bounds.right - bounds.left) * scale) / 2 - bounds.left * scale
  const offsetY = (previewHeight - (bounds.bottom - bounds.top) * scale) / 2 - bounds.top * scale
  const connectableCenters = buildConnectableCenterMap(normalizedSnapshot)

  const content = [
    ...normalizedSnapshot.strokes.map((stroke) => renderStroke(stroke, scale, offsetX, offsetY)),
    ...normalizedSnapshot.connections.map((connection) =>
      renderConnection(connection, connectableCenters, scale, offsetX, offsetY),
    ),
    ...normalizedSnapshot.notes.map((note) => renderNote(note, scale, offsetX, offsetY)),
    ...normalizedSnapshot.shapes.map((shape) => renderShape(shape, scale, offsetX, offsetY)),
    ...normalizedSnapshot.images.map((image) => renderImage(image, scale, offsetX, offsetY)),
    ...normalizedSnapshot.texts.map((text) => renderText(text, scale, offsetX, offsetY)),
  ]
    .filter(Boolean)
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${previewWidth}" height="${previewHeight}" viewBox="0 0 ${previewWidth} ${previewHeight}" fill="none"><rect width="${previewWidth}" height="${previewHeight}" rx="14" fill="#ffffff"/><rect x="0.5" y="0.5" width="${previewWidth - 1}" height="${previewHeight - 1}" rx="13.5" stroke="#e9e9e7"/>${content}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildConnectableCenterMap(snapshot: MindmapSnapshot) {
  const centerById = new Map<string, ConnectableCenter>()

  snapshot.notes.forEach((note) => centerById.set(note.id, centerOfBox(note.x, note.y, note.w, note.h)))
  snapshot.texts.forEach((text) => centerById.set(text.id, centerOfBox(text.x, text.y, text.w, text.h)))
  snapshot.images.forEach((image) => centerById.set(image.id, centerOfBox(image.x, image.y, image.w, image.h)))
  snapshot.shapes.forEach((shape) => centerById.set(shape.id, centerOfBox(shape.x, shape.y, shape.w, shape.h)))

  return centerById
}

function renderStroke(stroke: MindmapStroke, scale: number, offsetX: number, offsetY: number) {
  if (stroke.points.length === 0) {
    return ''
  }

  const points = stroke.points
    .map((point) => `${formatNumber(point.x * scale + offsetX)},${formatNumber(point.y * scale + offsetY)}`)
    .join(' ')

  return `<polyline points="${points}" fill="none" stroke="${escapeAttribute(stroke.color)}" stroke-width="${formatNumber(
    Math.max(1, stroke.size * scale * 0.5),
  )}" stroke-linecap="round" stroke-linejoin="round" />`
}

function renderConnection(
  connection: MindmapConnection,
  centers: Map<string, ConnectableCenter>,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  const from = centers.get(connection.from)
  const to = centers.get(connection.to)

  if (!from || !to) {
    return ''
  }

  if (connection.mode === 'curve') {
    const controlOffset = Math.max(Math.abs(to.x - from.x) * 0.4, 24)
    return `<path d="M ${formatNumber(from.x * scale + offsetX)} ${formatNumber(
      from.y * scale + offsetY,
    )} C ${formatNumber(from.x * scale + offsetX + controlOffset * scale)} ${formatNumber(
      from.y * scale + offsetY,
    )} ${formatNumber(to.x * scale + offsetX - controlOffset * scale)} ${formatNumber(
      to.y * scale + offsetY,
    )} ${formatNumber(to.x * scale + offsetX)} ${formatNumber(
      to.y * scale + offsetY,
    )}" fill="none" stroke="${escapeAttribute(connection.color)}" stroke-width="${formatNumber(
      Math.max(1, connection.size * scale * 0.5),
    )}" stroke-linecap="round" />`
  }

  return `<line x1="${formatNumber(from.x * scale + offsetX)}" y1="${formatNumber(
    from.y * scale + offsetY,
  )}" x2="${formatNumber(to.x * scale + offsetX)}" y2="${formatNumber(
    to.y * scale + offsetY,
  )}" stroke="${escapeAttribute(connection.color)}" stroke-width="${formatNumber(
    Math.max(1, connection.size * scale * 0.5),
  )}" stroke-linecap="round" />`
}

function renderNote(note: MindmapNote, scale: number, offsetX: number, offsetY: number) {
  const x = note.x * scale + offsetX
  const y = note.y * scale + offsetY
  const width = Math.max(10, note.w * scale)
  const height = Math.max(10, note.h * scale)
  const text = note.text.trim()

  return `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(
    width,
  )}" height="${formatNumber(height)}" rx="10" fill="${escapeAttribute(
    note.color,
  )}" stroke="#e6dcc0" stroke-width="1" />${
    text
      ? `<text x="${formatNumber(x + 14)}" y="${formatNumber(
          y + Math.min(height - 10, 28),
        )}" fill="#20262d" font-size="${formatNumber(Math.max(12, 14 * scale))}" font-family="Inter, Microsoft YaHei, sans-serif">${escapeText(
          text,
        )}</text>`
      : ''
  }`
}

function renderShape(shape: MindmapShape, scale: number, offsetX: number, offsetY: number) {
  const x = shape.x * scale + offsetX
  const y = shape.y * scale + offsetY
  const width = Math.max(8, shape.w * scale)
  const height = Math.max(8, shape.h * scale)
  const strokeWidth = formatNumber(Math.max(1, shape.size * scale * 0.45))
  const stroke = escapeAttribute(shape.color)

  switch (shape.type) {
    case 'ellipse':
      return `<ellipse cx="${formatNumber(x + width / 2)}" cy="${formatNumber(
        y + height / 2,
      )}" rx="${formatNumber(width / 2)}" ry="${formatNumber(
        height / 2,
      )}" fill="#ffffff" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    case 'diamond':
      return `<polygon points="${formatNumber(x + width / 2)},${formatNumber(y)} ${formatNumber(
        x + width,
      )},${formatNumber(y + height / 2)} ${formatNumber(x + width / 2)},${formatNumber(
        y + height,
      )} ${formatNumber(x)},${formatNumber(y + height / 2)}" fill="#ffffff" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    case 'triangle':
      return `<polygon points="${formatNumber(x + width / 2)},${formatNumber(y)} ${formatNumber(
        x + width,
      )},${formatNumber(y + height)} ${formatNumber(x)},${formatNumber(
        y + height,
      )}" fill="#ffffff" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    default:
      return `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(
        width,
      )}" height="${formatNumber(height)}" rx="10" fill="#ffffff" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  }
}

function renderImage(image: MindmapImage, scale: number, offsetX: number, offsetY: number) {
  return `<rect x="${formatNumber(image.x * scale + offsetX)}" y="${formatNumber(
    image.y * scale + offsetY,
  )}" width="${formatNumber(Math.max(8, image.w * scale))}" height="${formatNumber(
    Math.max(8, image.h * scale),
  )}" rx="8" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1" />`
}

function renderText(text: MindmapText, scale: number, offsetX: number, offsetY: number) {
  const value = text.text.trim()
  if (!value) {
    return ''
  }

  return `<text x="${formatNumber(text.x * scale + offsetX)}" y="${formatNumber(
    text.y * scale + offsetY + Math.max(12, text.fontSize * scale),
  )}" fill="${escapeAttribute(text.color)}" font-size="${formatNumber(
    Math.max(12, text.fontSize * scale),
  )}" font-family="Inter, Microsoft YaHei, sans-serif">${escapeText(value)}</text>`
}

function getSnapshotBounds(snapshot: MindmapSnapshot): Bounds {
  const bounds: Bounds[] = [
    ...snapshot.notes.map((note) => boxBounds(note.x, note.y, note.w, note.h)),
    ...snapshot.texts.map((text) => boxBounds(text.x, text.y, text.w, text.h)),
    ...snapshot.images.map((image) => boxBounds(image.x, image.y, image.w, image.h)),
    ...snapshot.shapes.map((shape) => boxBounds(shape.x, shape.y, shape.w, shape.h)),
    ...snapshot.strokes
      .map((stroke) => strokeBounds(stroke))
      .filter((value): value is Bounds => value !== null),
  ]

  if (bounds.length === 0) {
    return {
      left: 0,
      top: 0,
      right: previewWidth,
      bottom: previewHeight,
    }
  }

  return {
    left: Math.min(...bounds.map((item) => item.left)),
    top: Math.min(...bounds.map((item) => item.top)),
    right: Math.max(...bounds.map((item) => item.right)),
    bottom: Math.max(...bounds.map((item) => item.bottom)),
  }
}

function boxBounds(x: number, y: number, width: number, height: number): Bounds {
  return {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  }
}

function strokeBounds(stroke: MindmapStroke): Bounds | null {
  if (stroke.points.length === 0) {
    return null
  }

  return {
    left: Math.min(...stroke.points.map((point) => point.x)),
    top: Math.min(...stroke.points.map((point) => point.y)),
    right: Math.max(...stroke.points.map((point) => point.x)),
    bottom: Math.max(...stroke.points.map((point) => point.y)),
  }
}

function centerOfBox(x: number, y: number, width: number, height: number): ConnectableCenter {
  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

function escapeAttribute(value: string) {
  return value.replace(/"/g, '&quot;')
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatNumber(value: number) {
  return Number(value.toFixed(2))
}
