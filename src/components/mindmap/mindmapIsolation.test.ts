import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('mindmap runtime isolation', () => {
  it('does not import the whiteboard runtime from the forked files', () => {
    const files = [
      'src/components/mindmap/MindmapCanvas.tsx',
      'src/components/mindmap/MindmapPage.tsx',
      'src/components/mindmap/mindmapModel.ts',
      'src/components/mindmap/mindmapPreview.ts',
      'src/components/mindmap/mindmapDocument.ts',
    ]

    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toContain('../whiteboard/')
      expect(text).not.toContain('./whiteboard')
    }
  })
})
