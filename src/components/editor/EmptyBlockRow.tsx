import { useState } from 'react'
import type { BlockType } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { SlashMenu } from './SlashMenu'

interface EmptyBlockRowProps {
  onInsert: (type: BlockType) => void
}

export function EmptyBlockRow({ onInsert }: EmptyBlockRowProps) {
  const [value, setValue] = useState('')
  const open = value.startsWith('/')

  function handlePick(type: BlockType) {
    onInsert(type)
    setValue('')
  }

  return (
    <div className="empty-block-row">
      <span className="empty-block-plus" aria-hidden="true">
        ＋
      </span>
      <input
        className="empty-block-input"
        value={value}
        placeholder={uiCopy.page.typeSlash}
        onChange={(event) => setValue(event.target.value)}
      />
      {open ? <SlashMenu query={value} onPick={handlePick} /> : null}
    </div>
  )
}
