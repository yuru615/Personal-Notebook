import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListBlock } from './ListBlock'

describe('ListBlock', () => {
  it('renders a single list row with the matching marker', () => {
    const { container } = render(
      <ListBlock
        type="numbered_list"
        value="第一项"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByDisplayValue('第一项')).toBeInTheDocument()

    const markers = Array.from(container.querySelectorAll('.list-block-marker')).map((element) =>
      element.textContent?.trim(),
    )

    expect(markers).toEqual(['1.'])
  })
})
