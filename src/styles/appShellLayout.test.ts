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

  it('keeps the sidebar pinned with its own scroll area', () => {
    const sidebar = cssRule('.sidebar')

    expect(sidebar).toContain('position: sticky;')
    expect(sidebar).toContain('top: 0;')
    expect(sidebar).toContain('align-self: start;')
    expect(sidebar).toContain('height: 100vh;')
    expect(sidebar).toContain('overflow-y: auto;')
    expect(sidebar).toContain('overscroll-behavior: contain;')
  })
})
