import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageOutline } from './PageOutline'

describe('PageOutline', () => {
  it('shows an empty state when the current page has no headings', () => {
    render(
      <PageOutline
        blocks={[
          {
            id: 'block-paragraph',
            type: 'paragraph',
            text: '普通正文',
          },
        ]}
      />,
    )

    expect(screen.getByText('目录')).toBeInTheDocument()
    expect(screen.getByText('暂无标题')).toBeInTheDocument()
  })
  it('follows the focused heading block in the outline', () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      render(
        <>
          <div id="block-heading-start" className="editor-row" data-block-id="heading-start">
            <div role="textbox" tabIndex={0}>
              Start
            </div>
          </div>
          <div id="block-heading-france" className="editor-row" data-block-id="heading-france">
            <div role="textbox" tabIndex={0}>
              France emperor
            </div>
          </div>
          <PageOutline
            blocks={[
              {
                id: 'heading-start',
                type: 'heading_2',
                text: 'Start',
              },
              {
                id: 'heading-france',
                type: 'heading_2',
                text: 'France emperor',
              },
            ]}
          />
        </>,
      )

      const [franceHeading, franceOutlineItem] = screen.getAllByText('France emperor')

      fireEvent.focusIn(franceHeading)

      expect(franceOutlineItem).toHaveClass('page-outline-item-active')
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
