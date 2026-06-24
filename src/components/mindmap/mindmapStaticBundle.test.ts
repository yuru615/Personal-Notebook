import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('mindmap static bundle', () => {
  it('uses relative asset paths in the hosted index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/mindmap-web/index.html'), 'utf8')

    expect(html).toContain('./assets/index-C6JP4z8p.js')
    expect(html).toContain('./assets/index-y0sdhTii.css')
    expect(html).toContain('./favicon.svg')
  })
})
