import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MediaBlock } from './MediaBlock'

vi.mock('../../../lib/assets', () => ({
  getAssetUrl: vi.fn(async (assetId: string) => `asset://${assetId}`),
  selectAndImportAsset: vi.fn(),
}))

describe('MediaBlock', () => {
  it('does not put the image element class on the outer figure', () => {
    const { container } = render(
      <MediaBlock
        block={{
          id: 'image-1',
          type: 'image',
          assetId: null,
          name: '',
          mimeType: '',
          caption: '',
          alt: '',
        }}
        onChange={vi.fn()}
      />,
    )

    const figure = container.querySelector('figure.media-block')

    expect(figure).toBeInTheDocument()
    expect(figure).toHaveClass('media-block-kind-image')
    expect(figure).not.toHaveClass('media-block-image')
  })

  it('frames uploaded images inside a dedicated media surface', async () => {
    const { container } = render(
      <MediaBlock
        block={{
          id: 'image-1',
          type: 'image',
          assetId: 'asset-image',
          name: 'garden.png',
          mimeType: 'image/png',
          caption: '',
          alt: 'Garden',
        }}
        onChange={vi.fn()}
      />,
    )

    const image = await screen.findByRole('img', { name: 'Garden' })
    const surface = container.querySelector('.media-block-surface')

    expect(surface).toBeInTheDocument()
    expect(surface).toContainElement(image)
    expect(image).toHaveClass('media-block-image')
  })

  it('renders audio as a framed card instead of a bare control', async () => {
    const { container } = render(
      <MediaBlock
        block={{
          id: 'audio-1',
          type: 'audio',
          assetId: 'asset-audio',
          name: 'interview.m4a',
          mimeType: 'audio/mp4',
          caption: '',
        }}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.media-block-audio-card')).toBeInTheDocument()
    })

    const audio = container.querySelector('audio.media-block-audio')
    const surface = container.querySelector('.media-block-surface')

    expect(surface).toBeInTheDocument()
    expect(surface).toContainElement(audio)
    expect(container.querySelector('.media-block-audio-art')).toBeInTheDocument()
  })

  it('uses the generated first video frame as the poster', async () => {
    const originalLoad = HTMLMediaElement.prototype.load
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
    const videoWidth = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth')
    const videoHeight = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight')

    HTMLMediaElement.prototype.load = function load() {
      setTimeout(() => this.dispatchEvent(new Event('loadeddata')), 0)
    }
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 320,
    })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 180,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
    })) as unknown as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,first-frame')

    try {
      const { container } = render(
        <MediaBlock
          block={{
            id: 'video-1',
            type: 'video',
            assetId: 'asset-video',
            name: 'demo.mp4',
            mimeType: 'video/mp4',
            caption: '',
          }}
          onChange={vi.fn()}
        />,
      )

      const video = await waitFor(() => {
        const element = container.querySelector('video.media-block-video')
        expect(element).toBeInTheDocument()
        return element
      })

      await waitFor(() => {
        expect(video).toHaveAttribute('poster', 'data:image/png;base64,first-frame')
      })
    } finally {
      HTMLMediaElement.prototype.load = originalLoad
      HTMLCanvasElement.prototype.getContext = originalGetContext
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL
      if (videoWidth) {
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', videoWidth)
      }
      if (videoHeight) {
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', videoHeight)
      }
    }
  })

  it('ignores stale generated posters after the video asset changes', async () => {
    const originalLoad = HTMLMediaElement.prototype.load
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL
    const videoWidth = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth')
    const videoHeight = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight')
    const pendingLoads: Array<{ src: string; video: HTMLMediaElement }> = []
    let drawnVideoSrc = ''

    HTMLMediaElement.prototype.load = function load() {
      const src = this.getAttribute('src')

      if (src) {
        pendingLoads.push({ src, video: this })
      }
    }
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 320,
    })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 180,
    })
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn((video: HTMLVideoElement) => {
        drawnVideoSrc = video.getAttribute('src') ?? ''
      }),
    })) as unknown as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() =>
      drawnVideoSrc.includes('asset-video-b')
        ? 'data:image/png;base64,poster-b'
        : 'data:image/png;base64,poster-a',
    )

    try {
      const { container, rerender } = render(
        <MediaBlock
          block={{
            id: 'video-1',
            type: 'video',
            assetId: 'asset-video-a',
            name: 'a.mp4',
            mimeType: 'video/mp4',
            caption: '',
          }}
          onChange={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(pendingLoads.some(({ src }) => src === 'asset://asset-video-a')).toBe(true)
      })

      rerender(
        <MediaBlock
          block={{
            id: 'video-1',
            type: 'video',
            assetId: 'asset-video-b',
            name: 'b.mp4',
            mimeType: 'video/mp4',
            caption: '',
          }}
          onChange={vi.fn()}
        />,
      )

      await waitFor(() => {
        expect(pendingLoads.some(({ src }) => src === 'asset://asset-video-b')).toBe(true)
      })

      const stalePosterLoad = pendingLoads.find(({ src }) => src === 'asset://asset-video-a')
      const currentPosterLoad = pendingLoads.find(({ src }) => src === 'asset://asset-video-b')

      currentPosterLoad?.video.dispatchEvent(new Event('loadeddata'))

      const video = await waitFor(() => {
        const element = container.querySelector('video.media-block-video')
        expect(element).toHaveAttribute('poster', 'data:image/png;base64,poster-b')
        return element
      })

      stalePosterLoad?.video.dispatchEvent(new Event('loadeddata'))
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(video).toHaveAttribute('poster', 'data:image/png;base64,poster-b')
    } finally {
      HTMLMediaElement.prototype.load = originalLoad
      HTMLCanvasElement.prototype.getContext = originalGetContext
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL
      if (videoWidth) {
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', videoWidth)
      }
      if (videoHeight) {
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', videoHeight)
      }
    }
  })
})
