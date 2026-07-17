import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const updaterKeyDir = join(homedir(), '.config', 'zhiqi', 'updater')
const tauriConfig = JSON.parse(readFileSync(join(projectRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const updaterPublicKey = tauriConfig.plugins?.updater?.pubkey

if (!updaterPublicKey) {
  console.error('Missing plugins.updater.pubkey in src-tauri/tauri.conf.json')
  process.exit(1)
}

const readLocalSecret = (fileName, trim = true) => {
  const path = join(updaterKeyDir, fileName)
  if (!existsSync(path)) return undefined

  const value = readFileSync(path, 'utf8')
  return trim ? value.trim() : value.trimEnd()
}

const env = { ...process.env }
env.ZHIQI_API_BASE_URL ||= 'http://117.72.91.46'
env.TAURI_SIGNING_PRIVATE_KEY ||= readLocalSecret('private.key')
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ||= readLocalSecret('private-key.password', false)

const missing = [
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
].filter((name) => !env[name])

if (!env.TAURI_SIGNING_PRIVATE_KEY) {
  missing.unshift('TAURI_SIGNING_PRIVATE_KEY')
}

if (missing.length > 0) {
  console.error(`Missing updater signing configuration: ${missing.join(', ')}`)
  console.error(`Set the environment variables or place the updater keys in ${updaterKeyDir}`)
  process.exit(1)
}

const args = ['build', ...process.argv.slice(2)]
if (env.ZHIQI_API_BASE_URL.startsWith('http://')) {
  env.ZHIQI_ALLOW_INSECURE_HTTP = '1'
  args.push(
    '--config',
    JSON.stringify({
      plugins: {
        updater: {
          dangerousInsecureTransportProtocol: true,
          pubkey: updaterPublicKey,
        },
      },
    }),
  )
  console.warn('Building with HTTP update transport for development use only.')
}

const tauriJs = join(projectRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')

try {
  execFileSync(process.execPath, [tauriJs, ...args], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })
  process.exit(0)
} catch (err) {
  if (err.status != null) process.exit(err.status)
  console.error(err.message)
  process.exit(1)
}
