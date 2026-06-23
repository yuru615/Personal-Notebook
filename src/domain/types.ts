export type PageId = string
export type BlockId = string
export type BoardId = string
export type DataTableId = string

export type BlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'todo'
  | 'bulleted_list'
  | 'numbered_list'
  | 'child_page'
  | 'code'
  | 'table'
  | 'whiteboard'
  | 'data_table'
  | 'data_table_inline'

export type TextColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'
export type BlockBackgroundColor =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
export type TextAlign = 'center'

export interface TextBlockStyle {
  textColor?: TextColor
  backgroundColor?: BlockBackgroundColor
  textAlign?: TextAlign
}

export type TableVerticalAlign = 'middle'

export interface TableCellStyle {
  backgroundColor?: BlockBackgroundColor
  textAlign?: TextAlign
  verticalAlign?: TableVerticalAlign
}

export type TableCellStyleGrid = Array<Array<TableCellStyle | null>>

export interface RichTextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  link?: string
  color?: TextColor
}

export interface InlineRichText {
  richText?: RichTextSegment[]
}

export interface BlockBase {
  id: BlockId
  type: BlockType
}

export interface ParagraphBlock extends BlockBase, TextBlockStyle, InlineRichText {
  type: 'paragraph'
  text: string
}

export interface Heading1Block extends BlockBase, TextBlockStyle, InlineRichText {
  type: 'heading_1'
  text: string
}

export interface Heading2Block extends BlockBase, TextBlockStyle, InlineRichText {
  type: 'heading_2'
  text: string
}

export interface Heading3Block extends BlockBase, TextBlockStyle, InlineRichText {
  type: 'heading_3'
  text: string
}

export interface TodoBlock extends BlockBase, TextBlockStyle, InlineRichText {
  type: 'todo'
  text: string
  checked: boolean
}

export interface BulletedListBlock extends BlockBase, TextBlockStyle {
  type: 'bulleted_list'
  items: string[]
}

export interface NumberedListBlock extends BlockBase, TextBlockStyle {
  type: 'numbered_list'
  items: string[]
}

export interface ChildPageBlock extends BlockBase {
  type: 'child_page'
  pageId: PageId
}

export interface CodeBlock extends BlockBase {
  type: 'code'
  language: string
  text: string
}

export interface TableBlock extends BlockBase {
  type: 'table'
  rows: string[][]
  cellStyles?: TableCellStyleGrid
  columnWidths?: number[]
  rowHeights?: number[]
}

export interface WhiteboardBlock extends BlockBase {
  type: 'whiteboard'
  boardId: BoardId
}

export interface DataTableBlock extends BlockBase {
  type: 'data_table'
  databaseId: DataTableId
  displayMode?: 'inline'
}

export type PageFontFamily = 'default' | 'serif' | 'mono'

export type BlockRecord =
  | ParagraphBlock
  | Heading1Block
  | Heading2Block
  | Heading3Block
  | TodoBlock
  | BulletedListBlock
  | NumberedListBlock
  | ChildPageBlock
  | CodeBlock
  | TableBlock
  | WhiteboardBlock
  | DataTableBlock

export interface BoardRecord {
  id: BoardId
  title: string
  snapshot: unknown
  createdAt: string
  updatedAt: string
}

export interface DataTableRecord {
  id: DataTableId
  title: string
  icon?: string | null
  cover?: string | null
  snapshot: unknown
  createdAt: string
  updatedAt: string
}

export interface PageRecord {
  id: PageId
  parentId: PageId | null
  title: string
  icon: string | null
  cover: string | null
  isFullWidth?: boolean
  isSmallText?: boolean
  fontFamily?: PageFontFamily
  showOutline?: boolean
  blocks: BlockRecord[]
  createdAt: string
  updatedAt: string
}

export interface WorkspaceSettings {
  lastOpenedPageId: PageId | null
}

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  dataTables?: DataTableRecord[]
  pages: PageRecord[]
  settings: WorkspaceSettings
}

export interface WorkspaceBackup extends WorkspaceSnapshot {
  version: 1
  exportedAt: string
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
