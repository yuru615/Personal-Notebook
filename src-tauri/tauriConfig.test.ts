import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

type TauriConfig = {
  app?: {
    windows?: Array<{
      dragDropEnabled?: boolean
    }>
  }
  bundle?: {
    icon?: string[]
    createUpdaterArtifacts?: boolean
  }
  version?: string
  plugins?: {
    updater?: {
      pubkey?: string
    }
  }
}

const srcTauriDir = dirname(fileURLToPath(import.meta.url))
const configPath = join(srcTauriDir, 'tauri.conf.json')

const readConfig = () => JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig

describe('Tauri config', () => {
  it('keeps WebView file drag/drop interception disabled for HTML5 mindmap dragging', () => {
    const config = readConfig()

    expect(config.app?.windows?.[0]?.dragDropEnabled).toBe(false)
  })

  it('keeps bundle icon paths backed by the approved Zhiqi source icon', () => {
    const config = readConfig()
    const iconPaths = config.bundle?.icon ?? []

    expect(iconPaths).toEqual([
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico',
    ])

    iconPaths.forEach((iconPath) => {
      expect(existsSync(join(srcTauriDir, iconPath))).toBe(true)
    })

    const sourceIcon = readFileSync(join(srcTauriDir, 'icons/icon-source.svg'), 'utf8')

    expect(sourceIcon).toContain('data-zhiqi-logo="perch-page"')
    expect(sourceIcon).toContain('#0E766E')
    expect(sourceIcon).toContain('#DDAE4E')
  })

  it('keeps the client version and signed updater artifacts enabled', () => {
    const config = readConfig()

    expect(config.version).toBe('0.1.0')
    expect(config.bundle?.createUpdaterArtifacts).toBe(true)
    const updaterPublicKey = config.plugins?.updater?.pubkey ?? ''
    const decodedPublicKey = Buffer.from(updaterPublicKey, 'base64').toString('utf8')

    expect(updaterPublicKey.length % 4).toBe(0)
    expect(Buffer.from(decodedPublicKey).toString('base64')).toBe(updaterPublicKey)
    expect(decodedPublicKey).toMatch(/^untrusted comment: minisign public key:/)
  })
})
