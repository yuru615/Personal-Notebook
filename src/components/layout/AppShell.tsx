import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { AppAccentTheme } from '../../domain/theme'
import { isDesktopRuntime } from '../../lib/fileAccess'
import { uiCopy } from '../../ui/copy'

export type FileDropTarget = 'sidebar' | 'content'

interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
  hideSidebar?: boolean
  sidebarClassName?: string
  sidebarWidth?: number
  accentTheme?: AppAccentTheme
  onSidebarWidthChange?: (width: number) => void
  onDropFiles?: (files: File[]) => void | Promise<void>
  onDropFilePaths?: (paths: string[], target: FileDropTarget) => void | Promise<void>
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
  accentTheme = 'blue_gray',
  onSidebarWidthChange,
  onDropFiles,
  onDropFilePaths,
}: AppShellProps) {
  const [liveSidebarWidth, setLiveSidebarWidth] = useState(() => clampSidebarWidth(sidebarWidth))
  const dragWidthRef = useRef(liveSidebarWidth)
  const pendingPersistWidthRef = useRef<number | null>(null)
  const [isFileDropActive, setIsFileDropActive] = useState(false)
  const fileDragDepthRef = useRef(0)
  const [fileDropTarget, setFileDropTarget] = useState<FileDropTarget>('content')

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

  useEffect(() => {
    if (!isDesktopRuntime() || !onDropFilePaths) {
      return
    }

    let isActive = true
    let unlisten: (() => void) | null = null
    const targetAt = (positionX: number): FileDropTarget =>
      positionX < liveSidebarWidth * (window.devicePixelRatio || 1) ? 'sidebar' : 'content'

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!isActive) {
          return
        }

        const { payload } = event

        if (payload.type === 'leave') {
          setIsFileDropActive(false)
          return
        }

        const target = targetAt(payload.position.x)
        setFileDropTarget(target)

        if (payload.type === 'drop') {
          setIsFileDropActive(false)
          void Promise.resolve(onDropFilePaths(payload.paths, target)).catch(() => undefined)
          return
        }

        setIsFileDropActive(true)
      })
      .then((nextUnlisten) => {
        if (isActive) {
          unlisten = nextUnlisten
          return
        }

        nextUnlisten()
      })
      .catch(() => undefined)

    return () => {
      isActive = false
      unlisten?.()
    }
  }, [liveSidebarWidth, onDropFilePaths])

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
    <div
      className={hideSidebar ? 'app-shell app-shell-focus' : 'app-shell'}
      data-accent-theme={accentTheme}
      style={shellStyle}
      onDragEnter={(event) => {
        if (isDesktopRuntime()) return
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        fileDragDepthRef.current += 1
        setIsFileDropActive(true)
      }}
      onDragOver={(event) => {
        if (isDesktopRuntime()) return
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (isDesktopRuntime()) return
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
        if (fileDragDepthRef.current === 0) setIsFileDropActive(false)
      }}
      onDrop={(event) => {
        if (isDesktopRuntime()) return
        const files = Array.from(event.dataTransfer.files)
        if (files.length === 0) return
        event.preventDefault()
        fileDragDepthRef.current = 0
        setIsFileDropActive(false)
        void onDropFiles?.(files)
      }}
    >
      {isFileDropActive ? (
        <div className={`app-file-drop-overlay app-file-drop-overlay-${fileDropTarget}`} aria-live="polite">
          <div className="app-file-drop-zone app-file-drop-zone-sidebar">
            <strong>拖入左侧</strong>
            <span>创建顶级页面，附件进入收件箱</span>
          </div>
          <div className="app-file-drop-zone app-file-drop-zone-content">
            <strong>拖入正文</strong>
            <span>创建子页面，附件追加到当前页面</span>
          </div>
        </div>
      ) : null}
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
