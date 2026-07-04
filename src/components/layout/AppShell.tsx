import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { uiCopy } from '../../ui/copy'

interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
  hideSidebar?: boolean
  sidebarClassName?: string
  sidebarWidth?: number
  onSidebarWidthChange?: (width: number) => void
}

const DEFAULT_SIDEBAR_WIDTH = 272
const SIDEBAR_RESIZE_LABEL = '调整侧边栏宽度'

function clampSidebarWidth(width: number) {
  const viewportWidth =
    typeof window === 'undefined' || !Number.isFinite(window.innerWidth) ? 1440 : window.innerWidth
  const minWidth = Math.round(viewportWidth / 8)
  const maxWidth = Math.round(viewportWidth / 4)

  return Math.min(maxWidth, Math.max(minWidth, Math.round(width)))
}

export function AppShell({
  sidebar,
  children,
  hideSidebar = false,
  sidebarClassName = 'sidebar',
  sidebarWidth = DEFAULT_SIDEBAR_WIDTH,
  onSidebarWidthChange,
}: AppShellProps) {
  const [liveSidebarWidth, setLiveSidebarWidth] = useState(() => clampSidebarWidth(sidebarWidth))
  const dragWidthRef = useRef(liveSidebarWidth)
  const pendingPersistWidthRef = useRef<number | null>(null)

  useEffect(() => {
    const nextWidth = clampSidebarWidth(sidebarWidth)
    setLiveSidebarWidth(nextWidth)
    dragWidthRef.current = nextWidth
  }, [sidebarWidth])

  useEffect(() => {
    if (hideSidebar) {
      return
    }

    function handleResize() {
      const nextWidth = clampSidebarWidth(dragWidthRef.current)
      setLiveSidebarWidth(nextWidth)
      dragWidthRef.current = nextWidth
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [hideSidebar])

  function handleResizeStart(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = clampSidebarWidth(moveEvent.clientX)
      dragWidthRef.current = nextWidth
      pendingPersistWidthRef.current = nextWidth
      setLiveSidebarWidth(nextWidth)
    }

    function handleMouseUp() {
      const nextWidth = pendingPersistWidthRef.current

      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)

      if (nextWidth !== null && nextWidth !== sidebarWidth) {
        onSidebarWidthChange?.(nextWidth)
      }

      pendingPersistWidthRef.current = null
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const shellStyle = useMemo(
    () =>
      hideSidebar
        ? undefined
        : ({
            '--app-sidebar-width': `${liveSidebarWidth}px`,
          } as CSSProperties),
    [hideSidebar, liveSidebarWidth],
  )

  return (
    <div className={hideSidebar ? 'app-shell app-shell-focus' : 'app-shell'} style={shellStyle}>
      {hideSidebar ? null : (
        <>
          <aside className={sidebarClassName} aria-label={uiCopy.sidebar.ariaLabel}>
            {sidebar}
          </aside>
          <button
            type="button"
            className="app-shell-sidebar-resizer"
            aria-label={SIDEBAR_RESIZE_LABEL}
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleResizeStart}
          />
        </>
      )}
      <main className={hideSidebar ? 'page-panel page-panel-focus' : 'page-panel'}>{children}</main>
    </div>
  )
}
