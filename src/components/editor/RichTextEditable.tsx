import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  MouseEvent,
} from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RichTextSegment, TextColor } from '../../domain/types'
import {
  applyRichTextMark,
  normalizeRichText,
  replaceRichTextRange,
  richTextFromPlainText,
  richTextToPlainText,
  type RichTextMarkPatch,
} from '../../domain/richText'
import { getPageRelationDisplayText } from '../../domain/pageRelations'
import { openExternalLink } from '../../lib/externalLinks'
import { textColorValues } from './blockTextStyle'
import {
  PageRelationAutocomplete,
  type PageRelationAutocompleteItem,
} from './PageRelationAutocomplete'

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
  relationPages?: PageRelationAutocompleteItem[]
  onOpenPageRelation?: (pageId: string) => void
  onCreatePageRelation?: (
    title: string,
  ) => Promise<PageRelationAutocompleteItem>
}

interface SelectionOffsets {
  start: number
  end: number
}

interface ToolbarPosition {
  top: number
  left: number
}

interface RelationAutocompleteState {
  kind: 'link' | 'mention'
  start: number
  query: string
  activeIndex: number
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

      if (segment.pageId && segment.relationKind) {
        html = `<a href="/pages/${escapeAttribute(segment.pageId)}" data-page-id="${escapeAttribute(segment.pageId)}" data-page-relation-kind="${escapeAttribute(segment.relationKind)}" class="page-relation-inline page-relation-inline-${escapeAttribute(segment.relationKind)}">${html}</a>`
      } else if (segment.link) {
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
    const pageId = element.getAttribute('data-page-id')
    const relationKind = element.getAttribute('data-page-relation-kind')

    if (pageId && (relationKind === 'link' || relationKind === 'mention')) {
      nextMarks.pageId = pageId
      nextMarks.relationKind = relationKind
      delete nextMarks.link
    } else {
      const href = element.getAttribute('href')
      if (href) {
        nextMarks.link = href
      }
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
      segment.pageId ||
      segment.relationKind ||
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
      segment.pageId === other.pageId &&
      segment.relationKind === other.relationKind &&
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

function getCollapsedSelectionOffset(root: HTMLElement): number | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    return null
  }

  const beforeSelection = range.cloneRange()
  beforeSelection.selectNodeContents(root)
  beforeSelection.setEnd(range.startContainer, range.startOffset)
  return beforeSelection.toString().length
}

function getCollapsedSelectionPosition(root: HTMLElement) {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  const rootRect = root.getBoundingClientRect()

  if (
    !range ||
    !root.contains(range.commonAncestorContainer) ||
    typeof range.getBoundingClientRect !== 'function'
  ) {
    return {
      top: rootRect.bottom + 8,
      left: rootRect.left,
    }
  }

  range.collapse(true)
  const rect = range.getBoundingClientRect()
  const anchorRect = rect.width > 0 || rect.height > 0 ? rect : rootRect

  return {
    top: anchorRect.bottom + 8,
    left: anchorRect.left,
  }
}

function getDomPositionForOffset(root: HTMLElement, offset: number) {
  let remaining = Math.max(0, offset)
  let fallback: { node: Node; offset: number } = {
    node: root,
    offset: root.childNodes.length,
  }

  function visit(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (remaining <= text.length) {
        return { node, offset: remaining }
      }

      remaining -= text.length
      fallback = { node, offset: text.length }
      return null
    }

    if (node instanceof HTMLBRElement) {
      const parent = node.parentNode
      const index = parent ? Array.from(parent.childNodes).indexOf(node) : -1

      if (remaining === 0 && parent && index >= 0) {
        return { node: parent, offset: index + 1 }
      }

      remaining = Math.max(0, remaining - 1)
      if (parent && index >= 0) {
        fallback = { node: parent, offset: index + 1 }
      }

      return null
    }

    for (const child of Array.from(node.childNodes)) {
      const result = visit(child)
      if (result) {
        return result
      }
    }

    return null
  }

  return visit(root) ?? fallback
}

function setCollapsedSelectionOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection()

  if (!selection) {
    return
  }

  const position = getDomPositionForOffset(root, offset)
  const range = document.createRange()
  range.setStart(position.node, position.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
}

function moveSelectionAfterCurrentRelation(root: HTMLElement) {
  const selection = window.getSelection()

  if (!selection) {
    return
  }

  const anchorNode = selection.anchorNode
  const anchorElement =
    anchorNode instanceof Element
      ? anchorNode
      : anchorNode instanceof Node
        ? anchorNode.parentElement
        : null
  const relationElement = anchorElement?.closest('a[data-page-id]')

  if (!relationElement || !root.contains(relationElement)) {
    return
  }

  const parent = relationElement.parentNode
  const index = parent ? Array.from(parent.childNodes).indexOf(relationElement) : -1

  if (!parent || index < 0) {
    return
  }

  const range = document.createRange()
  range.setStart(parent, index + 1)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus()
}

