import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const editorStyles = readFileSync('src/styles/index.css', 'utf8')
const dataTableStyles = readFileSync('src/components/dataTable/styles.css', 'utf8')

function getRuleBody(styles: string, selector: string) {
  return new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
    styles,
  )?.[1] ?? ''
}

function zIndex(styles: string, selector: string) {
  const value = getRuleBody(styles, selector).match(/z-index:\s*(\d+)/)?.[1]

  if (!value) {
    throw new Error(`Missing z-index for ${selector}`)
  }

  return Number(value)
}

describe('editor menu layering', () => {
  it('keeps knowledge editor menus above embedded data table view menus', () => {
    const highestDataTableMenu = Math.max(
      zIndex(dataTableStyles, '.database-toolbar-floating-layer'),
      zIndex(dataTableStyles, '.database-view-create-menu'),
      zIndex(dataTableStyles, '.view-tab-menu'),
      zIndex(dataTableStyles, '.view-options-view-menu-shell .view-tab-menu'),
      zIndex(dataTableStyles, '.notion-select-floating-layer'),
    )

    expect(zIndex(editorStyles, '.slash-menu')).toBeGreaterThan(highestDataTableMenu)
    expect(zIndex(editorStyles, '.block-menu')).toBeGreaterThan(highestDataTableMenu)
  })

  it('keeps data table route header popovers above data table toolbar menus', () => {
    const highestDataTableMenu = Math.max(
      zIndex(dataTableStyles, '.database-toolbar-floating-layer'),
      zIndex(dataTableStyles, '.database-view-create-menu'),
      zIndex(dataTableStyles, '.view-tab-menu'),
      zIndex(dataTableStyles, '.view-options-view-menu-shell .view-tab-menu'),
      zIndex(dataTableStyles, '.notion-select-floating-layer'),
    )

    expect(zIndex(editorStyles, '.data-table-route-page-header .page-cover-popover')).toBeGreaterThan(
      highestDataTableMenu,
    )
    expect(zIndex(editorStyles, '.data-table-route-page-header .page-icon-popover')).toBeGreaterThan(
      highestDataTableMenu,
    )
    expect(zIndex(editorStyles, '.data-table-route-page-header .page-menu-popover')).toBeGreaterThan(
      highestDataTableMenu,
    )
  })
})
