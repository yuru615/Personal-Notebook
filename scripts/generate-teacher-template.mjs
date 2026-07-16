import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(
  root,
  'public/templates/high-school-chinese-teacher-workbench.zhiqi',
)
const temporaryOutput = `${output}.tmp`
const archiveDateText = '2026-07-16T00:00:00.000Z'
const archiveDate = new Date(archiveDateText)
let server

try {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  const {
    createHighSchoolChineseTeacherTemplate,
    validateHighSchoolChineseTeacherTemplate,
  } = await server.ssrLoadModule('/src/domain/templates/highSchoolChineseTeacher.ts')
  const bundle = createHighSchoolChineseTeacherTemplate()
  validateHighSchoolChineseTeacherTemplate(bundle)

  const assetManifest = bundle.assets.map((asset) => ({
    id: asset.id,
    sha256: createHash('sha256').update(asset.bytes).digest('hex'),
    name: asset.name,
    mimeType: asset.mimeType,
    byteSize: asset.bytes.byteLength,
    relativePath: asset.relativePath,
    createdAt: archiveDateText,
  }))
  const manifest = {
    format: 'zhiqi.exchange',
    formatVersion: 2,
    kind: 'page-package',
    createdWith: packageJson.version,
    createdAt: archiveDateText,
  }
  const payload = {
    rootPageId: bundle.rootPageId,
    pages: bundle.pages,
    boards: bundle.boards,
    dataTables: bundle.dataTables,
    mindmaps: bundle.mindmaps,
    syncedBlockGroups: bundle.syncedBlockGroups,
  }
  const archive = new JSZip()
  const entryOptions = { date: archiveDate, createFolders: false }

  archive.file('manifest.json', JSON.stringify(manifest, null, 2), entryOptions)
  archive.file('payload.json', JSON.stringify(payload, null, 2), entryOptions)
  archive.file('assets/manifest.json', JSON.stringify(assetManifest, null, 2), entryOptions)
  bundle.assets.forEach((asset) => {
    archive.file(`assets/${asset.relativePath}`, asset.bytes, entryOptions)
  })

  const bytes = await archive.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  })
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(temporaryOutput, bytes)
  await rm(output, { force: true })
  await rename(temporaryOutput, output)

  console.log(`Generated ${path.relative(root, output)} (${bytes.byteLength} bytes)`)
} finally {
  await rm(temporaryOutput, { force: true })
  await server?.close()
}
