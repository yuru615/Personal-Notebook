import { describe, expect, it } from 'vitest'
import type {
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PagePropertyDefinition,
  PageRecord,
} from './types'
import { searchBoards, searchDataTables, searchMindmaps, searchPages } from './search'

const now = '2026-06-15T00:00:00.000Z'
const pagePropertyDefinitions: PagePropertyDefinition[] = []

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
  {
    id: 'page-d',
    parentId: null,
    title: 'Visual Thinking',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-d1', type: 'mindmap', mindmapId: 'mindmap-1' }],
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

const mindmapPages: PageRecord[] = [
  {
    id: 'page-mindmap',
    parentId: null,
    title: 'Strategy Workspace',
    icon: null,
    cover: null,
    blocks: [{ id: 'block-mindmap', type: 'mindmap', mindmapId: 'mindmap-strategy' }],
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

const mindmaps: MindmapRecord[] = [
  {
    id: 'mindmap-strategy',
    title: 'Strategy Map',
    snapshot: {
      id: 'doc-root',
      title: 'Strategy Map',
      structure: 'mindmap',
      rootId: 'node-root',
      nodes: {
        'node-root': {
          id: 'node-root',
          parentId: null,
          childIds: ['node-1'],
          text: 'Strategy Map',
          collapsed: false,
        },
        'node-1': {
          id: 'node-1',
          parentId: 'node-root',
          childIds: [],
          text: 'North star metric',
          collapsed: false,
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  },
]

describe('searchPages', () => {
  it('returns pages whose title or block content matches the query', () => {
    expect(searchPages(pages, pagePropertyDefinitions, [], 'customer')[0]).toMatchObject({
      pageId: 'page-a',
      title: 'Product Plan',
      excerpt: 'Core customer goals',
    })

    expect(searchPages(pages, pagePropertyDefinitions, [], 'search')[0]).toMatchObject({
      pageId: 'page-b',
      title: 'Tech Notes',
      excerpt: 'Module Status Search Open',
    })

    expect(searchPages(pages, pagePropertyDefinitions, [], 'layout')[0]).toMatchObject({
      pageId: 'page-c',
      title: 'Canvas Structure',
      excerpt: 'Whiteboard layout notes',
    })

    expect(searchPages(pages, pagePropertyDefinitions, [], '导图')[0]).toMatchObject({
      pageId: 'page-d',
      title: 'Visual Thinking',
      excerpt: '导图',
    })
  })

  it('returns no results for blank queries', () => {
    expect(searchPages(pages, pagePropertyDefinitions, [], '   ')).toEqual([])
  })

  it('returns multiple matches from the same page when different blocks match the query', () => {
    const multiMatchPages: PageRecord[] = [
      {
        id: 'page-multi',
        parentId: null,
        title: 'Meeting Notes',
        icon: null,
        cover: null,
        blocks: [
          { id: 'block-1', type: 'paragraph', text: 'customer interview summary' },
          { id: 'block-2', type: 'paragraph', text: 'customer follow-up checklist' },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(searchPages(multiMatchPages, pagePropertyDefinitions, [], 'customer')).toMatchObject([
      {
        pageId: 'page-multi',
        blockId: 'block-1',
        excerpt: 'customer interview summary',
      },
      {
        pageId: 'page-multi',
        blockId: 'block-2',
        excerpt: 'customer follow-up checklist',
      },
    ])
  })

  it('attaches block ids to block-backed page hits so the app can jump to the matched block', () => {
    expect(searchPages(pages, pagePropertyDefinitions, [], 'schedule')).toMatchObject([
      {
        pageId: 'page-a',
        blockId: 'block-a2',
        excerpt: 'Schedule customer interviews',
      },
    ])
  })

  it('matches visible rich text content even when legacy text fields are empty', () => {
    const richTextOnlyPages: PageRecord[] = [
      {
        id: 'page-rich-text-only',
        parentId: null,
        title: 'Rich text page',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'block-rich-text-only',
            type: 'paragraph',
            text: '',
            richText: [{ text: 'Visible synced search text' }],
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(searchPages(richTextOnlyPages, pagePropertyDefinitions, [], 'Visible synced search text')).toMatchObject([
      {
        pageId: 'page-rich-text-only',
        blockId: 'block-rich-text-only',
        excerpt: 'Visible synced search text',
      },
    ])
  })

  it('returns relation hits with block ids and keeps multiple relation matches from the same page', () => {
    const relationPages: PageRecord[] = [
      {
        id: 'page-target',
        parentId: null,
        title: 'Product Plan',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-source',
        parentId: null,
        title: 'Meeting Notes',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'block-relation',
            type: 'paragraph',
            text: 'See Product Plan and @Product Plan',
            richText: [
              { text: 'See ' },
              { text: 'Product Plan', pageId: 'page-target', relationKind: 'link' },
              { text: ' and ' },
              { text: '@Product Plan', pageId: 'page-target', relationKind: 'mention' },
            ],
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    const relationResults = searchPages(
      relationPages,
      pagePropertyDefinitions,
      [],
      'product plan',
    ).filter((result) => result.pageId === 'page-source')

    expect(relationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'page-source',
          blockId: 'block-relation',
          matchSource: 'page_link',
          sourceLabel: '页面链接',
          excerpt: 'See Product Plan and @Product Plan',
        }),
        expect.objectContaining({
          pageId: 'page-source',
          blockId: 'block-relation',
          matchSource: 'page_mention',
          sourceLabel: '页面提及',
          excerpt: 'See Product Plan and @Product Plan',
        }),
      ]),
    )
    expect(
      relationResults.filter(
        (result) => result.matchSource === 'page_link' || result.matchSource === 'page_mention',
      ),
    ).toHaveLength(2)
  })

  it('emits property hits with source labels and keeps multiple hits from the same page', () => {
    const pageWithProperties: PageRecord = {
      id: 'page-search',
      parentId: null,
      title: '搜索笔记',
      icon: null,
      cover: null,
      blocks: [{ id: 'block-search', type: 'paragraph', text: '搜索需求梳理' }],
      properties: {
        prop_tags: ['产品', '搜索'],
        prop_status: '进行中',
      },
      createdAt: now,
      updatedAt: now,
    }

    const definitions: PagePropertyDefinition[] = [
      {
        id: 'prop_tags',
        key: 'tags',
        name: '标签',
        type: 'multiSelect',
        config: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prop_status',
        key: 'status',
        name: '状态',
        type: 'select',
        config: {},
        createdAt: now,
        updatedAt: now,
      },
    ]

    const results = searchPages([pageWithProperties], definitions, [], '搜索')

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'page-search',
          matchSource: 'property',
          matchKey: 'tags',
          sourceLabel: '标签',
          excerpt: '产品 / 搜索',
        }),
      ]),
    )
    expect(results.filter((result) => result.pageId === 'page-search')).toHaveLength(3)
  })

  it('matches media file names more robustly across punctuation boundaries', () => {
    const mediaPages: PageRecord[] = [
      {
        id: 'page-media',
        parentId: null,
        title: 'Media Notes',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'block-image',
            type: 'image',
            assetId: 'asset-image',
            name: 'Capture001.png',
            mimeType: 'image/png',
            caption: '',
            alt: '',
          },
          {
            id: 'block-audio',
            type: 'audio',
            assetId: 'asset-audio',
            name: '20分.mp3',
            mimeType: 'audio/mpeg',
            caption: '',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(searchPages(mediaPages, pagePropertyDefinitions, [], 'capture001 png')).toMatchObject([
      {
        pageId: 'page-media',
        excerpt: 'Capture001.png',
      },
    ])

    expect(searchPages(mediaPages, pagePropertyDefinitions, [], '20分 mp3')).toMatchObject([
      {
        pageId: 'page-media',
        excerpt: '20分.mp3',
      },
    ])
  })

  it('returns referenced whiteboards and excludes orphan boards', () => {
    expect(searchBoards(boardPages, boards, 'feedback')).toMatchObject([
      {
        pageId: 'page-board',
        boardId: 'board-feedback',
        title: 'Feedback Board',
        matchSource: 'whiteboard_title',
        sourceLabel: '白板标题',
      },
    ])

    expect(searchBoards(boardPages, boards, 'orphan')).toEqual([])
  })

  it('returns whiteboard content hits with their own source label', () => {
    const boardsWithContent: BoardRecord[] = [
      {
        id: 'board-feedback',
        title: 'Feedback Board',
        snapshot: {
          version: 1,
          elements: [
            {
              id: 'text-1',
              type: 'text',
              x: 0,
              y: 0,
              width: 120,
              height: 40,
              text: 'Customer quote wall',
              color: '#111111',
              fontSize: 16,
            },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        createdAt: now,
        updatedAt: '2026-06-16T00:00:00.000Z',
      },
    ]

    expect(searchBoards(boardPages, boardsWithContent, 'quote')).toMatchObject([
      {
        pageId: 'page-board',
        boardId: 'board-feedback',
        title: 'Feedback Board',
        excerpt: 'Customer quote wall',
        matchSource: 'whiteboard_content',
        sourceLabel: '白板内容',
      },
    ])
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

  it('returns referenced mindmaps for both title hits and node hits', () => {
    expect(searchMindmaps(mindmapPages, mindmaps, 'strategy')).toMatchObject([
      {
        kind: 'mindmap',
        pageId: 'page-mindmap',
        mindmapId: 'mindmap-strategy',
        title: 'Strategy Map',
        matchSource: 'mindmap_title',
        sourceLabel: '导图标题',
      },
    ])

    expect(searchMindmaps(mindmapPages, mindmaps, 'north star')).toMatchObject([
      {
        kind: 'mindmap',
        pageId: 'page-mindmap',
        mindmapId: 'mindmap-strategy',
        title: 'Strategy Map',
        excerpt: 'North star metric',
        matchSource: 'mindmap_node',
        sourceLabel: '导图节点',
      },
    ])
  })
  it('includes media file names together with media descriptions in excerpts', () => {
    const mediaPages: PageRecord[] = [
      {
        id: 'page-media-descriptions',
        parentId: null,
        title: 'Media Library',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'block-image-description',
            type: 'image',
            assetId: 'asset-image-description',
            name: 'Capture001.png',
            mimeType: 'image/png',
            caption: '首页截图',
            alt: '搜索弹窗',
          },
          {
            id: 'block-audio-description',
            type: 'audio',
            assetId: 'asset-audio-description',
            name: 'meeting.mp3',
            mimeType: 'audio/mpeg',
            caption: '访谈录音',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(searchPages(mediaPages, pagePropertyDefinitions, [], '首页截图')).toMatchObject([
      {
        pageId: 'page-media-descriptions',
        blockId: 'block-image-description',
        excerpt: 'Capture001.png / 首页截图 / 搜索弹窗',
        matchSource: 'media',
      },
    ])

    expect(searchPages(mediaPages, pagePropertyDefinitions, [], '访谈录音')).toMatchObject([
      {
        pageId: 'page-media-descriptions',
        blockId: 'block-audio-description',
        excerpt: 'meeting.mp3 / 访谈录音',
        matchSource: 'media',
      },
    ])
  })
  it('returns synced and reference hits per page instance', () => {
    const syncedPages: PageRecord[] = [
      {
        id: 'page-sync',
        parentId: null,
        title: 'Sync page',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'container-sync',
            type: 'synced_block',
            groupId: 'group-1',
            instanceId: 'instance-sync',
            mode: 'sync',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'page-reference',
        parentId: null,
        title: 'Reference page',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'container-reference',
            type: 'synced_block',
            groupId: 'group-1',
            instanceId: 'instance-reference',
            mode: 'reference',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]
    const syncedBlockGroups = [
      {
        id: 'group-1',
        blocks: [{ id: 'group-block-1', type: 'paragraph' as const, text: 'Shared alpha note' }],
        primaryInstanceId: 'instance-sync',
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(
      searchPages(syncedPages, pagePropertyDefinitions, syncedBlockGroups, 'Shared alpha note'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: 'page-sync',
          blockId: 'container-sync',
          matchSource: 'synced_block',
          sourceLabel: '同步块内容',
        }),
        expect.objectContaining({
          pageId: 'page-reference',
          blockId: 'container-reference',
          matchSource: 'reference_block',
          sourceLabel: '引用块内容',
        }),
      ]),
    )
  })

  it('keeps multiple synced hits on the same page when several instances match', () => {
    const syncedPages: PageRecord[] = [
      {
        id: 'page-sync',
        parentId: null,
        title: 'Sync page',
        icon: null,
        cover: null,
        blocks: [
          {
            id: 'container-1',
            type: 'synced_block',
            groupId: 'group-1',
            instanceId: 'instance-1',
            mode: 'sync',
          },
          {
            id: 'container-2',
            type: 'synced_block',
            groupId: 'group-1',
            instanceId: 'instance-2',
            mode: 'sync',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]
    const syncedBlockGroups = [
      {
        id: 'group-1',
        blocks: [{ id: 'group-block-1', type: 'paragraph' as const, text: 'Shared alpha note' }],
        primaryInstanceId: 'instance-1',
        createdAt: now,
        updatedAt: now,
      },
    ]

    expect(
      searchPages(syncedPages, pagePropertyDefinitions, syncedBlockGroups, 'Shared alpha note'),
    ).toMatchObject([
      expect.objectContaining({ pageId: 'page-sync', blockId: 'container-1' }),
      expect.objectContaining({ pageId: 'page-sync', blockId: 'container-2' }),
    ])
  })
})
