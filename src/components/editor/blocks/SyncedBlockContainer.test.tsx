import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PageRecord, SyncedBlockGroupRecord, SyncedBlockInstanceBlock } from '../../../domain/types'
import { SyncedBlockContainer } from './SyncedBlockContainer'

vi.mock('../../../lib/assets', () => ({
  getAssetUrl: vi.fn(async (assetId: string) => `asset://${assetId}`),
  selectAndImportAsset: vi.fn(),
}))

const now = '2026-07-07T00:00:00.000Z'

function createPage(pageId: string, containerBlock: SyncedBlockInstanceBlock): PageRecord {
  return {
    id: pageId,
    parentId: null,
    title: pageId,
    icon: null,
    cover: null,
    blocks: [containerBlock],
    createdAt: now,
    updatedAt: now,
  }
}

describe('SyncedBlockContainer', () => {
  it('updates sync todo blocks through the group callback', async () => {
    const user = userEvent.setup()
    const onUpdateGroupBlock = vi.fn()
    const containerBlock: SyncedBlockInstanceBlock = {
      id: 'container_sync',
      type: 'synced_block',
      groupId: 'group_1',
      instanceId: 'instance_1',
      mode: 'sync',
    }
    const group: SyncedBlockGroupRecord = {
      id: 'group_1',
      blocks: [{ id: 'todo_1', type: 'todo', text: 'Shared task', checked: false }],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    const { container } = render(
      <SyncedBlockContainer
        containerBlock={containerBlock}
        group={group}
        isPrimary
        allPages={[createPage('page_sync', containerBlock)]}
        onUpdateGroupBlock={onUpdateGroupBlock}
        onUnsync={vi.fn()}
        onOpenPrimary={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Shared task' }))

    expect(onUpdateGroupBlock).toHaveBeenCalledWith('group_1', 'todo_1', {
      id: 'todo_1',
      type: 'todo',
      text: 'Shared task',
      checked: true,
      richText: undefined,
    })
    expect(container.querySelector('.synced-block-header')).not.toBeInTheDocument()
    expect(container.querySelector('.synced-block-container-sync')).not.toBeNull()
  })

  it('renders reference blocks as readonly without the extra top action row', () => {
    const containerBlock: SyncedBlockInstanceBlock = {
      id: 'container_reference',
      type: 'synced_block',
      groupId: 'group_1',
      instanceId: 'instance_2',
      mode: 'reference',
    }
    const group: SyncedBlockGroupRecord = {
      id: 'group_1',
      blocks: [{ id: 'todo_1', type: 'todo', text: 'Shared task', checked: true }],
      primaryInstanceId: 'instance_1',
      createdAt: now,
      updatedAt: now,
    }

    const { container } = render(
      <SyncedBlockContainer
        containerBlock={containerBlock}
        group={group}
        isPrimary={false}
        allPages={[
          createPage(
            'page_primary',
            {
              id: 'container_sync',
              type: 'synced_block',
              groupId: 'group_1',
              instanceId: 'instance_1',
              mode: 'sync',
            },
          ),
          createPage('page_reference', containerBlock),
        ]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={vi.fn()}
        onOpenPrimary={vi.fn()}
      />,
    )

    expect(screen.queryByRole('checkbox', { name: 'Shared task' })).not.toBeInTheDocument()
    expect(screen.getByText('Shared task')).toBeInTheDocument()
    expect(container.querySelector('.synced-block-header')).not.toBeInTheDocument()
    expect(container.querySelector('.synced-block-container-reference')).not.toBeNull()
  })

  it('shows a recovery state when the shared group is missing', async () => {
    const user = userEvent.setup()
    const onDeleteContainer = vi.fn()
    const onUnsync = vi.fn()
    const containerBlock: SyncedBlockInstanceBlock = {
      id: 'container_missing',
      type: 'synced_block',
      groupId: 'group_missing',
      instanceId: 'instance_missing',
      mode: 'sync',
    }

    render(
      <SyncedBlockContainer
        containerBlock={containerBlock}
        group={null}
        isPrimary={false}
        allPages={[createPage('page_missing', containerBlock)]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={onUnsync}
        onOpenPrimary={vi.fn()}
        onDeleteContainer={onDeleteContainer}
      />,
    )

    const missingBlock = document.querySelector('.synced-block-container-missing')

    expect(missingBlock).toBeInstanceOf(HTMLElement)
    expect(screen.getByText(/同步内容不可用/i)).toBeInTheDocument()

    if (!(missingBlock instanceof HTMLElement)) {
      throw new Error('Expected missing synced block')
    }

    await user.click(missingBlock)
    await user.keyboard('{Backspace}')

    expect(onDeleteContainer).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /取消同步/i }))

    expect(onUnsync).toHaveBeenCalledTimes(1)
  })

  it('renders referenced image blocks with the actual image preview', async () => {
    const containerBlock: SyncedBlockInstanceBlock = {
      id: 'container_reference_image',
      type: 'synced_block',
      groupId: 'group_image',
      instanceId: 'instance_reference_image',
      mode: 'reference',
    }
    const group: SyncedBlockGroupRecord = {
      id: 'group_image',
      blocks: [
        {
          id: 'image_1',
          type: 'image',
          assetId: 'asset-image',
          name: 'shared.png',
          mimeType: 'image/png',
          caption: 'Shared image',
          alt: 'Shared image',
        },
      ],
      primaryInstanceId: 'instance_primary_image',
      createdAt: now,
      updatedAt: now,
    }

    const { container } = render(
      <SyncedBlockContainer
        containerBlock={containerBlock}
        group={group}
        isPrimary={false}
        allPages={[createPage('page_reference_image', containerBlock)]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={vi.fn()}
        onOpenPrimary={vi.fn()}
      />,
    )

    const image = await screen.findByRole('img', { name: 'Shared image' })

    expect(image).toHaveClass('media-block-image')
    expect(container.querySelector('.synced-block-complex-shell')).not.toBeInTheDocument()
  })

  it('hides the jump action for complex blocks on the primary synced instance', () => {
    const onOpenPrimary = vi.fn()
    const containerBlock: SyncedBlockInstanceBlock = {
      id: 'container_primary_complex',
      type: 'synced_block',
      groupId: 'group_complex',
      instanceId: 'instance_primary_complex',
      mode: 'sync',
    }
    const group: SyncedBlockGroupRecord = {
      id: 'group_complex',
      blocks: [
        {
          id: 'code_1',
          type: 'code',
          language: 'ts',
          code: 'const answer = 42',
        },
      ],
      primaryInstanceId: 'instance_primary_complex',
      createdAt: now,
      updatedAt: now,
    }

    render(
      <SyncedBlockContainer
        containerBlock={containerBlock}
        group={group}
        isPrimary
        allPages={[createPage('page_primary_complex', containerBlock)]}
        onUpdateGroupBlock={vi.fn()}
        onUnsync={vi.fn()}
        onOpenPrimary={onOpenPrimary}
      />,
    )

    expect(screen.getByText('代码块')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '前往原位置' })).not.toBeInTheDocument()
    expect(onOpenPrimary).not.toHaveBeenCalled()
  })
})
