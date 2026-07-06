import { Trash2 } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

export type CreatableOption = {
  id: string
  label: string
  color?: string
}

interface CreatableOptionPickerProps {
  mode: 'single' | 'multiple'
  options: CreatableOption[]
  selectedLabels: string[]
  inputLabel: string
  onSelect: (label: string) => void
  onDeselect: (label: string) => void
  onCreate: (label: string) => void
  onDelete?: (optionId: string) => void
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function CreatableOptionPicker({
  mode,
  options,
  selectedLabels,
  inputLabel,
  onSelect,
  onDeselect,
  onCreate,
  onDelete,
}: CreatableOptionPickerProps) {
  const [draft, setDraft] = useState('')
  const trimmedDraft = draft.trim()
  const matchingOption =
    options.find((option) => normalizeLabel(option.label) === normalizeLabel(trimmedDraft)) ?? null
  const canCreate = trimmedDraft.length > 0 && !matchingOption

  const activateLabel = (label: string) => {
    const isSelected = selectedLabels.includes(label)

    if (mode === 'multiple' && isSelected) {
      onDeselect(label)
      setDraft('')
      return
    }

    onSelect(label)
    setDraft('')
  }

  const handleSubmit = () => {
    const nextLabel = trimmedDraft

    if (!nextLabel) {
      return
    }

    if (matchingOption) {
      activateLabel(matchingOption.label)
      return
    }

    onCreate(nextLabel)
    setDraft('')
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    handleSubmit()
  }

  return (
    <div className="creatable-option-picker" data-mode={mode}>
      <input
        type="text"
        aria-label={inputLabel}
        className="creatable-option-picker-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleInputKeyDown}
      />
      <div
        className="creatable-option-picker-list"
        role="listbox"
        aria-multiselectable={mode === 'multiple' ? 'true' : undefined}
      >
        {canCreate ? (
          <button
            type="button"
            className="creatable-option-picker-create"
            onClick={handleSubmit}
          >
            {`创建 “${trimmedDraft}”`}
          </button>
        ) : null}
        {options.map((option) => {
          const isSelected = selectedLabels.includes(option.label)

          return (
            <div key={option.id} className="creatable-option-picker-row">
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                className={
                  isSelected
                    ? 'creatable-option-picker-option creatable-option-picker-option-main is-selected'
                    : 'creatable-option-picker-option creatable-option-picker-option-main'
                }
                onClick={() => activateLabel(option.label)}
              >
                {option.color ? (
                  <span
                    className="creatable-option-picker-color"
                    style={{ backgroundColor: option.color }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className="creatable-option-picker-option-copy">{option.label}</span>
              </button>
              {onDelete ? (
                <button
                  type="button"
                  className="creatable-option-picker-delete"
                  aria-label={`删除 ${option.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDelete(option.id)
                  }}
                >
                  <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
