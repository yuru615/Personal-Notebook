import { describe, expect, it } from 'vitest'
import {
  buildClipboardTextBlocks,
  clipboardHtmlToStructuredPasteItems,
  clipboardHtmlToStructuredBlocks,
  clipboardHtmlToParagraphBlocks,
  clipboardPlainTextToParagraphBlocks,
  isDuplicateClipboardSignature,
} from './clipboardCapture'

describe('clipboardCapture', () => {
  it('splits plain text into multiple paragraph blocks by blank lines', () => {
    expect(clipboardPlainTextToParagraphBlocks('first\n\nsecond')).toMatchObject([
      { type: 'paragraph', text: 'first' },
      { type: 'paragraph', text: 'second' },
    ])
  })

  it('keeps line breaks inside one paragraph block', () => {
    expect(clipboardPlainTextToParagraphBlocks('first\nsecond')).toMatchObject([
      { type: 'paragraph', text: 'first\nsecond' },
    ])
  })

  it('turns html text into paragraph blocks with approved marks', () => {
    expect(
      clipboardHtmlToParagraphBlocks(
        '<p><strong>Bold</strong> <em>Italic</em> <u>Under</u> <a href="https://example.com">Link</a><br>Tail</p>',
      ),
    ).toMatchObject([
      {
        type: 'paragraph',
        text: 'Bold Italic Under Link\nTail',
        richText: [
          { text: 'Bold', bold: true },
          { text: ' ' },
          { text: 'Italic', italic: true },
          { text: ' ' },
          { text: 'Under', underline: true },
          { text: ' ' },
          { text: 'Link', link: 'https://example.com' },
          { text: '\nTail' },
        ],
      },
    ])
  })

  it('keeps inline formatting from Word style attributes', () => {
    expect(
      clipboardHtmlToParagraphBlocks(
        '<p class="MsoNormal"><span style="font-weight: 700">Bold</span> <span style="font-style: italic">Italic</span> <span style="text-decoration: underline line-through">Marked</span> <span style="color: #d44c47">Red</span><o:p></o:p></p>',
      ),
    ).toMatchObject([
      {
        type: 'paragraph',
        text: 'Bold Italic Marked Red',
        richText: [
          { text: 'Bold', bold: true },
          { text: ' ' },
          { text: 'Italic', italic: true },
          { text: ' ' },
          { text: 'Marked', underline: true, strike: true },
          { text: ' ' },
          { text: 'Red', color: 'red' },
        ],
      },
    ])
  })

  it('maps Word heading paragraph styles to heading blocks', () => {
    expect(
      clipboardHtmlToStructuredBlocks(
        '<p class="MsoHeading1">Main heading</p><p style="mso-style-name: Heading 2">Subheading</p><p>Body text</p>',
      ),
    ).toMatchObject([
      { type: 'heading_1', text: 'Main heading' },
      { type: 'heading_2', text: 'Subheading' },
      { type: 'paragraph', text: 'Body text' },
    ])
  })

  it('preserves Word outline headings, tables, and inline images as structured paste items', () => {
    expect(
      clipboardHtmlToStructuredPasteItems(
        [
          '<style>p.CustomWordHeading { mso-outline-level: 2; }</style>',
          '<p class="CustomWordHeading">Outline heading</p>',
          '<table><tr><td>Column A</td><td>Column B</td></tr><tr><td>One</td><td>Two</td></tr></table>',
          '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Word diagram"></p>',
        ].join(''),
      ),
    ).toMatchObject([
      { kind: 'block', block: { type: 'heading_2', text: 'Outline heading' } },
      {
        kind: 'block',
        block: {
          type: 'table',
          rows: [
            ['Column A', 'Column B'],
            ['One', 'Two'],
          ],
        },
      },
      {
        kind: 'image',
        source: 'data:image/png;base64,iVBORw0KGgo=',
        alt: 'Word diagram',
      },
    ])
  })

  it('converts copied markdown preview HTML into matching editor block types', () => {
    expect(
      clipboardHtmlToStructuredBlocks(
        [
          '<h1>项目计划</h1>',
          '<p>这是 <strong>重点</strong>。</p>',
          '<ul><li>第一项</li></ul>',
          '<pre><code class="language-ts">const done = true</code></pre>',
          '<table><tr><th>名称</th><th>状态</th></tr><tr><td>知栖</td><td>进行中</td></tr></table>',
        ].join(''),
      ),
    ).toMatchObject([
      { type: 'heading_1', text: '项目计划' },
      {
        type: 'paragraph',
        text: '这是 重点。',
        richText: [{ text: '这是 ' }, { text: '重点', bold: true }, { text: '。' }],
      },
      { type: 'bulleted_list', items: ['第一项'] },
      { type: 'code', language: 'ts', text: 'const done = true' },
      {
        type: 'table',
        rows: [
          ['名称', '状态'],
          ['知栖', '进行中'],
        ],
      },
    ])
  })

  it('splits inline html into multiple paragraph blocks on consecutive br tags', () => {
    expect(clipboardHtmlToParagraphBlocks('first<br><br>second')).toMatchObject([
      { type: 'paragraph', text: 'first' },
      { type: 'paragraph', text: 'second' },
    ])
  })

  it('keeps a single br inside one inline html paragraph block', () => {
    expect(clipboardHtmlToParagraphBlocks('first<br>second<br><br>third')).toMatchObject([
      { type: 'paragraph', text: 'first\nsecond' },
      { type: 'paragraph', text: 'third' },
    ])
  })

  it('falls back to plain text paragraphs for invalid or unsupported html', () => {
    expect(
      buildClipboardTextBlocks({
        html: '<table><tr><td>Cell 1</td></tr></table>',
        text: 'Cell 1\n\nCell 2',
      }),
    ).toMatchObject([
      { type: 'paragraph', text: 'Cell 1' },
      { type: 'paragraph', text: 'Cell 2' },
    ])
  })

  it('detects duplicate clipboard signatures', () => {
    expect(isDuplicateClipboardSignature('same', 'same')).toBe(true)
    expect(isDuplicateClipboardSignature('same', 'other')).toBe(false)
  })
})
