import { describe, expect, it } from 'vitest'
import { readRichTextSegmentsFromHtml } from './richTextHtml'

describe('richTextHtml', () => {
  it('preserves the approved basic marks from html', () => {
    expect(
      readRichTextSegmentsFromHtml(
        '<strong>Bold</strong><em>Italic</em><u>Under</u><a href="https://example.com">Link</a><br>Tail',
      ),
    ).toEqual([
      { text: 'Bold', bold: true },
      { text: 'Italic', italic: true },
      { text: 'Under', underline: true },
      { text: 'Link', link: 'https://example.com' },
      { text: '\nTail' },
    ])
  })
})