function setCollapsedSelectionAfterRelation(root: HTMLElement, offset: number) {
  setCollapsedSelectionOffset(root, offset)
  moveSelectionAfterCurrentRelation(root)
}

function scheduleCollapsedSelectionOffset(root: HTMLElement, offset: number) {
  const restoreSelection = () => {
    if (!root.isConnected) {
      return
    }

    setCollapsedSelectionAfterRelation(root, offset)
  }

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restoreSelection)
    return
  }

  window.setTimeout(restoreSelection, 0)
}

function getRelationAutocompleteDraft(
  element: HTMLElement,
  autocompleteState: RelationAutocompleteState,
  baseSegments?: RichTextSegment[],
) {
  const end = getCollapsedSelectionOffset(element)
  if (end === null || end < autocompleteState.start) {
    return null
  }

  const text = richTextToPlainText(baseSegments ?? readSegmentsFromElement(element))
  const rawToken = text.slice(autocompleteState.start, end)
  const query =
    autocompleteState.kind === 'mention'
      ? rawToken.replace(/^@/, '')
      : rawToken.replace(/^\[\[/, '')

  if (
    (autocompleteState.kind === 'mention' && !rawToken.startsWith('@')) ||
    (autocompleteState.kind === 'link' && !rawToken.startsWith('[['))
  ) {
    return null
  }

  return { end, query }
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
  relationPages = [],
  onOpenPageRelation,
  onCreatePageRelation,
}: RichTextEditableProps) {
  const editableRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const relationAutocompleteMenuRef = useRef<HTMLDivElement | null>(null)
  const isFocusedRef = useRef(false)
  const selectionRef = useRef<SelectionOffsets | null>(null)
  const ignoreSelectionChangeRef = useRef(false)
  const isLinkMenuOpenRef = useRef(false)
  const relationAutocompleteRef = useRef<RelationAutocompleteState | null>(null)
  const pendingPropSyncSegmentsRef = useRef<RichTextSegment[] | null>(null)
  const [isEmpty, setIsEmpty] = useState(value.length === 0)
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition | null>(null)
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false)
  const [isLinkMenuOpen, setIsLinkMenuOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [hoveredLinkHref, setHoveredLinkHref] = useState<string | null>(null)
  const [isModifierPressed, setIsModifierPressed] = useState(false)
  const [activeMarks, setActiveMarks] = useState<ActiveSelectionMarks>(emptyActiveSelectionMarks)
  const [relationAutocomplete, setRelationAutocomplete] = useState<RelationAutocompleteState | null>(
    null,
  )
  const [isCreatingPageRelation, setIsCreatingPageRelation] = useState(false)
  const isLinkOpenReady = Boolean(hoveredLinkHref && isModifierPressed)

  useLayoutEffect(() => {
    const element = editableRef.current

    if (!element) {
      return
    }

    if (isCreatingPageRelation) {
      return
    }

    const segments = getSegments(value, richText)
    const normalizedSegments = normalizeRichText(segments)
    const pendingPropSyncSegments = pendingPropSyncSegmentsRef.current

    if (pendingPropSyncSegments && segmentsEqual(normalizedSegments, pendingPropSyncSegments)) {
      pendingPropSyncSegmentsRef.current = null
    }

    if (isFocusedRef.current) {
      const currentSegments = readSegmentsFromElement(element)
      if (segmentsEqual(currentSegments, normalizedSegments)) {
        setIsEmpty(richTextToPlainText(normalizedSegments).length === 0)
        return
      }

      if (pendingPropSyncSegments && segmentsEqual(currentSegments, pendingPropSyncSegments)) {
        setIsEmpty(richTextToPlainText(currentSegments).length === 0)
        return
      }
    }

    element.innerHTML = richTextToHtml(normalizedSegments)
    setIsEmpty(richTextToPlainText(normalizedSegments).length === 0)
  }, [isCreatingPageRelation, richText, value])

  const relationQuery = relationAutocomplete?.query.trim() ?? ''
  const normalizedRelationQuery = relationQuery.toLocaleLowerCase()
  const relationSuggestions = relationAutocomplete
    ? relationPages.filter((page) =>
        normalizedRelationQuery.length === 0
          ? true
          : page.title.toLocaleLowerCase().includes(normalizedRelationQuery),
      )
    : []
  const canCreateRelationPage =
    Boolean(onCreatePageRelation) &&
    relationQuery.length > 0 &&
    relationSuggestions.length === 0

  function closeRelationAutocomplete() {
    relationAutocompleteRef.current = null
    setRelationAutocomplete(null)
  }

  function updateRelationAutocompleteQuery() {
    const element = editableRef.current
    const autocompleteState = relationAutocompleteRef.current

    if (!element || !autocompleteState) {
      return
    }

    const draft = getRelationAutocompleteDraft(element, autocompleteState)
    if (!draft) {
      closeRelationAutocomplete()
      return
    }

    const position = getCollapsedSelectionPosition(element)
    setRelationAutocomplete((current) =>
      current
        ? {
            ...current,
            query: draft.query,
            activeIndex: 0,
            top: position.top,
            left: position.left,
          }
        : current,
    )
  }

  function openRelationAutocomplete(kind: 'link' | 'mention', start: number) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const position = getCollapsedSelectionPosition(element)
    const nextState = {
      kind,
      start,
      query: '',
      activeIndex: 0,
      top: position.top,
      left: position.left,
    } satisfies RelationAutocompleteState
    relationAutocompleteRef.current = nextState
    setRelationAutocomplete(nextState)
  }

  useEffect(() => {
    isLinkMenuOpenRef.current = isLinkMenuOpen
  }, [isLinkMenuOpen])

  useEffect(() => {
    relationAutocompleteRef.current = relationAutocomplete
  }, [relationAutocomplete])

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
      const relationAutocompleteMenu = relationAutocompleteMenuRef.current

      if (
        editable?.contains(target) ||
        toolbar?.contains(target) ||
        relationAutocompleteMenu?.contains(target)
      ) {
        return
      }

      setToolbarPosition(null)
      setIsColorMenuOpen(false)
      setIsLinkMenuOpen(false)
      setLinkDraft('')
      selectionRef.current = null
      setActiveMarks(emptyActiveSelectionMarks)
      setHoveredLinkHref(null)
      closeRelationAutocomplete()

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

      if (!editable || !selection || selection.rangeCount === 0) {
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
        closeRelationAutocomplete()
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
        closeRelationAutocomplete()
        return
      }

      if (selection.isCollapsed) {
        setToolbarPosition(null)
        setIsColorMenuOpen(false)
        setIsLinkMenuOpen(false)
        setLinkDraft('')
        selectionRef.current = null
        setActiveMarks(emptyActiveSelectionMarks)
        setHoveredLinkHref(null)

        if (relationAutocompleteRef.current) {
          updateRelationAutocompleteQuery()
        }

        return
      }

      if (relationAutocompleteRef.current) {
        closeRelationAutocomplete()
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

  function insertPageRelationAtRange(
    page: PageRelationAutocompleteItem,
    kind: 'link' | 'mention',
    start: number,
    end: number,
    baseSegmentsOverride?: RichTextSegment[],
  ) {
    const element = editableRef.current

    if (!element) {
      return
    }

    const baseSegments = baseSegmentsOverride ?? readSegmentsFromElement(element)
    const displayText = getPageRelationDisplayText(page.title, kind)
    const nextSegments = replaceRichTextRange(baseSegments, start, end, [
      { text: displayText, pageId: page.id, relationKind: kind },
    ])
    const nextCaretOffset = start + displayText.length

    pendingPropSyncSegmentsRef.current = nextSegments
    closeRelationAutocomplete()
    commitSegments(nextSegments)
    setCollapsedSelectionAfterRelation(element, nextCaretOffset)
    scheduleCollapsedSelectionOffset(element, nextCaretOffset)
  }

  function insertPageRelation(page: PageRelationAutocompleteItem, kind: 'link' | 'mention') {
    const element = editableRef.current
    const autocompleteState = relationAutocomplete

    if (!element || !autocompleteState || autocompleteState.kind !== kind) {
      return
    }

    const caretOffset = getCollapsedSelectionOffset(element)
    if (caretOffset === null) {
      return
    }

    insertPageRelationAtRange(
      page,
      kind,
      autocompleteState.start,
      caretOffset,
    )
  }

  async function createPageRelation() {
    const element = editableRef.current
    const autocompleteState = relationAutocompleteRef.current ?? relationAutocomplete

    if (!autocompleteState || !onCreatePageRelation || isCreatingPageRelation || !element) {
      return
    }

    const baseSegments = readSegmentsFromElement(element)
    const draft = getRelationAutocompleteDraft(element, autocompleteState, baseSegments)
    const title = draft?.query.trim() ?? ''
    if (!title) {
      return
    }

    if (!draft) {
      return
    }

    const insertionRange = {
      kind: autocompleteState.kind,
      start: autocompleteState.start,
      end: draft.end,
    } as const

    setIsCreatingPageRelation(true)

    try {
      const page = await onCreatePageRelation(title)
      insertPageRelationAtRange(
        page,
        insertionRange.kind,
        insertionRange.start,
        insertionRange.end,
        baseSegments,
      )
    } finally {
      setIsCreatingPageRelation(false)
    }
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
    updateRelationAutocompleteQuery()
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
    setHoveredLinkHref(link?.dataset.pageId ? null : (link?.getAttribute('href') ?? null))
    setIsModifierPressed(event.ctrlKey || event.metaKey)
  }

  function handleMouseLeave() {
    setHoveredLinkHref(null)
  }

  function handleMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
    const link = getLinkTarget(event.target)
    if (!link) {
      return
    }

    if (link.dataset.pageId) {
      event.preventDefault()
      return
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const link = getLinkTarget(event.target)
    if (!link) {
      return
    }

    const pageId = link.dataset.pageId

    if (pageId) {
      event.preventDefault()
      event.stopPropagation()
      onOpenPageRelation?.(pageId)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      void openExternalLink(link.getAttribute('href') ?? link.href)
    }
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (relationAutocomplete) {
      const element = editableRef.current

      if (!element || getCollapsedSelectionOffset(element) === null) {
        closeRelationAutocomplete()
        onKeyDown?.(event)
        return
      }

      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        closeRelationAutocomplete()
        return
      }

      if (event.key === 'ArrowDown' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        setRelationAutocomplete((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  relationSuggestions.length === 0
                    ? 0
                    : (current.activeIndex + 1) % relationSuggestions.length,
              }
            : current,
        )
        return
      }

      if (event.key === 'ArrowUp' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        setRelationAutocomplete((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  relationSuggestions.length === 0
                    ? 0
                    : current.activeIndex <= 0
                      ? relationSuggestions.length - 1
                      : current.activeIndex - 1,
              }
            : current,
        )
        return
      }

      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
        const liveDraft = getRelationAutocompleteDraft(element, relationAutocomplete)
        const normalizedLiveQuery = liveDraft?.query.trim().toLocaleLowerCase() ?? ''
        const liveSuggestions = relationPages.filter((page) =>
          normalizedLiveQuery.length === 0
            ? true
            : page.title.toLocaleLowerCase().includes(normalizedLiveQuery),
        )
        const canCreateLiveRelationPage =
          Boolean(onCreatePageRelation) &&
          Boolean(liveDraft?.query.trim()) &&
          liveSuggestions.length === 0

        if (liveSuggestions.length > 0) {
          event.preventDefault()
          insertPageRelation(
            liveSuggestions[Math.min(relationAutocomplete.activeIndex, liveSuggestions.length - 1)],
            relationAutocomplete.kind,
          )
          return
        }

        if (canCreateLiveRelationPage || isCreatingPageRelation) {
          event.preventDefault()
          if (!isCreatingPageRelation) {
            void createPageRelation()
          }
          return
        }
      }
    }

    if (
      event.key === '@' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      const element = editableRef.current
      const caretOffset = element ? getCollapsedSelectionOffset(element) : null
      if (caretOffset !== null) {
        queueMicrotask(() => openRelationAutocomplete('mention', caretOffset))
      }
    }

    if (
      event.key === '[' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.nativeEvent.isComposing
    ) {
      const element = editableRef.current
      const caretOffset = element ? getCollapsedSelectionOffset(element) : null
      const text = element ? richTextToPlainText(readSegmentsFromElement(element)) : ''
      const previousCharacter = caretOffset !== null ? text.charAt(Math.max(0, caretOffset - 1)) : ''

      if (caretOffset !== null && previousCharacter === '[') {
        queueMicrotask(() => openRelationAutocomplete('link', Math.max(0, caretOffset - 1)))
      }
    }

    onKeyDown?.(event)
  }

  return (
    <>
      <div
        ref={editableRef}
        role="textbox"
        aria-label={ariaLabel}
        contentEditable={!isCreatingPageRelation}
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
        onKeyDown={handleEditorKeyDown}
      />
      {relationAutocomplete ? (
        <PageRelationAutocomplete
          panelRef={relationAutocompleteMenuRef}
          kind={relationAutocomplete.kind}
          suggestions={relationSuggestions}
          activeIndex={Math.min(relationAutocomplete.activeIndex, Math.max(0, relationSuggestions.length - 1))}
          top={relationAutocomplete.top}
          left={relationAutocomplete.left}
          createTitle={canCreateRelationPage ? relationQuery : undefined}
          createDisabled={isCreatingPageRelation}
          onSelect={(page) => insertPageRelation(page, relationAutocomplete.kind)}
          onCreate={canCreateRelationPage ? () => void createPageRelation() : undefined}
        />
      ) : null}
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
