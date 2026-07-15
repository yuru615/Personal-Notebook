import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseDocxPage } from './docxImport'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

async function createDocxFixture() {
  const zip = new JSZip()
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>项目计划</w:t></w:r></w:p>
          <w:p><w:r><w:t>这是正文</w:t></w:r></w:p>
          <w:p><w:pPr><w:numPr><w:numId w:val="1" /></w:numPr></w:pPr><w:r><w:t>第一项</w:t></w:r></w:p>
          <w:p><w:pPr><w:numPr><w:numId w:val="2" /></w:numPr></w:pPr><w:r><w:t>第二项</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>状态</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>知栖</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>进行中</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
          <w:p><w:r><w:drawing><a:blip r:embed="rIdImage" /></w:drawing></w:r></w:p>
        </w:body>
      </w:document>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png" />
      </Relationships>`,
  )
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
      <w:numbering xmlns:w="${WORD_NS}">
        <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet" /></w:lvl></w:abstractNum>
        <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal" /></w:lvl></w:abstractNum>
        <w:num w:numId="1"><w:abstractNumId w:val="10" /></w:num>
        <w:num w:numId="2"><w:abstractNumId w:val="20" /></w:num>
      </w:numbering>`,
  )
  zip.file('word/media/diagram.png', new Uint8Array([137, 80, 78, 71]))

  return zip.generateAsync({ type: 'uint8array' })
}

describe('parseDocxPage', () => {
  it('maps common Word content and image relationships into editable page content', async () => {
    const result = await parseDocxPage('项目计划.docx', await createDocxFixture())

    expect(result.title).toBe('项目计划')
    expect(result.blocks).toMatchObject([
      { type: 'heading_1', text: '项目计划' },
      { type: 'paragraph', text: '这是正文' },
      { type: 'bulleted_list', items: ['第一项'] },
      { type: 'numbered_list', items: ['第二项'] },
      {
        type: 'table',
        rows: [
          ['名称', '状态'],
          ['知栖', '进行中'],
        ],
      },
      { type: 'image', assetId: null, name: 'diagram.png', mimeType: 'image/png' },
    ])
    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toMatchObject({ name: 'diagram.png', mimeType: 'image/png' })
    expect(result.images[0].bytes).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('uses the file name as the page title when the document has no heading', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>纯正文</w:t></w:r></w:p></w:body></w:document>`,
    )

    await expect(
      parseDocxPage('无标题文档.docx', await zip.generateAsync({ type: 'uint8array' })),
    ).resolves.toMatchObject({ title: '无标题文档', blocks: [{ type: 'paragraph', text: '纯正文' }] })
  })

  it('rejects damaged archives and files without Word document XML', async () => {
    await expect(parseDocxPage('损坏.docx', new Uint8Array([1, 2, 3]))).rejects.toThrow('无法读取 Word 文档')

    const zip = new JSZip()
    zip.file('readme.txt', 'not a Word document')
    await expect(
      parseDocxPage('空壳.docx', await zip.generateAsync({ type: 'uint8array' })),
    ).rejects.toThrow('缺少正文')
  })
})
