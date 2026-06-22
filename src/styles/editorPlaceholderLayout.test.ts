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

describe('editor placeholder layout', () => {
  it('hides placeholders inside existing empty blocks', () => {
    expect(cssRule('.editor-row .block-input::placeholder')).toContain('color: transparent;')
    expect(
      cssRule(".editor-row .block-input[contenteditable='true'][data-empty='true']::before"),
    ).toContain("content: '';")
  })
})
