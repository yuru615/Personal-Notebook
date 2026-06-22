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

describe('page outline layout', () => {
  it('pins the outline to the viewport right edge instead of the content grid', () => {
    expect(cssRule('.page-outline')).toContain('position: fixed;')
    expect(cssRule('.page-outline')).toContain('right: var(--page-panel-inline-padding);')
    expect(cssRule('.page-outline')).toContain('width: var(--page-outline-width);')
  })

  it('keeps the page content width independent from the outline lane', () => {
    expect(cssRule('.page-with-outline')).not.toContain('grid-template-columns')
    expect(cssRule('.page-content')).toContain('max-width:')
    expect(cssRule('.page-panel')).toContain('--page-content-available-width:')
    expect(cssRule('.page-panel')).toContain('var(--page-outline-width)')
    expect(cssRule('.page-panel')).toContain('var(--page-outline-gap)')
  })

  it('supports an adaptive page content width mode', () => {
    expect(cssRule('.page-content-adaptive')).toContain('max-width: var(--page-content-available-width);')
  })

  it('supports a small text page mode', () => {
    expect(cssRule('.page-content-small-text')).toContain('--editor-font-size: 14px;')
    expect(cssRule('.page-content-small-text')).toContain('--editor-line-height: 1.45;')
    expect(cssRule('.page-content-small-text')).toContain('--editor-line-box: 24px;')
  })

  it('leaves enough scroll room below the editor for comfortable continuous typing', () => {
    expect(cssRule('.editor-surface')).toContain('padding-bottom: 300px;')
  })

  it('supports page font modes', () => {
    expect(cssRule('.page-content-font-default')).toContain('font-family:')
    expect(cssRule('.page-content-font-serif')).toContain('font-family:')
    expect(cssRule('.page-content-font-mono')).toContain('font-family:')
  })

  it('supports hiding the outline without keeping the reserved outline width', () => {
    expect(cssRule('.page-with-outline-hidden')).toContain('--page-content-available-width: calc(')
    expect(cssRule('.page-with-outline-hidden')).not.toContain('var(--page-outline-width)')
  })
})
