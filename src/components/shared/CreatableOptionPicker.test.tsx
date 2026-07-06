import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CreatableOptionPicker,
  type CreatableOption,
} from './CreatableOptionPicker'

function renderPicker({
  mode = 'single',
  options = [],
  selectedLabels = [],
}: {
  mode?: 'single' | 'multiple'
  options?: CreatableOption[]
  selectedLabels?: string[]
} = {}) {
  const onSelect = vi.fn()
  const onDeselect = vi.fn()
  const onCreate = vi.fn()
  const onDelete = vi.fn()

  const view = render(
    <CreatableOptionPicker
      mode={mode}
      options={options}
      selectedLabels={selectedLabels}
      inputLabel="选项输入"
      onSelect={onSelect}
      onDeselect={onDeselect}
      onCreate={onCreate}
      onDelete={onDelete}
    />,
  )

  return {
    ...view,
    onSelect,
    onDeselect,
    onCreate,
    onDelete,
  }
}

describe('CreatableOptionPicker', () => {
  it('single-select create-on-enter calls onCreate and not onSelect', async () => {
    const user = userEvent.setup()
    const { onCreate, onSelect } = renderPicker()

    await user.type(screen.getByRole('textbox', { name: '选项输入' }), 'Blocked{Enter}')

    expect(onCreate).toHaveBeenCalledWith('Blocked')
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('single-select Enter trims input before calling onCreate', async () => {
    const user = userEvent.setup()
    const { onCreate, onSelect } = renderPicker()

    await user.type(screen.getByRole('textbox', { name: '选项输入' }), '  Blocked  {Enter}')

    expect(onCreate).toHaveBeenCalledWith('Blocked')
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('multi-select clicking an already-selected option calls onDeselect and not onSelect or onCreate', async () => {
    const user = userEvent.setup()
    const { onCreate, onDeselect, onSelect } = renderPicker({
      mode: 'multiple',
      options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
      selectedLabels: ['Alpha'],
    })

    await user.click(screen.getByRole('option', { name: 'Alpha' }))

    expect(onDeselect).toHaveBeenCalledWith('Alpha')
    expect(onDeselect).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('exact existing label on Enter selects existing option instead of creating duplicate', async () => {
    const user = userEvent.setup()
    const { onCreate, onSelect } = renderPicker({
      options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
    })

    await user.type(screen.getByRole('textbox', { name: '选项输入' }), 'Alpha{Enter}')

    expect(onSelect).toHaveBeenCalledWith('Alpha')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('clicking an option after typing text clears the textbox', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderPicker({
      options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
    })
    const textbox = screen.getByRole('textbox', { name: '选项输入' })

    await user.type(textbox, 'temp')
    await user.click(screen.getByRole('option', { name: 'Alpha' }))

    expect(onSelect).toHaveBeenCalledWith('Alpha')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(textbox).toHaveValue('')
  })

  it('exact existing selected label on Enter in multiple mode calls onDeselect', async () => {
    const user = userEvent.setup()
    const { onCreate, onDeselect, onSelect } = renderPicker({
      mode: 'multiple',
      options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
      selectedLabels: ['Alpha'],
    })

    await user.type(screen.getByRole('textbox', { name: '选项输入' }), 'Alpha{Enter}')

    expect(onDeselect).toHaveBeenCalledWith('Alpha')
    expect(onDeselect).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows a visible create action for a new draft and clicking it creates the option', async () => {
    const user = userEvent.setup()
    const { onCreate, onSelect } = renderPicker({
      options: [{ id: 'alpha', label: 'Alpha', color: 'blue' }],
    })

    await user.type(screen.getByRole('textbox', { name: /选项输入/ }), 'Blocked')
    await user.click(screen.getByRole('button', { name: '创建 “Blocked”' }))

    expect(onCreate).toHaveBeenCalledWith('Blocked')
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders a color swatch for colored options', () => {
    const { container } = renderPicker({
      options: [{ id: 'alpha', label: 'Alpha', color: '#2563eb' }],
    })

    const swatch = container.querySelector('.creatable-option-picker-color') as HTMLElement | null

    expect(swatch).not.toBeNull()
    expect(swatch?.style.backgroundColor).not.toBe('')
  })

  it('clicking delete removes an option without selecting it', async () => {
    const user = userEvent.setup()
    const { onCreate, onDelete, onDeselect, onSelect } = renderPicker({
      mode: 'multiple',
      options: [{ id: 'alpha', label: 'Alpha', color: '#2563eb' }],
      selectedLabels: ['Alpha'],
    })

    await user.click(screen.getByRole('button', { name: '删除 Alpha' }))

    expect(onDelete).toHaveBeenCalledWith('alpha')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDeselect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })
})
