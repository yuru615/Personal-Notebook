import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function readSource(path: string) {
  return readFileSync(join(sourceRoot, path), 'utf8')
}

describe('App code splitting', () => {
  it('keeps data table route modules out of the static app import graph', () => {
    const appSource = readSource('app/App.tsx')

    expect(appSource).not.toContain(
      "import { DataTablePage } from '../components/dataTable/DataTablePage'",
    )
    expect(appSource).toContain("const DataTablePage = lazy(() =>")
  })

  it('keeps inline data table modules out of the static editor import graph', () => {
    const editorSource = readSource('components/editor/BlockEditor.tsx')

    expect(editorSource).not.toContain(
      "import { EmbeddedDataTableBlock } from './blocks/EmbeddedDataTableBlock'",
    )
    expect(editorSource).toContain("const EmbeddedDataTableBlock = lazy(() =>")
  })

  it('keeps whiteboard canvas modules out of the static app import graph', () => {
    const appSource = readSource('app/App.tsx')

    expect(appSource).not.toContain(
      "import { WhiteboardCanvas } from '../components/whiteboard/WhiteboardCanvas'",
    )
    expect(appSource).toContain("const WhiteboardCanvas = lazy(() =>")
  })
})
