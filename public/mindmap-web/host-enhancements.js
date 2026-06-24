;(() => {
  const DEFAULT_TITLE = '\u672a\u547d\u540d\u5bfc\u56fe'
  let cleanupRenamePopover = null

  function getFloatingMenuAnchor(panel) {
    const root = panel?.parentElement
    if (!(root instanceof HTMLElement)) {
      return null
    }

    if (root.matches('.toolbar-select-field')) {
      return root.querySelector('.toolbar-select-trigger')
    }

    return root.querySelector('.toolbar-icon-button')
  }

  function positionFloatingMenuPanel(panel) {
    const root = panel?.parentElement
    const anchor = getFloatingMenuAnchor(panel)
    if (!(panel instanceof HTMLElement) || !(root instanceof HTMLElement) || !(anchor instanceof HTMLElement)) {
      return
    }

    const rootRect = root.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const panelWidth = panel.offsetWidth || 0
    const left = Math.min(
      Math.max(12 - rootRect.left, anchorRect.left - rootRect.left),
      Math.max(12 - rootRect.left, window.innerWidth - rootRect.left - panelWidth - 12),
    )

    panel.style.top = `${Math.round(anchorRect.bottom - rootRect.top + 16)}px`
    panel.style.left = `${Math.round(left)}px`
    panel.style.right = 'auto'
  }

  function positionOpenToolbarPanels() {
    document.querySelectorAll('.toolbar-menu-panel').forEach((panel) => {
      positionFloatingMenuPanel(panel)
    })
  }

  function getTitleInput() {
    return document.querySelector('.title-input')
  }

  function setControlledInputValue(input, value) {
    const descriptor =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ??
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')

    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function ensureTitleManaged() {
    const input = getTitleInput()
    if (!(input instanceof HTMLInputElement)) {
      return
    }

    input.classList.add('host-title-input-hidden')
    input.tabIndex = -1
    input.setAttribute('aria-hidden', 'true')
    input.closest('.toolbar-meta')?.classList.add('toolbar-meta-compact')
  }

  function isMoreMenuPanel(panel) {
    if (!(panel instanceof HTMLElement)) {
      return false
    }

    const text = panel.textContent ?? ''
    return text.includes('\u5bfc\u51fa JSON') && text.includes('\u5bfc\u5165 JSON')
  }

  function findMoreMenuButton(panel) {
    return panel?.parentElement?.querySelector('.toolbar-icon-button') ?? null
  }

  function closeRenamePopover() {
    cleanupRenamePopover?.()
    cleanupRenamePopover = null
    document.querySelector('.host-rename-popover')?.remove()
  }

  function openRenamePopover(panel) {
    const titleInput = getTitleInput()
    const trigger = findMoreMenuButton(panel)
    if (!(titleInput instanceof HTMLInputElement) || !(trigger instanceof HTMLElement)) {
      return
    }

    closeRenamePopover()

    const popover = document.createElement('div')
    popover.className = 'host-rename-popover'
    popover.innerHTML = `
      <form class="host-rename-popover-form">
        <p class="host-rename-popover-title">\u91cd\u547d\u540d</p>
        <input class="host-rename-popover-input" type="text" maxlength="120" />
        <div class="host-rename-popover-actions">
          <button type="button" class="host-rename-popover-button host-rename-popover-button-secondary">\u53d6\u6d88</button>
          <button type="submit" class="host-rename-popover-button host-rename-popover-button-primary">\u786e\u8ba4</button>
        </div>
      </form>
    `
    document.body.appendChild(popover)

    const form = popover.querySelector('form')
    const field = popover.querySelector('.host-rename-popover-input')
    const cancelButton = popover.querySelector('.host-rename-popover-button-secondary')
    if (!(form instanceof HTMLFormElement) || !(field instanceof HTMLInputElement)) {
      popover.remove()
      return
    }

    field.value = (titleInput.value || '').trim() || DEFAULT_TITLE

    function positionPopover() {
      const rect = trigger.getBoundingClientRect()
      const popoverWidth = popover.offsetWidth || 296
      const left = Math.min(Math.max(12, rect.right - popoverWidth), window.innerWidth - popoverWidth - 12)
      popover.style.top = `${rect.bottom + 10}px`
      popover.style.left = `${left}px`
    }

    function commitTitle() {
      const nextTitle = field.value.trim() || DEFAULT_TITLE
      setControlledInputValue(titleInput, nextTitle)
      closeRenamePopover()
    }

    function handlePointerDown(event) {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (popover.contains(target) || trigger.contains(target)) {
        return
      }

      closeRenamePopover()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRenamePopover()
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault()
      commitTitle()
    })

    cancelButton?.addEventListener('click', () => {
      closeRenamePopover()
    })

    positionPopover()
    requestAnimationFrame(positionPopover)
    queueMicrotask(() => {
      field.focus()
      field.select()
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('keydown', handleKeyDown)
      window.addEventListener('resize', positionPopover)
    })

    cleanupRenamePopover = () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', positionPopover)
    }
  }

  function ensureRenameAction(panel) {
    if (!isMoreMenuPanel(panel) || panel.querySelector('[data-host-rename-action="true"]')) {
      return
    }

    const renameButton = document.createElement('button')
    renameButton.type = 'button'
    renameButton.className = 'toolbar-menu-item host-rename-menu-item'
    renameButton.dataset.hostRenameAction = 'true'
    renameButton.innerHTML = `
      <span class="host-rename-menu-icon" aria-hidden="true">T</span>
      <span>\u91cd\u547d\u540d</span>
    `
    renameButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      const trigger = findMoreMenuButton(panel)
      openRenamePopover(panel)
      if (trigger instanceof HTMLButtonElement && trigger.getAttribute('aria-expanded') === 'true') {
        trigger.click()
      }
    })

    panel.insertBefore(renameButton, panel.firstChild)
  }

  function scanHostUi() {
    ensureTitleManaged()
    document.querySelectorAll('.toolbar-menu-panel').forEach((panel) => ensureRenameAction(panel))
    requestAnimationFrame(positionOpenToolbarPanels)
  }

  const observer = new MutationObserver(() => {
    scanHostUi()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanHostUi, { once: true })
  } else {
    scanHostUi()
  }

  window.addEventListener('resize', positionOpenToolbarPanels)

  window.addEventListener('beforeunload', () => {
    closeRenamePopover()
    window.removeEventListener('resize', positionOpenToolbarPanels)
    observer.disconnect()
  })
})()
