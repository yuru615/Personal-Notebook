import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bell, ChevronRight, Download, MoreHorizontal, Plus, Search } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useDismissableLayer } from '../editor/useDismissableLayer'
import { DEFAULT_PAGE_ICON } from '../../domain/pageIcons'
import type {
  DataTableId,
  DataTableRecord,
  PageId,
  PageRecord,
  SidebarPinnedItem,
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
const SIDEBAR_EXPORT_PAGE_LABEL = '导出页面'
const SIDEBAR_PAGE_MENU_GAP = 8
const SIDEBAR_PAGE_MENU_VIEWPORT_PADDING = 12

type SidebarLayout = NonNullable<WorkspaceSettings['sidebarLayout']>
type SidebarSectionKey = 'pinned' | 'shared' | 'my_pages'
type SidebarMenuItem =
  | {
      kind: 'page'
      pageId: PageId
      title: string
      isPinned: boolean
    }
  | {
      kind: 'data_table'
      pageId: PageId
      dataTableId: DataTableId
      title: string
      isPinned: boolean
    }
type PinnedSidebarEntry = SidebarMenuItem & {
  href: string
  icon: string
  depth: number
  hasNestedItems: boolean
}

interface SidebarTreeProps {
  pages: PageRecord[]
  dataTables?: DataTableRecord[]
  currentPageId: PageId | null
  pinnedSidebarItems?: SidebarPinnedItem[]
  onCreatePage: () => void
  onSearch?: () => void
  onExportWorkspace?: () => void | Promise<void>
  onReorderPage?: (activePageId: PageId, overPageId: PageId) => void
  onTogglePinnedSidebarItem?: (item: SidebarPinnedItem) => void | Promise<void>
  onRenamePage?: (pageId: PageId, title: string) => void | Promise<void>
  onExportPage?: (pageId: PageId) => void | Promise<void>
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
  dataTables = [],
  currentPageId,
  pinnedSidebarItems = [],
  onCreatePage,
  onSearch,
  onExportWorkspace,
  onReorderPage,
  onTogglePinnedSidebarItem,
  onRenamePage,
  onExportPage,
  onDuplicatePage,
  onDeletePage,
  onImportArchive,
  layout = 'classic',
  onSetSidebarLayout,
}: SidebarTreeProps) {
  const location = useLocation()
  const [expandedPageIds, setExpandedPageIds] = useState<Record<string, boolean>>({})
  const [openMenuItem, setOpenMenuItem] = useState<SidebarMenuItem | null>(null)
  const [openMenuPosition, setOpenMenuPosition] = useState<SidebarPopoverPosition | null>(null)
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false)
  const [utilityMenuPosition, setUtilityMenuPosition] = useState<SidebarPopoverPosition | null>(null)
  const [sidebarScrolled, setSidebarScrolled] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<SidebarSectionKey, boolean>>({
    pinned: true,
    shared: true,
    my_pages: true,
  })
  const visiblePages = useMemo(
    () => buildVisiblePageItems(pages, expandedPageIds),
    [expandedPageIds, pages],
  )
  const recentBoards: Array<{ board: { id: string; title: string }; pageId: string }> = []
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
  const pinnedItemEntries = useMemo(
    () => buildPinnedItemEntries(pinnedSidebarItems, pages, dataTablesByPageId, expandedPageIds),
    [dataTablesByPageId, expandedPageIds, pages, pinnedSidebarItems],
  )
  const sharedItemEntries: PinnedSidebarEntry[] = []

  function closeOpenMenu() {
    menuTriggerRef.current = null
    setOpenMenuItem(null)
  }

  useDismissableLayer({
    open: openMenuItem !== null,
    refs: [menuRef, menuTriggerRef],
    onDismiss: closeOpenMenu,
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
    if (openMenuItem === null) {
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
  }, [openMenuItem])

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

  function toggleSection(sectionKey: SidebarSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true),
    }))
  }

  function getSectionToggleLabel(sectionTitle: string, isExpanded: boolean) {
    return `${isExpanded ? uiCopy.sidebar.collapseSection : uiCopy.sidebar.expandSection}${sectionTitle}`
  }

  function getTreeItemPaddingLeft(depth: number, hasToggleSlot: boolean) {
    return `${treeMetrics.basePadding + depth * treeMetrics.depthIndent + (hasToggleSlot ? treeMetrics.toggleSlot : 0)}px`
  }

  function isPinned(item: SidebarPinnedItem) {
    return pinnedSidebarItems.some((currentItem) => isSamePinnedSidebarItem(currentItem, item))
  }

  function getMenuKey(item: SidebarPinnedItem) {
    return item.kind === 'page'
      ? `page:${item.pageId}`
      : `data_table:${item.pageId}:${item.dataTableId}`
  }

  function renderSidebarMenu(item: SidebarMenuItem) {
    const pinTarget: SidebarPinnedItem =
      item.kind === 'page'
        ? { kind: 'page', pageId: item.pageId }
        : { kind: 'data_table', pageId: item.pageId, dataTableId: item.dataTableId }

    return (
      <div className="page-menu-section">
        {item.kind === 'page' && onRenamePage ? (
          <button
            type="button"
            className="page-menu-action"
            onClick={() => {
              closeOpenMenu()
              const nextTitle = window.prompt(SIDEBAR_RENAME_PAGE_PROMPT, item.title)
              if (nextTitle !== null && nextTitle !== item.title) {
                void onRenamePage(item.pageId, nextTitle)
              }
            }}
          >
            <span className="page-menu-item-label">{SIDEBAR_RENAME_PAGE_LABEL}</span>
          </button>
        ) : null}
        {onTogglePinnedSidebarItem ? (
          <button
            type="button"
            className="page-menu-action"
            onClick={() => {
              closeOpenMenu()
              void onTogglePinnedSidebarItem(pinTarget)
            }}
          >
            <span className="page-menu-item-label">
              {item.isPinned ? uiCopy.sidebar.unpinFromTop : uiCopy.sidebar.pinToTop}
            </span>
          </button>
        ) : null}
        {item.kind === 'page' && onExportPage ? (
          <button
            type="button"
            className="page-menu-action"
            onClick={() => {
              closeOpenMenu()
              void onExportPage(item.pageId)
            }}
          >
            <span className="page-menu-item-label">{SIDEBAR_EXPORT_PAGE_LABEL}</span>
          </button>
        ) : null}
        {item.kind === 'page' && onDuplicatePage ? (
          <button
            type="button"
            className="page-menu-action"
            onClick={() => {
              closeOpenMenu()
              void onDuplicatePage(item.pageId)
            }}
          >
            <span className="page-menu-item-label">{SIDEBAR_DUPLICATE_PAGE_LABEL}</span>
          </button>
        ) : null}
        {item.kind === 'page' && onDeletePage ? (
          <button
            type="button"
            className="page-menu-action page-menu-action-danger"
            onClick={() => {
              closeOpenMenu()
              void onDeletePage(item.pageId)
            }}
          >
            <span className="page-menu-item-label">{SIDEBAR_DELETE_PAGE_LABEL}</span>
          </button>
        ) : null}
      </div>
    )
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
              {onExportWorkspace ? (
                <button
                  type="button"
                  className="page-menu-action"
                  onClick={() => {
                    setIsUtilityMenuOpen(false)
                    void onExportWorkspace()
                  }}
                >
                  <span className="page-menu-item-label">{uiCopy.export.workspace}</span>
                </button>
              ) : null}
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

  function renderSidebarSection({
    sectionKey,
    title,
    hidden = false,
    children,
  }: {
    sectionKey: SidebarSectionKey
    title: string
    hidden?: boolean
    children: ReactNode
  }) {
    if (hidden) {
      return null
    }

    const isExpanded = expandedSections[sectionKey] ?? true

    return (
      <div className="sidebar-group sidebar-section-group">
        <div className="sidebar-section-header">
          <button
            type="button"
            className="sidebar-section-button"
            aria-expanded={isExpanded}
            aria-label={getSectionToggleLabel(title, isExpanded)}
            onClick={() => toggleSection(sectionKey)}
          >
            <span className="sidebar-section-chevron" aria-hidden="true">
              <ChevronRight size={12} strokeWidth={1.9} />
            </span>
            <span className="sidebar-section-button-label">{title}</span>
          </button>
        </div>
        {isExpanded ? <div className="sidebar-section-body">{children}</div> : null}
      </div>
    )
  }

  return (
    <div className={`sidebar-layout sidebar-layout-${layout}`}>
      <div className={sidebarScrolled ? 'sidebar-fixed-top sidebar-fixed-top-scrolled' : 'sidebar-fixed-top'}>
        {layout === 'compact' ? renderCompactHeader() : renderClassicHeader()}
      </div>

      <div
        className="sidebar-scroll-content"
        onScroll={(event) => {
          const nextScrolled = event.currentTarget.scrollTop > 2
          setSidebarScrolled((current) => (current === nextScrolled ? current : nextScrolled))
        }}
      >
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

      {renderSidebarSection({
        sectionKey: 'pinned',
        title: uiCopy.sidebar.pinnedSection,
        hidden: pinnedItemEntries.length === 0,
        children: (
          <div className="sidebar-tree" aria-label={uiCopy.sidebar.pinnedSection}>
            {pinnedItemEntries.map((item) => {
              const menuKey = getMenuKey(
                item.kind === 'page'
                  ? { kind: 'page', pageId: item.pageId }
                  : { kind: 'data_table', pageId: item.pageId, dataTableId: item.dataTableId },
              )
              const isMenuOpen =
                openMenuItem !== null &&
                getMenuKey(
                  openMenuItem.kind === 'page'
                    ? { kind: 'page', pageId: openMenuItem.pageId }
                    : {
                        kind: 'data_table',
                        pageId: openMenuItem.pageId,
                        dataTableId: openMenuItem.dataTableId,
                      },
                ) === menuKey

              const isExpanded =
                item.kind === 'page'
                  ? expandedPageIds[item.pageId] ?? true
                  : false
              const toggleLabel = isExpanded ? uiCopy.sidebar.collapsePage : uiCopy.sidebar.expandPage
              const toggleLeft = `${treeMetrics.basePadding + item.depth * treeMetrics.depthIndent}px`

              return (
                <div key={`pinned:${menuKey}`} className="sidebar-tree-row">
                  {item.kind === 'page' && item.hasNestedItems ? (
                    <button
                      type="button"
                      className="sidebar-tree-toggle"
                      aria-label={toggleLabel}
                      aria-expanded={isExpanded}
                      style={{ left: toggleLeft }}
                      onClick={() => togglePage(item.pageId)}
                    >
                      <span className="sidebar-tree-toggle-icon" aria-hidden="true">
                        <ChevronRight size={14} strokeWidth={1.9} />
                      </span>
                    </button>
                  ) : null}
                  <NavLink
                    to={item.href}
                    end={item.kind === 'page'}
                    className={({ isActive }) => getSidebarItemClassName(isActive)}
                    style={{ paddingLeft: getTreeItemPaddingLeft(item.depth, true) }}
                  >
                    <span className="sidebar-tree-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="sidebar-tree-label">{item.title}</span>
                  </NavLink>
                  {onTogglePinnedSidebarItem ? (
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
                              closeOpenMenu()
                              return
                            }

                            menuTriggerRef.current = event.currentTarget
                            setOpenMenuItem(item)
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
                            {renderSidebarMenu(item)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ),
      })}

      {renderSidebarSection({
        sectionKey: 'shared',
        title: uiCopy.sidebar.sharedSection,
        hidden: sharedItemEntries.length === 0,
        children: <div className="sidebar-tree" aria-label={uiCopy.sidebar.sharedSection} />,
      })}

      {renderSidebarSection({
        sectionKey: 'my_pages',
        title: uiCopy.sidebar.myPagesSection,
        children: (
      <nav className="sidebar-tree" aria-label={uiCopy.sidebar.pageTree}>
        {visiblePages.map(({ page, depth, hasChildren }) => {
          const pageDataTables = dataTablesByPageId.get(page.id) ?? []
          const hasNestedItems = hasChildren || pageDataTables.length > 0
          const isActivePage =
            currentPageId === page.id && location.pathname === `/pages/${page.id}`
          const isExpanded = expandedPageIds[page.id] ?? true
          const pageMenuItem: SidebarMenuItem = {
            kind: 'page',
            pageId: page.id,
            title: page.title,
            isPinned: isPinned({ kind: 'page', pageId: page.id }),
          }
          const isMenuOpen =
            openMenuItem !== null &&
            getMenuKey({ kind: 'page', pageId: page.id }) ===
              getMenuKey(
                openMenuItem.kind === 'page'
                  ? { kind: 'page', pageId: openMenuItem.pageId }
                  : {
                      kind: 'data_table',
                      pageId: openMenuItem.pageId,
                      dataTableId: openMenuItem.dataTableId,
                    },
              )
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
                  end
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
                {onRenamePage || onTogglePinnedSidebarItem || onExportPage || onDuplicatePage || onDeletePage ? (
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
                            closeOpenMenu()
                            return
                          }

                          menuTriggerRef.current = event.currentTarget
                          setOpenMenuItem(pageMenuItem)
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
                          {renderSidebarMenu(pageMenuItem)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              {(isExpanded ? pageDataTables : []).map((dataTable) => {
                const dataTableMenuItem: SidebarMenuItem = {
                  kind: 'data_table',
                  pageId: page.id,
                  dataTableId: dataTable.id,
                  title: dataTable.title,
                  isPinned: isPinned({
                    kind: 'data_table',
                    pageId: page.id,
                    dataTableId: dataTable.id,
                  }),
                }
                const isDataTableMenuOpen =
                  openMenuItem !== null &&
                  getMenuKey({
                    kind: 'data_table',
                    pageId: page.id,
                    dataTableId: dataTable.id,
                  }) ===
                    getMenuKey(
                      openMenuItem.kind === 'page'
                        ? { kind: 'page', pageId: openMenuItem.pageId }
                        : {
                            kind: 'data_table',
                            pageId: openMenuItem.pageId,
                            dataTableId: openMenuItem.dataTableId,
                          },
                    )

                return (
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
                    {onTogglePinnedSidebarItem ? (
                      <div className="sidebar-tree-actions">
                        <div
                          className="page-menu sidebar-tree-page-menu"
                          ref={isDataTableMenuOpen ? menuRef : null}
                        >
                          <button
                            type="button"
                            className="sidebar-tree-more-button"
                            aria-label={SIDEBAR_PAGE_MENU_LABEL}
                            aria-expanded={isDataTableMenuOpen}
                            aria-haspopup="menu"
                            onClick={(event) => {
                              if (isDataTableMenuOpen) {
                                closeOpenMenu()
                                return
                              }

                              menuTriggerRef.current = event.currentTarget
                              setOpenMenuItem(dataTableMenuItem)
                            }}
                          >
                            <MoreHorizontal size={14} strokeWidth={1.9} />
                          </button>
                          {isDataTableMenuOpen ? (
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
                              {renderSidebarMenu(dataTableMenuItem)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>
        ),
      })}
      </div>
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

function buildPinnedItemEntries(
  pinnedSidebarItems: SidebarPinnedItem[],
  pages: PageRecord[],
  dataTablesByPageId: Map<PageId, DataTableRecord[]>,
  expandedPageIds: Record<string, boolean>,
): PinnedSidebarEntry[] {
  const pageById = new Map(pages.map((page) => [page.id, page]))
  const childrenByParent = new Map<PageId | null, PageRecord[]>()
  const explicitPinnedKeys = new Set(
    pinnedSidebarItems.map((item) =>
      item.kind === 'page'
        ? `page:${item.pageId}`
        : `data_table:${item.pageId}:${item.dataTableId}`,
    ),
  )
  const seenKeys = new Set<string>()
  const entries: PinnedSidebarEntry[] = []

  for (const page of pages) {
    const siblings = childrenByParent.get(page.parentId) ?? []
    siblings.push(page)
    childrenByParent.set(page.parentId, siblings)
  }

  function pushPageEntry(page: PageRecord, depth: number, hasNestedItems: boolean) {
    const key = `page:${page.id}`

    if (seenKeys.has(key)) {
      return
    }

    seenKeys.add(key)
    entries.push({
      kind: 'page',
      pageId: page.id,
      title: page.title,
      isPinned: explicitPinnedKeys.has(key),
      href: `/pages/${page.id}`,
      icon: page.icon ?? DEFAULT_PAGE_ICON,
      depth,
      hasNestedItems,
    })
  }

  function pushDataTableEntry(pageId: PageId, dataTable: DataTableRecord, depth: number) {
    const key = `data_table:${pageId}:${dataTable.id}`

    if (seenKeys.has(key)) {
      return
    }

    seenKeys.add(key)
    entries.push({
      kind: 'data_table',
      pageId,
      dataTableId: dataTable.id,
      title: dataTable.title,
      isPinned: explicitPinnedKeys.has(key),
      href: `/pages/${pageId}/data-tables/${dataTable.id}`,
      icon: dataTable.icon ?? DATA_TABLE_ICON,
      depth,
      hasNestedItems: false,
    })
  }

  function visitPinnedPage(pageId: PageId, depth: number) {
    const page = pageById.get(pageId)

    if (!page) {
      return
    }

    const childPages = childrenByParent.get(page.id) ?? []
    const pageDataTables = dataTablesByPageId.get(page.id) ?? []
    const hasNestedItems = childPages.length > 0 || pageDataTables.length > 0

    pushPageEntry(page, depth, hasNestedItems)

    if (!hasNestedItems || !(expandedPageIds[page.id] ?? true)) {
      return
    }

    for (const dataTable of pageDataTables) {
      pushDataTableEntry(page.id, dataTable, depth + 1)
    }

    for (const childPage of childPages) {
      visitPinnedPage(childPage.id, depth + 1)
    }
  }

  for (const item of pinnedSidebarItems) {
    if (item.kind === 'page') {
      visitPinnedPage(item.pageId, 0)
      continue
    }

    const dataTable = (dataTablesByPageId.get(item.pageId) ?? []).find(
      (candidate) => candidate.id === item.dataTableId,
    )

    if (!dataTable) {
      continue
    }

    pushDataTableEntry(item.pageId, dataTable, 0)
  }

  return entries
}

function isSamePinnedSidebarItem(left: SidebarPinnedItem, right: SidebarPinnedItem) {
  return JSON.stringify(left) === JSON.stringify(right)
}
