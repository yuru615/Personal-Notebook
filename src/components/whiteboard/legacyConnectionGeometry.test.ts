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
})
