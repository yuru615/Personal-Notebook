import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MediaBlock } from './MediaBlock'

describe('MediaBlock', () => {
  it('does not put the image element class on the outer figure', () => {
    const { container } = render(
      <MediaBlock
        block={{
          id: 'image-1',
          type: 'image',
          assetId: null,
          name: '',
          mimeType: '',
          caption: '',
          alt: '',
        }}
        onChange={vi.fn()}
      />,
    )

    const figure = container.querySelector('figure.media-block')

    expect(figure).toBeInTheDocument()
    expect(figure).toHaveClass('media-block-kind-image')
    expect(figure).not.toHaveClass('media-block-image')
  })
})
