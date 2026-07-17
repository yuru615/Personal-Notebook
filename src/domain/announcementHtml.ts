const ALLOWED_TAGS = new Set([
  'A',
  'BLOCKQUOTE',
  'BR',
  'EM',
  'H1',
  'H2',
  'H3',
  'LI',
  'OL',
  'P',
  'STRONG',
  'UL',
])
const REMOVED_WITH_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE'])

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function sanitizeAnnouncementHtml(value: string) {
  const document = new DOMParser().parseFromString(value, 'text/html')
  const elements = Array.from(document.body.querySelectorAll('*')).reverse()

  for (const element of elements) {
    if (REMOVED_WITH_CONTENT_TAGS.has(element.tagName)) {
      element.remove()
      continue
    }
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes))
      continue
    }

    for (const attribute of Array.from(element.attributes)) {
      if (element.tagName !== 'A' || attribute.name !== 'href') {
        element.removeAttribute(attribute.name)
      }
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') ?? ''
      if (!isSafeHttpUrl(href)) {
        element.removeAttribute('href')
      } else {
        element.setAttribute('rel', 'noopener noreferrer')
      }
    }
  }

  return document.body.innerHTML
}
