import { invoke } from '@tauri-apps/api/core'

export interface AccountUser {
  id: string
  email: string
  status: 'active' | 'suspended'
  emailVerifiedAt: string | null
}

export interface AccountSession {
  user: AccountUser
  expiresAt: string
  connectivity: 'online' | 'offline'
}

export interface AccountMessage {
  message: string
}

export interface AccountErrorShape {
  code: string
  message: string
  status?: number
}

export interface AccountClient {
  register(email: string, password: string): Promise<AccountMessage>
  resendVerification(email: string): Promise<AccountMessage>
  forgotPassword(email: string): Promise<AccountMessage>
  login(email: string, password: string): Promise<AccountSession>
  restore(): Promise<AccountSession | null>
  validate(): Promise<AccountSession>
  activateServices(): Promise<void>
  logout(): Promise<void>
  clearSession(): Promise<void>
}

export function createTauriAccountClient(): AccountClient {
  return {
    register(email, password) {
      return invoke<AccountMessage>('account_register', { email, password })
    },
    resendVerification(email) {
      return invoke<AccountMessage>('account_resend_verification', { email })
    },
    forgotPassword(email) {
      return invoke<AccountMessage>('account_forgot_password', { email })
    },
    login(email, password) {
      return invoke<AccountSession>('account_login', { email, password })
    },
    restore() {
      return invoke<AccountSession | null>('account_restore')
    },
    validate() {
      return invoke<AccountSession>('account_validate')
    },
    activateServices() {
      return invoke<void>('account_activate_services')
    },
    logout() {
      return invoke<void>('account_logout')
    },
    clearSession() {
      return invoke<void>('account_clear_session')
    },
  }
}

export function normalizeAccountError(error: unknown): AccountErrorShape {
  if (error && typeof error === 'object') {
    const candidate = error as Partial<AccountErrorShape>
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return {
        code: candidate.code,
        message: candidate.message,
        ...(typeof candidate.status === 'number' ? { status: candidate.status } : {}),
      }
    }
  }

  if (error instanceof Error) {
    return { code: 'account_client_error', message: error.message }
  }

  return { code: 'account_client_error', message: '账号服务暂时不可用，请稍后重试。' }
}
