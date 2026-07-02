import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import type { PageRecord } from './types'
import { buildMarkdownZip, importMarkdownZip } from './markdown'

function createPage(blocks: PageRecord['blocks']): PageRecord {
  return {
    id: 'page_1',
    parentId: null,
    title: 'Media',
    icon: null,
    cover: null,
    blocks,
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  }
}

describe('markdown media packages', () => {
  it('exports media blocks as files under the page asset folder', async () => {
    const page = createPage([
      {
        id: 'block_image',
        type: 'image',
        assetId: 'asset_image',
        name: 'photo.png',
        mimeType: 'image/png',
        caption: 'Cover',
        alt: 'Photo',
      },
    ])
    const readAsset = vi.fn<(assetId: string) => Promise<Uint8Array>>().mockResolvedValue(
      new Uint8Array([1, 2, 3]),
    )

    const blob = await buildMarkdownZip({
      rootPage: page,
      allPages: [page],
      reversible: true,
      readAsset,
    })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const markdown = await zip.file('Media/index.md')?.async('string')

    expect(markdown).toContain('![Photo](./_assets/media/asset_image-photo.png)')
    await expect(
      zip.file('Media/_assets/media/asset_image-photo.png')?.async('uint8array'),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })

  it('imports image assets from markdown packages through the asset writer', async () => {
    const zip = new JSZip()
    zip.file(
      'Media/index.md',
      [
        '---',
        'pageId: "page-original"',
        'parentId: null',
        'title: "Media"',
        'icon: null',
        'cover: null',
        'createdAt: "2026-07-02T00:00:00.000Z"',
        'updatedAt: "2026-07-02T00:00:00.000Z"',
        '---',
        '',
        '# Media',
        '',
        '![Alt text](./_assets/media/photo.png)',
      ].join('\n'),
    )
    zip.file('Media/_assets/media/photo.png', new Uint8Array([4, 5, 6]))
    const writeAsset = vi.fn().mockResolvedValue({
      id: 'asset_imported',
      name: 'photo.png',
      mimeType: 'image/png',
    })

    const payload = await importMarkdownZip(await zip.generateAsync({ type: 'blob' }), {
      writeAsset,
    })

    expect(writeAsset).toHaveBeenCalledWith({
      name: 'photo.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([4, 5, 6]),
    })
    expect(payload.pages[0].blocks[0]).toMatchObject({
      type: 'image',
      assetId: 'asset_imported',
      name: 'photo.png',
      mimeType: 'image/png',
      alt: 'Alt text',
    })
  })
})
