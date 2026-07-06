import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageRelationsPanel } from './PageRelationsPanel'

describe('PageRelationsPanel', () => {
  it('renders separate backlinks and mentions sections and opens the source block', async () => {
    const user = userEvent.setup()
    const onOpenSource = vi.fn()

    render(
      <PageRelationsPanel
        links={[
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: null,
            sourceBlockId: 'block_link',
            excerpt: 'See Product Plan',
            kind: 'link',
          },
        ]}
        mentions={[
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: null,
            sourceBlockId: 'block_mention',
            excerpt: '@Product Plan came up again',
            kind: 'mention',
          },
        ]}
        onOpenSource={onOpenSource}
      />,
    )

    expect(screen.getByRole('heading', { name: '链接到此页面' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '提及此页面' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /See Product Plan/ }))
    expect(onOpenSource).toHaveBeenCalledWith('page_source', 'block_link')
  })

  it('deduplicates repeated hits from the same source block and kind', () => {
    render(
      <PageRelationsPanel
        links={[
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: null,
            sourceBlockId: 'block_link',
            excerpt: 'See Product Plan',
            kind: 'link',
          },
          {
            targetPageId: 'page_target',
            sourcePageId: 'page_source',
            sourcePageTitle: 'Meeting Notes',
            sourcePageIcon: null,
            sourceBlockId: 'block_link',
            excerpt: 'See Product Plan',
            kind: 'link',
          },
        ]}
        mentions={[]}
        onOpenSource={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button', { name: /See Product Plan/ })).toHaveLength(1)
  })

  it('renders nothing when there are no relation hits', () => {
    const { container } = render(
      <PageRelationsPanel links={[]} mentions={[]} onOpenSource={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
