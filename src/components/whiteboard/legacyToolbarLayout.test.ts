import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/components/whiteboard/legacy/styles.css', 'utf8')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`))

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('legacy whiteboard toolbar layout', () => {
  it('wraps the color control in the same segmented shell as other toolbar groups', () => {
    expect(cssRule('.color-picker')).toContain('padding: 3px;')
    expect(cssRule('.color-picker')).toContain('border: 1px solid #e5ebef;')
    expect(cssRule('.color-picker')).toContain('border-radius: 8px;')
    expect(cssRule('.color-picker')).toContain('background: #f8fafb;')
  })

  it('keeps the color button itself visually flush inside that shell', () => {
    expect(cssRule('.color-toggle')).toContain('border: 0;')
    expect(cssRule('.color-toggle')).toContain('background: transparent;')
  })

  it('keeps the color and shape popovers slightly separated from the toolbar shell', () => {
    expect(cssRule('.shape-strip')).toContain('top: calc(100% + 12px);')
    expect(cssRule('.color-panel')).toContain('top: calc(100% + 12px);')
  })

  it('normalizes the optical size of shape picker icons', () => {
    expect(cssRule('.shape-picker .icon-button svg')).toContain('width: 18px;')
    expect(cssRule('.shape-picker .icon-button svg')).toContain('height: 18px;')
    expect(cssRule('.shape-strip [data-shape-type="diamond"] svg')).toContain('transform: scale(0.92);')
    expect(cssRule('.shape-strip [data-shape-type="triangle"] svg')).toContain(
      'transform: translateY(0.5px) scale(0.9);',
    )
  })
})
