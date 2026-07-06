import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageRelationAutocomplete } from './PageRelationAutocomplete'

describe('PageRelationAutocomplete', () => {
  it('shows path labels for nested pages', () => {
    render(
      <PageRelationAutocomplete
        kind="link"
        suggestions={[
          {
            id: 'page_product',
            title: 'Product Plan',
            icon: null,
            parentId: 'page_planning',
            pathLabel: 'Workspace / Planning',
          },
        ]}
        activeIndex={0}
        top={120}
        left={240}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('listbox', { name: '页面链接建议' })).toBeInTheDocument()
    expect(screen.getByText('Workspace / Planning')).toBeInTheDocument()
  })
})
