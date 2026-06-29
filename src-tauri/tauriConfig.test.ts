import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Tauri window config', () => {
  it('keeps WebView file drag/drop interception disabled for HTML5 mindmap dragging', () => {
    const configPath = join(dirname(fileURLToPath(import.meta.url)), 'tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      app?: {
        windows?: Array<{
          dragDropEnabled?: boolean
        }>
      }
    }

    expect(config.app?.windows?.[0]?.dragDropEnabled).toBe(false)
  })
})
