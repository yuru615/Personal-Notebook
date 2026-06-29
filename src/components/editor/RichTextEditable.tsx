import type { CSSProperties, FormEvent, KeyboardEventHandler, MouseEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RichTextSegment, TextColor } from '../../domain/types'
import {
  applyRichTextMark,
  normalizeRichText,
  richTextFromPlainText,
  richTextToPlainText,
  type RichTextMarkPatch,
} from '../../domain/richText'
import { openExternalLink } from '../../lib/externalLinks'
import { textColorValues } from './blockTextStyle'

export interface RichTextEditableChange {
  text: string
  richText?: RichTextSegment[]
}

interface RichTextEditableProps {
  value: string
  richText?: RichTextSegment[]
  className?: string
  style?: CSSProperties
  placeholder?: string
  ariaLabel: string
  onChange: (next: RichTextEditableChange) => void
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

interface SelectionOffsets {
  start: number
  end: number
}

interface ToolbarPosition {
  top: number
  left: number
}

interface ActiveSelectionMarks {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  link?: string
  color?: TextColor
}

const textColorOptions: Array<{ value: TextColor; label: string }> = [
  { value: 'gray', label: '灰色' },
  { value: 'brown', label: '棕色' },
  { value: 'orange', label: '橙色' },
  { value: 'yellow', label: '黄色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'purple', label: '紫色' },
  { value: 'pink', label: '粉色' },
  { value: 'red', label: '红色' },
]

const emptyActiveSelectionMarks: ActiveSelectionMarks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function isTextColor(value: string | null): value is TextColor {
  return Boolean(value && value in textColorValues)
}

function richTextToHtml(segments: RichTextSegment[]) {
  return normalizeRichText(segments)
    .map((segment) => {
      let html = escapeHtml(segment.text).replace(/\n/g, '<br>')

      if (segment.bold) {
        html = `<strong>${html}</strong>`
      }

      if (segment.italic) {
        html = `<em>${html}</em>`
      }

      if (segment.underline) {
        html = `<u>${html}</u>`
      }

      if (segment.strike) {
        html = `<s>${html}</s>`
      }

      if (segment.link) {
        html = `<a href="${escapeAttribute(segment.link)}">${html}</a>`
      }

      if (segment.color) {
        html = `<span data-rich-text-color="${escapeAttribute(segment.color)}" style="color: ${textColorValues[segment.color]}">${html}</span>`
      }

      return html
    })
    .join('')
}

function getSegments(value: string, richText?: RichTextSegment[]) {
  return richText && richText.length > 0 ? normalizeRichText(richText) : richTextFromPlainText(value)
}

function marksFromElement(element: Element, marks: Omit<RichTextSegment, 'text'>) {
  const tagName = element.tagName.toLowerCase()
  const nextMarks = { ...marks }

  if (tagName === 'strong' || tagName === 'b') {
    nextMarks.bold = true
  }

  if (tagName === 'em' || tagName === 'i') {
    nextMarks.italic = true
  }

  if (tagName === 'u') {
    nextMarks.underline = true
  }

  if (tagName === 's' || tagName === 'strike' || tagName === 'del') {
    nextMarks.strike = true
  }

  if (tagName === 'a') {
    const href = element.getAttribute('href')
    if (href) {
      nextMarks.link = href
    }
  }

  const color = element.getAttribute('data-rich-text-color')
  if (isTextColor(color)) {
    nextMarks.color = color
  }

  return nextMarks
}

function readSegmentsFromNode(
  node: Node,
  marks: Omit<RichTextSegment, 'text'>,
): RichTextSegment[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    return text ? [{ text, ...marks }] : []
  }

  if (!(node instanceof Element)) {
    return []
  }

  if (node.tagName.toLowerCase() === 'br') {
    return [{ text: '\n', ...marks }]
  }

  const nextMarks = marksFromElement(node, marks)
  return Array.from(node.childNodes).flatMap((child) => readSegmentsFromNode(child, nextMarks))
}

function readSegmentsFromElement(element: HTMLElement): RichTextSegment[] {
  return normalizeRichText(
    Array.from(element.childNodes).flatMap((child) => readSegmentsFromNode(child, {})),
  )
}

function hasRichTextMarks(segments: RichTextSegment[]) {
  return segments.some(
    (segment) =>
      segment.bold ||
      segment.italic ||
      segment.underline ||
      segment.strike ||
      segment.link ||
      segment.color,
  )
}

function segmentsEqual(left: RichTextSegment[], right: RichTextSegment[]) {
  const normalizedLeft = normalizeRichText(left)
  const normalizedRight = normalizeRichText(right)

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((segment, index) => {
    const other = normalizedRight[index]
    return (
      segment.text === other.text &&
      segment.bold === other.bold &&
      segment.italic === other.italic &&
      segment.underline === other.underline &&
      segment.strike === other.strike &&
      segment.link === other.link &&
      segment.color === other.color
    )
  })
}

function getLinkTarget(target: EventTarget | null) {
  if (!(target instanceof Node)) {
    return null
  }

  const element =
    target instanceof HTMLAnchorElement
      ? target
      : target.parentElement?.closest('a[href]')

  return element instanceof HTMLAnchorElement ? element : null
}

function toChangePayload(segments: RichTextSegment[]): RichTextEditableChange {
  const normalized = normalizeRichText(segments)
  return {
    text: richTextToPlainText(normalized),
    richText: hasRichTextMarks(normalized) ? normalized : undefined,
  }
}

function getSelectionOffsets(root: HTMLElement): SelectionOffsets | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    return null
  }

  const beforeSelection = range.cloneRange()
  beforeSelection.selectNodeContents(root)
  beforeSelection.setEnd(range.startContainer, range.startOffset)

  const start = beforeSelection.toString().length
  const end = start + range.toString().length

  return start === end ? null : { start, end }
}

