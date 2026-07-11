import type { ClipboardEvent as ReactClipboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BlockType } from '../../domain/types'
import { readDesktopClipboardCandidate } from '../../lib/desktopLifecycle'
import { uiCopy } from '../../ui/copy'
import { useFloatingMenuLayout } from './floatingMenu'
import { getSlashMenuOptions, SlashMenu, type SlashMenuCommand } from './SlashMenu'
import type { DesktopPasteFallback, PastedImageSource } from './RichTextEditable'
import { useDismissableLayer } from './useDismissableLayer'

interface EmptyBlockRowProps {
  allowedBlockTypes?: BlockType[]
  onInsert: (type: SlashMenuCommand) => void
  onInsertParagraph?: (text: string) => void
  onPasteImage?: (source: PastedImageSource) => Promise<void> | void
  onPasteStructuredContent?: (clipboardData: DataTransfer) => boolean
  onPasteDesktopContent?: () => Promise<DesktopPasteFallback>
}

function isImageFile(file: File) {
  if (file.type && file.type.startsWith('image/')) {
    return true
  }

  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || '')
}

function getClipboardImageFile(dataTransfer?: DataTransfer | null) {
  if (!dataTransfer) {
    return null
  }

  const file = Array.from(dataTransfer.files ?? []).find(isImageFile)
  if (file) {
    return file
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') {
      continue
    }

    const candidate = item.getAsFile()
    if (candidate && (item.type.startsWith('image/') || isImageFile(candidate))) {
      return candidate
    }
  }

  return null
}

function getClipboardImageName(mimeType: string) {
  const extension = mimeType.split('/')[1]?.split('+')[0] || 'png'
  return `clipboard-${Date.now()}.${extension}`
}

async function readBrowserClipboardImageFile(): Promise<File | null> {
  if (typeof navigator === 'undefined') {
    return null
  }

  const clipboard = navigator.clipboard as Clipboard & {
    read?: () => Promise<Array<{ types: readonly string[]; getType?: (type: string) => Promise<Blob> }>>
  }

  if (typeof clipboard?.read !== 'function') {
    return null
  }

  try {
    const items = await clipboard.read()

    for (const item of items) {
      const mimeType = item.types.find((type) => type.startsWith('image/'))

      if (!mimeType || typeof item.getType !== 'function') {
        continue
      }

      const blob = await item.getType(mimeType)

      if (blob.size === 0) {
        continue
      }

      return new File([blob], getClipboardImageName(mimeType), {
        type: mimeType,
        lastModified: Date.now(),
      })
    }
  } catch {
    return null
  }

  return null
}

async function getPastedImageSource(dataTransfer?: DataTransfer | null): Promise<PastedImageSource | null> {
  const file = getClipboardImageFile(dataTransfer)
  if (file) {
    return file
  }

  const browserClipboardFile = await readBrowserClipboardImageFile()
  if (browserClipboardFile) {
    return browserClipboardFile
  }

  const candidate = await readDesktopClipboardCandidate()
  if (!candidate || (candidate.kind !== 'image_bytes' && candidate.kind !== 'image_file')) {
    return null
  }

  return candidate
}

function hasReadableClipboardText(dataTransfer: DataTransfer) {
  if (typeof dataTransfer.getData !== 'function') {
    return false
  }

  return ['text/markdown', 'text/plain', 'text/html', 'Text'].some((type) => {
    try {
      return dataTransfer.getData(type).length > 0
    } catch {
      return false
    }
  })
}

export function EmptyBlockRow({
  allowedBlockTypes,
  onInsert,
  onInsertParagraph,
  onPasteImage,
  onPasteStructuredContent,
  onPasteDesktopContent,
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

  function handlePick(type: SlashMenuCommand) {
    onInsert(type)
    setValue('')
    setMenuOpen(false)
    setSlashMenuDismissed(false)
    setActiveOptionIndex(-1)
  }

  function handleSubmitText() {
    if (open) {
      return
    }

    const nextValue = value.trim()

    if (!nextValue) {
      onInsert('paragraph')
      setValue('')
      setSlashMenuDismissed(false)
      return
    }

    onInsertParagraph?.(nextValue)
    setValue('')
    setSlashMenuDismissed(false)
  }

  function handlePaste(event: ReactClipboardEvent<HTMLInputElement>) {
    const resetRowState = () => {
      setValue('')
      setMenuOpen(false)
      setSlashMenuDismissed(false)
      setActiveOptionIndex(-1)
    }

    const directFile = getClipboardImageFile(event.clipboardData)
    if (directFile && onPasteImage) {
      event.preventDefault()
      resetRowState()
      void Promise.resolve(onPasteImage(directFile)).catch(() => undefined)
      return
    }

    if (onPasteStructuredContent?.(event.clipboardData)) {
      event.preventDefault()
      resetRowState()
      return
    }

    if (!hasReadableClipboardText(event.clipboardData) && onPasteDesktopContent) {
      void onPasteDesktopContent()
        .then(({ handled, imageSource }) => {
          if (handled) {
            resetRowState()
            return
          }

          if (!onPasteImage) {
            return
          }

          if (imageSource) {
            resetRowState()
            return onPasteImage(imageSource)
          }

          return getPastedImageSource(event.clipboardData).then((source) => {
            if (source) {
              resetRowState()
              return onPasteImage(source)
            }
          })
        })
        .catch(() => undefined)
      return
    }

    if (!onPasteImage) {
      return
    }

    void getPastedImageSource(event.clipboardData)
      .then((source) => {
        if (!source) {
          return
        }

        resetRowState()
        return onPasteImage(source)
      })
      .catch(() => undefined)
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
        onPaste={handlePaste}
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
