import type {
  PagePropertyDefinition,
  PagePropertyValue,
  PagePropertyValueMap,
} from '../../domain/types'
import { uiCopy } from '../../ui/copy'

type DefaultPagePropertyKey = 'tags' | 'status' | 'date' | 'notes'

interface PagePropertiesPanelProps {
  definitions: PagePropertyDefinition[]
  values: PagePropertyValueMap
  onSetValue: (propertyId: string, value: PagePropertyValue) => void
  onAddDefaultProperty: (key: DefaultPagePropertyKey) => void
}

const defaultPropertyOrder: DefaultPagePropertyKey[] = ['tags', 'status', 'date', 'notes']

function formatPropertyValue(value: PagePropertyValue) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(' / ') : uiCopy.pageProperties.emptyValue
  }

  return value && value.trim() ? value : uiCopy.pageProperties.emptyValue
}

function getNextMissingPropertyKey(definitions: PagePropertyDefinition[]) {
  const usedKeys = new Set(definitions.map((definition) => definition.key))
  return defaultPropertyOrder.find((key) => !usedKeys.has(key)) ?? 'tags'
}

function getNextSelectValue(definition: PagePropertyDefinition, currentValue: PagePropertyValue) {
  const labels = (definition.config.options ?? [])
    .map((option) => option.label.trim())
    .filter(Boolean)

  if (labels.length === 0) {
    return currentValue === '进行中' ? null : '进行中'
  }

  const currentLabel = typeof currentValue === 'string' ? currentValue : null
  const currentIndex = currentLabel ? labels.indexOf(currentLabel) : -1
  return labels[(currentIndex + 1 + labels.length) % labels.length]
}

export function PagePropertiesPanel({
  definitions,
  values,
  onSetValue,
  onAddDefaultProperty,
}: PagePropertiesPanelProps) {
  function handleValueClick(definition: PagePropertyDefinition) {
    const currentValue = values[definition.id]

    if (definition.type === 'select') {
      onSetValue(definition.id, getNextSelectValue(definition, currentValue))
      return
    }

    if (definition.type === 'multiSelect') {
      const initialValue = Array.isArray(currentValue) ? currentValue.join(', ') : ''
      const nextValue = window.prompt(uiCopy.pageProperties.editMultiSelect, initialValue)
      if (nextValue === null) {
        return
      }

      const items = nextValue
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      onSetValue(definition.id, items)
      return
    }

    const nextValue = window.prompt(
      uiCopy.pageProperties.editValue,
      typeof currentValue === 'string' ? currentValue : '',
    )
    if (nextValue === null) {
      return
    }

    onSetValue(definition.id, nextValue.trim() || null)
  }

  return (
    <section className="page-properties-panel" aria-label={uiCopy.pageProperties.title}>
      {definitions.map((definition) => (
        <div key={definition.id} className="page-property-row">
          <span className="page-property-name">{definition.name}</span>
          <button
            type="button"
            className="page-property-value"
            onClick={() => handleValueClick(definition)}
          >
            {formatPropertyValue(values[definition.id] ?? null)}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="page-property-add"
        onClick={() => onAddDefaultProperty(getNextMissingPropertyKey(definitions))}
      >
        {uiCopy.pageProperties.add}
      </button>
    </section>
  )
}
