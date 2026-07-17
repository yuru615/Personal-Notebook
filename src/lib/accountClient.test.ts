import { describe, expect, it } from 'vitest'
import { normalizeAccountError } from './accountClient'

describe('normalizeAccountError', () => {
  it('preserves structured account errors from Tauri', () => {
    expect(
      normalizeAccountError({ code: 'account_suspended', message: '账号已停用', status: 403 }),
    ).toEqual({ code: 'account_suspended', message: '账号已停用', status: 403 })
  })

  it('uses a safe fallback for unknown failures', () => {
    expect(normalizeAccountError(null)).toEqual({
      code: 'account_client_error',
      message: '账号服务暂时不可用，请稍后重试。',
    })
  })
})
