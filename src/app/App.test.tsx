import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../domain/types'
import { createMemoryRepository } from '../test/memoryRepository'
import { App } from './App'

describe('App', () => {
  it('focuses the paragraph editor after exiting an empty list item', async () => {
    const pageId = 'page_focus'
    const snapshot: WorkspaceSnapshot = {
      boards: [],
      pages: [
        {
          id: pageId,
          parentId: null,
          title: '列表页',
          icon: null,
          cover: null,
          isFullWidth: false,
          isSmallText: false,
          fontFamily: 'default',
          showOutline: true,
          blocks: [{ id: 'block_1', type: 'bulleted_list', items: [''] }],
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      ],
      settings: { lastOpenedPageId: pageId },
    }

    render(
      <App
        repository={createMemoryRepository(snapshot)}
        initialEntries={[`/pages/${pageId}`]}
      />,
    )

    const listEditor = await screen.findByRole('textbox', { name: '每行一个列表项' })
    fireEvent.keyDown(listEditor, { key: 'Enter' })

    const paragraphEditor = await screen.findByRole('textbox', { name: '输入正文' })
    await waitFor(() => expect(paragraphEditor).toHaveFocus())
  })
})
