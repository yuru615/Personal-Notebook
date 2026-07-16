import { disableNativeContextMenu } from './nativeContextMenu'

describe('disableNativeContextMenu', () => {
  it('prevents the browser context menu across the application document', () => {
    const restore = disableNativeContextMenu(document)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    restore()
  })

  it('restores the default context-menu behavior during cleanup', () => {
    const restore = disableNativeContextMenu(document)
    restore()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })

    document.body.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })
})
