import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import type { WorkspaceSnapshot } from '../domain/types'
import { createMemoryRepository } from '../test/memoryRepository'
import { createWorkspaceStore } from '../store/createWorkspaceStore'

function createSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString()

  return {
    pages: [
      {
        id: 'page-home',
        parentId: null,
        title: '快速开始',
        icon: '📝',
        cover: null,
        blocks: [
          {
            id: 'block-home',
            type: 'paragraph',
            text: '这是首页内容。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-notes',
        parentId: null,
        title: '会议记录',
        icon: '📒',
        cover: null,
        blocks: [
          {
            id: 'block-notes',
            type: 'paragraph',
            text: '这是第二页内容。',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    settings: {
      lastOpenedPageId: 'page-home',
    },
  }
}

describe('App shell', () => {
  it('renders the requested page from a controlled repository and memory route', async () => {
    const repository = createMemoryRepository(createSnapshot())

    render(<App repository={repository} initialEntries={['/pages/page-notes']} />)

    expect(await screen.findByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('会议记录')).toBeInTheDocument()
    expect(screen.getByText('这是第二页内容。')).toBeInTheDocument()
  })

  it('syncs store state after navigating to another page', async () => {
    const repository = createMemoryRepository(createSnapshot())
    const store = createWorkspaceStore(repository)
    const user = userEvent.setup()

    render(<App store={store} initialEntries={['/pages/page-home']} />)

    await screen.findByDisplayValue('快速开始')
    await user.click(screen.getByRole('link', { name: '会议记录' }))

    expect(await screen.findByDisplayValue('会议记录')).toBeInTheDocument()

    await waitFor(() => {
      expect(store.getState().currentPageId).toBe('page-notes')
      expect(store.getState().settings.lastOpenedPageId).toBe('page-notes')
      expect(screen.getByRole('link', { name: '首页' })).toHaveAttribute('href', '/pages/page-notes')
    })
  })
})
