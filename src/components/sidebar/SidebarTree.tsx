import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronRight, Download, MoreHorizontal, Plus, Search } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useDismissableLayer } from '../editor/useDismissableLayer'
import { DEFAULT_PAGE_ICON } from '../../domain/pageIcons'
import type {
  BoardRecord,
  DataTableRecord,
  PageId,
  PageRecord,
  WorkspaceSettings,
} from '../../domain/types'
import { uiCopy } from '../../ui/copy'
import { buildVisiblePageItems } from '../../utils/pageTree'

const RECENT_WHITEBOARDS_LABEL = '最近白板'
const DATA_TABLE_ICON = '▦'
const SIDEBAR_PAGE_MENU_LABEL = '页面更多操作'
const SIDEBAR_RENAME_PAGE_LABEL = '重命名页面'
const SIDEBAR_DUPLICATE_PAGE_LABEL = '复制页面'
const SIDEBAR_DELETE_PAGE_LABEL = '删除页面'
const SIDEBAR_RENAME_PAGE_PROMPT = '重命名页面'
const SIDEBAR_PAGE_MENU_GAP = 8
const SIDEBAR_PAGE_MENU_VIEWPORT_PADDING = 12

type SidebarLayout = NonNullable<WorkspaceSettings['sidebarLayout']>

interface SidebarTreeProps {
  pages: PageRecord[]
  boards?: BoardRecord[]
  dataTables?: DataTableRecord[]
  currentPageId: PageId | null
  onCreatePage: () => void
  onSearch?: () => void
  onReorderPage?: (activePageId: PageId, overPageId: PageId) => void
  onRenamePage?: (pageId: PageId, title: string) => void | Promise<void>
  onDuplicatePage?: (pageId: PageId) => void | Promise<void>
  onDeletePage?: (pageId: PageId) => void | Promise<void>
  onImportArchive?: () => void | Promise<void>
  layout?: SidebarLayout
  onSetSidebarLayout?: (layout: SidebarLayout) => void | Promise<void>
}

interface SidebarPopoverPosition {
  left: number
  top: number
}

