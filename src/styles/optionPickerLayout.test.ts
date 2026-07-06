import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appStyles = readFileSync('src/styles/index.css', 'utf8')
const dataTableStyles = readFileSync('src/components/dataTable/styles.css', 'utf8')

function cssRule(styles: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('option picker layout', () => {
  it('gives the shared creatable picker a distinct input area and stacked option list', () => {
    const picker = cssRule(appStyles, '.creatable-option-picker')
    const input = cssRule(appStyles, '.creatable-option-picker-input')
    const list = cssRule(appStyles, '.creatable-option-picker-list')

    expect(picker).toContain('display: grid;')
    expect(picker).toContain('gap: 8px;')
    expect(input).toContain('min-height: 34px;')
    expect(input).toContain('border: 1px solid rgba(55, 53, 47, 0.12);')
    expect(input).toContain('background: #fbfbfa;')
    expect(list).toContain('display: grid;')
    expect(list).toContain('gap: 4px;')
    expect(list).toContain('max-height: min(280px, 40vh);')
  })

  it('distinguishes the create action and selected option states', () => {
    expect(appStyles).toContain('.creatable-option-picker-option,')
    expect(appStyles).toContain('min-height: 36px;')
    expect(appStyles).toContain('border-radius: 8px;')
    expect(appStyles).toContain(
      '.creatable-option-picker-option.is-selected {\n  box-shadow: inset 0 0 0 1px rgba(55, 53, 47, 0.08);',
    )
    expect(appStyles).toContain(
      '.creatable-option-picker-create {\n  background: rgba(35, 131, 226, 0.08);',
    )
    expect(appStyles).toContain('.creatable-option-picker-create {\n  background: rgba(35, 131, 226, 0.08);\n  color: #1d4ed8;')
  })

  it('supports option rows with a swatch and delete action', () => {
    const row = cssRule(appStyles, '.creatable-option-picker-row')
    const main = cssRule(appStyles, '.creatable-option-picker-option-main')
    const color = cssRule(appStyles, '.creatable-option-picker-color')
    const deleteButton = cssRule(appStyles, '.creatable-option-picker-delete')

    expect(row).toContain('grid-template-columns: minmax(0, 1fr) auto;')
    expect(main).toContain('padding-right: 8px;')
    expect(color).toContain('width: 10px;')
    expect(color).toContain('height: 10px;')
    expect(deleteButton).toContain('width: 28px;')
    expect(deleteButton).toContain('height: 28px;')
  })

  it('keeps the data-table option popover a little airier around the shared picker', () => {
    const popover = cssRule(dataTableStyles, '.database-cell-popover--options')
    const list = cssRule(dataTableStyles, '.cell-option-list')
    const clearRow = cssRule(dataTableStyles, '.cell-option-item')

    expect(popover).toContain('padding: 10px;')
    expect(list).toContain('gap: 8px;')
    expect(clearRow).toContain('min-height: 34px;')
    expect(clearRow).toContain('padding: 0 10px;')
  })
})
