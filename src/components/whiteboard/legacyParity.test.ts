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
      '00B30A17097E35E2BF9A2CAB54C231D10579C1BD59529926F2D9DF95830DCA07',
    )
  })

  it('keeps the embedded index.html identical to the imported standalone whiteboard source', () => {
    expect(sha256(readLegacyFile('./legacy/index.html'))).toBe(
      '2442BB04B2310D244245F20EFAB583A17B540DCA5A0D8D543DB54D0808D6A9E6',
    )
  })

  it('keeps the embedded styles.css identical to the imported standalone whiteboard source', () => {
    expect(sha256(readLegacyFile('./legacy/styles.css'))).toBe(
      '31A854D987956A5B93E008E051D1ACAB6EBFB8930A4E1DE177EEC648555C0382',
    )
  })
})
