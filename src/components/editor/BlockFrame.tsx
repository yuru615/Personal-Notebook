import type { ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { BlockType, TextBlockStyle } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { BlockHandleMenu, type BlockHandleMenuAction } from './BlockHandleMenu'
import { useFloatingMenuLayout } from './floatingMenu'
import { SlashMenu, type SlashMenuCommand } from './SlashMenu'
import { useDismissableLayer } from './useDismissableLayer'

type BlockFrameMenuMode = 'block' | 'insert'

interface BlockFrameProps {
  children: ReactNode
  badge?: string | null
  textStyle?: TextBlockStyle
  allowedBlockTypes?: BlockType[]
  menuMode?: BlockFrameMenuMode
  extraMenuActions?: BlockHandleMenuAction[]
  onDragStart: () => void
  onDragEnd: () => void
  onChangeTextStyle?: (nextStyle: TextBlockStyle) => void
  onInsertPick?: (type: SlashMenuCommand) => void
  onTurnInto: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function BlockFrame({
  children,
  badge = null,
  textStyle,
  allowedBlockTypes,
  menuMode = 'block',
  extraMenuActions = [],
  onDragStart,
  onDragEnd,
  onChangeTextStyle,
  onInsertPick,
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
    anchorRef: handleRef,
    menuRef,
  })
  const isInsertMenu = menuMode === 'insert'

  useDismissableLayer({
    open,
    refs: dismissableRefs,
    onDismiss: closeMenu,
  })

  return (
    <div className={`block-frame${badge ? ' block-frame-has-badge' : ''}`} ref={frameRef}>
      <div className="block-frame-handle-anchor">
        <button
          ref={handleRef}
          type="button"
          aria-label={isInsertMenu ? uiCopy.editor.addBlock : '拖动块'}
          className="block-handle"
          draggable={!isInsertMenu}
          onDragStart={(event) => {
            if (isInsertMenu) {
              return
            }

            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move'
            }
            onDragStart()
          }}
          onDragEnd={() => {
            if (!isInsertMenu) {
              onDragEnd()
            }
          }}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        >
          {isInsertMenu ? '+' : '⋮⋮'}
        </button>
        {open ? (
          isInsertMenu ? (
            <SlashMenu
              query="/"
              allowedBlockTypes={allowedBlockTypes}
              menuRef={menuRef}
              placement={menuLayout.placement}
              maxHeight={menuLayout.maxHeight}
              onPick={(type) => {
                setOpen(false)
                onInsertPick?.(type)
              }}
            />
          ) : (
            <BlockHandleMenu
              menuRef={menuRef}
              placement={menuLayout.placement}
              maxHeight={menuLayout.maxHeight}
              allowedBlockTypes={allowedBlockTypes}
              extraActions={extraMenuActions.map((action) => ({
                ...action,
                onSelect: () => {
                  setOpen(false)
                  action.onSelect()
                },
              }))}
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
          )
        ) : null}
      </div>
      <div className="block-frame-content">{children}</div>
      {badge ? <span className="block-frame-badge">{badge}</span> : null}
    </div>
  )
}
