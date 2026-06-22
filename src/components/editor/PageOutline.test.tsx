import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
