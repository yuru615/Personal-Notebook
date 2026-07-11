import { ImageIcon, Music, RefreshCw, Upload, Video } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { AudioBlock, ImageBlock, VideoBlock } from '../../../domain/types'
import { getAssetUrl, selectAndImportAsset } from '../../../lib/assets'

type MediaBlockRecord = ImageBlock | VideoBlock | AudioBlock

interface MediaBlockProps {
  block: MediaBlockRecord
  onChange: (block: MediaBlockRecord) => void
  readOnly?: boolean
  onDelete?: () => void
}

interface ImagePreviewView {
  scale: number
  offset: {
    x: number
    y: number
  }
  origin: {
    x: number
    y: number
  }
}

async function createVideoFirstFramePoster(assetUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null
  }

  return new Promise((resolve) => {
    const video = document.createElement('video')
    let timeoutId: ReturnType<typeof window.setTimeout> | null = null
    let settled = false

    const settle = (posterUrl: string | null) => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('error', handleError)
      video.removeAttribute('src')
      video.load()
      resolve(posterUrl)
    }

    const captureFrame = () => {
      if (settled) {
        return
      }

      try {
        const width = video.videoWidth
        const height = video.videoHeight

        if (!width || !height) {
          settle(null)
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext('2d')
        if (!context) {
          settle(null)
          return
        }

        context.drawImage(video, 0, 0, width, height)
        settle(canvas.toDataURL('image/png'))
      } catch {
        settle(null)
      }
    }

    function handleLoadedData() {
      captureFrame()
    }

    function handleError() {
      settle(null)
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.addEventListener('loadeddata', handleLoadedData, { once: true })
    video.addEventListener('error', handleError, { once: true })
    timeoutId = window.setTimeout(() => settle(null), 7000)
    video.src = assetUrl
    video.load()
  })
}

const mediaLabels = {
  image: {
    title: '图片',
    upload: '上传图片',
  },
  video: {
    title: '视频',
    upload: '上传视频',
  },
  audio: {
    title: '音频',
    upload: '上传音频',
  },
}

const openImagePreviewLabel = '打开图片预览'
const closeImagePreviewLabel = '关闭图片预览'
const imagePreviewDialogLabel = '图片预览'

function clampPreviewScale(scale: number) {
  return Math.min(4, Math.max(1, Number(scale.toFixed(2))))
}

function clampPreviewPointerPosition(value: number, size: number) {
  return Math.min(Math.max(value, 0), size)
}

function createDefaultImagePreviewView(): ImagePreviewView {
  return {
    scale: 1,
    offset: { x: 0, y: 0 },
    origin: { x: 0, y: 0 },
  }
}

