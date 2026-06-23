import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(join(process.cwd(), 'src/components/dataTable/styles.css'), 'utf8')

function getRuleBody(selector: string) {
  return new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
    styles,
  )?.[1] ?? ''
}

describe('data table styles', () => {
  it('keeps record peek properties aligned with the peek page content', () => {
    expect(styles).toContain('.record-peek-body .record-properties')
    expect(styles).toContain('padding-left: 0')
    expect(styles).toContain('padding-right: 0')
  })

  it('uses the same blurred backdrop for record peeks and confirm dialogs', () => {
    const confirmOverlay = getRuleBody('.table-confirm-overlay')
    const recordPeekOverlay = getRuleBody('.record-peek-overlay')

    expect(recordPeekOverlay).toContain('background: rgba(15, 23, 42, 0.18)')
    expect(recordPeekOverlay).toContain('backdrop-filter: blur(10px)')
    expect(recordPeekOverlay).toContain(confirmOverlay.match(/background:[^;]+;/)?.[0])
    expect(recordPeekOverlay).toContain(confirmOverlay.match(/backdrop-filter:[^;]+;/)?.[0])
  })
})
