export type MindmapShapeType = 'rect' | 'ellipse' | 'diamond' | 'triangle'
export type MindmapLineMode = 'straight' | 'curve'
export type MindmapConnectionSide = 'n' | 'e' | 's' | 'w'
export type MindmapConnectionMarker = 'none' | 'arrow' | 'bar' | 'dot' | 'circle' | 'diamond'

export interface MindmapConnectionAnchor {
  x: number
  y: number
}

export interface MindmapCamera {
  x: number
  y: number
  scale: number
}

export interface MindmapNote {
  id: string
  x: number
  y: number
  w: number
  h: number
  text: string
  color: string
  z: number
}

export interface MindmapShape {
  id: string
  type: MindmapShapeType
  x: number
  y: number
  w: number
  h: number
  color: string
  size: number
  text: string
  z: number
}

export interface MindmapStrokePoint {
  x: number
  y: number
}

export interface MindmapStroke {
  id: string
  color: string
  size: number
  points: MindmapStrokePoint[]
}

export interface MindmapConnection {
  id: string
  from: string
  to: string
  fromSide: MindmapConnectionSide | null
  toSide?: MindmapConnectionSide | null
  fromAnchor?: MindmapConnectionAnchor | null
  toAnchor?: MindmapConnectionAnchor | null
  fromMarker?: MindmapConnectionMarker | null
  toMarker?: MindmapConnectionMarker | null
  mode: MindmapLineMode
  color: string
  size: number
}

export interface MindmapText {
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

export interface MindmapImage {
  id: string
  x: number
  y: number
  w: number
  h: number
  src: string
  name: string
  z: number
}

export interface MindmapSnapshot {
  camera: MindmapCamera
  color: string
  strokeSize: number
  textFontFamily: string
  textFontSize: number
  lineMode: MindmapLineMode
  lineStartMarker?: MindmapConnectionMarker
  lineEndMarker?: MindmapConnectionMarker
  shapeType: MindmapShapeType
  shapes: MindmapShape[]
  strokes: MindmapStroke[]
  connections: MindmapConnection[]
  notes: MindmapNote[]
  texts: MindmapText[]
  images: MindmapImage[]
}

interface SimplifiedMindmapShapeElement {
  id: string
  type: 'rect' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
  stroke: string
  fill: string
}

interface SimplifiedMindmapTextElement {
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

interface SimplifiedMindmapArrowElement {
  id: string
  type: 'arrow'
  x: number
  y: number
  width: number
  height: number
  stroke: string
}

type SimplifiedMindmapElement =
  | SimplifiedMindmapShapeElement
  | SimplifiedMindmapTextElement
  | SimplifiedMindmapArrowElement

interface SimplifiedMindmapSnapshot {
  version: 1
  elements: SimplifiedMindmapElement[]
  viewport: {
    x: number
    y: number
    zoom: number
  }
}

const defaultSnapshot: MindmapSnapshot = {
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

export function createEmptyMindmapSnapshot(): MindmapSnapshot {
  return structuredClone(defaultSnapshot)
}

export function normalizeMindmapSnapshot(value: unknown): MindmapSnapshot {
  if (isLegacyMindmapSnapshot(value)) {
    return structuredClone(value)
  }

  if (isSimplifiedMindmapSnapshot(value)) {
    return convertSimplifiedSnapshot(value)
  }

  return createEmptyMindmapSnapshot()
}

export function isMindmapSnapshot(
  value: unknown,
): value is MindmapSnapshot | SimplifiedMindmapSnapshot {
  return isLegacyMindmapSnapshot(value) || isSimplifiedMindmapSnapshot(value)
}

function isLegacyMindmapSnapshot(value: unknown): value is MindmapSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<MindmapSnapshot>
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

function isSimplifiedMindmapSnapshot(value: unknown): value is SimplifiedMindmapSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<SimplifiedMindmapSnapshot>
  return (
    snapshot.version === 1 &&
    Array.isArray(snapshot.elements) &&
    !!snapshot.viewport &&
    typeof snapshot.viewport.x === 'number' &&
    typeof snapshot.viewport.y === 'number' &&
    typeof snapshot.viewport.zoom === 'number'
  )
}

function isCamera(value: unknown): value is MindmapCamera {
  if (!value || typeof value !== 'object') {
    return false
  }

  const camera = value as Partial<MindmapCamera>
  return (
    typeof camera.x === 'number' &&
    typeof camera.y === 'number' &&
    typeof camera.scale === 'number'
  )
}

function isLineMode(value: unknown): value is MindmapLineMode {
  return value === 'straight' || value === 'curve'
}

function isShapeType(value: unknown): value is MindmapShapeType {
  return value === 'rect' || value === 'ellipse' || value === 'diamond' || value === 'triangle'
}

function convertSimplifiedSnapshot(snapshot: SimplifiedMindmapSnapshot): MindmapSnapshot {
  const nextSnapshot = createEmptyMindmapSnapshot()
  nextSnapshot.camera = {
    x: snapshot.viewport.x,
    y: snapshot.viewport.y,
    scale: snapshot.viewport.zoom,
  }
  nextSnapshot.shapes = snapshot.elements
    .filter(
      (element): element is SimplifiedMindmapShapeElement =>
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
      (element): element is SimplifiedMindmapTextElement => element.type === 'text',
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
      (element): element is SimplifiedMindmapArrowElement => element.type === 'arrow',
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
