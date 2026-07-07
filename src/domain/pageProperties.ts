import { createId } from '../utils/id'
import type {
  PagePropertyDefinition,
  PagePropertyOption,
  PagePropertyType,
  PagePropertyValue,
  PagePropertyValueMap,
  WorkspaceSnapshot,
} from './types'

const PAGE_PROPERTY_OPTION_COLOR_PLACEHOLDER = '#475569'
const PAGE_PROPERTY_OPTION_COLOR_PALETTE = [
  '#7c3aed',
  '#2563eb',
  '#0f766e',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#db2777',
  '#dc2626',
  '#475569',
]

export function createDefaultPagePropertyDefinitions(now: string): PagePropertyDefinition[] {
  return [
    createDefinition('tags', '标签', 'multiSelect', now),
    createDefinition('status', '状态', 'select', now),
    createDefinition('date', '日期', 'date', now),
    createDefinition('notes', '备注', 'text', now),
  ]
}

export function createDefinition(
  key: string,
  name: string,
  type: PagePropertyType,
  now: string,
): PagePropertyDefinition {
  return {
    id: createId('page_property'),
    key,
    name,
    type,
    config: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizePagePropertyDefinitions(value: unknown): PagePropertyDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((definition) => {
    const pagePropertyDefinition = definition as PagePropertyDefinition

    if (
      !definition ||
      typeof definition !== 'object' ||
      Array.isArray(definition) ||
      (pagePropertyDefinition.type !== 'select' && pagePropertyDefinition.type !== 'multiSelect')
    ) {
      return pagePropertyDefinition
    }

    const rawOptions = Array.isArray(pagePropertyDefinition.config?.options)
      ? pagePropertyDefinition.config.options
      : []
    const nextOptions = normalizePagePropertyOptions(undefined, rawOptions)

    return {
      ...pagePropertyDefinition,
      config: {
        ...pagePropertyDefinition.config,
        options: nextOptions,
      },
    }
  })
}

function getNextPagePropertyOptionColor(usedColors: Set<string>, preferredIndex: number) {
  for (let offset = 0; offset < PAGE_PROPERTY_OPTION_COLOR_PALETTE.length; offset += 1) {
    const color =
      PAGE_PROPERTY_OPTION_COLOR_PALETTE[
        (preferredIndex + offset) % PAGE_PROPERTY_OPTION_COLOR_PALETTE.length
      ]

    if (!usedColors.has(color)) {
      return color
    }
  }

  return PAGE_PROPERTY_OPTION_COLOR_PALETTE[
    preferredIndex % PAGE_PROPERTY_OPTION_COLOR_PALETTE.length
  ]
}

export function normalizePagePropertyOptions(
  previousOptions: PagePropertyOption[] | undefined,
  nextOptions: PagePropertyOption[],
) {
  const previousById = new Map(previousOptions?.map((option) => [option.id, option]) ?? [])
  const previousByLabel = new Map(previousOptions?.map((option) => [option.label, option]) ?? [])
  const usedColors = new Set<string>()

  return nextOptions
    .filter((option) => option && option.label.trim())
    .map((option, index) => {
      const normalizedLabel = option.label.trim()
      const previousOption =
        previousById.get(option.id) ?? previousByLabel.get(normalizedLabel)
      const explicitColor =
        option.color && option.color !== PAGE_PROPERTY_OPTION_COLOR_PLACEHOLDER
          ? option.color
          : null
      const previousColor =
        previousOption?.color &&
        previousOption.color !== PAGE_PROPERTY_OPTION_COLOR_PLACEHOLDER
          ? previousOption.color
          : null
      const resolvedColor =
        explicitColor ??
        previousColor ??
        getNextPagePropertyOptionColor(usedColors, index)

      usedColors.add(resolvedColor)

      return {
        ...option,
        label: normalizedLabel,
        id: previousOption?.id ?? option.id,
        color: resolvedColor,
      }
    })
}

export function normalizePagePropertyValue(
  definition: PagePropertyDefinition,
  value: unknown,
): PagePropertyValue {
  const allowedOptionLabels =
    definition.type === 'select' || definition.type === 'multiSelect'
      ? Array.isArray(definition.config.options)
        ? new Set(definition.config.options.map((option) => option.label))
        : null
      : null

  if (definition.type === 'multiSelect') {
    const nextValue = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []

    return allowedOptionLabels
      ? nextValue.filter((item) => allowedOptionLabels.has(item))
      : nextValue
  }

  const nextValue = typeof value === 'string' && value.trim() ? value.trim() : null

  if (!nextValue) {
    return null
  }

  return allowedOptionLabels && !allowedOptionLabels.has(nextValue) ? null : nextValue
}

export function normalizePagePropertyValues(
  definitions: PagePropertyDefinition[],
  value: PagePropertyValueMap | undefined,
): PagePropertyValueMap {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      normalizePagePropertyValue(definition, value?.[definition.id]),
    ]),
  )
}

export function normalizeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...snapshot,
    pageProperties: normalizePagePropertyDefinitions(snapshot.pageProperties),
    pages: snapshot.pages.map((page) => ({
      ...page,
      properties: page.properties ?? {},
    })),
  }
}
