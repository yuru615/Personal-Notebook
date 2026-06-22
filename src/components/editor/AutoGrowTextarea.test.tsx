import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AutoGrowTextarea } from './AutoGrowTextarea'

describe('AutoGrowTextarea', () => {
  it('renders as a plain autosizing editor surface without native resize chrome', () => {
    render(<AutoGrowTextarea value="" onChange={() => undefined} />)

    const textarea = screen.getByRole('textbox')

    expect(textarea).toHaveStyle({
      overflow: 'hidden',
      resize: 'none',
    })
  })

  it('does not commit IME interim pinyin before composition ends', () => {
    const onChange = vi.fn()

    render(<AutoGrowTextarea aria-label="列表输入" value="" onChange={onChange} />)

    const textarea = screen.getByRole('textbox', { name: '列表输入' })

    fireEvent.compositionStart(textarea)
    fireEvent.change(textarea, { target: { value: 'feng' } })
    fireEvent.compositionEnd(textarea)
    fireEvent.change(textarea, { target: { value: '风' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0].target.value).toBe('风')
  })
})
