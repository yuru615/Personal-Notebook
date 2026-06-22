export type WhiteboardShapeType = 'rect' | 'ellipse' | 'diamond' | 'triangle'
export type WhiteboardLineMode = 'straight' | 'curve'
export type WhiteboardConnectionSide = 'n' | 'e' | 's' | 'w'
export type WhiteboardConnectionMarker = 'none' | 'arrow' | 'bar' | 'dot' | 'circle' | 'diamond'

export interface WhiteboardConnectionAnchor {
  x: number
  y: number
}

export interface WhiteboardCamera {
  x: number
  y: number
  scale: number
}

export interface WhiteboardNote {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  z: number
}

export interface WhiteboardShape {
  id: string
  type: WhiteboardShapeType
  x: number
  y: number
  w: number
  h: number
  color: string
  size: number
  text: string
  z: number
}

export interface WhiteboardStrokePoint {
  x: number
  y: number
}

export interface WhiteboardStroke {
  id: string
  color: string
  size: number
  points: WhiteboardStrokePoint[]
}

export interface WhiteboardConnection {
  id: string
  from: string
  to: string
  fromSide: WhiteboardConnectionSide | null
  toSide?: WhiteboardConnectionSide | null
  fromAnchor?: WhiteboardConnectionAnchor | null
  toAnchor?: WhiteboardConnectionAnchor | null
  fromMarker?: WhiteboardConnectionMarker | null
  toMarker?: WhiteboardConnectionMarker | null
  mode: WhiteboardLineMode
  color: string
  size: number
}

export interface WhiteboardText {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: string
  fontStyle: 'normal' | 'italic'
  autoSize: boolean
  z: number
}

export interface WhiteboardImage {
  id: string
  x: number
  y: number
  w: number
  h: number
  src: string
  name: string
  z: number
}

export interface WhiteboardSnapshot {
  camera: WhiteboardCamera
  color: string
  strokeSize: number
  textFontFamily: string
  textFontSize: number
  lineMode: WhiteboardLineMode
  lineStartMarker?: WhiteboardConnectionMarker
  lineEndMarker?: WhiteboardConnectionMarker
  shapeType: WhiteboardShapeType
  shapes: WhiteboardShape[]
  strokes: WhiteboardStroke[]
  connections: WhiteboardConnection[]
  notes: WhiteboardNote[]
  texts: WhiteboardText[]
  images: WhiteboardImage[]
}

interface SimplifiedWhiteboardShapeElement {
  id: string
  type: 'rect' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
  stroke: string
  fill: string
}

interface SimplifiedWhiteboardTextElement {
  id: string
  type: 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  color: string
  fontSize: number
}

interface SimplifiedWhiteboardArrowElement {
  id: string
  type: 'arrow'
  x: number
  y: number
  width: number
  height: number
  stroke: string
}

type SimplifiedWhiteboardElement =
  | SimplifiedWhiteboardShapeElement
  | SimplifiedWhiteboardTextElement
  | SimplifiedWhiteboardArrowElement

interface SimplifiedWhiteboardSnapshot {
  version: 1
  elements: SimplifiedWhiteboardElement[]
  viewport: {
    x: number
    y: number
    zoom: number
  }
}

const defaultSnapshot: WhiteboardSnapshot = {
  camera: {
    x: 0,
    y: 0,
    scale: 1,
  },
  color: '#17202a',
  strokeSize: 6,
  textFontFamily: 'Inter, Segoe UI, sans-serif',
  textFontSize: 24,
  lineMode: 'straight',
  lineStartMarker: 'dot',
  lineEndMarker: 'arrow',
  shapeType: 'rect',
  shapes: [],
  strokes: [],
  connections: [],
  notes: [],
  texts: [],
  images: [],
}

export function createEmptyBoardSnapshot(): WhiteboardSnapshot {
  return structuredClone(defaultSnapshot)
}

