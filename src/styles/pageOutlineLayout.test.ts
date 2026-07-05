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
    expect(cssRule('.page-body-with-outline')).toContain('position: relative;')
    expect(cssRule('.page-body-with-outline-has-outline')).toContain('display: grid;')
    expect(cssRule('.page-body-with-outline-has-outline')).toContain(
      'minmax(0, 1fr)',
    )
    expect(cssRule('.page-body-with-outline-has-outline')).toContain('width: 100%;')
    expect(cssRule('.page-body-with-outline-has-outline')).not.toContain(
      'calc(760px + var(--page-outline-gap) + var(--page-outline-width))',
    )
    expect(cssRule('.page-body-with-outline-has-outline:has(> .page-content-adaptive)')).toContain(
      'width: 100%;',
    )
    expect(cssRule(".page-body-with-outline-has-outline > [class~='page-content']")).toContain(
      'grid-column: 1;',
    )
    expect(cssRule(".page-body-with-outline-has-outline > [class~='page-content']")).toContain('grid-row: 1;')
    expect(cssRule('.page-outline')).toContain('position: sticky;')
    expect(cssRule('.page-outline')).toContain('top: 68px;')
    expect(cssRule('.page-outline')).toContain('grid-column: 3;')
    expect(cssRule('.page-outline')).toContain('grid-row: 1;')
    expect(cssRule('.page-outline')).toContain('width: var(--page-outline-width);')
    expect(cssRule('.page-outline-panel')).not.toContain('position: sticky;')
    expect(cssRule('.page-outline-panel')).toContain('scrollbar-width: none;')
    expect(cssRule('.page-outline-panel')).toContain('-ms-overflow-style: none;')
    expect(cssRule('.page-outline-panel::-webkit-scrollbar')).toContain('display: none;')
  })

  it('keeps the page content width independent from the outline lane', () => {
    expect(cssRule('.page-with-outline')).toContain('width: min(100%, var(--page-content-available-width));')
    expect(cssRule('.page-with-outline')).toContain('margin: 0 auto;')
    expect(cssRule('.page-with-outline-has-outline')).toContain('width: min(')
    expect(cssRule('.page-with-outline-has-outline')).toContain(
      'calc(var(--page-content-available-width) + var(--page-outline-gap) + var(--page-outline-width))',
    )
    expect(cssRule('.page-route-topbar')).toContain('width: 100%;')
    expect(cssRule('.page-route-topbar')).toContain('position: sticky;')
    expect(cssRule('.page-route-topbar')).toContain('top: 0;')
    expect(cssRule('.page-route-topbar')).toContain('min-height: 44px;')
    expect(cssRule('.page-route-topbar')).toContain('margin-top: calc(-1 * var(--page-panel-block-padding-top));')
    expect(cssRule('.page-route-topbar')).toContain('padding: 6px 0 12px;')
    expect(cssRule('.page-route-topbar')).toContain('justify-content: space-between;')
    expect(cssRule('.page-route-topbar')).toContain('flex-wrap: nowrap;')
    expect(cssRule('.page-route-topbar::before')).toContain(
      'left: calc(-1 * var(--page-panel-inline-padding));',
    )
    expect(cssRule('.page-route-topbar::before')).toContain(
      'right: calc(-1 * var(--page-panel-inline-padding));',
    )
    expect(cssRule('.page-route-topbar::before')).toContain('background: #fff;')
    expect(cssRule('.page-route-topbar::before')).toContain('box-shadow: none;')
    expect(cssRule('.page-route-topbar-scrolled::before')).toContain('box-shadow:')
    expect(cssRule('.page-route-cover')).toContain('width: 100%;')
    expect(cssRule('.page-content')).toContain('max-width:')
    expect(cssRule('.page-content')).toContain('margin: 0 auto;')
    expect(cssRule('.page-header-body')).not.toContain('padding-left:')
    expect(cssRule('.page-header-external-toolbar .page-header-body')).toContain(
      'padding-left: calc(var(--editor-gutter-size) + var(--editor-gutter-gap));',
    )
    expect(cssRule('.page-header-no-external-cover')).toContain('margin-top: 18px;')
    expect(cssRule('.page-title-input')).toContain('height: 52px;')
    expect(cssRule('.page-title-input')).toContain('line-height: 52px;')
    expect(cssRule('.page-title-input')).toContain('overflow: hidden;')
    expect(cssRule('.page-panel')).toContain('--page-content-available-width:')
    expect(cssRule('.page-panel')).toContain('--page-panel-block-padding-top: 56px;')
    expect(cssRule('.page-panel')).toContain('var(--page-outline-width)')
    expect(cssRule('.page-panel')).toContain('var(--page-outline-gap)')
  })

  it('supports an adaptive page content width mode', () => {
    expect(cssRule('.page-content-adaptive')).toContain('max-width: var(--page-content-available-width);')
  })

  it('supports a small text page mode', () => {
    expect(cssRule('.page-content-small-text')).toContain('--editor-font-size: 14px;')
    expect(cssRule('.page-content-small-text')).toContain('--editor-line-height: 1.6;')
    expect(cssRule('.page-content-small-text')).toContain('--editor-line-box: 24px;')
  })

  it('leaves enough scroll room below the editor for comfortable continuous typing', () => {
    expect(cssRule('.editor-surface')).toContain('padding-bottom: 300px;')
  })

  it('adds extra spacing when a heading is followed by a feature card block', () => {
    expect(cssRule('.editor-row-kind-heading + .editor-row-kind-feature-card')).toContain('margin-top: 14px;')
    expect(cssRule('.editor-row-kind-feature-card + .editor-row-kind-heading')).toContain('margin-top: 14px;')
  })

  it('supports page font modes', () => {
    expect(cssRule('.page-content-font-default')).toContain('font-family:')
    expect(cssRule('.page-content-font-serif')).toContain('font-family:')
    expect(cssRule('.page-content-font-mono')).toContain('font-family:')
  })

  it('vertically centers heading text when the heading block has a visible background surface', () => {
    expect(cssRule('.heading_1-block')).toContain('display: flex;')
    expect(cssRule('.heading_1-block')).toContain('align-items: center;')
    expect(cssRule('.heading_2-block')).toContain('display: flex;')
    expect(cssRule('.heading_2-block')).toContain('align-items: center;')
    expect(cssRule('.heading_3-block')).toContain('display: flex;')
    expect(cssRule('.heading_3-block')).toContain('align-items: center;')
  })

  it('supports hiding the outline without keeping the reserved outline width', () => {
    expect(cssRule('.page-with-outline-hidden')).toContain('--page-content-available-width: calc(')
    expect(cssRule('.page-with-outline-hidden')).not.toContain('var(--page-outline-width)')
  })

  it('keeps covered page icons below the cover when the toolbar moves outside the header', () => {
    expect(cssRule('.page-header-external-toolbar .page-header-icon-with-cover')).toContain(
      'margin-top: 4px;',
    )
  })
})
