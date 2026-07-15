import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountProvider, type AccountContextValue } from '../../app/accountContext'
import type { AnnouncementClient } from '../../lib/announcementClient'
import { AnnouncementsPage } from './AnnouncementsPage'

function createAccount(overrides: Partial<AccountContextValue> = {}): AccountContextValue {
  return {
    session: {
      user: {
        id: 'user-id',
        email: '123456@qq.com',
        status: 'active',
        emailVerifiedAt: '2026-07-15T09:00:00Z',
      },
      expiresAt: '2099-07-16T09:00:00Z',
      connectivity: 'online',
    },
    logout: vi.fn(async () => undefined),
    lock: vi.fn(async () => undefined),
    registerBeforeLock: vi.fn(),
    ...overrides,
  }
}

function createClient(): AnnouncementClient {
  return {
    list: vi.fn(async () => ({
      items: [
        {
          id: 'announcement-1',
          title: '版本 1.2 发布',
          publishedAt: '2026-07-15T10:00:00Z',
          updatedAt: '2026-07-15T10:00:00Z',
        },
        {
          id: 'announcement-2',
          title: '服务维护通知',
          publishedAt: '2026-07-14T10:00:00Z',
          updatedAt: '2026-07-14T10:00:00Z',
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    })),
    get: vi.fn(async (id) => ({
      id,
      title: id === 'announcement-1' ? '版本 1.2 发布' : '服务维护通知',
      contentHtml:
        id === 'announcement-1'
          ? '<p>新增消息中心。</p><script>alert(1)</script>'
          : '<p>维护时间为今晚。</p>',
      publishedAt: '2026-07-15T10:00:00Z',
      updatedAt: '2026-07-15T10:00:00Z',
    })),
  }
}

describe('AnnouncementsPage', () => {
  it('loads the list, opens the first detail and switches announcements', async () => {
    const user = userEvent.setup()
    const client = createClient()

    render(
      <AccountProvider value={createAccount()}>
        <AnnouncementsPage client={client} />
      </AccountProvider>,
    )

    expect(await screen.findByRole('heading', { name: '版本 1.2 发布' })).toBeInTheDocument()
    expect(screen.getByText('新增消息中心。')).toBeInTheDocument()
    expect(document.querySelector('.announcement-content script')).toBeNull()

    await user.click(screen.getByRole('button', { name: /服务维护通知/ }))
    expect(await screen.findByRole('heading', { name: '服务维护通知' })).toBeInTheDocument()
    expect(screen.getByText('维护时间为今晚。')).toBeInTheDocument()
    expect(client.get).toHaveBeenLastCalledWith('announcement-2')
  })

  it('locks the authenticated workspace when the server rejects the session', async () => {
    const lock = vi.fn(async () => undefined)
    const client: AnnouncementClient = {
      list: vi.fn(async () => {
        throw { code: 'session_expired', message: '会话无效或已过期', status: 401 }
      }),
      get: vi.fn(),
    }

    render(
      <AccountProvider value={createAccount({ lock })}>
        <AnnouncementsPage client={client} />
      </AccountProvider>,
    )

    await waitFor(() =>
      expect(lock).toHaveBeenCalledWith({
        code: 'session_expired',
        message: '会话无效或已过期',
        status: 401,
      }),
    )
  })

  it('shows an offline-aware retry state for network failures', async () => {
    const account = createAccount({
      session: { ...createAccount().session, connectivity: 'offline' },
    })
    const client: AnnouncementClient = {
      list: vi.fn(async () => {
        throw { code: 'network_unavailable', message: '无法连接账号服务' }
      }),
      get: vi.fn(),
    }

    render(
      <AccountProvider value={account}>
        <AnnouncementsPage client={client} />
      </AccountProvider>,
    )

    expect(await screen.findByText('当前无法联网')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })
})
