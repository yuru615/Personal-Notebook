import { ImageIcon, Music, RefreshCw, Upload, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AudioBlock, ImageBlock, VideoBlock } from '../../../domain/types'
import { getAssetUrl, selectAndImportAsset } from '../../../lib/assets'

type MediaBlockRecord = ImageBlock | VideoBlock | AudioBlock

interface MediaBlockProps {
  block: MediaBlockRecord
  onChange: (block: MediaBlockRecord) => void
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

export function MediaBlock({ block, onChange }: MediaBlockProps) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [videoPosterUrl, setVideoPosterUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadError, setHasLoadError] = useState(false)
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

  function renderPreview() {
    if (!block.assetId) {
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
          <img className="media-block-image" src={assetUrl} alt={block.alt || block.name} />
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
    <figure className={`media-block media-block-kind-${block.type}`}>
      <div className="media-block-toolbar">
        <div className="media-block-label">
          <Icon size={16} aria-hidden="true" />
          <span>{block.name || labels.title}</span>
        </div>
        <button
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
      <figcaption>
        <input
          className="media-block-caption"
          value={block.caption}
          placeholder="添加说明"
          onChange={(event) => onChange({ ...block, caption: event.currentTarget.value })}
        />
        {block.type === 'image' ? (
          <input
            className="media-block-caption"
            value={block.alt}
            placeholder="替代文本"
            onChange={(event) => onChange({ ...block, alt: event.currentTarget.value })}
          />
        ) : null}
      </figcaption>
    </figure>
  )
}
