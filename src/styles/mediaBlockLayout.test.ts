import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles/index.css', 'utf8')

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = Array.from(
    styles.matchAll(new RegExp(`(^|\\n)${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, 'g')),
  )
  const match = matches.at(-1)

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return match.groups.body
}

describe('media block layout', () => {
  it('keeps capped images sized by their intrinsic ratio inside the preview flow', () => {
    const preview = cssRule('.media-block-preview')
    const surface = cssRule('.media-block-surface')
    const image = cssRule('img.media-block-image')
    const trigger = cssRule('.media-block-image-trigger')

    expect(preview).toContain('display: grid;')
    expect(preview).toContain('justify-items: start;')
    expect(surface).toContain('width: fit-content;')
    expect(surface).toContain('max-width: 100%;')
    expect(surface).toContain('border: 1px solid #e7e0d7;')
    expect(surface).toContain('box-shadow: 0 12px 30px rgba(42, 36, 28, 0.08);')
    expect(image).toContain('max-width: 100%;')
    expect(image).toContain('width: auto;')
    expect(image).toContain('height: auto;')
    expect(image).toContain('max-height: min(540px, 70vh);')
    expect(trigger).toContain('cursor: zoom-in;')
    expect(styles).not.toMatch(/(^|\n)\.media-block-image\s*[{,]/)
    expect(styles).not.toMatch(/(^|\n)\.media-block-video\s*[{,]/)
  })

  it('gives audio and empty media states purpose-built presentation', () => {
    const upload = cssRule('.media-block-upload')
    const audioSurface = cssRule('.media-block-kind-audio .media-block-surface')
    const audioCard = cssRule('.media-block-audio-card')
    const audioArt = cssRule('.media-block-audio-art')

    expect(upload).toContain('min-height: 148px;')
    expect(upload).toContain('border-radius: 10px;')
    expect(upload).toContain('background: linear-gradient(180deg, #fffdf9 0%, #f8f4ed 100%);')
    expect(audioSurface).toContain('width: 100%;')
    expect(audioCard).toContain('grid-template-columns: 52px minmax(0, 1fr);')
    expect(audioArt).toContain('border-radius: 12px;')
    expect(audioArt).toContain('background: linear-gradient(135deg, #49675f 0%, #d6b170 52%, #7d9ab4 100%);')
  })

  it('styles the enlarged image preview as a centered overlay dialog', () => {
    const overlay = cssRule('.media-block-image-preview-overlay')
    const dialog = cssRule('.media-block-image-preview-dialog')
    const previewImage = cssRule('.media-block-image-preview-image')
    const panReadyImage = cssRule('.media-block-image-preview-body-pan-ready .media-block-image-preview-image')
    const draggingImage = cssRule('.media-block-image-preview-body-dragging .media-block-image-preview-image')

    expect(overlay).toContain('position: fixed;')
    expect(overlay).toContain('backdrop-filter: blur(10px);')
    expect(dialog).toContain('width: min(90vw, 1440px);')
    expect(dialog).toContain('max-height: 90vh;')
    expect(dialog).toContain('border-radius: 14px;')
    expect(previewImage).toContain('max-height: calc(90vh - 92px);')
    expect(panReadyImage).toContain('grab;')
    expect(draggingImage).toContain('grabbing;')
  })
})
