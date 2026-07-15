import { invoke } from '@tauri-apps/api/core'

export interface AnnouncementSummary {
  id: string
  title: string
  publishedAt: string
  updatedAt: string
}

export interface AnnouncementDetail extends AnnouncementSummary {
  contentHtml: string
}

export interface AnnouncementPage {
  items: AnnouncementSummary[]
  total: number
  page: number
  pageSize: number
}

export interface AnnouncementClient {
  list(page: number): Promise<AnnouncementPage>
  get(id: string): Promise<AnnouncementDetail>
}

export function createTauriAnnouncementClient(): AnnouncementClient {
  return {
    list(page) {
      return invoke<AnnouncementPage>('list_announcements', { page })
    },
    get(id) {
      return invoke<AnnouncementDetail>('get_announcement', { id })
    },
  }
}
