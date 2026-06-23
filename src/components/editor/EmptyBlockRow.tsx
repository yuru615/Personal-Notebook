import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BlockType } from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { useFloatingMenuLayout } from './floatingMenu'
import { getSlashMenuOptions, SlashMenu } from './SlashMenu'
import { useDismissableLayer } from './useDismissableLayer'

interface EmptyBlockRowProps {
  allowedBlockTypes?: BlockType[]
  onInsert: (type: BlockType) => void
  onInsertParagraph?: (text: string) => void
}

export function EmptyBlockRow({
  allowedBlockTypes,
  onInsert,
  onInsertParagraph,
}: EmptyBlockRowProps) {
  const [value, setValue] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [slashMenuDismissed, setSlashMenuDismissed] = useState(false)
  const [activeOptionIndex, setActiveOptionIndex] = useState(-1)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const plusRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const dismissableRefs = useMemo(() => [plusRef, inputRef, menuRef], [])
  const open = menuOpen || (value.startsWith('/') && !slashMenuDismissed)
  const query = open ? (value.startsWith('/') ? value : `/${value}`) : value
  const menuOptions = useMemo(
    () => (open ? getSlashMenuOptions(query, allowedBlockTypes) : []),
    [allowedBlockTypes, open, query],
  )
  const activeOption =
    activeOptionIndex >= 0 && activeOptionIndex < menuOptions.length
      ? menuOptions[activeOptionIndex]
      : null
  const menuLayout = useFloatingMenuLayout({
    open,
    anchorRef: rowRef,
    menuRef,
  })

  useEffect(() => {
    setActiveOptionIndex(-1)
  }, [query])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setActiveOptionIndex(-1)

    if (value.startsWith('/')) {
      setSlashMenuDismissed(true)
    }
  }, [value])

  useDismissableLayer({
    open,
    refs: dismissableRefs,
    onDismiss: closeMenu,
  })

  function handlePick(type: BlockType) {
    onInsert(type)
    setValue('')
    setMenuOpen(false)
    setSlashMenuDismissed(false)
    setActiveOptionIndex(-1)
  }

  function handleSubmitText() {
    const nextValue = value.trim()

    if (!nextValue || open) {
      return
    }

    onInsertParagraph?.(nextValue)
    setValue('')
    setSlashMenuDismissed(false)
  }

  return (
    <div className="empty-block-row" ref={rowRef}>
      <button
        ref={plusRef}
        type="button"
        className="empty-block-plus"
        aria-label={uiCopy.editor.addBlock}
        onClick={() => {
          setMenuOpen(true)
          setSlashMenuDismissed(false)
          setActiveOptionIndex(-1)
          inputRef.current?.focus()
        }}
      >
        ＋
      </button>
      <input
        ref={inputRef}
        className="empty-block-input"
        value={value}
        placeholder={uiCopy.page.typeSlash}
        onChange={(event) => {
          setValue(event.target.value)
          setSlashMenuDismissed(false)
          setActiveOptionIndex(-1)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            closeMenu()
            return
          }

          if (open && event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveOptionIndex((current) =>
              menuOptions.length === 0 ? -1 : current < 0 ? 0 : (current + 1) % menuOptions.length,
            )
            return
          }

          if (open && event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveOptionIndex((current) =>
              menuOptions.length === 0
                ? -1
                : current <= 0
                  ? menuOptions.length - 1
                  : current - 1,
            )
            return
          }

          if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
            return
          }

          event.preventDefault()

          if (open) {
            if (activeOption) {
              handlePick(activeOption.type)
            }
            return
          }

          handleSubmitText()
        }}
      />
      {open ? (
        <SlashMenu
          query={query}
          activeType={activeOption?.type ?? null}
          allowedBlockTypes={allowedBlockTypes}
          menuRef={menuRef}
          placement={menuLayout.placement}
          maxHeight={menuLayout.maxHeight}
          onPick={handlePick}
        />
      ) : null}
    </div>
  )
}