export function normalizeWhiteboardSnapshot(value: unknown): WhiteboardSnapshot {
  if (isLegacyWhiteboardSnapshot(value)) {
    return structuredClone(value)
  }

  if (isSimplifiedWhiteboardSnapshot(value)) {
    return convertSimplifiedSnapshot(value)
  }

  return createEmptyBoardSnapshot()
}

export function isWhiteboardSnapshot(
  value: unknown,
): value is WhiteboardSnapshot | SimplifiedWhiteboardSnapshot {
  return isLegacyWhiteboardSnapshot(value) || isSimplifiedWhiteboardSnapshot(value)
}

function isLegacyWhiteboardSnapshot(value: unknown): value is WhiteboardSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<WhiteboardSnapshot>
  return (
    isCamera(snapshot.camera) &&
    typeof snapshot.color === 'string' &&
    typeof snapshot.strokeSize === 'number' &&
    typeof snapshot.textFontFamily === 'string' &&
    typeof snapshot.textFontSize === 'number' &&
    isLineMode(snapshot.lineMode) &&
    isShapeType(snapshot.shapeType) &&
    Array.isArray(snapshot.shapes) &&
    Array.isArray(snapshot.strokes) &&
    Array.isArray(snapshot.connections) &&
    Array.isArray(snapshot.notes) &&
    Array.isArray(snapshot.texts) &&
    Array.isArray(snapshot.images)
  )
}

function isSimplifiedWhiteboardSnapshot(value: unknown): value is SimplifiedWhiteboardSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<SimplifiedWhiteboardSnapshot>
  return (
    snapshot.version === 1 &&
    Array.isArray(snapshot.elements) &&
    !!snapshot.viewport &&
    typeof snapshot.viewport.x === 'number' &&
    typeof snapshot.viewport.y === 'number' &&
    typeof snapshot.viewport.zoom === 'number'
  )
}

function isCamera(value: unknown): value is WhiteboardCamera {
  if (!value || typeof value !== 'object') {
    return false
  }

  const camera = value as Partial<WhiteboardCamera>
  return (
    typeof camera.x === 'number' &&
    typeof camera.y === 'number' &&
    typeof camera.scale === 'number'
  )
}

function isLineMode(value: unknown): value is WhiteboardLineMode {
  return value === 'straight' || value === 'curve'
}

function isShapeType(value: unknown): value is WhiteboardShapeType {
  return value === 'rect' || value === 'ellipse' || value === 'diamond' || value === 'triangle'
}

function convertSimplifiedSnapshot(snapshot: SimplifiedWhiteboardSnapshot): WhiteboardSnapshot {
  const nextSnapshot = createEmptyBoardSnapshot()
  nextSnapshot.camera = {
    x: snapshot.viewport.x,
    y: snapshot.viewport.y,
    scale: snapshot.viewport.zoom,
  }
  nextSnapshot.shapes = snapshot.elements
    .filter(
      (element): element is SimplifiedWhiteboardShapeElement =>
        element.type === 'rect' || element.type === 'ellipse',
    )
    .map((element, index) => ({
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      w: element.width,
      h: element.height,
      color: element.stroke,
      size: 3,
      text: '',
      z: index + 1,
    }))
  nextSnapshot.texts = snapshot.elements
    .filter(
      (element): element is SimplifiedWhiteboardTextElement => element.type === 'text',
    )
    .map((element, index) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      w: element.width,
      h: element.height,
      text: element.text,
      color: element.color,
      fontFamily: nextSnapshot.textFontFamily,
      fontSize: element.fontSize,
      fontWeight: '400',
      fontStyle: 'normal',
      autoSize: false,
      z: nextSnapshot.shapes.length + index + 1,
    }))
  nextSnapshot.strokes = snapshot.elements
    .filter(
      (element): element is SimplifiedWhiteboardArrowElement => element.type === 'arrow',
    )
    .map((element) => ({
      id: element.id,
      color: element.stroke,
      size: 3,
      points: [
        { x: element.x, y: element.y },
        { x: element.x + element.width, y: element.y + element.height },
      ],
    }))

  return nextSnapshot
}
