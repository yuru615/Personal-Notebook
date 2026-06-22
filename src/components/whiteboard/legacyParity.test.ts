import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex').toUpperCase()
}

function readLegacyFile(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('legacy whiteboard parity', () => {
  it('keeps the embedded app.js identical to the imported standalone whiteboard source', () => {
    expect(sha256(readLegacyFile('./legacy/app.js'))).toBe(
      'E3FDE4C2065AC88A355BC9382D7D289AB41712C0A272C8E55481C1FB6D3D3C0C',
    )
  })

  it('keeps the embedded index.html identical to the imported standalone whiteboard source', () => {
    expect(sha256(readLegacyFile('./legacy/index.html'))).toBe(
      '667D382FFD9390248B54202114B8FE8AE257F3E2804D6F77C4938682761F128F',
    )
  })

  it('keeps the embedded styles.css identical to the imported standalone whiteboard source', () => {
    expect(sha256(readLegacyFile('./legacy/styles.css'))).toBe(
      '31A854D987956A5B93E008E051D1ACAB6EBFB8930A4E1DE177EEC648555C0382',
    )
  })
})
