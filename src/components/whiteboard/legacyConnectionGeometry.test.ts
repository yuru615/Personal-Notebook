import { describe, expect, it } from 'vitest'
import legacyAppScript from './legacy/app.js?raw'

function extractFunction(source: string, name: string): string {
  const signature = `function ${name}(`
  const start = source.indexOf(signature)
  if (start === -1) {
    throw new Error(`Missing function: ${name}`)
  }

  const bodyStart = source.indexOf('{', start)
  if (bodyStart === -1) {
    throw new Error(`Missing function body: ${name}`)
  }

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  throw new Error(`Unclosed function body: ${name}`)
}

function loadConnectionPathGeometry(): (
  start: { x: number; y: number },
  end: { x: number; y: number },
  mode: string,
  fromSide?: string | null,
  toSide?: string | null,
) => {
  start: { x: number; y: number }
  end: { x: number; y: number }
  control1?: { x: number; y: number }
  control2?: { x: number; y: number }
} {
  const factory = new Function(
    [
      extractFunction(legacyAppScript, 'clamp'),
      extractFunction(legacyAppScript, 'sideVector'),
      extractFunction(legacyAppScript, 'connectionPathGeometry'),
      'return connectionPathGeometry;',
    ].join('\n\n'),
  )

  return factory() as ReturnType<typeof loadConnectionPathGeometry>
}

function loadConnectionHitTest() {
  const connectionPathGeometry = loadConnectionPathGeometry()
  const factory = new Function(
    'findConnectable',
    'connectionGeometry',
    'distanceToSegment',
    'cubicPoint',
    'CONNECTION_HIT_PAD',
    [
      extractFunction(legacyAppScript, 'connectionHitTest'),
      'return connectionHitTest;',
    ].join('\n\n'),
  )

  return factory(
    () => ({ id: 'object' }),
    () => connectionPathGeometry({ x: 0, y: 0 }, { x: 200, y: 400 }, 'curve', 'e', 'w'),
    new Function(
      [extractFunction(legacyAppScript, 'clamp'), extractFunction(legacyAppScript, 'distanceToSegment'), 'return distanceToSegment;'].join('\n\n'),
    )(),
    new Function(`${extractFunction(legacyAppScript, 'cubicPoint')}\nreturn cubicPoint;`)(),
    12,
  ) as (
    connection: { from: string; to: string; mode: string; size: number },
    point: { x: number; y: number },
    threshold: number,
  ) => boolean
}

function loadConnectionGeometry() {
  const factory = new Function(
    [
      extractFunction(legacyAppScript, 'clamp'),
      extractFunction(legacyAppScript, 'normalizeSide'),
      extractFunction(legacyAppScript, 'normalizeAnchor'),
      extractFunction(legacyAppScript, 'noteCenter'),
      extractFunction(legacyAppScript, 'sidePoint'),
      extractFunction(legacyAppScript, 'resolveConnectionSide'),
      extractFunction(legacyAppScript, 'resolveObjectAnchor'),
      extractFunction(legacyAppScript, 'edgePoint'),
      extractFunction(legacyAppScript, 'sideVector'),
      extractFunction(legacyAppScript, 'connectionPathGeometry'),
      extractFunction(legacyAppScript, 'connectionGeometry'),
      'return connectionGeometry;',
    ].join('\n\n'),
  )

  return factory() as (
    connection: Record<string, unknown>,
    from: { x: number; y: number; w: number; h: number },
    to: { x: number; y: number; w: number; h: number },
  ) => { start: { x: number; y: number }; end: { x: number; y: number } }
}

describe('legacy connection geometry', () => {
  it('keeps fixed left-to-right tangents even when endpoints swap vertically', () => {
    const connectionPathGeometry = loadConnectionPathGeometry()
    const start = { x: 100, y: 200 }

    const above = connectionPathGeometry(start, { x: 180, y: 0 }, 'curve', 'e', 'w')
    const below = connectionPathGeometry(start, { x: 180, y: 400 }, 'curve', 'e', 'w')

    for (const geometry of [above, below]) {
      expect(geometry.control1).toEqual({
        x: expect.any(Number),
        y: geometry.start.y,
      })
      expect(geometry.control2).toEqual({
        x: expect.any(Number),
        y: geometry.end.y,
      })
      expect(geometry.control1?.x ?? 0).toBeGreaterThan(geometry.start.x)
      expect(geometry.control2?.x ?? 0).toBeLessThan(geometry.end.x)
    }
  })

  it('keeps a curve selectable from the direct path between its endpoints', () => {
    const connectionHitTest = loadConnectionHitTest()

    expect(
      connectionHitTest(
        { from: 'from', to: 'to', mode: 'curve', size: 3 },
        { x: 50, y: 100 },
        6,
      ),
    ).toBe(true)
  })

  it('uses explicit anchors as the rendered connection endpoints when sides are null', () => {
    const connectionGeometry = loadConnectionGeometry()

    expect(
      connectionGeometry(
        {
          from: 'from',
          to: 'to',
          fromSide: null,
          toSide: null,
          fromAnchor: { x: 0.25, y: 1 },
          toAnchor: { x: 0.75, y: 0 },
          mode: 'straight',
        },
        { x: 20, y: 40, w: 200, h: 100 },
        { x: 500, y: 300, w: 160, h: 120 },
      ),
    ).toEqual({
      start: { x: 70, y: 140 },
      end: { x: 620, y: 300 },
    })
  })
})
