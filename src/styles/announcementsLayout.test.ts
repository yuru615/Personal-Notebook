import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/styles/index.css', 'utf8')

describe('announcement center layout', () => {
  it('keeps the message list and article in stable responsive tracks', () => {
    expect(css).toContain('.announcements-page {')
    expect(css).toContain('grid-template-rows: 76px minmax(0, 1fr);')
    expect(css).toContain('grid-template-columns: minmax(240px, 31%) minmax(0, 1fr);')
    expect(css).toContain('@media (max-width: 760px)')
    expect(css).toContain('grid-template-columns: minmax(190px, 42%) minmax(0, 1fr);')
  })
})
