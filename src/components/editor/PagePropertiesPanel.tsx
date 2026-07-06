import type { FocusEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  PagePropertyDefinition,
  PagePropertyOption,
  PagePropertyValue,
  PagePropertyValueMap,
} from '../../domain/types'
import { DateCalendarPanel } from '../shared/DateCalendarPanel'
import { CreatableOptionPicker } from '../shared/CreatableOptionPicker'
import { uiCopy } from '../../ui/copy'
import { createId } from '../../utils/id'

type DefaultPagePropertyKey = 'tags' | 'status' | 'date' | 'notes'

interface PagePropertiesPanelProps {
  definitions: PagePropertyDefinition[]
  values: PagePropertyValueMap
  onSetValue: (propertyId: string, value: PagePropertyValue) => void
  onSetOptions?: (propertyId: string, options: PagePropertyOption[]) => void
  onAddDefaultProperty: (key: DefaultPagePropertyKey) => void
}

type EditingState =
  | {
      propertyId: string
      type: 'text'
      draft: string
    }
  | {
      propertyId: string
      type: 'select' | 'multiSelect' | 'date'
    }

type DraftEditingState = Extract<EditingState, { draft: string }>

type FloatingPosition = {
  top: number
  left: number
  width: number
}

const defaultPropertyOrder: DefaultPagePropertyKey[] = ['tags', 'status', 'date', 'notes']
const optionPopoverOffset = 8
const optionPopoverMargin = 16
const optionPopoverMinWidth = 240
const datePopoverOffset = 8
const datePopoverMargin = 16
const datePopoverMinWidth = 312
const newPagePropertyOptionColor = '#475569'

function resolveOptionColor(color: string, alpha = '1f') {
  if (color.startsWith('#')) {
    if (color.length === 7) {
      return `${color}${alpha}`
    }

    if (color.length === 4) {
      const expanded = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      return `${expanded}${alpha}`
    }
  }

  return undefined
}

function formatPropertyValue(value: PagePropertyValue) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(' / ') : uiCopy.pageProperties.emptyValue
  }

  return value && value.trim() ? value : uiCopy.pageProperties.emptyValue
}

function getNextMissingPropertyKey(definitions: PagePropertyDefinition[]) {
  const usedKeys = new Set(definitions.map((definition) => definition.key))
  return defaultPropertyOrder.find((key) => !usedKeys.has(key)) ?? null
}

function getEditableDraft(value: PagePropertyValue) {
  return typeof value === 'string' ? value : ''
}

function parseDraftValue(editing: DraftEditingState): PagePropertyValue {
  const nextValue = editing.draft.trim()
  return nextValue ? nextValue : null
}

function isTextEditingState(editing: EditingState | null): editing is DraftEditingState {
  return editing?.type === 'text'
}

function getSelectedLabels(value: PagePropertyValue): string[] {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value) {
    return [value]
  }

  return []
}

function findPropertyOption(definition: PagePropertyDefinition, label: string) {
  return (definition.config.options ?? []).find((option) => option.label === label)
}

