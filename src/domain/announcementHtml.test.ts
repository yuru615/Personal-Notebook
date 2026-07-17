import { describe, expect, it } from 'vitest'
import { sanitizeAnnouncementHtml } from './announcementHtml'

describe('sanitizeAnnouncementHtml', () => {
  it('keeps supported announcement formatting and safe links', () => {
    expect(
      sanitizeAnnouncementHtml(
        '<h2>更新</h2><p><strong>重要</strong></p><a href="https://example.com">详情</a>',
      ),
    ).toBe(
      '<h2>更新</h2><p><strong>重要</strong></p><a href="https://example.com" rel="noopener noreferrer">详情</a>',
    )
  })

  it('removes scripts, event handlers, styles and unsafe links', () => {
    expect(
      sanitizeAnnouncementHtml(
        '<p onclick="alert(1)" style="color:red">正文<script>alert(1)</script><img src=x><a href="javascript:alert(1)">链接</a></p>',
      ),
    ).toBe('<p>正文<a>链接</a></p>')
  })
})
