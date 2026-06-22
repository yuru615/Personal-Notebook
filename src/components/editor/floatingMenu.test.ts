import { describe, expect, it } from 'vitest'
import { resolveFloatingMenuLayout } from './floatingMenu'

describe('resolveFloatingMenuLayout', () => {
  it('keeps the menu below the anchor when there is enough room', () => {
    expect(
      resolveFloatingMenuLayout({
        anchorTop: 100,
        anchorBottom: 132,
        menuHeight: 260,
        viewportHeight: 900,
      }),
    ).toEqual({
      maxHeight: 744,
      placement: 'bottom',
    })
  })

  it('moves the menu above the anchor when it would overflow below', () => {
    expect(
      resolveFloatingMenuLayout({
        anchorTop: 864,
        anchorBottom: 894,
        menuHeight: 626,
        viewportHeight: 912,
      }),
    ).toEqual({
      maxHeight: 840,
      placement: 'top',
    })
  })

  it('chooses the side with more room and clamps height when neither side fits', () => {
    expect(
      resolveFloatingMenuLayout({
        anchorTop: 300,
        anchorBottom: 332,
        menuHeight: 700,
        viewportHeight: 640,
      }),
    ).toEqual({
      maxHeight: 284,
      placement: 'bottom',
    })
  })
})