export function PagePropertiesPanel({
  definitions,
  values,
  onSetValue,
  onSetOptions,
  onAddDefaultProperty,
}: PagePropertiesPanelProps) {
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [optionPopoverPosition, setOptionPopoverPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: optionPopoverMinWidth,
  })
  const [datePopoverPosition, setDatePopoverPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: datePopoverMinWidth,
  })
  const optionTriggerRef = useRef<HTMLButtonElement | null>(null)
  const optionPopoverRef = useRef<HTMLDivElement | null>(null)
  const dateTriggerRef = useRef<HTMLButtonElement | null>(null)
  const datePopoverRef = useRef<HTMLDivElement | null>(null)
  const nextMissingPropertyKey = getNextMissingPropertyKey(definitions)

  const updateOptionPopoverPosition = useCallback(() => {
    if (
      (editing?.type !== 'select' && editing?.type !== 'multiSelect') ||
      !optionTriggerRef.current
    ) {
      return
    }

    const triggerRect = optionTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const desiredWidth = Math.max(optionPopoverMinWidth, triggerRect.width)
    const renderedWidth = optionPopoverRef.current?.offsetWidth ?? desiredWidth
    const width = Math.max(desiredWidth, renderedWidth)
    const height = optionPopoverRef.current?.offsetHeight ?? 0
    let left = triggerRect.left
    let top = triggerRect.bottom + optionPopoverOffset

    left = Math.max(
      optionPopoverMargin,
      Math.min(left, viewportWidth - optionPopoverMargin - width),
    )

    if (height > 0 && top + height > viewportHeight - optionPopoverMargin) {
      const flippedTop = triggerRect.top - optionPopoverOffset - height
      top =
        flippedTop >= optionPopoverMargin
          ? flippedTop
          : Math.max(optionPopoverMargin, viewportHeight - optionPopoverMargin - height)
    }

    setOptionPopoverPosition((current) =>
      current.top === top && current.left === left && current.width === width
        ? current
        : { top, left, width },
    )
  }, [editing])

  const updateDatePopoverPosition = useCallback(() => {
    if (editing?.type !== 'date' || !dateTriggerRef.current) {
      return
    }

    const triggerRect = dateTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const desiredWidth = Math.max(datePopoverMinWidth, triggerRect.width)
    const renderedWidth = datePopoverRef.current?.offsetWidth ?? desiredWidth
    const width = Math.max(desiredWidth, renderedWidth)
    const height = datePopoverRef.current?.offsetHeight ?? 0
    let left = triggerRect.left
    let top = triggerRect.bottom + datePopoverOffset

    left = Math.max(
      datePopoverMargin,
      Math.min(left, viewportWidth - datePopoverMargin - width),
    )

    if (height > 0 && top + height > viewportHeight - datePopoverMargin) {
      const flippedTop = triggerRect.top - datePopoverOffset - height
      top =
        flippedTop >= datePopoverMargin
          ? flippedTop
          : Math.max(datePopoverMargin, viewportHeight - datePopoverMargin - height)
    }

    setDatePopoverPosition((current) =>
      current.top === top && current.left === left && current.width === width
        ? current
        : { top, left, width },
    )
  }, [editing])

  useLayoutEffect(() => {
    if (editing?.type !== 'select' && editing?.type !== 'multiSelect') {
      return
    }

    updateOptionPopoverPosition()
    const frameId = window.requestAnimationFrame(updateOptionPopoverPosition)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [definitions, editing, updateOptionPopoverPosition, values])

  useLayoutEffect(() => {
    if (editing?.type !== 'date') {
      return
    }

    updateDatePopoverPosition()
    const frameId = window.requestAnimationFrame(updateDatePopoverPosition)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [editing, updateDatePopoverPosition])

  useEffect(() => {
    if (editing?.type !== 'select' && editing?.type !== 'multiSelect') {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (optionTriggerRef.current?.contains(target) || optionPopoverRef.current?.contains(target)) {
        return
      }

      setEditing(null)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditing(null)
      }
    }

    function syncOptionPopoverPosition() {
      updateOptionPopoverPosition()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', syncOptionPopoverPosition)
    window.addEventListener('scroll', syncOptionPopoverPosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', syncOptionPopoverPosition)
      window.removeEventListener('scroll', syncOptionPopoverPosition, true)
    }
  }, [editing, updateOptionPopoverPosition])

  useEffect(() => {
    if (editing?.type !== 'date') {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (dateTriggerRef.current?.contains(target) || datePopoverRef.current?.contains(target)) {
        return
      }

      setEditing(null)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditing(null)
      }
    }

    function syncDatePopoverPosition() {
      updateDatePopoverPosition()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', syncDatePopoverPosition)
    window.addEventListener('scroll', syncDatePopoverPosition, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', syncDatePopoverPosition)
      window.removeEventListener('scroll', syncDatePopoverPosition, true)
    }
  }, [editing, updateDatePopoverPosition])

  function startEditing(definition: PagePropertyDefinition) {
    if (definition.type === 'select' || definition.type === 'multiSelect' || definition.type === 'date') {
      setEditing({
        propertyId: definition.id,
        type: definition.type,
      })
      return
    }

    setEditing({
      propertyId: definition.id,
      type: 'text',
      draft: getEditableDraft(values[definition.id]),
    })
  }

  function cancelEditing() {
    setEditing(null)
  }

  function saveEditing() {
    if (!isTextEditingState(editing)) {
      return
    }

    onSetValue(editing.propertyId, parseDraftValue(editing))
    setEditing(null)
  }

  function updateDraft(draft: string) {
    setEditing((currentEditing) => {
      if (!currentEditing || currentEditing.type !== 'text') {
        return currentEditing
      }

      return {
        ...currentEditing,
        draft,
      }
    })
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveEditing()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  function handleEditorBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    saveEditing()
  }

  function renderInlineEditor(definition: PagePropertyDefinition) {
    if (!editing || editing.propertyId !== definition.id) {
      return null
    }

    if (editing.type !== 'text') {
      return null
    }

    return (
      <div className="page-property-editor" onBlur={handleEditorBlur}>
        <input
          autoFocus
          type="text"
          className="page-property-input"
          value={editing.draft}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={handleEditorKeyDown}
        />
      </div>
    )
  }

  function renderOptionPopover(definition: PagePropertyDefinition) {
    const isOpen =
      editing?.propertyId === definition.id &&
      (editing.type === 'select' || editing.type === 'multiSelect')

    if (!isOpen || typeof document === 'undefined') {
      return null
    }

    const options = definition.config.options ?? []
    const selectedLabels = getSelectedLabels(values[definition.id] ?? null)

    return createPortal(
      <div
        ref={optionPopoverRef}
        className="database-cell-floating-layer"
        style={{
          top: `${optionPopoverPosition.top}px`,
          left: `${optionPopoverPosition.left}px`,
          width: `${optionPopoverPosition.width}px`,
        }}
      >
        <section
          className="database-cell-popover database-cell-popover--options"
          role="dialog"
          aria-label={`${definition.name} 选项`}
        >
          <div className="cell-option-list">
            {editing.type === 'select' ? (
              <button
                type="button"
                role="option"
                aria-selected={selectedLabels.length === 0}
                className={
                  selectedLabels.length === 0
                    ? 'cell-option-item is-selected is-clear'
                    : 'cell-option-item is-clear'
                }
                onClick={() => {
                  onSetValue(definition.id, null)
                  setEditing(null)
                }}
              >
                <span className="cell-option-item-copy">{uiCopy.pageProperties.emptyValue}</span>
              </button>
            ) : null}
            <CreatableOptionPicker
              mode={editing.type === 'select' ? 'single' : 'multiple'}
              options={options}
              selectedLabels={selectedLabels}
              inputLabel={`${definition.name} 选项输入`}
              onSelect={(label) => {
                if (editing.type === 'select') {
                  onSetValue(definition.id, label)
                  setEditing(null)
                  return
                }

                onSetValue(definition.id, [...selectedLabels, label])
              }}
              onDeselect={(label) => {
                if (editing.type !== 'multiSelect') {
                  return
                }

                onSetValue(
                  definition.id,
                  selectedLabels.filter((selectedLabel) => selectedLabel !== label),
                )
              }}
              onCreate={(label) => {
                if (!onSetOptions) {
                  return
                }

                onSetOptions(definition.id, [
                  ...options,
                  {
                    id: createId('page_property_option'),
                    label,
                    color: newPagePropertyOptionColor,
                  },
                ])

                if (editing.type === 'select') {
                  onSetValue(definition.id, label)
                  setEditing(null)
                  return
                }

                onSetValue(definition.id, [...selectedLabels, label])
              }}
              onDelete={
                onSetOptions
                  ? (optionId) => {
                      onSetOptions(
                        definition.id,
                        options.filter((option) => option.id !== optionId),
                      )
                    }
                  : undefined
              }
            />
          </div>
        </section>
      </div>,
      document.body,
    )
  }

  function renderOptionEditor(definition: PagePropertyDefinition) {
    const value = values[definition.id] ?? null
    const displayCopy = formatPropertyValue(value)
    const isOpen =
      editing?.propertyId === definition.id &&
      (editing.type === 'select' || editing.type === 'multiSelect')
    const selectedLabels = getSelectedLabels(value)

    function renderOptionChip(label: string, className = 'cell-option-chip') {
      const option = findPropertyOption(definition, label)
      const tone = option?.color ?? newPagePropertyOptionColor

      return (
        <span
          key={label}
          className={className}
          style={{
            color: tone,
            backgroundColor: resolveOptionColor(tone, '2e'),
            borderColor: 'transparent',
          }}
        >
          {label}
        </span>
      )
    }

    function renderValueContent() {
      if (selectedLabels.length === 0) {
        return (
          <span className="page-property-value-content is-placeholder">
            <span>{uiCopy.pageProperties.emptyValue}</span>
          </span>
        )
      }

      if (definition.type === 'select') {
        return <span className="page-property-value-content">{renderOptionChip(selectedLabels[0])}</span>
      }

      return (
        <span className="page-property-value-content">
          <span className="cell-option-chip-list">
            {selectedLabels.map((label) => renderOptionChip(label))}
          </span>
        </span>
      )
    }

    return (
      <>
        <button
          ref={isOpen ? optionTriggerRef : null}
          type="button"
          className="page-property-value"
          aria-label={displayCopy}
          aria-expanded={isOpen}
          onClick={() => {
            if (isOpen) {
              setEditing(null)
              return
            }

            startEditing(definition)
          }}
        >
          {renderValueContent()}
        </button>
        {renderOptionPopover(definition)}
      </>
    )
  }

  function renderDatePopover(definition: PagePropertyDefinition, currentValue: string | null) {
    const isOpen = editing?.propertyId === definition.id && editing.type === 'date'

    if (!isOpen || typeof document === 'undefined') {
      return null
    }

    return createPortal(
      <div
        ref={datePopoverRef}
        className="page-property-date-floating-layer"
        style={{
          top: `${datePopoverPosition.top}px`,
          left: `${datePopoverPosition.left}px`,
          width: `${datePopoverPosition.width}px`,
        }}
      >
        <div className="page-property-date-popover">
          <DateCalendarPanel
            value={currentValue}
            ariaLabel={`${definition.name} 日期`}
            clearLabel={uiCopy.pageProperties.clearDate}
            todayLabel={uiCopy.pageProperties.today}
            onSelect={(nextValue) => {
              onSetValue(definition.id, nextValue)
              setEditing(null)
            }}
            onClear={() => {
              onSetValue(definition.id, null)
              setEditing(null)
            }}
          />
        </div>
      </div>,
      document.body,
    )
  }

  function renderDateEditor(definition: PagePropertyDefinition) {
    const value = values[definition.id]
    const currentValue = typeof value === 'string' ? value : null
    const isOpen = editing?.propertyId === definition.id && editing.type === 'date'

    return (
      <div className="page-property-date-wrap">
        <button
          ref={isOpen ? dateTriggerRef : null}
          type="button"
          className="page-property-value"
          onClick={() => {
            if (isOpen) {
              setEditing(null)
              return
            }

            startEditing(definition)
          }}
        >
          {formatPropertyValue(currentValue)}
        </button>
        {renderDatePopover(definition, currentValue)}
      </div>
    )
  }

  return (
    <section className="page-properties-panel" aria-label={uiCopy.pageProperties.title}>
      {definitions.map((definition) => {
        const isEditingCurrent = editing?.propertyId === definition.id

        return (
          <div key={definition.id} className="page-property-row">
            <span className="page-property-name">{definition.name}</span>
            {definition.type === 'date' ? (
              renderDateEditor(definition)
            ) : definition.type === 'select' || definition.type === 'multiSelect' ? (
              renderOptionEditor(definition)
            ) : isEditingCurrent ? (
              renderInlineEditor(definition)
            ) : (
              <button
                type="button"
                className="page-property-value"
                onClick={() => startEditing(definition)}
              >
                {formatPropertyValue(values[definition.id] ?? null)}
              </button>
            )}
          </div>
        )
      })}
      {nextMissingPropertyKey ? (
        <button
          type="button"
          className="page-property-add"
          onClick={() => onAddDefaultProperty(nextMissingPropertyKey)}
        >
          {uiCopy.pageProperties.add}
        </button>
      ) : null}
    </section>
  )
}
