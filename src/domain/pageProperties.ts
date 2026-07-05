import { createId } from '../utils/id'
import type {
  PagePropertyDefinition,
  PagePropertyType,
  PagePropertyValue,
  PagePropertyValueMap,
  WorkspaceSnapshot,
} from './types'

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
  return Array.isArray(value) ? value : []
}

export function normalizePagePropertyValue(
  definition: PagePropertyDefinition,
  value: unknown,
): PagePropertyValue {
  if (definition.type === 'multiSelect') {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  return typeof value === 'string' && value.trim() ? value.trim() : null
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