function formatPreviewTransform(scale: number, offset: { x: number; y: number }) {
  if (offset.x === 0 && offset.y === 0) {
    return `scale(${scale})`
  }

  return `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
}

export function MediaBlock({ block, onChange, readOnly = false, onDelete }: MediaBlockProps) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const [imagePreviewView, setImagePreviewView] = useState<ImagePreviewView>(createDefaultImagePreviewView)
  const [isImagePreviewDragging, setIsImagePreviewDragging] = useState(false)
  const previewImageRef = useRef<HTMLImageElement | null>(null)
  const previewDragRef = useRef<{
    startX: number
    startY: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const labels = mediaLabels[block.type]
  const Icon = useMemo(() => {
    switch (block.type) {
      case 'image':
        return ImageIcon
      case 'video':
        return Video
      case 'audio':
        return Music
    }
  }, [block.type])

  useEffect(() => {
    let cancelled = false
    setAssetUrl(null)
    setHasLoadError(false)
    setIsImagePreviewOpen(false)
    setImagePreviewView(createDefaultImagePreviewView())
    setIsImagePreviewDragging(false)
    previewDragRef.current = null

    if (!block.assetId) {
      return
    }

    void getAssetUrl(block.assetId)
      .then((url) => {
        if (!cancelled) {
          setAssetUrl(url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasLoadError(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [block.assetId])

  useEffect(() => {
    let cancelled = false
    setVideoPosterUrl(null)

    if (block.type !== 'video' || !assetUrl) {
      return
    }

    void createVideoFirstFramePoster(assetUrl).then((posterUrl) => {
      if (!cancelled) {
        setVideoPosterUrl(posterUrl)
      }
    })

    return () => {
      cancelled = true
    }
  }, [assetUrl, block.type])

  useEffect(() => {
    if (!isImagePreviewOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsImagePreviewOpen(false)
      }
    }
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = previewDragRef.current

      if (!dragState) {
        return
      }

      setImagePreviewView((currentView) => ({
        ...currentView,
        offset: {
          x: Number((dragState.offsetX + event.clientX - dragState.startX).toFixed(2)),
          y: Number((dragState.offsetY + event.clientY - dragState.startY).toFixed(2)),
        },
      }))
    }
    const handleMouseUp = () => {
      if (!previewDragRef.current) {
        return
      }

      previewDragRef.current = null
      setIsImagePreviewDragging(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      previewDragRef.current = null
      setIsImagePreviewDragging(false)
    }
  }, [isImagePreviewOpen])

  function handlePreviewWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const previewImage = previewImageRef.current
    const previewBody = event.currentTarget
    const delta = event.deltaY < 0 ? 0.1 : -0.1

    setImagePreviewView((currentView) => {
      const nextScale = clampPreviewScale(currentView.scale + delta)

      if (!previewImage || nextScale === currentView.scale) {
        return currentView
      }

      if (nextScale === 1) {
        return createDefaultImagePreviewView()
      }

      const bodyRect = previewBody.getBoundingClientRect()
      const baseLeft = bodyRect.left + (previewBody.clientWidth - previewImage.offsetWidth) / 2
      const baseTop = bodyRect.top + (previewBody.clientHeight - previewImage.offsetHeight) / 2
      const nextOrigin = {
        x: clampPreviewPointerPosition(
          currentView.origin.x +
            (event.clientX - baseLeft - currentView.offset.x - currentView.origin.x) / currentView.scale,
          previewImage.offsetWidth,
        ),
        y: clampPreviewPointerPosition(
          currentView.origin.y +
            (event.clientY - baseTop - currentView.offset.y - currentView.origin.y) / currentView.scale,
          previewImage.offsetHeight,
        ),
      }

      return {
        scale: nextScale,
        origin: nextOrigin,
        offset: {
          x: Number((event.clientX - baseLeft - nextOrigin.x).toFixed(2)),
          y: Number((event.clientY - baseTop - nextOrigin.y).toFixed(2)),
        },
      }
    })
  }

  function resetImagePreviewView() {
    setImagePreviewView(createDefaultImagePreviewView())
    previewDragRef.current = null
    setIsImagePreviewDragging(false)
  }

  function handlePreviewMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || imagePreviewView.scale <= 1) {
      return
    }

    event.preventDefault()
    previewDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: imagePreviewView.offset.x,
      offsetY: imagePreviewView.offset.y,
    }
    setIsImagePreviewDragging(true)
  }

  async function handleSelectAsset() {
    setIsLoading(true)
    try {
      const asset = await selectAndImportAsset(block.type)

      if (!asset) {
        return
      }

      onChange({
        ...block,
        assetId: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        ...(block.type === 'image' && !block.alt ? { alt: asset.name } : {}),
      } as MediaBlockRecord)
    } finally {
      setIsLoading(false)
    }
  }

  function handleDeleteKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (
      !onDelete ||
      event.nativeEvent.isComposing ||
      (event.key !== 'Backspace' && event.key !== 'Delete') ||
      event.target !== event.currentTarget
    ) {
      return
    }

    event.preventDefault()
    onDelete()
  }

  function renderPreview() {
    if (!block.assetId) {
      if (readOnly) {
        return (
          <div className="media-block-missing">
            <Icon size={20} aria-hidden="true" />
            <span>媒体文件缺失</span>
          </div>
        )
      }

      return (
        <button
          type="button"
          className="media-block-upload"
          onClick={() => {
            void handleSelectAsset()
          }}
          disabled={isLoading}
        >
          <span className="media-block-upload-icon" aria-hidden="true">
            <Upload size={20} />
          </span>
          <span className="media-block-upload-text">{isLoading ? '上传中...' : labels.upload}</span>
        </button>
      )
    }

    if (hasLoadError) {
      return (
        <div className="media-block-missing">
          <Icon size={20} aria-hidden="true" />
          <span>媒体文件缺失</span>
        </div>
      )
    }

    if (!assetUrl) {
      return (
        <div className="media-block-missing">
          <Icon size={20} aria-hidden="true" />
          <span>加载中...</span>
        </div>
      )
    }

    if (block.type === 'image') {
      return (
        <div className="media-block-surface">
          <button
            type="button"
            className="media-block-image-trigger"
            aria-label={openImagePreviewLabel}
            onClick={() => setIsImagePreviewOpen(true)}
          >
            <img
              className="media-block-image"
              src={assetUrl}
              alt={block.name || labels.title}
              onError={() => {
                setHasLoadError(true)
              }}
            />
          </button>
        </div>
      )
    }

    if (block.type === 'video') {
      return (
        <div className="media-block-surface">
          <video
            className="media-block-video"
            src={assetUrl}
            poster={videoPosterUrl ?? undefined}
            controls
            preload="metadata"
          />
        </div>
      )
    }

    return (
      <div className="media-block-surface">
        <div className="media-block-audio-card">
          <div className="media-block-audio-art" aria-hidden="true">
            <Music size={22} />
          </div>
          <div className="media-block-audio-content">
            <div className="media-block-audio-meta">
              <span>{block.name || labels.title}</span>
              {block.mimeType ? <small>{block.mimeType}</small> : null}
            </div>
            <audio
              className="media-block-audio"
              src={assetUrl}
              controls
              preload="metadata"
              aria-label={block.name ? `播放 ${block.name}` : '播放音频'}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <figure
        className={`media-block media-block-kind-${block.type}`}
        tabIndex={!readOnly && onDelete ? -1 : undefined}
        onKeyDown={handleDeleteKeyDown}
      >
        <div className="media-block-toolbar">
          <div className="media-block-label">
            <Icon size={16} aria-hidden="true" />
            <span>{block.name || labels.title}</span>
          </div>
          <button
            hidden={readOnly}
            type="button"
            className="media-block-replace"
            onClick={() => {
              void handleSelectAsset()
            }}
            disabled={isLoading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            <span>替换</span>
          </button>
        </div>
        <div className="media-block-preview">{renderPreview()}</div>
        <figcaption hidden={readOnly}>
          <input
            className="media-block-caption"
            value={block.caption}
            placeholder="添加说明"
            onChange={(event) => onChange({ ...block, caption: event.currentTarget.value })}
          />
        </figcaption>
      </figure>
      {block.type === 'image' && assetUrl && isImagePreviewOpen
        ? createPortal(
            <div className="media-block-image-preview-overlay" onClick={() => setIsImagePreviewOpen(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label={imagePreviewDialogLabel}
                className="media-block-image-preview-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="media-block-image-preview-header">
                  <span className="media-block-image-preview-name" title={block.name || labels.title}>
                    {block.name || labels.title}
                  </span>
                  <div className="media-block-image-preview-actions">
                    <span className="media-block-image-preview-zoom" aria-live="polite">
                      {Math.round(imagePreviewView.scale * 100)}%
                    </span>
                    <button
                      type="button"
                      className="media-block-image-preview-close"
                      aria-label={closeImagePreviewLabel}
                      onClick={() => setIsImagePreviewOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div
                  className={[
                    'media-block-image-preview-body',
                    imagePreviewView.scale > 1 ? 'media-block-image-preview-body-pan-ready' : '',
                    isImagePreviewDragging ? 'media-block-image-preview-body-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onWheel={handlePreviewWheel}
                  onMouseDown={handlePreviewMouseDown}
                  onDoubleClick={resetImagePreviewView}
                >
                  <img
                    ref={previewImageRef}
                    className="media-block-image-preview-image"
                    src={assetUrl}
                    alt={block.name || labels.title}
                    draggable={false}
                    style={{
                      transformOrigin: `${imagePreviewView.origin.x}px ${imagePreviewView.origin.y}px`,
                      transform: formatPreviewTransform(imagePreviewView.scale, imagePreviewView.offset),
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
