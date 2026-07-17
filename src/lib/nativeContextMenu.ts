export function disableNativeContextMenu(target: Document = document): () => void {
  const preventContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }

  target.addEventListener('contextmenu', preventContextMenu, true)

  return () => {
    target.removeEventListener('contextmenu', preventContextMenu, true)
  }
}
