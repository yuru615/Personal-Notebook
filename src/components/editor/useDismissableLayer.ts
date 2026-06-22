import { useEffect } from 'react'

interface DismissableRef {
  readonly current: HTMLElement | null
}

interface UseDismissableLayerOptions {
  open: boolean
  refs?: readonly DismissableRef[]
  onDismiss: () => void
  shouldKeepOpen?: (target: Node) => boolean
}

const emptyRefs: readonly DismissableRef[] = []

export function useDismissableLayer({
  open,
  refs = emptyRefs,
  onDismiss,
  shouldKeepOpen,
}: UseDismissableLayerOptions) {
  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (refs.some((ref) => ref.current?.contains(target)) || shouldKeepOpen?.(target)) {
        return
      }

      onDismiss()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [open, onDismiss, refs, shouldKeepOpen])
}
