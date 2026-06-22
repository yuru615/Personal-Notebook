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

describe('canvas entry card layout', () => {
  it('shows whiteboard thumbnails at their preview aspect ratio without cropping', () => {
    expect(cssRule('.whiteboard-card-preview')).toContain('aspect-ratio: 8 / 5;')
    expect(cssRule('.whiteboard-card-preview')).toContain('height: auto;')
    expect(cssRule('.whiteboard-card-preview .canvas-entry-preview-image')).toContain(
      'object-fit: contain;',
    )
  })
})