function getToolbarPosition(root: HTMLElement): ToolbarPosition {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const rootRect = root.getBoundingClientRect()

  if (!range || typeof range.getBoundingClientRect !== 'function') {
    return {
      top: rootRect.top - 44,
      left: rootRect.left + rootRect.width / 2,
    }
  }

  const rect = range.getBoundingClientRect()
  const anchorRect = rect.width > 0 || rect.height > 0 ? rect : rootRect

  return {
    top: anchorRect.top - 44,
    left: anchorRect.left + anchorRect.width / 2,
  }
}

function selectedSegmentsAllHaveMark(
  segments: RichTextSegment[],
  selection: SelectionOffsets,
  markName: Exclude<keyof RichTextMarkPatch, 'link' | 'color'>,
) {
  let offset = 0
  let hasSelectedText = false

  for (const segment of normalizeRichText(segments)) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd

    if (segmentEnd <= selection.start || segmentStart >= selection.end) {
      continue
    }

    hasSelectedText = true
    if (!segment[markName]) {
      return false
    }
  }

  return hasSelectedText
}

function getSelectedSegments(segments: RichTextSegment[], selection: SelectionOffsets) {
  const selected: RichTextSegment[] = []
  let offset = 0

  for (const segment of normalizeRichText(segments)) {
    const segmentStart = offset
    const segmentEnd = offset + segment.text.length
    offset = segmentEnd

    if (segmentEnd <= selection.start || segmentStart >= selection.end) {
      continue
    }

    selected.push(segment)
  }

  return selected
}

function getActiveSelectionMarks(
  segments: RichTextSegment[],
  selection: SelectionOffsets | null,
): ActiveSelectionMarks {
  if (!selection) {
    return emptyActiveSelectionMarks
  }

  const normalized = normalizeRichText(segments)
  const selected = getSelectedSegments(normalized, selection)

  if (selected.length === 0) {
    return emptyActiveSelectionMarks
  }

  const firstLink = selected[0]?.link
  const firstColor = selected[0]?.color

  return {
    bold: selectedSegmentsAllHaveMark(normalized, selection, 'bold'),
    italic: selectedSegmentsAllHaveMark(normalized, selection, 'italic'),
    underline: selectedSegmentsAllHaveMark(normalized, selection, 'underline'),
    strike: selectedSegmentsAllHaveMark(normalized, selection, 'strike'),
    link:
      firstLink && selected.every((segment) => segment.link && segment.link === firstLink)
        ? firstLink
        : undefined,
    color:
      firstColor && selected.every((segment) => segment.color && segment.color === firstColor)
        ? firstColor
        : undefined,
  }
}

