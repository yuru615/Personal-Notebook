import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles/index.css', 'utf8')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('table control layout', () => {
  it('uses hover-only controls without reserving fixed table whitespace', () => {
    expect(cssRule('.table-stage')).not.toContain('padding:')
    expect(cssRule('.table-column-controls')).toContain('opacity: 0;')
    expect(cssRule('.table-column-controls')).toContain('pointer-events: none;')
    expect(cssRule('.table-row-controls')).toContain('opacity: 0;')
    expect(cssRule('.table-add-column-cell')).toContain('opacity: 0;')
    expect(cssRule('.table-add-row-cell')).toContain('opacity: 0;')
    expect(cssRule('.table-block:hover .table-column-controls')).toContain('opacity: 1;')
    expect(cssRule('.table-block:hover .table-row-controls')).toContain('opacity: 1;')
  })

  it('does not reserve visible header or gutter space inside the data grid', () => {
    expect(cssRule('.table-grid')).toContain('grid-template-columns:')
    expect(cssRule('.table-grid')).toContain(
      'repeat(var(--table-column-count), minmax(120px, 1fr))',
    )
    expect(cssRule('.table-grid')).not.toContain('var(--table-control-size)')
  })

  it('keeps the table at least as wide as its available body area after a narrow column resize', () => {
    expect(cssRule('.table-block')).toContain('width: 100%;')
    expect(cssRule('.table-scroll')).toContain('width: 100%;')
    expect(cssRule('.table-stage')).toContain('min-width: 100%;')
    expect(cssRule('.table-grid')).toContain('min-width: 100%;')
    expect(cssRule('.table-stage')).toContain('width: 100%;')
    expect(cssRule('.table-grid')).toContain('width: 100%;')
  })

  it('does not turn the grid border into horizontal overflow at full body width', () => {
    expect(cssRule('.table-grid')).toContain('box-sizing: border-box;')
  })

  it('supports compact content-width tables with horizontal overflow when needed', () => {
    expect(cssRule('.table-block.table-layout-content')).toContain('width: fit-content;')
    expect(cssRule('.table-block.table-layout-content .table-scroll')).toContain('width: fit-content;')
    expect(cssRule('.table-block.table-layout-content .table-grid')).toContain('width: max-content;')
  })

  it('keeps overlay controls above the table content', () => {
    expect(cssRule('.table-column-controls')).toContain('z-index: 4')
    expect(cssRule('.table-row-controls')).toContain('z-index: 4')
    expect(cssRule('.table-add-column-cell')).toContain('z-index: 3')
    expect(cssRule('.table-add-row-cell')).toContain('z-index: 3')
  })

  it('keeps the horizontal table scroll from creating an unnecessary vertical scrollbar', () => {
    expect(cssRule('.table-scroll')).toContain('overflow-y: hidden;')
  })

  it('does not reserve a permanent top control strip inside the table stage', () => {
    expect(cssRule('.table-stage')).not.toContain('padding:')
  })

  it('keeps the column control lane as a hover-only overlay', () => {
    expect(cssRule('.table-column-controls')).toContain('top: 0;')
    expect(cssRule('.table-column-controls')).toContain('left: 0;')
    expect(cssRule('.table-column-controls')).not.toContain('transform:')
    expect(cssRule('.table-column-controls')).toContain('pointer-events: none;')
    expect(cssRule('.table-column-controls')).toContain('background: transparent;')
  })

  it('keeps row and add-column controls on the table edge without a reserved strip', () => {
    expect(cssRule('.table-row-controls')).toContain('top: 0;')
    expect(cssRule('.table-row-controls')).toContain('background: transparent;')
    expect(cssRule('.table-add-column-cell')).toContain('top: 0;')
  })

  it('uses a dedicated active state for the focused row or column strip cell', () => {
    expect(cssRule('.table-control-cell-active')).toContain('background: rgba(55, 53, 47, 0.06);')
  })

  it('keeps row and column menu triggers as visible as the edge add controls', () => {
    expect(cssRule('.table-control-trigger')).toContain('color: #b8b7b3;')
    expect(cssRule('.table-control-trigger')).toContain('background: transparent;')
    expect(cssRule('.table-control-trigger:hover')).toContain('background: #f3f2ef;')
    expect(cssRule('.table-control-trigger:hover')).toContain('color: #37352f;')
    expect(cssRule('.table-control-trigger:hover')).toContain('box-shadow: inset 0 0 0 1px #e2e0dc;')
    expect(styles).not.toContain('.table-block:hover .table-control-cell')
    expect(styles).toContain('.table-block:hover .table-control-trigger')
  })

  it('stretches edge add buttons to fill the full row or column lane', () => {
    expect(cssRule('.table-add-column-cell .table-edge-add')).toContain('width: 100%;')
    expect(cssRule('.table-add-column-cell .table-edge-add')).toContain('height: 100%;')
    expect(cssRule('.table-edge-add-row')).toContain('width: 100%;')
    expect(cssRule('.table-edge-add-row')).toContain('height: 100%;')
  })

  it('keeps selected cells and multiline content lightweight without changing grid dimensions', () => {
    expect(cssRule('.table-data-cell-selected::after')).toContain('border: 1px solid var(--app-accent-border);')
    expect(cssRule('.table-data-cell-selected::after')).toContain('background: var(--app-accent-soft);')
    expect(styles).toContain('white-space: pre-wrap;')
    expect(styles).toContain('overflow: hidden;')
    expect(styles).toContain('resize: none;')
  })

  it('positions measured menu controls over the real table cell rectangles', () => {
    expect(styles).toContain('.table-column-controls.table-controls-measured')
    expect(styles).toContain('.table-row-controls.table-controls-measured')
    expect(styles).toContain('display: block;')
    expect(cssRule('.table-column-controls.table-controls-pending')).toContain('visibility: hidden;')
    expect(cssRule('.table-column-controls.table-controls-measured .table-column-control-cell')).toContain(
      'position: absolute;',
    )
    expect(cssRule('.table-row-controls.table-controls-measured .table-row-control-cell')).toContain(
      'position: absolute;',
    )
  })

  it('uses centered content and a clearly distinct header background by default', () => {
    expect(cssRule('.table-data-cell')).toContain('align-items: center;')
    expect(cssRule('.table-data-cell-header')).toContain('background: #f0efec;')
  })

  it('keeps resize handles above menu triggers with an easy-to-hit boundary target', () => {
    expect(cssRule('.table-resize-handle')).toContain('z-index: 5;')
    expect(cssRule('.table-column-resize-handle')).toContain('width: 10px;')
    expect(cssRule('.table-row-resize-handle')).toContain('height: 10px;')
  })

  it('keeps the final resize handles inside the table bounds', () => {
    expect(cssRule('.table-column-control-cell:last-child .table-column-resize-handle')).toContain(
      'right: 0;',
    )
    expect(cssRule('.table-row-control-cell:last-child .table-row-resize-handle')).toContain('bottom: 0;')
  })
})
