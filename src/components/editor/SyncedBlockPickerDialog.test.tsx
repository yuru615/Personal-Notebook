import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SyncedBlockPickerDialog } from './SyncedBlockPickerDialog'

describe('SyncedBlockPickerDialog', () => {
  it('filters synced groups and returns the picked group id', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()

    render(
      <SyncedBlockPickerDialog
        open
        mode="sync"
        items={[
          {
            id: 'group:group_1',
            summary: 'Weekly review',
            meta: '2 个块',
            blockCount: 2,
            searchText: 'Weekly review',
            source: { kind: 'group', groupId: 'group_1' },
          },
          {
            id: 'group:group_2',
            summary: 'Project plan',
            meta: '3 个块',
            blockCount: 3,
            searchText: 'Project plan',
            source: { kind: 'group', groupId: 'group_2' },
          },
        ]}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText('搜索已有内容'), 'Weekly')
    await user.click(screen.getByRole('button', { name: /Weekly review/i }))

    expect(onPick).toHaveBeenCalledWith('group:group_1')
    expect(screen.queryByRole('button', { name: /Project plan/i })).not.toBeInTheDocument()
  })

  it('supports keyboard selection with arrow keys and enter', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()

    render(
      <SyncedBlockPickerDialog
        open
        mode="reference"
        items={[
          {
            id: 'group:group_1',
            summary: 'Weekly review',
            meta: '2 个块',
            blockCount: 2,
            searchText: 'Weekly review',
            source: { kind: 'group', groupId: 'group_1' },
          },
          {
            id: 'block:page_1:block_1',
            summary: 'Existing source note',
            meta: 'Source page',
            blockCount: 1,
            searchText: 'Existing source note Source page',
            source: { kind: 'block', pageId: 'page_1', blockId: 'block_1' },
          },
        ]}
        onPick={onPick}
        onClose={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText('搜索已有内容')
    await user.type(input, 'source')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onPick).toHaveBeenCalledWith('block:page_1:block_1')
  })
})
