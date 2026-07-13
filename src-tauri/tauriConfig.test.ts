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
})
