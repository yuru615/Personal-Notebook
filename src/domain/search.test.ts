import { describe, expect, it } from 'vitest'
import type { BoardRecord, DataTableRecord, PageRecord } from './types'
import { searchBoards, searchDataTables, searchPages } from './search'

const now = '2026-06-15T00:00:00.000Z'

const pages: PageRecord[] = [
  {
    id: 'page-a',
    parentId: null,
    title: 'Product Plan',
    icon: null,
    cover: null,
    blocks: [
      { id: 'block-a1', type: 'paragraph', text: 'Core customer goals' },
      { id: 'block-a2', type: 'todo', text: 'Schedule customer interviews', checked: false },
      { id: 'block-a3', type: 'bulleted_list', items: ['Requirements', 'Launch plan'] },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'page-b',
    parentId: null,
    title: 'Tech Notes',
    icon: null,
    cover: null,
    blocks: [
      { id: 'block-b1', type: 'code', language: 'ts', text: 'const query = "local";' },
      {
        id: 'block-b2',
        type: 'table',
        rows: [
          ['Module', 'Status'],
          ['Search', 'Open'],
        ],
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'page-c',
    parentId: null,
    title: 'Canvas Structure',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-c1', type: 'paragraph', text: 'Whiteboard layout notes' }],
    createdAt: now,
    updatedAt: now,
  },
]

const boards: BoardRecord[] = [
  {
    id: 'board-feedback',
    title: 'Feedback Board',
    snapshot: null,
    createdAt: now,
    updatedAt: '2026-06-16T00:00:00.000Z',
  },
  {
    id: 'board-orphan',
    title: 'Orphan Board',
    snapshot: null,
    createdAt: now,
    updatedAt: '2026-06-17T00:00:00.000Z',
  },
]

const boardPages: PageRecord[] = [
  {
    id: 'page-board',
    parentId: null,
    title: 'Customer Workspace',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-board', type: 'whiteboard', boardId: 'board-feedback' }],
    createdAt: now,
    updatedAt: now,
  },
]

const dataTablePages: PageRecord[] = [
  {
    id: 'page-data',
    parentId: null,
    title: 'Project Workspace',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-data', type: 'data_table', databaseId: 'database-roadmap' }],
    createdAt: now,
    updatedAt: now,
  },
]

const dataTables: DataTableRecord[] = [
  {
    id: 'database-roadmap',
    title: 'Roadmap Database',
    snapshot: {
      version: 1,
      records: {
        'record-launch': {
          id: 'record-launch',
          title: 'Launch Checklist',
          values: {},
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'database-orphan',
    title: 'Orphan Database',
    snapshot: {
      version: 1,
      records: {
        'record-orphan': {
          id: 'record-orphan',
          title: 'Hidden Record',
          values: {},
          createdAt: now,
          updatedAt: now,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  },
]

describe('searchPages', () => {
  it('returns pages whose title or block content matches the query', () => {
    expect(searchPages(pages, 'customer')[0]).toMatchObject({
      pageId: 'page-a',
      title: 'Product Plan',
      excerpt: 'Core customer goals',
    })

    expect(searchPages(pages, 'search')[0]).toMatchObject({
      pageId: 'page-b',
      title: 'Tech Notes',
      excerpt: 'Module Status Search Open',
    })

    expect(searchPages(pages, 'layout')[0]).toMatchObject({
      pageId: 'page-c',
      title: 'Canvas Structure',
      excerpt: 'Whiteboard layout notes',
    })
  })

  it('returns no results for blank queries', () => {
    expect(searchPages(pages, '   ')).toEqual([])
  })

  it('returns referenced whiteboards and excludes orphan boards', () => {
    expect(searchBoards(boardPages, boards, 'feedback')).toMatchObject([
      {
        pageId: 'page-board',
        boardId: 'board-feedback',
        title: 'Feedback Board',
      },
    ])

    expect(searchBoards(boardPages, boards, 'orphan')).toEqual([])
  })

  it('returns referenced data tables and their records', () => {
    expect(searchDataTables(dataTablePages, dataTables, 'roadmap')).toMatchObject([
      {
        kind: 'data_table',
        pageId: 'page-data',
        databaseId: 'database-roadmap',
        title: 'Roadmap Database',
      },
    ])

    expect(searchDataTables(dataTablePages, dataTables, 'launch')).toMatchObject([
      {
        kind: 'data_table_record',
        pageId: 'page-data',
        databaseId: 'database-roadmap',
        recordId: 'record-launch',
        title: 'Launch Checklist',
      },
    ])

    expect(searchDataTables(dataTablePages, dataTables, 'orphan')).toEqual([])
  })
})
