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

describe('media block layout', () => {
  it('keeps capped images sized by their intrinsic ratio inside the preview flow', () => {
    const preview = cssRule('.media-block-preview')
    const image = cssRule('img.media-block-image')

    expect(preview).toContain('display: grid;')
    expect(preview).toContain('justify-items: start;')
    expect(image).toContain('max-width: 100%;')
    expect(image).toContain('width: auto;')
    expect(image).toContain('height: auto;')
    expect(image).toContain('max-height: min(540px, 70vh);')
    expect(styles).not.toMatch(/(^|\n)\.media-block-image\s*[{,]/)
    expect(styles).not.toMatch(/(^|\n)\.media-block-video\s*[{,]/)
  })
})
