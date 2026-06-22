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

describe('whiteboard chrome layout', () => {
  it('styles the back control with the same outer shell language as the canvas toolbar', () => {
    expect(cssRule('.whiteboard-page-topbar')).toContain('padding: 8px;')
    expect(cssRule('.whiteboard-page-topbar')).toContain('border: 1px solid rgba(219, 226, 231, 0.92);')
    expect(cssRule('.whiteboard-page-topbar')).toContain('border-radius: 8px;')
    expect(cssRule('.whiteboard-page-topbar')).toContain('background: rgba(255, 255, 255, 0.94);')
  })

  it('keeps the back button itself as a flush icon button inside that shell', () => {
    expect(cssRule('.whiteboard-page-back')).toContain('width: 36px;')
    expect(cssRule('.whiteboard-page-back')).toContain('height: 36px;')
    expect(cssRule('.whiteboard-page-back')).toContain('border: 0;')
    expect(cssRule('.whiteboard-page-back')).toContain('border-radius: 7px;')
    expect(cssRule('.whiteboard-page-back')).toContain('background: transparent;')
  })

  it('pins the whiteboard route menu into the same floating chrome on the top-right', () => {
    expect(cssRule('.whiteboard-page-actions-wrap')).toContain('top: 12px;')
    expect(cssRule('.whiteboard-page-actions-wrap')).toContain('right: 12px;')
    expect(cssRule('.whiteboard-page-actions-wrap')).toContain('padding: 8px;')
    expect(cssRule('.whiteboard-page-actions-wrap')).toContain('border-radius: 8px;')
    expect(cssRule('.whiteboard-page-actions-wrap')).toContain('background: rgba(255, 255, 255, 0.94);')
  })
})
