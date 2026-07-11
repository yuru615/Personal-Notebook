import { describe, expect, it } from 'vitest'
import { createBlock } from './blockFactory'

describe('createBlock', () => {
  it('creates an empty file attachment block', () => {
    expect(createBlock('file')).toMatchObject({
      type: 'file',
      assetId: null,
      name: '',
      mimeType: '',
      caption: '',
    })
  })
})
