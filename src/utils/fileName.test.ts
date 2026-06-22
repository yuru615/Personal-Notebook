import { describe, expect, it } from 'vitest'
import { sanitizeFileNameSegment } from './fileName'

describe('sanitizeFileNameSegment', () => {
  it('replaces unsafe characters and falls back when the name is empty', () => {
    expect(sanitizeFileNameSegment('  bad:name\u0001.txt  ', 'Untitled')).toBe('bad name .txt')
    expect(sanitizeFileNameSegment('...', 'Untitled')).toBe('Untitled')
  })
})