export function SidebarTree({
  pages,
  boards = [],
  dataTables = [],
  currentPageId,
  onCreatePage,
  onSearch,
  onReorderPage,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onImportArchive,
  layout = 'classic',
  onSetSidebarLayout,
}: SidebarTreeProps) {
  const [expandedPageIds, setExpandedPageIds] = useState<Record<string, boolean>>({})
  const [openMenuPageId, setOpenMenuPageId] = useState<PageId | null>(null)
  const [openMenuPosition, setOpenMenuPosition] = useState<SidebarPopoverPosition | null>(null)
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false)
  const [utilityMenuPosition, setUtilityMenuPosition] = useState<SidebarPopoverPosition | null>(null)
  const visiblePages = useMemo(
    () => buildVisiblePageItems(pages, expandedPageIds),
    [expandedPageIds, pages],
  )
  const recentBoards = useMemo(() => buildRecentBoards(pages, boards), [boards, pages])
  const dataTablesByPageId = useMemo(
    () => buildDataTablesByPageId(pages, dataTables),
    [dataTables, pages],
  )
  const draggingPageId = useRef<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const utilityMenuRef = useRef<HTMLDivElement | null>(null)
  const utilityTriggerRef = useRef<HTMLButtonElement | null>(null)
  const treeMetrics = getTreeMetrics(layout)

  useDismissableLayer({
    open: openMenuPageId !== null,
    refs: [menuRef, menuTriggerRef],
    onDismiss: () => {
      menuTriggerRef.current = null
      setOpenMenuPageId(null)
    },
  })

  useDismissableLayer({
    open: isUtilityMenuOpen,
    refs: [utilityMenuRef, utilityTriggerRef],
    onDismiss: () => {
      utilityTriggerRef.current = null
      setIsUtilityMenuOpen(false)
    },
  })

  useLayoutEffect(() => {
    if (openMenuPageId === null) {
      setOpenMenuPosition(null)
      return
    }

    function updateMenuPosition() {
      const trigger = menuTriggerRef.current
      const menu = menuRef.current

      if (!trigger || !menu) {
        return
      }

      const nextPosition = resolveSidebarPopoverPosition({
        anchorRect: trigger.getBoundingClientRect(),
        menuRect: menu.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })

      setOpenMenuPosition((current) =>
        current?.left === nextPosition.left && current.top === nextPosition.top
          ? current
          : nextPosition,
      )
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [openMenuPageId])

  useLayoutEffect(() => {
    if (!isUtilityMenuOpen) {
      setUtilityMenuPosition(null)
      return
    }

    function updateMenuPosition() {
      const trigger = utilityTriggerRef.current
      const menu = utilityMenuRef.current

      if (!trigger || !menu) {
        return
      }

      const nextPosition = resolveSidebarPopoverPosition({
        anchorRect: trigger.getBoundingClientRect(),
        menuRect: menu.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      })

      setUtilityMenuPosition((current) =>
        current?.left === nextPosition.left && current.top === nextPosition.top
          ? current
          : nextPosition,
      )
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isUtilityMenuOpen])

  function togglePage(pageId: PageId) {
    setExpandedPageIds((current) => ({
      ...current,
      [pageId]: !(current[pageId] ?? true),
    }))
  }

  function getTreeItemPaddingLeft(depth: number, hasToggleSlot: boolean) {
    return `${treeMetrics.basePadding + depth * treeMetrics.depthIndent + (hasToggleSlot ? treeMetrics.toggleSlot : 0)}px`
  }

  function renderUtilityMenu(buttonClassName: string) {
    return (
      <div className="sidebar-utility-menu" ref={isUtilityMenuOpen ? utilityMenuRef : null}>
        <button
          type="button"
          className={buttonClassName}
          aria-label={uiCopy.sidebar.more}
          aria-expanded={isUtilityMenuOpen}
          aria-haspopup="menu"
          onClick={(event) => {
            if (isUtilityMenuOpen) {
              utilityTriggerRef.current = null
              setIsUtilityMenuOpen(false)
              return
            }

            utilityTriggerRef.current = event.currentTarget
            setIsUtilityMenuOpen(true)
          }}
        >
          <MoreHorizontal size={14} strokeWidth={1.9} />
          {buttonClassName.includes('sidebar-link') ? <span>{uiCopy.sidebar.more}</span> : null}
        </button>
        {isUtilityMenuOpen ? (
          <div
            ref={utilityMenuRef}
            className="page-menu-popover sidebar-utility-menu-popover"
            style={{
              position: 'fixed',
              left: `${utilityMenuPosition?.left ?? 0}px`,
              top: `${utilityMenuPosition?.top ?? 0}px`,
              right: 'auto',
              visibility: utilityMenuPosition ? 'visible' : 'hidden',
            }}
          >
            <div className="page-menu-section">
              <button
                type="button"
                className="page-menu-action"
                aria-pressed={layout === 'compact'}
                onClick={() => {
                  setIsUtilityMenuOpen(false)
                  void onSetSidebarLayout?.('compact')
                }}
              >
                <span className="page-menu-item-label">{uiCopy.sidebar.compactMode}</span>
              </button>
              <button
                type="button"
                className="page-menu-action"
                aria-pressed={layout === 'classic'}
                onClick={() => {
                  setIsUtilityMenuOpen(false)
                  void onSetSidebarLayout?.('classic')
                }}
              >
                <span className="page-menu-item-label">{uiCopy.sidebar.classicMode}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderCompactHeader() {
    return (
      <div className="sidebar-compact-header">
        <div className="sidebar-account">
          <div className="sidebar-account-avatar" aria-hidden="true">
            知
          </div>
          <div className="sidebar-account-copy">
            <div className="sidebar-account-title">{uiCopy.sidebar.localWorkspace}</div>
            <div className="sidebar-account-subtitle">{uiCopy.sidebar.desktopApp}</div>
          </div>
        </div>
        <div className="sidebar-toolstrip" aria-label={uiCopy.sidebar.tools}>
          <button type="button" className="sidebar-tool-button" aria-label={uiCopy.sidebar.search} onClick={onSearch}>
            <Search size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="sidebar-tool-button"
            aria-label={uiCopy.sidebar.newPage}
            onClick={onCreatePage}
          >
            <Plus size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="sidebar-tool-button"
            aria-label={uiCopy.sidebar.import}
            disabled={!onImportArchive}
            onClick={() => {
              void onImportArchive?.()
            }}
          >
            <Download size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="sidebar-tool-button"
            aria-label={uiCopy.sidebar.notifications}
            disabled
          >
            <Bell size={15} strokeWidth={1.9} />
          </button>
          {renderUtilityMenu('sidebar-tool-button')}
        </div>
      </div>
    )
  }

  function renderClassicHeader() {
    return (
      <div className="sidebar-group">
        <button type="button" className="sidebar-link" onClick={onSearch}>
          {uiCopy.sidebar.search}
        </button>
        <button type="button" className="sidebar-link" onClick={onCreatePage}>
          {uiCopy.sidebar.newPage}
        </button>
        {renderUtilityMenu('sidebar-link sidebar-link-icon-button')}
      </div>
    )
  }

  return (
    <div className={`sidebar-layout sidebar-layout-${layout}`}>
      {layout === 'compact' ? renderCompactHeader() : renderClassicHeader()}

      {recentBoards.length > 0 ? (
        <div className="sidebar-group">
          <div className="sidebar-section-title">{RECENT_WHITEBOARDS_LABEL}</div>
          <div className="sidebar-tree" aria-label={RECENT_WHITEBOARDS_LABEL}>
            {recentBoards.map(({ board, pageId }) => (
              <NavLink
                key={board.id}
                to={`/pages/${pageId}/boards/${board.id}`}
                className={({ isActive }) => getSidebarItemClassName(isActive)}
              >
                <span className="sidebar-tree-icon" aria-hidden="true">
                  □
                </span>
                <span className="sidebar-tree-label">{board.title}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}

      <nav className="sidebar-tree" aria-label={uiCopy.sidebar.pageTree}>
        {visiblePages.map(({ page, depth, hasChildren }) => {
          const pageDataTables = dataTablesByPageId.get(page.id) ?? []
          const hasNestedItems = hasChildren || pageDataTables.length > 0
          const isActivePage = currentPageId === page.id
          const isExpanded = expandedPageIds[page.id] ?? true
          const isMenuOpen = openMenuPageId === page.id
          const toggleLabel = isExpanded ? uiCopy.sidebar.collapsePage : uiCopy.sidebar.expandPage
          const linkPaddingLeft = getTreeItemPaddingLeft(depth, true)
          const toggleLeft = `${treeMetrics.basePadding + depth * treeMetrics.depthIndent}px`

          return (
            <div key={page.id} className="sidebar-tree-entry">
              <div
                className={[
                  'sidebar-tree-row',
                  'sidebar-tree-page-row',
                  isActivePage ? 'sidebar-tree-row-active' : '',
                  isMenuOpen ? 'sidebar-tree-row-menu-open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingPageId.current && draggingPageId.current !== page.id) {
                    onReorderPage?.(draggingPageId.current, page.id)
                  }
                  draggingPageId.current = null
                }}
              >
                {hasNestedItems ? (
                  <button
                    type="button"
                    className="sidebar-tree-toggle"
                    aria-label={toggleLabel}
                    aria-expanded={isExpanded}
                    style={{ left: toggleLeft }}
                    onClick={() => togglePage(page.id)}
                  >
                    <span className="sidebar-tree-toggle-icon" aria-hidden="true">
                      <ChevronRight size={14} strokeWidth={1.9} />
                    </span>
                  </button>
                ) : null}
                <NavLink
                  to={`/pages/${page.id}`}
                  className={({ isActive }) => getSidebarItemClassName(isActive)}
                  style={{ paddingLeft: linkPaddingLeft }}
                  draggable
                  onDragStart={() => {
                    draggingPageId.current = page.id
                  }}
                >
                  <span className="sidebar-tree-icon" aria-hidden="true">
                    {page.icon ?? DEFAULT_PAGE_ICON}
                  </span>
                  <span className="sidebar-tree-label">{page.title}</span>
                </NavLink>
                {onRenamePage || onDuplicatePage || onDeletePage ? (
                  <div className="sidebar-tree-actions">
                    <div
                      className="page-menu sidebar-tree-page-menu"
                      ref={isMenuOpen ? menuRef : null}
                    >
                      <button
                        type="button"
                        className="sidebar-tree-more-button"
                        aria-label={SIDEBAR_PAGE_MENU_LABEL}
                        aria-expanded={isMenuOpen}
                        aria-haspopup="menu"
                        onClick={(event) => {
                          if (isMenuOpen) {
                            menuTriggerRef.current = null
                            setOpenMenuPageId(null)
                            return
                          }

                          menuTriggerRef.current = event.currentTarget
                          setOpenMenuPageId(page.id)
                        }}
                      >
                        <MoreHorizontal size={14} strokeWidth={1.9} />
                      </button>
                      {isMenuOpen ? (
                        <div
                          ref={menuRef}
                          className="page-menu-popover sidebar-tree-page-menu-popover"
                          style={{
                            position: 'fixed',
                            left: `${openMenuPosition?.left ?? 0}px`,
                            top: `${openMenuPosition?.top ?? 0}px`,
                            right: 'auto',
                            visibility: openMenuPosition ? 'visible' : 'hidden',
                          }}
                        >
                          <div className="page-menu-section">
                            {onRenamePage ? (
                              <button
                                type="button"
                                className="page-menu-action"
                                onClick={() => {
                                  menuTriggerRef.current = null
                                  setOpenMenuPageId(null)
                                  const nextTitle = window.prompt(
                                    SIDEBAR_RENAME_PAGE_PROMPT,
                                    page.title,
                                  )
                                  if (nextTitle !== null && nextTitle !== page.title) {
                                    void onRenamePage(page.id, nextTitle)
                                  }
                                }}
                              >
                                <span className="page-menu-item-label">{SIDEBAR_RENAME_PAGE_LABEL}</span>
                              </button>
                            ) : null}
                            {onDuplicatePage ? (
                              <button
                                type="button"
                                className="page-menu-action"
                                onClick={() => {
                                  menuTriggerRef.current = null
                                  setOpenMenuPageId(null)
                                  void onDuplicatePage(page.id)
                                }}
                              >
                                <span className="page-menu-item-label">{SIDEBAR_DUPLICATE_PAGE_LABEL}</span>
                              </button>
                            ) : null}
                            {onDeletePage ? (
                              <button
                                type="button"
                                className="page-menu-action page-menu-action-danger"
                                onClick={() => {
                                  menuTriggerRef.current = null
                                  setOpenMenuPageId(null)
                                  void onDeletePage(page.id)
                                }}
                              >
                                <span className="page-menu-item-label">{SIDEBAR_DELETE_PAGE_LABEL}</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              {(isExpanded ? pageDataTables : []).map((dataTable) => (
                <div key={`${page.id}-${dataTable.id}`} className="sidebar-tree-row">
                  <NavLink
                    to={`/pages/${page.id}/data-tables/${dataTable.id}`}
                    className={({ isActive }) => getSidebarItemClassName(isActive)}
                    style={{ paddingLeft: getTreeItemPaddingLeft(depth + 1, true) }}
                  >
                    <span className="sidebar-tree-icon" aria-hidden="true">
                      {dataTable.icon ?? DATA_TABLE_ICON}
                    </span>
                    <span className="sidebar-tree-label">{dataTable.title}</span>
                  </NavLink>
                </div>
              ))}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

function getSidebarItemClassName(isActive: boolean) {
  return isActive ? 'sidebar-link sidebar-link-active' : 'sidebar-link'
}

function resolveSidebarPopoverPosition({
  anchorRect,
  menuRect,
  viewportWidth,
  viewportHeight,
}: {
  anchorRect: DOMRect
  menuRect: DOMRect
  viewportWidth: number
  viewportHeight: number
}): SidebarPopoverPosition {
  const maxLeft = Math.max(
    SIDEBAR_PAGE_MENU_VIEWPORT_PADDING,
    viewportWidth - menuRect.width - SIDEBAR_PAGE_MENU_VIEWPORT_PADDING,
  )
  const preferredLeft = anchorRect.right + SIDEBAR_PAGE_MENU_GAP
  const fallbackLeft = anchorRect.left - menuRect.width - SIDEBAR_PAGE_MENU_GAP
  const left = preferredLeft <= maxLeft
    ? preferredLeft
    : Math.max(SIDEBAR_PAGE_MENU_VIEWPORT_PADDING, fallbackLeft)
  const top = Math.min(
    Math.max(SIDEBAR_PAGE_MENU_VIEWPORT_PADDING, anchorRect.top - 4),
    Math.max(
      SIDEBAR_PAGE_MENU_VIEWPORT_PADDING,
      viewportHeight - menuRect.height - SIDEBAR_PAGE_MENU_VIEWPORT_PADDING,
    ),
  )

  return {
    left: Math.round(left),
    top: Math.round(top),
  }
}

function getTreeMetrics(layout: SidebarLayout) {
  if (layout === 'compact') {
    return {
      basePadding: 8,
      depthIndent: 14,
      toggleSlot: 16,
    }
  }

  return {
    basePadding: 10,
    depthIndent: 16,
    toggleSlot: 18,
  }
}

function buildRecentBoards(pages: PageRecord[], boards: BoardRecord[]) {
  const pageIdsByBoardId = new Map<string, string>()

  for (const page of pages) {
    for (const block of page.blocks) {
      if (block.type === 'whiteboard' && !pageIdsByBoardId.has(block.boardId)) {
        pageIdsByBoardId.set(block.boardId, page.id)
      }
    }
  }

  return boards
    .filter((board) => pageIdsByBoardId.has(board.id))
    .sort((left, right) => getUpdatedAt(right.updatedAt) - getUpdatedAt(left.updatedAt))
    .map((board) => ({
      board,
      pageId: pageIdsByBoardId.get(board.id) ?? pages[0]?.id ?? '',
    }))
}

function buildDataTablesByPageId(pages: PageRecord[], dataTables: DataTableRecord[]) {
  const dataTableById = new Map(dataTables.map((dataTable) => [dataTable.id, dataTable]))
  const result = new Map<PageId, DataTableRecord[]>()

  for (const page of pages) {
    const seenOnPage = new Set<string>()

    for (const block of page.blocks) {
      if (block.type !== 'data_table' || seenOnPage.has(block.databaseId)) {
        continue
      }

      const dataTable = dataTableById.get(block.databaseId)

      if (!dataTable) {
        continue
      }

      seenOnPage.add(block.databaseId)
      result.set(page.id, [...(result.get(page.id) ?? []), dataTable])
    }
  }

  return result
}

function getUpdatedAt(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
