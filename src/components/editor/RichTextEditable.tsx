import type { CSSProperties, KeyboardEventHandler } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RichTextSegment, TextColor } from '../../domain/types'
import {
  applyRichTextMark,
  normalizeRichText,
  richTextFromPlainText,
  richTextToPlainText,
  type RichTextMarkPatch,
} from '../../domain/richText'
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
  const [isEmpty, setIsEmpty] = useState(value.length === 0)
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null)
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false)

  useLayoutEffect(() => {
    const element = editableRef.current

    if (!element || isFocusedRef.current) {
      return
    }

    const segments = getSegments(value, richText)
    element.innerHTML = richTextToHtml(segments)
    setIsEmpty(richTextToPlainText(segments).length === 0)
  }, [richText, value])

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

      const selection = window.getSelection()
      if (selection && editable && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (editable.contains(range.commonAncestorContainer)) {
          selection.removeAllRanges()
        }
      }
    }

    function syncToolbarWithSelection() {
      const editable = editableRef.current
      const selection = window.getSelection()

      if (!editable || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setToolbarPosition(null)
        setIsColorMenuOpen(false)
        return
      }

      const range = selection.getRangeAt(0)
      if (!editable.contains(range.commonAncestorContainer)) {
        setToolbarPosition(null)
        setIsColorMenuOpen(false)
        return
      }

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

    if (!element || !getSelectionOffsets(element)) {
      setToolbarPosition(null)
      return
    }

    setToolbarPosition(getToolbarPosition(element))
  }

  function commitSegments(segments: RichTextSegment[]) {
    const element = editableRef.current
    const payload = toChangePayload(segments)

    if (element) {
      element.innerHTML = richTextToHtml(segments)
    }

    setIsEmpty(payload.text.length === 0)
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
    onChange(payload)
  }

  function applySelectionMark(mark: RichTextMarkPatch) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const selection = getSelectionOffsets(element)
    if (!selection) {
      return
    }

    const baseSegments = readSegmentsFromElement(element)
    commitSegments(applyRichTextMark(baseSegments, selection.start, selection.end, mark))
  }

  function toggleBooleanMark(markName: Exclude<keyof RichTextMarkPatch, 'link' | 'color'>) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const selection = getSelectionOffsets(element)
    if (!selection) {
      return
    }

    const baseSegments = readSegmentsFromElement(element)
    applySelectionMark({
      [markName]: selectedSegmentsAllHaveMark(baseSegments, selection, markName)
        ? undefined
        : true,
    })
  }

  function applyLink() {
    const link = window.prompt('输入链接')

    if (link === null) {
      return
    }

    applySelectionMark({ link: link.trim() || undefined })
  }

  function applyTextColor(color?: TextColor) {
    applySelectionMark({ color })
    setIsColorMenuOpen(false)
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
        data-placeholder={placeholder}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onBlur={() => {
          isFocusedRef.current = false
        }}
        onInput={handleInput}
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
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" aria-label="粗体" onClick={() => toggleBooleanMark('bold')}>
            B
          </button>
          <button type="button" aria-label="斜体" onClick={() => toggleBooleanMark('italic')}>
            I
          </button>
          <button
            type="button"
            aria-label="下划线"
            onClick={() => toggleBooleanMark('underline')}
          >
            U
          </button>
          <button type="button" aria-label="删除线" onClick={() => toggleBooleanMark('strike')}>
            S
          </button>
          <div className="inline-format-color-control">
            <button
              type="button"
              aria-label="文字颜色"
              className="inline-format-toolbar-color"
              aria-expanded={isColorMenuOpen}
              onClick={() => setIsColorMenuOpen((isOpen) => !isOpen)}
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
          <button
            type="button"
            aria-label="超链接"
            className="inline-format-toolbar-link"
            onClick={applyLink}
          >
            链接
          </button>
        </div>
      ) : null}
    </>
  )
}
