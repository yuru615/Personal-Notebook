import type { ReactNode } from 'react'
import { useState } from 'react'
import type { BlockType } from '../../domain/types'
import { BlockHandleMenu } from './BlockHandleMenu'

interface BlockFrameProps {
  children: ReactNode
  onDragStart: () => void
  onTurnInto: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function BlockFrame({
  children,
  onDragStart,
  onTurnInto,
  onDuplicate,
  onDelete,
}: BlockFrameProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="block-frame">
      <button
        type="button"
        className="block-handle"
        draggable
        onDragStart={onDragStart}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮⋮
      </button>
      <div className="block-frame-content">{children}</div>
      {open ? (
        <BlockHandleMenu
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
