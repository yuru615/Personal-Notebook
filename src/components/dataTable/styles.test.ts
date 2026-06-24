import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'src/components/dataTable/styles.css'), 'utf8')
const appStyles = readFileSync(join(process.cwd(), 'src/styles/index.css'), 'utf8')

function getRuleBody(selector: string) {
  return new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
    styles,
  )?.[1] ?? ''
}

function getAppRuleBody(selector: string) {
  return new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
    appStyles,
  )?.[1] ?? ''
}

describe('data table styles', () => {
  it('keeps record peek properties aligned with the peek page content', () => {
    expect(styles).toContain('.record-peek-body .record-properties')
    expect(styles).toContain('padding-left: 0')
    expect(styles).toContain('padding-right: 0')
  })

  it('uses the same blurred backdrop for record peeks and confirm dialogs', () => {
    const confirmOverlay = getRuleBody('.table-confirm-overlay')
    const recordPeekOverlay = getRuleBody('.record-peek-overlay')

    expect(recordPeekOverlay).toContain('background: rgba(15, 23, 42, 0.18)')
    expect(recordPeekOverlay).toContain('backdrop-filter: blur(10px)')
    expect(recordPeekOverlay).toContain(confirmOverlay.match(/background:[^;]+;/)?.[0])
    expect(recordPeekOverlay).toContain(confirmOverlay.match(/backdrop-filter:[^;]+;/)?.[0])
  })

  it('lets embedded table toolbar popovers escape the block frame', () => {
    const embed = getRuleBody('.data-table-embed')
    const tableWrapper = getRuleBody('.data-table-embed .table-wrapper')

    expect(embed).toContain('overflow: visible')
    expect(tableWrapper).toContain('max-height: none')
  })

  it('keeps toolbar popovers inside the visible viewport with internal scrolling', () => {
    const layer = getRuleBody('.database-toolbar-floating-layer')
    const popover = getRuleBody('.database-toolbar-popover')
    const popoverBody = getRuleBody('.database-toolbar-popover-body')

    expect(layer).toContain(
      'max-height: var(--database-toolbar-popover-max-height, min(68vh, 720px))',
    )
    expect(layer).toContain('overflow: visible')
    expect(popover).toContain('max-height: inherit')
    expect(popover).toContain('display: flex')
    expect(popover).toContain('flex-direction: column')
    expect(popoverBody).toContain('max-height: none')
    expect(popoverBody).toContain('overflow: auto')
  })

  it('keeps the embedded table outer wrapper visually hidden', () => {
    const embed = getRuleBody('.data-table-embed')

    expect(embed).toContain('border: 1px solid transparent')
  })

  it('hides the copied database icon in embedded tables', () => {
    const embeddedIcon = getRuleBody('.data-table-embed .database-page-icon')

    expect(embeddedIcon).toContain('display: none')
  })

  it('lets the full data table route header use the available page width', () => {
    expect(getAppRuleBody('.data-table-route-page')).toContain('--page-content-available-width: calc(')
    expect(getAppRuleBody('.data-table-route-page')).not.toContain('var(--page-outline-width)')
    expect(getAppRuleBody('.data-table-route-page')).not.toContain('var(--page-outline-gap)')
    expect(getAppRuleBody('.data-table-route-page .database-page.is-full-width')).toContain('padding-left: 0')
    expect(getAppRuleBody('.data-table-route-page .database-page.is-full-width')).toContain('padding-right: 0')
    expect(getAppRuleBody('.data-table-route-page-header')).toContain('width: min(100%, var(--page-content-available-width))')
    expect(getAppRuleBody('.data-table-route-page-header')).toContain('padding: 0')
    expect(getAppRuleBody('.data-table-route-page-header .page-cover')).toBe('')
    expect(getAppRuleBody('.data-table-route-header-body')).toContain('max-width: none')
  })

  it('keeps data table breadcrumbs in the normal page flow without a separate panel', () => {
    const breadcrumbRow = getAppRuleBody('.data-table-route-breadcrumb-row')

    expect(breadcrumbRow).toContain('width: min(100%, var(--page-content-available-width))')
    expect(breadcrumbRow).not.toContain('background:')
    expect(breadcrumbRow).not.toContain('border:')
    expect(breadcrumbRow).not.toContain('border-radius:')
    expect(breadcrumbRow).not.toContain('position: fixed')
  })

  it('only wraps multi-select chips when table cell wrapping is enabled', () => {
    expect(getRuleBody('.database-table')).toContain('table-layout: auto')
    expect(getRuleBody('.database-table.is-wrapped')).toContain('table-layout: fixed')
    expect(getRuleBody('.database-table:not(.is-wrapped) td')).toContain('white-space: nowrap')
    expect(getRuleBody('.database-table:not(.is-wrapped) .cell-date-trigger')).toContain(
      'width: max-content',
    )
    expect(getRuleBody('.database-table:not(.is-wrapped) .cell-option-chip-list')).toContain(
      'flex-wrap: nowrap',
    )
    expect(getRuleBody('.database-table.is-wrapped .cell-option-chip-list')).toContain(
      'flex-wrap: wrap',
    )
    expect(getRuleBody('.database-table:not(.is-wrapped) .cell-option-trigger')).toContain(
      'width: max-content',
    )
  })

  it('keeps the table header sticky when freezing is enabled', () => {
    const frozenWrapper = getRuleBody('.table-wrapper.has-frozen-first-column')
    const frozenHeader = getRuleBody(
      '.table-wrapper.has-frozen-first-column .database-table thead th',
    )

    expect(frozenWrapper).toContain('overflow-x: visible')
    expect(frozenHeader).toContain('position: sticky')
    expect(frozenHeader).toContain('top: 0')
    expect(frozenHeader).toContain('z-index: 2')
    expect(frozenHeader).toContain('background: rgb(255, 255, 255)')
  })
})
