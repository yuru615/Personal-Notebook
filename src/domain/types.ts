export type PageId = string
export type BlockId = string

export type BlockType =
  | 'paragraph'
  | 'todo'
  | 'bulleted_list'
  | 'numbered_list'
  | 'child_page'
  | 'code'
  | 'table'

export interface BlockBase {
  id: BlockId
  type: BlockType
}

export interface ParagraphBlock extends BlockBase {
  type: 'paragraph'
  text: string
}

export interface TodoBlock extends BlockBase {
  type: 'todo'
  text: string
  checked: boolean
}

export interface BulletedListBlock extends BlockBase {
  type: 'bulleted_list'
  text: string
}

export interface NumberedListBlock extends BlockBase {
  type: 'numbered_list'
  text: string
}

export interface ChildPageBlock extends BlockBase {
  type: 'child_page'
  pageId: PageId
  title: string
}

export interface CodeBlock extends BlockBase {
  type: 'code'
  language: string
  code: string
}

export interface TableBlock extends BlockBase {
  type: 'table'
  rows: string[][]
}

export type BlockRecord =
  | ParagraphBlock
  | TodoBlock
  | BulletedListBlock
  | NumberedListBlock
  | ChildPageBlock
  | CodeBlock
  | TableBlock

export interface PageRecord {
  id: PageId
  parentId: PageId | null
  title: string
  blocks: BlockRecord[]
  createdAt: string
  updatedAt: string
}

export interface WorkspaceSettings {
  workspaceName: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceSnapshot {
  pages: PageRecord[]
  settings: WorkspaceSettings
  currentPageId: PageId | null
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
