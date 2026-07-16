import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(root, 'scripts/generate-teacher-template.mjs')
const outputDirectory = path.join(root, 'public/templates')
const outputName = 'high-school-chinese-teacher-workbench.zhiqi'
const outputPath = path.join(outputDirectory, outputName)
const expectedHash = 'acbc71fe07e869c630c850c3f537a3c43384f044776a2cb598c93419bd608f0f'
const temporaryOutputPrefix = `${outputName}.tmp`

it('keeps the committed teacher package in sync with the template source', async () => {
  const bytes = await readFile(outputPath)
  const hash = createHash('sha256').update(bytes).digest('hex')

  expect(bytes.byteLength).toBeGreaterThan(0)
  expect(hash).toBe(expectedHash)
})

const originalViteUrl = `${import.meta.resolve('vite')}?teacher-template-test-original`
const closeTrackingWrapper = `
  import * as original from ${JSON.stringify(originalViteUrl)}
  import { writeFile } from 'node:fs/promises'
  export * from ${JSON.stringify(originalViteUrl)}
  export async function createServer(...args) {
    const server = await original.createServer(...args)
    const close = server.close.bind(server)
    server.close = async () => {
      const marker = process.env.TEACHER_TEMPLATE_CLOSE_MARKER
      if (marker) await writeFile(marker, '')
      await close()
      if (process.env.TEACHER_TEMPLATE_FORCE_CLOSE_FAILURE === '1') {
        throw new Error('forced teacher template close failure')
      }
    }
    return server
  }
`
const closeTrackingWrapperUrl = `data:text/javascript,${encodeURIComponent(closeTrackingWrapper)}`
const closeTrackingLoader = `data:text/javascript,${encodeURIComponent(`
  const wrapperUrl = ${JSON.stringify(closeTrackingWrapperUrl)}
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === 'vite') {
      return { url: wrapperUrl, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  }
`)}`
const closeTrackingPreload = `data:text/javascript,${encodeURIComponent(`
  import { register } from 'node:module'
  register(${JSON.stringify(closeTrackingLoader)})
`)}`

function environmentWithPreloads(...preloads: string[]) {
  return {
    ...process.env,
    NODE_OPTIONS: [
      process.env.NODE_OPTIONS,
      ...preloads.map((preload) => `--import=${preload}`),
    ].filter(Boolean).join(' '),
  }
}

async function runGenerator(environment = process.env) {
  return execFileAsync(process.execPath, [scriptPath], {
    cwd: root,
    env: environment,
    timeout: 20_000,
    windowsHide: true,
  }).then(
    (result) => ({ status: 'fulfilled' as const, stderr: result.stderr, killed: false }),
    (error) => ({
      status: 'rejected' as const,
      stderr: String(error.stderr),
      killed: Boolean(error.killed),
    }),
  )
}

async function runGeneratorWithCloseMarker(environment: NodeJS.ProcessEnv) {
  const markerDirectory = await mkdtemp(path.join(outputDirectory, '.generator-close-'))
  const markerPath = path.join(markerDirectory, 'closed')
  try {
    const run = await runGenerator({
      ...environment,
      TEACHER_TEMPLATE_CLOSE_MARKER: markerPath,
    })
    return {
      run,
      closed: (await readdir(markerDirectory)).includes('closed'),
    }
  } finally {
    await rm(markerDirectory, { force: true, recursive: true })
  }
}

const delayedRenamePreload = `data:text/javascript,${encodeURIComponent(`
  import fsPromises from 'node:fs/promises'
  import { syncBuiltinESMExports } from 'node:module'
  import path from 'node:path'
  const rename = fsPromises.rename
  fsPromises.rename = async (...args) => {
    const barrier = process.env.TEACHER_TEMPLATE_RENAME_BARRIER
    await fsPromises.writeFile(path.join(barrier, String(process.pid)), '')
    while ((await fsPromises.readdir(barrier)).length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return rename(...args)
  }
  syncBuiltinESMExports()
`)}`
const generatorEnvironment = environmentWithPreloads(delayedRenamePreload)
const forcedRenameFailurePreload = `data:text/javascript,${encodeURIComponent(`
  import fsPromises from 'node:fs/promises'
  import { syncBuiltinESMExports } from 'node:module'
  fsPromises.rename = async () => {
    throw new Error('forced teacher template publish failure')
  }
  syncBuiltinESMExports()
`)}`
const forcedCleanupFailurePreload = `data:text/javascript,${encodeURIComponent(`
  import fsPromises from 'node:fs/promises'
  import { syncBuiltinESMExports } from 'node:module'
  import path from 'node:path'
  const rm = fsPromises.rm
  fsPromises.rm = async (...args) => {
    if (path.basename(String(args[0])).startsWith('${temporaryOutputPrefix}')) {
      await rm(...args)
      throw new Error('forced teacher template cleanup failure')
    }
    return rm(...args)
  }
  syncBuiltinESMExports()
`)}`
const forcedRenameFailureEnvironment = environmentWithPreloads(forcedRenameFailurePreload)
const forcedCleanupFailureEnvironment = environmentWithPreloads(
  closeTrackingPreload,
  forcedCleanupFailurePreload,
)
const forcedGenerationAndCleanupFailureEnvironment = environmentWithPreloads(
  closeTrackingPreload,
  forcedRenameFailurePreload,
  forcedCleanupFailurePreload,
)
const forcedCloseFailureEnvironment = {
  ...environmentWithPreloads(closeTrackingPreload),
  TEACHER_TEMPLATE_FORCE_CLOSE_FAILURE: '1',
}

it('publishes the deterministic teacher package safely from concurrent generators', async () => {
  const barrier = await mkdtemp(path.join(outputDirectory, '.generator-barrier-'))
  const runs = await (async () => {
    try {
      const environment = {
        ...generatorEnvironment,
        TEACHER_TEMPLATE_RENAME_BARRIER: barrier,
      }
      return await Promise.all([
        runGenerator(environment),
        runGenerator(environment),
      ])
    } finally {
      await rm(barrier, { force: true, recursive: true })
    }
  })()
  const bytes = await readFile(path.join(outputDirectory, outputName))
  const hash = createHash('sha256').update(bytes).digest('hex')
  const temporaryFiles = (await readdir(outputDirectory))
    .filter((name) => name.startsWith(`${outputName}.tmp`))
  const errors = runs.map((run) => run.stderr)

  expect(runs.map((run) => run.status)).toEqual(['fulfilled', 'fulfilled'])
  expect(runs.map((run) => run.killed)).toEqual([false, false])
  expect(errors).toEqual(['', ''])
  expect(hash).toBe(expectedHash)
  expect(temporaryFiles).toEqual([])
}, 30_000)

it('preserves the published package when the replacement rename fails', async () => {
  const outputPath = path.join(outputDirectory, outputName)
  const publishedBytes = await readFile(outputPath)
  const publishedHash = createHash('sha256').update(publishedBytes).digest('hex')
  const run = await runGenerator(forcedRenameFailureEnvironment)
  const preservedBytes = await readFile(outputPath).catch(() => null)
  const preservedHash = preservedBytes
    ? createHash('sha256').update(preservedBytes).digest('hex')
    : null
  const temporaryFiles = (await readdir(outputDirectory))
    .filter((name) => name.startsWith(`${outputName}.tmp`))

  expect(run.status).toBe('rejected')
  expect(run.killed).toBe(false)
  expect(run.stderr).toContain('forced teacher template publish failure')
  expect(preservedHash).toBe(publishedHash)
  expect(temporaryFiles).toEqual([])
}, 30_000)

it('preserves the generation error when temporary cleanup also fails', async () => {
  const { run, closed } = await runGeneratorWithCloseMarker(
    forcedGenerationAndCleanupFailureEnvironment,
  )

  expect(run.status).toBe('rejected')
  expect(run.killed).toBe(false)
  expect(closed).toBe(true)
  expect(run.stderr).toContain('forced teacher template publish failure')
  expect(run.stderr).not.toContain('forced teacher template cleanup failure')
}, 30_000)

it('reports cleanup failure after a successful publication and still closes Vite', async () => {
  const { run, closed } = await runGeneratorWithCloseMarker(forcedCleanupFailureEnvironment)
  const bytes = await readFile(path.join(outputDirectory, outputName))
  const hash = createHash('sha256').update(bytes).digest('hex')

  expect(run.status).toBe('rejected')
  expect(run.killed).toBe(false)
  expect(closed).toBe(true)
  expect(run.stderr).toContain('forced teacher template cleanup failure')
  expect(hash).toBe(expectedHash)
}, 30_000)

it('reports a Vite close failure after a successful publication', async () => {
  const { run, closed } = await runGeneratorWithCloseMarker(forcedCloseFailureEnvironment)

  expect(run.status).toBe('rejected')
  expect(run.killed).toBe(false)
  expect(closed).toBe(true)
  expect(run.stderr).toContain('forced teacher template close failure')
}, 30_000)
