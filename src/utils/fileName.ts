export function sanitizeFileNameSegment(value: string, fallback: string) {
  const withoutControlCharacters = Array.from(value.trim(), (character) => {
    const codePoint = character.codePointAt(0) ?? 0

    return codePoint <= 31 ? ' ' : character
  }).join('')

  const cleaned = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim()

  return cleaned || fallback
}
