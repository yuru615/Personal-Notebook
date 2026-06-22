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

describe('table borders', () => {
  it('uses visible border lines on the top and left table edges', () => {
    expect(cssRule('.table-block')).toContain('--table-border-color: #e9e9e7')
    expect(cssRule('.table-grid')).toContain('border-top: 1px solid var(--table-border-color)')
    expect(cssRule('.table-grid')).toContain('border-left: 1px solid var(--table-border-color)')
  })
})
