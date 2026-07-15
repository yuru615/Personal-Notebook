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

describe('editor multi select layout', () => {
  it('aligns a new paragraph with the trailing empty input row', () => {
    expect(cssRule('.block-frame')).toContain(
      'margin-left: calc(-18px - var(--editor-gutter-gap));',
    )
    expect(cssRule('.empty-block-row')).toContain(
      'grid-template-columns: var(--editor-gutter-size) minmax(0, 1fr);',
    )
  })

  it('matches the block background surface without highlighting the selection gutter or handle', () => {
    expect(styles).not.toMatch(/\.editor-row-selected\s*\{[^}]*background:/)
    const selectedContent = cssRule('.editor-row-selected > .block-frame > .block-frame-content')

    expect(selectedContent).toContain('background:')
    expect(selectedContent).toContain('margin: 0 -8px;')
    expect(selectedContent).toContain('padding: 0 8px;')
    expect(selectedContent).toContain('border-radius: 4px;')
    expect(selectedContent).toContain('box-shadow: inset 0 0 0 1px var(--app-accent-border);')
    expect(
      cssRule(
        '.editor-row-selected.editor-row-kind-feature-card > .block-frame > .block-frame-content',
      ),
    ).toContain('padding: 4px 8px;')
    expect(
      cssRule('.editor-row-kind-feature-card > .block-frame > .block-frame-content'),
    ).toContain('padding: 4px 0;')
    expect(styles).toContain(".block-style-surface[style*='background-color']")
    expect(cssRule('.editor-selection-marquee')).toContain('position: fixed;')
    expect(cssRule('.editor-selection-marquee')).toContain('pointer-events: none;')
    expect(cssRule('.editor-selection-marquee')).toContain('background: var(--app-accent-marquee);')
    expect(cssRule('.editor-surface:focus')).toContain('outline: 0;')
    expect(cssRule('.editor-surface:focus-visible')).toContain('outline: 0;')
    expect(styles).not.toContain(
      '.editor-row-selected > .block-frame > .block-frame-content > .canvas-entry-card,',
    )
    expect(cssRule('.block-selection-gutter')).not.toContain('cursor: crosshair;')
    expect(cssRule('.sidebar-link:hover')).toContain('background: var(--app-accent-hover);')
    expect(cssRule('.page-outline-item:hover')).toContain('background: var(--app-accent-hover);')
  })

  it('keeps the global file-drop overlay transparent to pointer events', () => {
    expect(cssRule('.app-file-drop-overlay')).toContain('pointer-events: none;')
  })
})
