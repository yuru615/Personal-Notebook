import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  LogIn,
  Mail,
  RefreshCw,
  UserPlus,
  WifiOff,
} from 'lucide-react'
import {
  createTauriAccountClient,
  normalizeAccountError,
  type AccountClient,
  type AccountErrorShape,
  type AccountSession,
} from '../lib/accountClient'
import { registerDesktopWindowFocusChanged } from '../lib/desktopLifecycle'
import { isDesktopRuntime } from '../lib/fileAccess'
import { AccountProvider } from './accountContext'
import { WorkspaceApp, type WorkspaceAppProps } from './App'

type AuthMode = 'login' | 'register' | 'verification' | 'forgot'

interface AuthenticatedAppProps {
  accountClient?: AccountClient
  workspaceProps?: WorkspaceAppProps
}

const QQ_EMAIL_PATTERN = /^\d+@qq\.com$/i
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[!-~]{8,16}$/

export function AuthenticatedApp({ accountClient, workspaceProps }: AuthenticatedAppProps = {}) {
  const client = useMemo(
    () => accountClient ?? (isDesktopRuntime() ? createTauriAccountClient() : null),
    [accountClient],
  )
  const [session, setSession] = useState<AccountSession | null>(null)
  const [isChecking, setIsChecking] = useState(client !== null)
  const [authError, setAuthError] = useState<AccountErrorShape | null>(null)
  const beforeLockRef = useRef<(() => Promise<void>) | null>(null)
  const restorePromiseRef = useRef<Promise<AccountSession | null> | null>(null)
  const validationPromiseRef = useRef<Promise<void> | null>(null)

  const registerBeforeLock = useCallback((handler: (() => Promise<void>) | null) => {
    beforeLockRef.current = handler
  }, [])

  const clearAndLock = useCallback(
    async (error?: AccountErrorShape) => {
      try {
        await beforeLockRef.current?.()
      } catch {
        // The workspace already exposes save failures; authentication still has to lock.
      }
      try {
        await client?.clearSession()
      } catch (clearError) {
        setAuthError(normalizeAccountError(clearError))
      }
      setSession(null)
      if (error) {
        setAuthError(error)
      }
    },
    [client],
  )

  const activateSession = useCallback(
    async (nextSession: AccountSession) => {
      if (!client) return
      try {
        await client.activateServices()
        setAuthError(null)
        setSession(nextSession)
      } catch (error) {
        await client.clearSession().catch(() => undefined)
        throw error
      }
    },
    [client],
  )

  useEffect(() => {
    if (!client) {
      setIsChecking(false)
      return
    }
    let active = true
    restorePromiseRef.current ??= client.restore()
    void restorePromiseRef.current
      .then(async (restoredSession) => {
        if (!active || !restoredSession) return
        await client.activateServices()
        if (active) setSession(restoredSession)
      })
      .catch((error) => {
        if (active) setAuthError(normalizeAccountError(error))
      })
      .finally(() => {
        if (active) setIsChecking(false)
      })

    return () => {
      active = false
    }
  }, [client])

  const validateSession = useCallback(() => {
    if (!client || !session || validationPromiseRef.current) return
    if (Date.parse(session.expiresAt) <= Date.now()) {
      void clearAndLock()
      return
    }
    const task = client
      .validate()
      .then(setSession)
      .catch((error) => clearAndLock(normalizeAccountError(error)))
      .finally(() => {
        if (validationPromiseRef.current === task) validationPromiseRef.current = null
      })
    validationPromiseRef.current = task
  }, [clearAndLock, client, session])

  useEffect(() => {
    if (!session) return
    const expiresAt = Date.parse(session.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      void clearAndLock()
      return
    }
    const timer = window.setTimeout(() => {
      void clearAndLock()
    }, Math.min(expiresAt - Date.now(), 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [clearAndLock, session])

  useEffect(() => {
    if (!session) return
    let active = true
    let unlisten: (() => void) | null = null
    void registerDesktopWindowFocusChanged((focused) => {
      if (active && focused) validateSession()
    })
      .then((value) => {
        if (active) unlisten = value
        else value()
      })
      .catch(() => undefined)
    return () => {
      active = false
      unlisten?.()
    }
  }, [session, validateSession])

  const logout = useCallback(async () => {
    if (!client) return
    try {
      await beforeLockRef.current?.()
    } catch {
      // Logout still removes the remote credential gate if a local save is already failing.
    }
    await client.logout()
    setSession(null)
    setAuthError(null)
  }, [client])

  const accountContextValue = useMemo(
    () => (session ? { session, logout, lock: clearAndLock, registerBeforeLock } : null),
    [clearAndLock, logout, registerBeforeLock, session],
  )

  if (!client) {
    return <DesktopRequired />
  }

  if (isChecking) {
    return <AuthLoading />
  }

  if (!session) {
    return (
      <AuthScreen
        client={client}
        initialError={authError}
        onAuthenticated={activateSession}
      />
    )
  }

  return (
    <AccountProvider value={accountContextValue}>
      <WorkspaceApp {...workspaceProps} />
    </AccountProvider>
  )
}

function AuthLoading() {
  return (
    <main className="account-auth-shell">
      <div className="account-auth-loading">
        <LoaderCircle className="account-spin" aria-hidden="true" />
        正在检查登录状态...
      </div>
    </main>
  )
}

function DesktopRequired() {
  return (
    <main className="account-auth-shell">
      <section className="account-auth-card account-auth-message">
        <img src="/favicon.svg" alt="" className="account-auth-logo" aria-hidden="true" />
        <h1>请使用知栖桌面版</h1>
        <p>账号登录与本地知识库仅在 Tauri 桌面运行环境中开放。</p>
      </section>
    </main>
  )
}

interface AuthScreenProps {
  client: AccountClient
  initialError: AccountErrorShape | null
  onAuthenticated: (session: AccountSession) => Promise<void>
}

function AuthScreen({ client, initialError, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [pendingEmail, setPendingEmail] = useState('')
  const [error, setError] = useState(initialError?.message ?? '')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  async function run(action: () => Promise<void>) {
    if (isSubmitting) return
    setIsSubmitting(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(normalizeAccountError(cause).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogin(form: HTMLFormElement) {
    const data = new FormData(form)
    const email = String(data.get('email')).trim().toLowerCase()
    const password = String(data.get('password'))
    await run(async () => {
      const nextSession = await client.login(email, password)
      await onAuthenticated(nextSession)
    })
  }

  async function handleRegister(form: HTMLFormElement) {
    const data = new FormData(form)
    const email = String(data.get('email')).trim().toLowerCase()
    const password = String(data.get('password'))
    if (!QQ_EMAIL_PATTERN.test(email)) {
      setError('请输入纯数字 QQ 邮箱。')
      return
    }
    if (!PASSWORD_PATTERN.test(password)) {
      setError('密码需为 8–16 位，并同时包含英文字母和数字。')
      return
    }
    if (password !== String(data.get('passwordConfirmation'))) {
      setError('两次输入的密码不一致。')
      return
    }
    await run(async () => {
      const result = await client.register(email, password)
      setPendingEmail(email)
      setNotice(result.message)
      setMode('verification')
    })
  }

  async function handleForgot(form: HTMLFormElement) {
    const email = String(new FormData(form).get('email')).trim().toLowerCase()
    await run(async () => {
      const result = await client.forgotPassword(email)
      setPendingEmail(email)
      setNotice(result.message)
    })
  }

  const heading =
    mode === 'login'
      ? '登录知栖'
      : mode === 'register'
        ? '创建知栖账号'
        : mode === 'forgot'
          ? '找回密码'
          : '验证 QQ 邮箱'

  return (
    <main className="account-auth-shell">
      <section className="account-auth-card" aria-labelledby="account-auth-title">
        <header className="account-auth-header">
          <img src="/favicon.svg" alt="" className="account-auth-logo" aria-hidden="true" />
          <div>
            <p className="account-auth-brand">知栖</p>
            <h1 id="account-auth-title">{heading}</h1>
          </div>
        </header>

        {initialError?.code === 'account_suspended' && mode === 'login' ? (
          <div className="account-auth-alert" role="alert">
            账号已被停用，请联系管理员。
          </div>
        ) : null}
        {error ? <div className="account-auth-alert" role="alert">{error}</div> : null}
        {notice ? <div className="account-auth-notice" role="status">{notice}</div> : null}

        {mode === 'login' ? (
          <form
            className="account-auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin(event.currentTarget)
            }}
          >
            <AuthField label="QQ 邮箱" name="email" type="email" autoComplete="username" autoFocus />
            <AuthField label="密码" name="password" type="password" autoComplete="current-password" />
            <button className="account-auth-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="account-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
              {isSubmitting ? '正在登录...' : '登录'}
            </button>
            <div className="account-auth-actions">
              <button type="button" onClick={() => changeMode('register')}>注册账号</button>
              <button type="button" onClick={() => changeMode('forgot')}>忘记密码</button>
            </div>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form
            className="account-auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleRegister(event.currentTarget)
            }}
          >
            <AuthField label="QQ 邮箱" name="email" type="email" autoComplete="username" autoFocus placeholder="纯数字@qq.com" />
            <AuthField label="密码" name="password" type="password" autoComplete="new-password" />
            <AuthField label="确认密码" name="passwordConfirmation" type="password" autoComplete="new-password" />
            <p className="account-auth-help">8–16 位，必须包含英文字母和数字，可使用半角符号。</p>
            <button className="account-auth-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="account-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              {isSubmitting ? '正在注册...' : '注册并发送验证邮件'}
            </button>
            <AuthBack onClick={() => changeMode('login')} />
          </form>
        ) : null}

        {mode === 'forgot' ? (
          <form
            className="account-auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleForgot(event.currentTarget)
            }}
          >
            <p className="account-auth-copy">重置链接会发送到已注册的 QQ 邮箱。</p>
            <AuthField label="QQ 邮箱" name="email" type="email" autoComplete="username" autoFocus defaultValue={pendingEmail} />
            <button className="account-auth-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? <LoaderCircle className="account-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              {isSubmitting ? '正在发送...' : '发送重置邮件'}
            </button>
            <AuthBack onClick={() => changeMode('login')} />
          </form>
        ) : null}

        {mode === 'verification' ? (
          <div className="account-auth-form">
            <div className="account-auth-verification">
              <Mail aria-hidden="true" />
              <p>请打开发送到 {pendingEmail} 的邮件并完成验证，然后返回登录。</p>
            </div>
            <button className="account-auth-primary" type="button" onClick={() => changeMode('login')}>
              <LogIn aria-hidden="true" />
              返回登录
            </button>
            <button
              className="account-auth-secondary"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                void run(async () => {
                  const result = await client.resendVerification(pendingEmail)
                  setNotice(result.message)
                })
              }}
            >
              {isSubmitting ? <LoaderCircle className="account-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
              重新发送验证邮件
            </button>
          </div>
        ) : null}

        <footer className="account-auth-footer">
          <WifiOff aria-hidden="true" />
          登录后的 24 小时内，断网仍可使用本地知识库。
        </footer>
      </section>
    </main>
  )
}

interface AuthFieldProps {
  label: string
  name: string
  type: 'email' | 'password'
  autoComplete: string
  autoFocus?: boolean
  placeholder?: string
  defaultValue?: string
}

function AuthField({ label, name, type, autoComplete, autoFocus, placeholder, defaultValue }: AuthFieldProps) {
  return (
    <label className="account-auth-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        defaultValue={defaultValue}
        minLength={type === 'password' ? 8 : undefined}
        maxLength={type === 'password' ? 16 : undefined}
        required
      />
    </label>
  )
}

function AuthBack({ onClick }: { onClick: () => void }) {
  return (
    <button className="account-auth-back" type="button" onClick={onClick}>
      <ArrowLeft aria-hidden="true" />
      返回登录
    </button>
  )
}

export default AuthenticatedApp