export function RichTextEditable({
  value,
  richText,
  className,
  style,
  placeholder,
  ariaLabel,
  onChange,
  onKeyDown,
}: RichTextEditableProps) {
  const editableRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)
  const selectionRef = useRef<SelectionOffsets | null>(null)
  const ignoreSelectionChangeRef = useRef(false)
  const isLinkMenuOpenRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(value.length === 0)
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null)
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false)
  const [isLinkMenuOpen, setIsLinkMenuOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [hoveredLinkHref, setHoveredLinkHref] = useState<string | null>(null)
  const [isModifierPressed, setIsModifierPressed] = useState(false)
  const [activeMarks, setActiveMarks] = useState<ActiveSelectionMarks>(emptyActiveSelectionMarks)
  const isLinkOpenReady = Boolean(hoveredLinkHref && isModifierPressed)

  useLayoutEffect(() => {
    const element = editableRef.current

    if (!element) {
      return
    }

    const segments = getSegments(value, richText)
    const normalizedSegments = normalizeRichText(segments)

    if (isFocusedRef.current) {
      const currentSegments = readSegmentsFromElement(element)
      if (segmentsEqual(currentSegments, normalizedSegments)) {
        setIsEmpty(richTextToPlainText(normalizedSegments).length === 0)
        return
      }
    }

    element.innerHTML = richTextToHtml(normalizedSegments)
    setIsEmpty(richTextToPlainText(normalizedSegments).length === 0)
  }, [richText, value])

  useEffect(() => {
    isLinkMenuOpenRef.current = isLinkMenuOpen
  }, [isLinkMenuOpen])

  useEffect(() => {
    function syncModifierState(event: KeyboardEvent) {
      setIsModifierPressed(event.ctrlKey || event.metaKey)
    }

    function resetModifierState() {
      setIsModifierPressed(false)
    }

    window.addEventListener('keydown', syncModifierState, true)
    window.addEventListener('keyup', syncModifierState, true)
    window.addEventListener('blur', resetModifierState)

    return () => {
      window.removeEventListener('keydown', syncModifierState, true)
      window.removeEventListener('keyup', syncModifierState, true)
      window.removeEventListener('blur', resetModifierState)
    }
  }, [])

  useEffect(() => {
    function hideToolbarForOutsidePointer(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      const editable = editableRef.current
      const toolbar = toolbarRef.current

      if (editable?.contains(target) || toolbar?.contains(target)) {
        return
      }

      setToolbarPosition(null)
      setIsColorMenuOpen(false)
      setIsLinkMenuOpen(false)
      setLinkDraft('')
      selectionRef.current = null
      setActiveMarks(emptyActiveSelectionMarks)
      setHoveredLinkHref(null)

      const selection = window.getSelection()
      if (selection && editable && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (editable.contains(range.commonAncestorContainer)) {
          selection.removeAllRanges()
        }
      }
    }

    function syncToolbarWithSelection() {
      if (ignoreSelectionChangeRef.current) {
        return
      }

      const editable = editableRef.current
      const selection = window.getSelection()

      if (!editable || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        if (isLinkMenuOpenRef.current && selectionRef.current) {
          return
        }

        setToolbarPosition(null)
        setIsColorMenuOpen(false)
        setIsLinkMenuOpen(false)
        setLinkDraft('')
        selectionRef.current = null
        setActiveMarks(emptyActiveSelectionMarks)
        setHoveredLinkHref(null)
        return
      }

      const range = selection.getRangeAt(0)
      if (!editable.contains(range.commonAncestorContainer)) {
        if (isLinkMenuOpenRef.current && selectionRef.current) {
          return
        }

        setToolbarPosition(null)
        setIsColorMenuOpen(false)
        setIsLinkMenuOpen(false)
        setLinkDraft('')
        selectionRef.current = null
        setActiveMarks(emptyActiveSelectionMarks)
        setHoveredLinkHref(null)
        return
      }

      const nextSelection = getSelectionOffsets(editable)
      const segments = readSegmentsFromElement(editable)
      selectionRef.current = nextSelection
      setActiveMarks(getActiveSelectionMarks(segments, nextSelection))
      setToolbarPosition(getToolbarPosition(editable))
    }

    document.addEventListener('pointerdown', hideToolbarForOutsidePointer, true)
    document.addEventListener('selectionchange', syncToolbarWithSelection)

    return () => {
      document.removeEventListener('pointerdown', hideToolbarForOutsidePointer, true)
      document.removeEventListener('selectionchange', syncToolbarWithSelection)
    }
  }, [])

  function refreshToolbar() {
    const element = editableRef.current

    if (!element) {
      return
    }

    const selection = getSelectionOffsets(element)
    if (!selection) {
      setToolbarPosition(null)
      setIsColorMenuOpen(false)
      setIsLinkMenuOpen(false)
      setLinkDraft('')
      selectionRef.current = null
      setActiveMarks(emptyActiveSelectionMarks)
      setHoveredLinkHref(null)
      return
    }

    const segments = readSegmentsFromElement(element)
    selectionRef.current = selection
    setActiveMarks(getActiveSelectionMarks(segments, selection))
    setToolbarPosition(getToolbarPosition(element))
  }

  function commitSegments(
    segments: RichTextSegment[],
    selectionToKeep: SelectionOffsets | null = null,
  ) {
    const element = editableRef.current
    const payload = toChangePayload(segments)

    if (element) {
      element.innerHTML = richTextToHtml(segments)
    }

    setIsEmpty(payload.text.length === 0)
    selectionRef.current = selectionToKeep
    setActiveMarks(getActiveSelectionMarks(segments, selectionToKeep))

    if (selectionToKeep && toolbarPosition) {
      ignoreSelectionChangeRef.current = true
      queueMicrotask(() => {
        ignoreSelectionChangeRef.current = false
      })
    }

    onChange(payload)
  }

  function handleInput() {
    const element = editableRef.current

    if (!element) {
      return
    }

    const segments = readSegmentsFromElement(element)
    const payload = toChangePayload(segments)
    setIsEmpty(payload.text.length === 0)
    const selection = getSelectionOffsets(element)
    selectionRef.current = selection
    setActiveMarks(getActiveSelectionMarks(segments, selection))
    onChange(payload)
  }

  function applySelectionMark(mark: RichTextMarkPatch, selectionOverride?: SelectionOffsets | null) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const selection = selectionOverride ?? getSelectionOffsets(element) ?? selectionRef.current
    if (!selection) {
      return
    }

    const baseSegments = readSegmentsFromElement(element)
    commitSegments(
      applyRichTextMark(baseSegments, selection.start, selection.end, mark),
      selection,
    )
  }

  function toggleBooleanMark(markName: Exclude<keyof RichTextMarkPatch, 'link' | 'color'>) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const selection = getSelectionOffsets(element) ?? selectionRef.current
    if (!selection) {
      return
    }

    const baseSegments = readSegmentsFromElement(element)
    applySelectionMark(
      {
        [markName]: selectedSegmentsAllHaveMark(baseSegments, selection, markName)
          ? undefined
          : true,
      },
      selection,
    )
  }

  function applyLink() {
    const element = editableRef.current
    if (!element) {
      return
    }

    const selection = getSelectionOffsets(element) ?? selectionRef.current
    if (!selection) {
      return
    }

    selectionRef.current = selection
    setIsColorMenuOpen(false)
    setLinkDraft(activeMarks.link ?? '')
    setIsLinkMenuOpen(true)
  }

  function closeLinkEditor() {
    setIsLinkMenuOpen(false)
    setLinkDraft('')
  }

  function submitLink(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    const selection = selectionRef.current
    if (!selection) {
      return
    }

    applySelectionMark({ link: linkDraft.trim() || undefined }, selection)
    closeLinkEditor()
  }

  function applyTextColor(color?: TextColor) {
    applySelectionMark({ color }, selectionRef.current)
    setIsColorMenuOpen(false)
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const link = getLinkTarget(event.target)
    setHoveredLinkHref(link?.getAttribute('href') ?? null)
    setIsModifierPressed(event.ctrlKey || event.metaKey)
  }

  function handleMouseLeave() {
    setHoveredLinkHref(null)
  }

  function handleMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
    const link = getLinkTarget(event.target)
    if (!link || !(event.ctrlKey || event.metaKey)) {
      return
    }

    event.preventDefault()
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const link = getLinkTarget(event.target)
    if (!link || !(event.ctrlKey || event.metaKey)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    void openExternalLink(link.getAttribute('href') ?? link.href)
  }

  return (
    <>
      <div
        ref={editableRef}
        role="textbox"
        aria-label={ariaLabel}
        contentEditable
        suppressContentEditableWarning
        className={className}
        style={style}
        data-empty={isEmpty ? 'true' : 'false'}
        data-link-open-ready={isLinkOpenReady ? 'true' : 'false'}
        data-placeholder={placeholder}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onBlur={() => {
          isFocusedRef.current = false
        }}
        onInput={handleInput}
        onMouseDownCapture={handleMouseDownCapture}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={refreshToolbar}
        onKeyUp={refreshToolbar}
        onKeyDown={onKeyDown}
      />
      {toolbarPosition ? (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="文本格式"
          className="inline-format-toolbar"
          style={{
            top: `${Math.max(8, toolbarPosition.top)}px`,
            left: `${toolbarPosition.left}px`,
          }}
          onMouseDown={(event) => {
            const target = event.target
            if (target instanceof HTMLElement && target.closest('.inline-link-popover')) {
              return
            }

            event.preventDefault()
          }}
        >
          <button
            type="button"
            aria-label="粗体"
            aria-pressed={activeMarks.bold}
            onClick={() => toggleBooleanMark('bold')}
          >
            B
          </button>
          <button
            type="button"
            aria-label="斜体"
            aria-pressed={activeMarks.italic}
            onClick={() => toggleBooleanMark('italic')}
          >
            I
          </button>
          <button
            type="button"
            aria-label="下划线"
            aria-pressed={activeMarks.underline}
            onClick={() => toggleBooleanMark('underline')}
          >
            U
          </button>
          <button
            type="button"
            aria-label="删除线"
            aria-pressed={activeMarks.strike}
            onClick={() => toggleBooleanMark('strike')}
          >
            S
          </button>
          <div className="inline-format-color-control">
            <button
              type="button"
              aria-label="文字颜色"
              className="inline-format-toolbar-color"
              aria-expanded={isColorMenuOpen}
              aria-pressed={Boolean(activeMarks.color)}
              onClick={() => {
                setIsLinkMenuOpen(false)
                setLinkDraft('')
                setIsColorMenuOpen((isOpen) => !isOpen)
              }}
            >
              <span className="inline-format-toolbar-color-icon" aria-hidden="true">
                A
              </span>
            </button>
            {isColorMenuOpen ? (
              <div className="inline-color-popover" role="menu" aria-label="文字颜色">
                <button
                  type="button"
                  className="inline-color-option"
                  aria-label="文字颜色：默认"
                  aria-pressed={!activeMarks.color}
                  onClick={() => applyTextColor(undefined)}
                >
                  <span
                    className="inline-color-swatch inline-color-swatch-default"
                    aria-hidden="true"
                  >
                    A
                  </span>
                  <span>默认</span>
                </button>
                {textColorOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="inline-color-option"
                    aria-label={`文字颜色：${option.label}`}
                    aria-pressed={activeMarks.color === option.value}
                    onClick={() => applyTextColor(option.value)}
                  >
                    <span
                      className="inline-color-swatch"
                      style={{ color: textColorValues[option.value] }}
                      aria-hidden="true"
                    >
                      A
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span className="inline-format-toolbar-divider" aria-hidden="true" />
          <div className="inline-link-control">
            <button
              type="button"
              aria-label="超链接"
              aria-expanded={isLinkMenuOpen}
              aria-pressed={Boolean(activeMarks.link)}
              className="inline-format-toolbar-link"
              onClick={applyLink}
            >
              链接
            </button>
            {isLinkMenuOpen ? (
              <form
                className="inline-link-popover"
                role="dialog"
                aria-label="编辑链接"
                onSubmit={submitLink}
              >
                <input
                  type="text"
                  className="inline-link-input"
                  aria-label="链接地址"
                  placeholder="https://example.com"
                  value={linkDraft}
                  autoFocus
                  onChange={(event) => setLinkDraft(event.target.value)}
                />
                <div className="inline-link-actions">
                  <button type="button" className="inline-link-cancel" onClick={closeLinkEditor}>
                    取消
                  </button>
                  <button type="submit" className="inline-link-submit">
                    确认链接
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
