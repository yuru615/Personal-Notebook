import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PageRecord, SyncedBlockGroupRecord } from '../../domain/types'
import { BlockEditor } from './BlockEditor'

const now = '2026-07-07T00:00:00.000Z'

describe('BlockEditor synced blocks', () => {
  it('renders synced block content and routes simple edits to the shared group callback', async () => {
    const user = userEvent.setup()
    const onUpdateSyncedGroupBlock = vi.fn()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_sync',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'todo_1', type: 'todo', text: 'Shared task', checked: false }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onUpdateSyncedGroupBlock={onUpdateSyncedGroupBlock}
        onUnsyncBlockInstance={vi.fn()}
        onOpenPrimarySyncedBlock={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Shared task' }))

    expect(onUpdateSyncedGroupBlock).toHaveBeenCalledWith('group_1', 'todo_1', {
      id: 'todo_1',
      type: 'todo',
      text: 'Shared task',
      checked: true,
      richText: undefined,
    })
  })

  it('opens the synced picker from an empty paragraph slash command and replaces that block', async () => {
    const user = userEvent.setup()
    const onReplaceBlockWithSyncedInstance = vi.fn()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [{ id: 'empty_1', type: 'paragraph', text: '' }],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onReplaceBlockWithSyncedInstance={onReplaceBlockWithSyncedInstance}
      />,
    )

    await user.click(screen.getByRole('textbox', { name: '输入正文' }))
    await user.keyboard('/')
    await user.click(screen.getByRole('button', { name: '同步块' }))
    await user.click(screen.getByRole('button', { name: /Weekly review/i }))

    expect(onReplaceBlockWithSyncedInstance).toHaveBeenCalledWith('empty_1', 'group_1', 'sync')
  })

  it('inserts a reference block from the blank row via the synced picker', async () => {
    const user = userEvent.setup()
    const onInsert = vi.fn().mockResolvedValue('placeholder_1')
    const onReplaceBlockWithSyncedInstance = vi.fn()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onInsert={onInsert}
        onReplaceBlockWithSyncedInstance={onReplaceBlockWithSyncedInstance}
      />,
    )

    await user.click(screen.getByRole('button', { name: '添加块' }))
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.click(screen.getByRole('button', { name: /Weekly review/i }))

    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledWith('paragraph')
    })
    expect(onReplaceBlockWithSyncedInstance).toHaveBeenCalledWith(
      'placeholder_1',
      'group_1',
      'reference',
    )
  })

  it('finds synced groups in the picker when content only exists in rich text', async () => {
    const user = userEvent.setup()
    const onReplaceBlockWithSyncedInstance = vi.fn()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [{ id: 'empty_1', type: 'paragraph', text: '' }],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [
          {
            id: 'paragraph_1',
            type: 'paragraph',
            text: '',
            richText: [{ text: 'Visible shared note' }],
          },
        ],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onReplaceBlockWithSyncedInstance={onReplaceBlockWithSyncedInstance}
      />,
    )

    await user.click(screen.getByRole('textbox', { name: '输入正文' }))
    await user.keyboard('/')
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'Visible')
    await user.click(screen.getByRole('button', { name: /Visible shared note/i }))

    expect(onReplaceBlockWithSyncedInstance).toHaveBeenCalledWith('empty_1', 'group_1', 'reference')
  })

  it('finds normal page blocks in the picker and promotes them into synced content', async () => {
    const user = userEvent.setup()
    const currentPage: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [{ id: 'empty_1', type: 'paragraph', text: '' }],
      createdAt: now,
      updatedAt: now,
    }
    const sourcePage: PageRecord = {
      id: 'page_source',
      parentId: null,
      title: 'Source page',
      icon: null,
      cover: null,
      blocks: [{ id: 'source_1', type: 'paragraph', text: 'Existing source note' }],
      createdAt: now,
      updatedAt: now,
    }
    const onCreateSyncedBlockFromExistingBlock = vi.fn()

    render(
      <BlockEditor
        page={currentPage}
        allPages={[currentPage, sourcePage]}
        syncedBlockGroups={[]}
        onUpdateBlock={vi.fn()}
        onCreateSyncedBlockFromExistingBlock={onCreateSyncedBlockFromExistingBlock}
      />,
    )

    await user.click(screen.getByRole('textbox', { name: '输入正文' }))
    await user.keyboard('/')
    await user.click(screen.getByRole('button', { name: '引用块' }))
    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'source note')
    await user.click(screen.getByRole('button', { name: /Existing source note/i }))

    expect(onCreateSyncedBlockFromExistingBlock).toHaveBeenCalledWith(
      'page_source',
      'source_1',
      'empty_1',
      'reference',
    )
  })

  it('creates a synced block from a two-step block handle flow', async () => {
    const user = userEvent.setup()
    const onCreateSyncedBlockFromRange = vi.fn()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [
        { id: 'block_1', type: 'paragraph', text: 'Alpha' },
        { id: 'block_2', type: 'paragraph', text: 'Beta' },
      ],
      createdAt: now,
      updatedAt: now,
    }

    render(
      <BlockEditor
        page={page}
        allPages={[page]}
        onUpdateBlock={vi.fn()}
        onCreateSyncedBlockFromRange={onCreateSyncedBlockFromRange}
      />,
    )

    const handles = screen.getAllByRole('button', { name: '拖动块' })
    await user.click(handles[0])
    await user.click(screen.getByRole('button', { name: '开始同步选区' }))
    await user.click(handles[1])
    await user.click(screen.getByRole('button', { name: '同步到这里' }))

    expect(onCreateSyncedBlockFromRange).toHaveBeenCalledWith('block_1', 'block_2')
  })

  it('shows synced handle actions and hides conversion options for synced containers', async () => {
    const user = userEvent.setup()
    const page: PageRecord = {
      id: 'page_sync',
      parentId: null,
      title: 'Sync page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_reference',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const primaryPage: PageRecord = {
      id: 'page_primary',
      parentId: null,
      title: 'Primary page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_primary',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    const { container } = render(
      <BlockEditor
        page={page}
        allPages={[primaryPage, page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onUnsyncBlockInstance={vi.fn()}
        onOpenPrimarySyncedBlock={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '拖动块' }))

    const menu = container.querySelector('.block-menu')
    if (!(menu instanceof HTMLElement)) {
      throw new Error('Expected block menu to open')
    }

    expect(within(menu).queryByText('转换为')).not.toBeInTheDocument()
    expect(within(menu).getByText('取消同步')).toBeInTheDocument()
    expect(within(menu).getByText('前往原位置')).toBeInTheDocument()
  })
  it('hides the open-primary action on the primary synced instance handle menu', async () => {
    const user = userEvent.setup()
    const page: PageRecord = {
      id: 'page_primary',
      parentId: null,
      title: 'Primary page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_primary',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const referencePage: PageRecord = {
      id: 'page_reference',
      parentId: null,
      title: 'Reference page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_reference',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    const { container } = render(
      <BlockEditor
        page={page}
        allPages={[page, referencePage]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onUnsyncBlockInstance={vi.fn()}
        onOpenPrimarySyncedBlock={vi.fn()}
      />,
    )

    const handle = container.querySelector('.block-handle')

    if (!(handle instanceof HTMLButtonElement)) {
      throw new Error('Expected block handle')
    }

    await user.click(handle)

    const menu = container.querySelector('.block-menu')
    if (!(menu instanceof HTMLElement)) {
      throw new Error('Expected block menu to open')
    }

    expect(menu.textContent).toContain('取消同步')
    expect(menu.textContent).not.toContain('前往原位置')
  })

  it('keeps only the unsync action when the synced group is missing', async () => {
    const user = userEvent.setup()
    const page: PageRecord = {
      id: 'page_missing_group',
      parentId: null,
      title: 'Missing page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_missing',
          type: 'synced_block',
          groupId: 'group_missing',
          instanceId: 'instance_missing',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }

    const { container } = render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={[]}
        onUpdateBlock={vi.fn()}
        onUnsyncBlockInstance={vi.fn()}
        onOpenPrimarySyncedBlock={vi.fn()}
      />,
    )

    const handle = container.querySelector('.block-handle')

    if (!(handle instanceof HTMLButtonElement)) {
      throw new Error('Expected block handle')
    }

    await user.click(handle)

    const menu = container.querySelector('.block-menu')
    if (!(menu instanceof HTMLElement)) {
      throw new Error('Expected block menu to open')
    }

    expect(menu.textContent).toContain('取消同步')
    expect(menu.textContent).not.toContain('前往原位置')
    expect(menu.textContent).not.toContain('转换为')
  })

  it('shows a merged external usage count on the primary synced block only', () => {
    const primaryPage: PageRecord = {
      id: 'page_primary',
      parentId: null,
      title: 'Primary page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_primary',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const referencePage: PageRecord = {
      id: 'page_reference',
      parentId: null,
      title: 'Reference page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_reference',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncPage: PageRecord = {
      id: 'page_sync_copy',
      parentId: null,
      title: 'Sync copy page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_sync_copy',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_3',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    const primaryRender = render(
      <BlockEditor
        page={primaryPage}
        allPages={[primaryPage, referencePage, syncPage]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
      />,
    )

    const primaryRow = primaryRender.container.querySelector(
      '.editor-row[data-block-id="container_primary"]',
    )

    if (!(primaryRow instanceof HTMLElement)) {
      throw new Error('Expected primary synced row')
    }

    expect(within(primaryRow).getByText('2', { selector: '.block-frame-badge' })).toBeInTheDocument()

    primaryRender.unmount()

    const copyRender = render(
      <BlockEditor
        page={referencePage}
        allPages={[primaryPage, referencePage, syncPage]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
      />,
    )
    const referenceRow = copyRender.container.querySelector(
      '.editor-row[data-block-id="container_reference"]',
    )

    if (!(referenceRow instanceof HTMLElement)) {
      throw new Error('Expected reference synced row')
    }

    expect(
      within(referenceRow).queryByText(/.+/, { selector: '.block-frame-badge' }),
    ).not.toBeInTheDocument()
  })

  it('caps the primary synced block usage badge at 99 plus', () => {
    const primaryPage: PageRecord = {
      id: 'page_primary',
      parentId: null,
      title: 'Primary page',
      icon: null,
      cover: null,
      blocks: [
        {
          id: 'container_primary',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_1',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const extraPages = Array.from({ length: 120 }, (_, index): PageRecord => ({
      id: `page_${index + 2}`,
      parentId: null,
      title: `Page ${index + 2}`,
      icon: null,
      cover: null,
      blocks: [
        {
          id: `container_${index + 2}`,
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: `instance_${index + 2}`,
          mode: index % 2 === 0 ? 'reference' : 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }))
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'paragraph_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    render(
      <BlockEditor
        page={primaryPage}
        allPages={[primaryPage, ...extraPages]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
      />,
    )

    expect(screen.getByText('99+', { selector: '.block-frame-badge' })).toBeInTheDocument()
  })

  it('deletes a focused reference block when pressing Backspace', async () => {
    const user = userEvent.setup()
    const onDeleteBlock = vi.fn()
    const page: PageRecord = {
      id: 'page_reference_delete',
      parentId: null,
      title: 'Reference page',
      icon: null,
      cover: null,
      blocks: [
        { id: 'paragraph_1', type: 'paragraph', text: 'Alpha' },
        {
          id: 'container_reference',
          type: 'synced_block',
          groupId: 'group_1',
          instanceId: 'instance_2',
          mode: 'reference',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    const syncedBlockGroups: SyncedBlockGroupRecord[] = [
      {
        id: 'group_1',
        blocks: [{ id: 'shared_1', type: 'paragraph', text: 'Weekly review' }],
        primaryInstanceId: 'instance_1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    const { container } = render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={syncedBlockGroups}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={onDeleteBlock}
      />,
    )

    const referenceBlock = container.querySelector('.synced-block-container-reference')

    if (!(referenceBlock instanceof HTMLElement)) {
      throw new Error('Expected reference synced block')
    }

    await user.click(referenceBlock)
    await user.keyboard('{Backspace}')

    expect(onDeleteBlock).toHaveBeenCalledWith('container_reference')
    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
  })

  it('deletes a focused missing synced block when pressing Backspace', async () => {
    const user = userEvent.setup()
    const onDeleteBlock = vi.fn()
    const page: PageRecord = {
      id: 'page_missing_delete',
      parentId: null,
      title: 'Missing synced page',
      icon: null,
      cover: null,
      blocks: [
        { id: 'paragraph_1', type: 'paragraph', text: 'Alpha' },
        {
          id: 'container_missing',
          type: 'synced_block',
          groupId: 'group_missing',
          instanceId: 'instance_missing',
          mode: 'sync',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }

    const { container } = render(
      <BlockEditor
        page={page}
        allPages={[page]}
        syncedBlockGroups={[]}
        onUpdateBlock={vi.fn()}
        onDeleteBlock={onDeleteBlock}
      />,
    )

    const missingBlock = container.querySelector('.synced-block-container-missing')

    if (!(missingBlock instanceof HTMLElement)) {
      throw new Error('Expected missing synced block')
    }

    await user.click(missingBlock)
    await user.keyboard('{Backspace}')

    expect(onDeleteBlock).toHaveBeenCalledWith('container_missing')
    expect(screen.getByRole('textbox', { name: '输入正文' })).toHaveFocus()
  })
})

