import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTauriAnnouncementClient } from './announcementClient'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('createTauriAnnouncementClient', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('uses typed Tauri commands without exposing session tokens', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ items: [], total: 0, page: 2, pageSize: 20 })
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 'announcement-id',
      title: '更新',
      contentHtml: '<p>内容</p>',
      publishedAt: '2026-07-15T10:00:00Z',
      updatedAt: '2026-07-15T10:00:00Z',
    })
    const client = createTauriAnnouncementClient()

    await client.list(2)
    await client.get('announcement-id')

    expect(invoke).toHaveBeenNthCalledWith(1, 'list_announcements', { page: 2 })
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_announcement', { id: 'announcement-id' })
  })
})
