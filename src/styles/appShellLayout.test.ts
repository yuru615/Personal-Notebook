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

describe('app shell layout', () => {
  it('reserves the page scrollbar gutter so scroll-locked popovers do not shift layout', () => {
    expect(cssRule('html')).toContain('scrollbar-gutter: stable;')
  })

  it('uses a subtle thin scrollbar across scrollable regions', () => {
    expect(cssRule(':root')).toContain('--app-scrollbar-size: 6px;')
    expect(cssRule(':root')).toContain('--app-scrollbar-thumb: rgba(55, 53, 47, 0.18);')
    expect(cssRule('*')).toContain('scrollbar-width: thin;')
    expect(cssRule('*')).toContain('scrollbar-color: var(--app-scrollbar-thumb) transparent;')
    expect(cssRule('*::-webkit-scrollbar')).toContain('width: var(--app-scrollbar-size);')
    expect(cssRule('*::-webkit-scrollbar')).toContain('height: var(--app-scrollbar-size);')
    expect(cssRule('*::-webkit-scrollbar-track')).toContain('background: transparent;')
    expect(cssRule('*::-webkit-scrollbar-thumb')).toContain(
      'background: var(--app-scrollbar-thumb);',
    )
  })

  it('keeps the sidebar pinned while the tree content owns the scroll area', () => {
    const sidebar = cssRule('.sidebar')
    const sidebarLayout = cssRule('.sidebar-layout')
    const sidebarFixedTop = cssRule('.sidebar-fixed-top')
    const sidebarFixedTopScrolled = cssRule('.sidebar-fixed-top-scrolled::after')
    const sidebarScrollContent = cssRule('.sidebar-scroll-content')

    expect(sidebar).toContain('position: sticky;')
    expect(sidebar).toContain('top: 0;')
    expect(sidebar).toContain('align-self: start;')
    expect(sidebar).toContain('height: 100vh;')
    expect(sidebar).toContain('overflow: hidden;')
    expect(sidebar).toContain('overflow-x: hidden;')
    expect(sidebarLayout).toContain('grid-template-rows: auto minmax(0, 1fr);')
    expect(sidebarLayout).toContain('height: 100%;')
    expect(sidebarLayout).toContain('position: relative;')
    expect(sidebarLayout).toContain('top: var(--sidebar-fixed-top-offset, 0px);')
    expect(sidebarLayout).toContain('will-change: top;')
    expect(sidebarScrollContent).toContain('min-height: 0;')
    expect(sidebarScrollContent).toContain('margin-right: calc(-1 * var(--sidebar-inline-padding));')
    expect(sidebarScrollContent).toContain('padding-right: calc(var(--sidebar-inline-padding) - 2px);')
    expect(sidebarScrollContent).toContain('overflow-y: auto;')
    expect(sidebarScrollContent).toContain('overflow-x: hidden;')
    expect(sidebarScrollContent).toContain('overscroll-behavior: contain;')
    expect(sidebarFixedTop).toContain('position: relative;')
    expect(cssRule('.sidebar-fixed-top::after')).toContain('background: #fbfbfa;')
    expect(cssRule('.sidebar-fixed-top::after')).toContain('box-shadow: none;')
    expect(sidebarFixedTopScrolled).toContain('box-shadow:')
  })

  it('keeps sidebar grid tracks packed at the top instead of stretching them into blank space', () => {
    const sidebarScrollContent = cssRule('.sidebar-scroll-content')
    const sidebarGroup = cssRule('.sidebar-group')
    const sidebarSectionBody = cssRule('.sidebar-section-body')
    const sidebarTree = cssRule('.sidebar-tree')

    expect(sidebarScrollContent).toContain('align-content: start;')
    expect(sidebarGroup).toContain('align-content: start;')
    expect(sidebarSectionBody).toContain('align-content: start;')
    expect(sidebarTree).toContain('align-content: start;')
  })

  it('keeps sidebar menus above the page content column', () => {
    const sidebar = cssRule('.sidebar')
    const sidebarTreeActions = cssRule('.sidebar-tree-actions')
    const pageMenuPopover = cssRule('.sidebar-tree-page-menu-popover')
    const utilityMenuPopover = cssRule('.sidebar-utility-menu-popover')

    expect(sidebar).toContain('z-index: 63;')
    expect(sidebar).toContain('isolation: isolate;')
    expect(sidebarTreeActions).not.toContain('transform:')
    expect(pageMenuPopover).toContain('z-index: 64;')
    expect(utilityMenuPopover).toContain('z-index: 64;')
  })

  it('lets sidebar popovers shrink and scroll inside small app windows', () => {
    const pageMenuPopover = cssRule('.sidebar-tree-page-menu-popover')
    const utilityMenuPopover = cssRule('.sidebar-utility-menu-popover')

    expect(pageMenuPopover).toContain('width: min(176px, calc(100vw - 24px));')
    expect(pageMenuPopover).toContain('max-height:')
    expect(pageMenuPopover).toContain('overflow: auto;')
    expect(utilityMenuPopover).toContain('width: min(164px, calc(100vw - 24px));')
    expect(utilityMenuPopover).toContain('max-height:')
    expect(utilityMenuPopover).toContain('overflow: auto;')
  })

  it('uses the small body text size for sidebar tree links', () => {
    const sidebarLink = cssRule('.sidebar-link')

    expect(sidebarLink).toContain('font-size: 14px;')
    expect(sidebarLink).toContain('line-height: 1.45;')
  })

  it('keeps long sidebar labels on a single truncated line', () => {
    const sidebarTreeLabel = cssRule('.sidebar-tree-label')

    expect(sidebarTreeLabel).toContain('overflow: hidden;')
    expect(sidebarTreeLabel).toContain('text-overflow: ellipsis;')
    expect(sidebarTreeLabel).toContain('white-space: nowrap;')
  })

  it('lets compact sidebar tree rows shrink inside the sidebar column', () => {
    const sidebarTree = cssRule('.sidebar-tree')
    const sidebarTreeEntry = cssRule('.sidebar-tree-entry')
    const sidebarTreeRow = cssRule('.sidebar-tree-row')

    expect(sidebarTree).toContain('min-width: 0;')
    expect(sidebarTreeEntry).toContain('min-width: 0;')
    expect(sidebarTreeRow).toContain('min-width: 0;')
  })

  it('avoids keeping extra section spacing after a sidebar group is collapsed', () => {
    const sidebarSectionGroup = cssRule('.sidebar-section-group')

    expect(sidebarSectionGroup).toContain('margin-bottom: 0;')
  })

  it('defines a dedicated drag handle for resizing the sidebar', () => {
    const appShell = cssRule('.app-shell')
    const resizer = cssRule('.app-shell-sidebar-resizer')

    expect(appShell).toContain('grid-template-columns: var(--app-sidebar-width, 272px) 1fr;')
    expect(resizer).toContain('cursor: col-resize;')
    expect(resizer).toContain('touch-action: none;')
  })
})
