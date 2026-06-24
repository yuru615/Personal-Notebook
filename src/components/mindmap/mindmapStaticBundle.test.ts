import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('mindmap static bundle', () => {
  it('uses relative asset paths in the hosted index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/mindmap-web/index.html'), 'utf8')

    expect(html).toContain('./assets/index-C6JP4z8p.js')
    expect(html).toContain('./assets/index-y0sdhTii.css')
    expect(html).toContain('./host-overrides.css')
    expect(html).toContain('./host-enhancements.js')
    expect(html).toContain('./favicon.svg')
  })

  it('maps the fixed storage key to the scoped host key', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/mindmap-web/index.html'), 'utf8')

    expect(html).toContain('storageKey')
    expect(html).toContain('mindmap-web.document.v1')
    expect(html).toContain('Storage.prototype.getItem')
    expect(html).toContain('Storage.prototype.setItem')
  })

  it('ships host toolbar overrides that keep the hosted chrome aligned with the app shell', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/mindmap-web/host-overrides.css'), 'utf8')

    expect(css).toContain('.topbar {')
    expect(css).toContain('left: 0;')
    expect(css).toContain('right: 0;')
    expect(css).toContain('margin: 0 auto;')
    expect(css).toContain('transform: none;')
    expect(css).toContain('width: fit-content;')
    expect(css).toContain('max-width: calc(100vw - 24px);')
    expect(css).toContain('.topbar-main {')
    expect(css).toContain('overflow: visible;')
    expect(css).toContain('padding: 8px;')
    expect(css).toContain('border-radius: 8px;')
    expect(css).toContain('white-space: nowrap;')
    expect(css).toContain('min-width: fit-content;')
    expect(css).toContain('.topbar-row-single > .toolbar-structure-switch')
    expect(css).toContain('background: #ebe9e6;')
    expect(css).toContain('box-shadow: none;')
    expect(css).toContain('.topbar .toolbar-global-shape')
    expect(css).toContain('border-color: transparent;')
    expect(css).toContain('display: none;')
    expect(css).toContain(".topbar .toolbar-group[aria-label='编辑历史']")
    expect(css).toContain("[aria-label='撤销']::before")
    expect(css).toContain("[aria-label='重做']::before")
    expect(css).toContain('.topbar .toolbar-node-color')
    expect(css).toContain('.topbar .toolbar-theme-menu > .toolbar-icon-button .toolbar-icon-svg')
    expect(css).toContain('.topbar .toolbar-theme-panel {')
    expect(css).toContain('.topbar .toolbar-theme-option {')
    expect(css).toContain('-webkit-mask:')
    expect(css).toContain('.title-input.host-title-input-hidden')
    expect(css).toContain('.topbar .toolbar-surface {')
    expect(css).toContain('.topbar .toolbar-icon-button {')
    expect(css).toContain('.topbar .toolbar-menu-panel {')
    expect(css).toContain('position: absolute;')
  })

  it('ships host enhancements for rename-in-menu behavior', () => {
    const script = readFileSync(resolve(process.cwd(), 'public/mindmap-web/host-enhancements.js'), 'utf8')

    expect(script).toContain('host-title-input-hidden')
    expect(script).toContain('\\u5bfc\\u51fa JSON')
    expect(script).toContain('\\u91cd\\u547d\\u540d')
    expect(script).toContain('host-rename-popover')
    expect(script).toContain('positionFloatingMenuPanel')
    expect(script).toContain("root.matches('.toolbar-select-field')")
    expect(script).toContain("root.querySelector('.toolbar-icon-button')")
    expect(script).toContain('anchorRect.left - rootRect.left')
    expect(script).toContain('12 - rootRect.left')
    expect(script).toContain('window.innerWidth - rootRect.left - panelWidth - 12')
    expect(script).toContain("panel.style.right = 'auto'")
    expect(script).toContain('anchorRect.bottom - rootRect.top + 16')
  })
})
