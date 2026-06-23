import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { BlockType, TextBlockStyle } from '../../domain/types'
import { BlockHandleMenu } from './BlockHandleMenu'
import { useFloatingMenuLayout } from './floatingMenu'
import { useDismissableLayer } from './useDismissableLayer'

interface BlockFrameProps {
  children: ReactNode
  textStyle?: TextBlockStyle
  allowedBlockTypes?: BlockType[]
  onDragStart: () => void
  onDragEnd: () => void
  onChangeTextStyle?: (nextStyle: TextBlockStyle) => void
  onTurnInto: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function BlockFrame({
  children,
  textStyle,
  allowedBlockTypes,
  onDragStart,
  onDragEnd,
  onChangeTextStyle,
  onTurnInto,
  onDuplicate,
  onDelete,
}: BlockFrameProps) {
  const [open, setOpen] = useState(false)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dismissableRefs = useMemo(() => [handleRef, menuRef], [])
  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])
  const menuLayout = useFloatingMenuLayout({
    open,
    anchorRef: frameRef,
    menuRef,
  })

  useDismissableLayer({
    open,
    refs: dismissableRefs,
    onDismiss: closeMenu,
  })

  return (
    <div className="block-frame" ref={frameRef}>
      <button
        ref={handleRef}
        type="button"
        aria-label="拖动块"
        className="block-handle"
        draggable
        onDragStart={(event) => {
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
          }
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      >
        ⋮⋮
      </button>
      <div className="block-frame-content">{children}</div>
      {open ? (
        <BlockHandleMenu
          menuRef={menuRef}
          placement={menuLayout.placement}
          maxHeight={menuLayout.maxHeight}
          allowedBlockTypes={allowedBlockTypes}
          textStyle={textStyle}
          onChangeTextStyle={onChangeTextStyle}
          onTurnInto={(type) => {
            setOpen(false)
            onTurnInto(type)
          }}
          onDuplicate={() => {
            setOpen(false)
            onDuplicate()
          }}
          onDelete={() => {
            setOpen(false)
            onDelete()
          }}
        />
      ) : null}
    </div>
  )
}
