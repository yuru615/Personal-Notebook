import { describe, expect, it } from 'vitest'

import { uiCopy } from './copy'

describe('uiCopy', () => {
  it('uses the official product name in app-facing messages', () => {
    expect(uiCopy.app.bootstrapError).toBe('数据加载失败，请关闭其他知栖窗口后重试。')
  })
})
