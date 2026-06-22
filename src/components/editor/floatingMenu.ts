import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

export type FloatingMenuPlacement = 'top' | 'bottom'

interface ResolveFloatingMenuLayoutInput {
  anchorTop: number
  anchorBottom: number
  menuHeight: number
  viewportHeight: number
  edgePadding?: number
  gap?: number
}

interface FloatingMenuLayout {
  placement: FloatingMenuPlacement
  maxHeight: number
}

export function resolveFloatingMenuLayout({
  anchorTop,
  anchorBottom,
  menuHeight,
  viewportHeight,
  edgePadding = 16,
  gap = 8,
}: ResolveFloatingMenuLayoutInput): FloatingMenuLayout {
  const availableTop = Math.max(0, Math.floor(anchorTop - edgePadding - gap))
  const availableBottom = Math.max(
    0,
    Math.floor(viewportHeight - anchorBottom - edgePadding - gap),
  )

  if (availableBottom >= menuHeight || availableBottom >= availableTop) {
    return {
      placement: 'bottom',
      maxHeight: availableBottom,
    }
  }

  return {
    placement: 'top',
    maxHeight: availableTop,
  }
}

interface UseFloatingMenuLayoutOptions {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  menuRef: RefObject<HTMLElement | null>
}

export function useFloatingMenuLayout({
  open,
  anchorRef,
  menuRef,
}: UseFloatingMenuLayoutOptions): FloatingMenuLayout {
  const [layout, setLayout] = useState<FloatingMenuLayout>({
    placement: 'bottom',
    maxHeight: 320,
  })

  useLayoutEffect(() => {
    if (!open) {
      return
    }

    function updateLayout() {
      const anchor = anchorRef.current
      const menu = menuRef.current

      if (!anchor || !menu) {
        return
      }

      const anchorRect = anchor.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()

      setLayout(
        resolveFloatingMenuLayout({
          anchorTop: anchorRect.top,
          anchorBottom: anchorRect.bottom,
          menuHeight: menuRect.height,
          viewportHeight: window.innerHeight,
        }),
      )
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)

    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
    }
  }, [anchorRef, menuRef, open])

  return layout
}
