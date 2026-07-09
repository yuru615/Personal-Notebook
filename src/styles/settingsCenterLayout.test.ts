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

describe('settings center layout', () => {
  it('keeps a fixed left navigation and a flexible content column', () => {
    expect(cssRule('.settings-center')).toContain('display: grid;')
    expect(cssRule('.settings-center')).toContain('grid-template-columns: 220px minmax(0, 1fr);')
    expect(cssRule('.settings-center')).toContain('width: 100%;')
    expect(cssRule('.settings-center')).toContain('min-height: 100vh;')
    expect(cssRule('.settings-center-nav')).toContain('position: sticky;')
    expect(cssRule('.settings-center-panel')).toContain('min-width: 0;')
  })
})
