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

  it('lets the page menu shrink and scroll inside smaller windows', () => {
    const pageMenuPopover = cssRule('.page-menu-popover')

    expect(pageMenuPopover).toContain('width: min(248px, calc(100vw - 24px));')
    expect(pageMenuPopover).toContain('max-height:')
    expect(pageMenuPopover).toContain('overflow: auto;')
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

  it('renders page property values without a persistent gray pill background', () => {
    const propertyValue = cssRule('.page-property-value')
    const propertyValueHover = cssRule('.page-property-value:hover')

    expect(propertyValue).toContain('background: transparent;')
    expect(propertyValueHover).toContain('background: rgba(55, 53, 47, 0.06);')
    expect(styles).toContain('.page-property-add {\n  background: #f7f6f3;')
  })

  it('lets the notes property expand to the page content width while editing', () => {
    expect(cssRule('.page-property-editor-wide')).toContain('width: 100%;')
    expect(cssRule('.page-property-editor-wide')).toContain('justify-self: stretch;')
    expect(cssRule('.page-property-input-wide')).toContain('width: 100%;')
    expect(cssRule('.page-property-input-wide')).toContain('max-width: 100%;')
  })

  it('keeps the slash hint visible for insert-mode empty paragraph rows', () => {
    expect(cssRule(".block-input-insert[contenteditable='true'][data-empty='true']::before")).toContain(
      'content: attr(data-placeholder);',
    )
    expect(cssRule(".editor-row .block-input-insert[contenteditable='true'][data-empty='true']::before")).toContain(
      "content: '';",
    )
    expect(cssRule(".editor-row .block-input-insert[contenteditable='true'][data-empty='true']:focus::before")).toContain(
      'content: attr(data-placeholder);',
    )
  })

  it('shows the trailing empty-row plus only on hover or focus', () => {
    expect(cssRule('.empty-block-plus')).toContain('opacity: 0;')
    expect(cssRule('.empty-block-row:hover .empty-block-plus')).toContain('opacity: 1;')
    expect(cssRule('.empty-block-row:focus-within .empty-block-plus')).toContain('opacity: 1;')
    expect(styles).not.toContain('.block-frame-insert-mode .block-handle')
  })

  it('renders reference synced blocks as a lighter callout with a left accent bar', () => {
    expect(cssRule('.synced-block-container')).toContain('border: 0;')
    expect(cssRule('.synced-block-container')).toContain('border-left:')
    expect(cssRule('.synced-block-container')).toContain('background: transparent;')
    expect(cssRule('.synced-block-container')).toContain('border-radius: 0;')
    expect(cssRule('.synced-block-container-reference')).toContain('border-left-color:')
  })

  it('renders synced source blocks with the same lightweight form but a stronger accent bar', () => {
    expect(cssRule('.synced-block-container-sync')).toContain('border-left-color:')
    expect(cssRule('.synced-block-container')).toContain('background: transparent;')
    expect(cssRule('.synced-block-container')).toContain('border-radius: 0;')
  })

  it('keeps synced block callouts aligned with the standard block handle position', () => {
    const syncedBlockContainer = cssRule('.synced-block-container')

    expect(syncedBlockContainer).toContain('padding-left: 12px;')
    expect(syncedBlockContainer).not.toContain('padding: 8px 0 8px 12px;')
    expect(syncedBlockContainer).not.toContain('padding-top:')
  })

  it('shows a clear focus state for reference synced blocks', () => {
    expect(cssRule('.synced-block-container-reference:focus')).toContain('outline: 0;')
    expect(cssRule('.synced-block-container-reference:focus')).toContain('background:')
    expect(cssRule('.synced-block-container-reference:focus')).toContain('box-shadow:')
    expect(cssRule('.synced-block-container-reference:focus')).toContain('border-left-color:')
    expect(cssRule('.synced-block-container-reference:focus-visible')).toContain('outline: 0;')
  })

  it('renders missing synced blocks with the same lightweight callout and focus treatment', () => {
    expect(cssRule('.synced-block-container-missing')).toContain('border-left-color:')
    expect(cssRule('.synced-block-container-missing')).toContain('min-height:')
    expect(cssRule('.synced-block-container-missing:focus')).toContain('outline: 0;')
    expect(cssRule('.synced-block-container-missing:focus')).toContain('background:')
    expect(cssRule('.synced-block-container-missing:focus')).toContain('box-shadow:')
  })
})
