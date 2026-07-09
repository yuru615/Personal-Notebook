export type PageId = string
export type BlockId = string
export type BoardId = string
export type DataTableId = string
export type MindmapId = string
export type PagePropertyType = 'text' | 'select' | 'multiSelect' | 'date'

export interface PagePropertyOption {
  id: string
  label: string
  color: string
}

export interface PagePropertyDefinition {
  id: string
  key: string
  name: string
  type: PagePropertyType
  config: {
    options?: PagePropertyOption[]
  }
  createdAt: string
  updatedAt: string
}

export type PagePropertyValue = string | string[] | null
export type PagePropertyValueMap = Record<string, PagePropertyValue>

export type SidebarPinnedItem =
  | {
      kind: 'page'
      pageId: PageId
    }
  | {
      kind: 'data_table'
      pageId: PageId
      dataTableId: DataTableId
    }

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
  | 'image'
  | 'video'
  | 'audio'
  | 'whiteboard'
  | 'data_table'
  | 'data_table_inline'
  | 'mindmap'
  | 'synced_block'

export type SyncedBlockMode = 'sync' | 'reference'

export type TextColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'
export type PageRelationKind = 'link' | 'mention'
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
  pageId?: PageId
  relationKind?: PageRelationKind
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

export interface ImageBlock extends BlockBase {
  type: 'image'
  assetId: string | null
  name: string
  mimeType: string
  caption: string
  alt: string
}

export interface VideoBlock extends BlockBase {
  type: 'video'
  assetId: string | null
  name: string
  mimeType: string
  caption: string
}

export interface AudioBlock extends BlockBase {
  type: 'audio'
  assetId: string | null
  name: string
  mimeType: string
  caption: string
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

export interface MindmapBlock extends BlockBase {
  type: 'mindmap'
  mindmapId: MindmapId
}

export interface SyncedBlockInstanceBlock extends BlockBase {
  type: 'synced_block'
  groupId: string
  instanceId: string
  mode: SyncedBlockMode
}

export type PageFontFamily = 'default' | 'serif' | 'mono'
export type ClipboardCaptureMode = 'off' | 'prompt_to_inbox'
export type AppCloseAction = 'hide_to_tray' | 'quit'
export type SearchExcerptLength = 'short' | 'medium' | 'long'

export interface PageDisplayDefaults {
  isFullWidth: boolean
  isSmallText: boolean
  fontFamily: PageFontFamily
  showOutline: boolean
}

export interface SearchPreferences {
  groupResults: boolean
  showSourceLabels: boolean
  excerptLength: SearchExcerptLength
}

export interface AppSettings {
  closeAction?: AppCloseAction
}

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
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | WhiteboardBlock
  | DataTableBlock
  | MindmapBlock
  | SyncedBlockInstanceBlock

export interface SyncedBlockGroupRecord {
  id: string
  blocks: BlockRecord[]
  primaryInstanceId: string
  createdAt: string
  updatedAt: string
}

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

export interface MindmapRecord {
  id: MindmapId
  title: string
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
  properties?: PagePropertyValueMap
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
  inboxPageId?: PageId | null
  sidebarLayout?: 'compact' | 'classic'
  sidebarWidth?: number
  pinnedSidebarItems?: SidebarPinnedItem[]
  clipboardCaptureMode?: ClipboardCaptureMode
  pageDefaults?: Partial<PageDisplayDefaults>
  searchPreferences?: Partial<SearchPreferences>
}

export interface WorkspaceSnapshot {
  boards: BoardRecord[]
  dataTables?: DataTableRecord[]
  mindmaps?: MindmapRecord[]
  syncedBlockGroups?: SyncedBlockGroupRecord[]
  pages: PageRecord[]
  pageProperties?: PagePropertyDefinition[]
  settings: WorkspaceSettings
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
