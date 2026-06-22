import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles/index.css', 'utf8')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('table control layout', () => {
  it('does not reserve visible header or gutter space inside the data grid', () => {
    expect(cssRule('.table-grid')).toContain('grid-template-columns:')
    expect(cssRule('.table-grid')).toContain(
      'repeat(var(--table-column-count), minmax(120px, 1fr))',
    )
    expect(cssRule('.table-grid')).not.toContain('var(--table-control-size)')
  })

  it('keeps overlay controls above the table content', () => {
    expect(cssRule('.table-column-controls')).toContain('z-index: 3')
    expect(cssRule('.table-row-controls')).toContain('z-index: 3')
    expect(cssRule('.table-add-column-cell')).toContain('z-index: 3')
    expect(cssRule('.table-add-row-cell')).toContain('z-index: 3')
  })

  it('reserves a real top control strip inside the table stage', () => {
    expect(cssRule('.table-stage')).toContain(
      'padding: var(--table-control-size) var(--table-control-size) var(--table-control-size)',
    )
  })

  it('keeps the column control lane inside the reserved top strip', () => {
    expect(cssRule('.table-column-controls')).toContain('top: 0;')
    expect(cssRule('.table-column-controls')).toContain('left: var(--table-control-size);')
    expect(cssRule('.table-column-controls')).not.toContain('transform:')
    expect(cssRule('.table-column-controls')).not.toContain('pointer-events: none;')
    expect(cssRule('.table-column-controls')).toContain('background: #fbfbfa;')
  })

  it('starts the row and add-column lanes below the top control strip', () => {
    expect(cssRule('.table-row-controls')).toContain('top: var(--table-control-size);')
    expect(cssRule('.table-row-controls')).toContain('background: #fbfbfa;')
    expect(cssRule('.table-add-column-cell')).toContain('top: var(--table-control-size);')
  })

  it('uses a dedicated active state for the focused row or column strip cell', () => {
    expect(cssRule('.table-control-cell-active')).toContain('background: #f3f2ef;')
  })

  it('stretches edge add buttons to fill the full row or column lane', () => {
    expect(cssRule('.table-add-column-cell .table-edge-add')).toContain('width: 100%;')
    expect(cssRule('.table-add-column-cell .table-edge-add')).toContain('height: 100%;')
    expect(cssRule('.table-edge-add-row')).toContain('width: 100%;')
    expect(cssRule('.table-edge-add-row')).toContain('height: 100%;')
  })
})
