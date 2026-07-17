import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountClient, AccountSession } from '../lib/accountClient'
import type { WorkspaceRepository } from '../lib/workspaceRepository'
import { AuthenticatedApp } from './AuthenticatedApp'

const onlineSession: AccountSession = {
  user: {
    id: 'user-1',
    email: '123456@qq.com',
    status: 'active',
    emailVerifiedAt: '2026-07-15T00:00:00Z',
  },
  expiresAt: '2099-07-16T00:00:00Z',
  connectivity: 'online',
}

function createAccountClient(overrides: Partial<AccountClient> = {}) {
  return {
    register: vi.fn(async () => ({ message: '验证邮件已发送' })),
    resendVerification: vi.fn(async () => ({ message: '验证邮件已重新发送' })),
    forgotPassword: vi.fn(async () => ({ message: '重置邮件已发送' })),
    login: vi.fn(async () => onlineSession),
    restore: vi.fn(async () => null),
    validate: vi.fn(async () => onlineSession),
    activateServices: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    clearSession: vi.fn(async () => undefined),
    ...overrides,
  } satisfies AccountClient
}

function createRepository() {
  const snapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page-home',
        parentId: null,
        title: '受保护的知识库',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: 'page-home' },
  }
  return {
    load: vi.fn(async () => structuredClone(snapshot)),
    save: vi.fn(async () => undefined),
    replace: vi.fn(async () => undefined),
    cleanupOrphanAssets: vi.fn(async () => 0),
  } satisfies WorkspaceRepository
}

describe('AuthenticatedApp', () => {
  it('does not bootstrap the workspace before authentication', async () => {
    let finishRestore: (session: AccountSession | null) => void = () => undefined
    const restore = new Promise<AccountSession | null>((resolve) => {
      finishRestore = resolve
    })
    const client = createAccountClient({ restore: vi.fn(() => restore) })
    const repository = createRepository()

    render(<AuthenticatedApp accountClient={client} workspaceProps={{ repository }} />)

    expect(screen.getByText('正在检查登录状态...')).toBeInTheDocument()
    expect(repository.load).not.toHaveBeenCalled()

    finishRestore(null)
    expect(await screen.findByRole('heading', { name: '登录知栖' })).toBeInTheDocument()
    expect(repository.load).not.toHaveBeenCalled()
  })

  it('logs in before activating services and bootstrapping the workspace', async () => {
    const user = userEvent.setup()
    const client = createAccountClient()
    const repository = createRepository()

    render(
      <AuthenticatedApp
        accountClient={client}
        workspaceProps={{ repository, initialEntries: ['/pages/page-home'] }}
      />,
    )

    await user.type(await screen.findByLabelText('QQ 邮箱'), '123456@qq.com')
    await user.type(screen.getByLabelText('密码'), 'secure123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByDisplayValue('受保护的知识库')).toBeInTheDocument()
    expect(client.login).toHaveBeenCalledWith('123456@qq.com', 'secure123')
    expect(client.activateServices).toHaveBeenCalledTimes(1)
    expect(repository.load).toHaveBeenCalledTimes(1)
    expect(client.activateServices.mock.invocationCallOrder[0]).toBeLessThan(
      repository.load.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    )
  })

  it('uses an unexpired cached session when the account service is offline', async () => {
    const offlineSession = { ...onlineSession, connectivity: 'offline' as const }
    const client = createAccountClient({ restore: vi.fn(async () => offlineSession) })
    const repository = createRepository()

    render(
      <AuthenticatedApp
        accountClient={client}
        workspaceProps={{ repository, initialEntries: ['/pages/page-home'] }}
      />,
    )

    expect(await screen.findByDisplayValue('受保护的知识库')).toBeInTheDocument()
    expect(screen.getAllByText('离线可用').length).toBeGreaterThan(0)
  })

  it('registers a QQ account and shows the verification step', async () => {
    const user = userEvent.setup()
    const client = createAccountClient()

    render(<AuthenticatedApp accountClient={client} />)

    await user.click(await screen.findByRole('button', { name: '注册账号' }))
    await user.type(screen.getByLabelText('QQ 邮箱'), '654321@qq.com')
    await user.type(screen.getByLabelText('密码'), 'secure123')
    await user.type(screen.getByLabelText('确认密码'), 'secure123')
    await user.click(screen.getByRole('button', { name: '注册并发送验证邮件' }))

    expect(await screen.findByRole('heading', { name: '验证 QQ 邮箱' })).toBeInTheDocument()
    expect(client.register).toHaveBeenCalledWith('654321@qq.com', 'secure123')
    expect(screen.getByText(/654321@qq.com/)).toBeInTheDocument()
  })

  it('clears the credential and locks when the cached session expires', async () => {
    const expiringSession = {
      ...onlineSession,
      expiresAt: new Date(Date.now() + 120).toISOString(),
    }
    const client = createAccountClient({ restore: vi.fn(async () => expiringSession) })
    const repository = createRepository()

    render(
      <AuthenticatedApp
        accountClient={client}
        workspaceProps={{ repository, initialEntries: ['/pages/page-home'] }}
      />,
    )

    expect(await screen.findByDisplayValue('受保护的知识库')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '登录知栖' }, { timeout: 2000 })).toBeInTheDocument()
    expect(client.clearSession).toHaveBeenCalled()
  })

  it('logs out without deleting the local workspace snapshot', async () => {
    const user = userEvent.setup()
    const client = createAccountClient({ restore: vi.fn(async () => onlineSession) })
    const repository = createRepository()

    render(
      <AuthenticatedApp
        accountClient={client}
        workspaceProps={{ repository, initialEntries: ['/pages/page-home'] }}
      />,
    )

    await screen.findByDisplayValue('受保护的知识库')
    const replaceCallsBeforeLogout = repository.replace.mock.calls.length
    await user.click(screen.getByRole('button', { name: /123456@qq.com/ }))
    await user.click(await screen.findByRole('button', { name: '退出登录' }))

    await waitFor(() => expect(client.logout).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: '登录知栖' })).toBeInTheDocument()
    expect(repository.replace).toHaveBeenCalledTimes(replaceCallsBeforeLogout)
  })
})
