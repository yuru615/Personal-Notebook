import type { MindmapRecord } from '../../domain/types'

export function buildMindmapPreviewSvgDataUrl(mindmap: MindmapRecord): string {
  const layoutMode = normalizePreviewLayoutMode(mindmap.layoutMode)
  const rootText = escapeText(mindmap.nodes[mindmap.rootNodeId]?.text ?? '中心主题')
  const branchMarkup = buildBranchMarkup(layoutMode)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="none" data-layout="${layoutMode}">
      <rect width="320" height="180" rx="18" fill="#fcfcfb"/>
      <rect x="0.75" y="0.75" width="318.5" height="178.5" rx="17.25" stroke="#ece9e4" stroke-width="1.5"/>
      <circle cx="272" cy="32" r="20" fill="url(#mindmapPreviewGlow)" opacity="0.68"/>
      ${branchMarkup}
      <rect x="128" y="70" width="64" height="40" rx="18" fill="#ffffff" stroke="#dfe5ec"/>
      <text x="160" y="94" text-anchor="middle" font-size="12" font-weight="600" fill="#2f2f2b" font-family="Inter, Microsoft YaHei, sans-serif">${rootText}</text>
      <defs>
        <radialGradient id="mindmapPreviewGlow" cx="0" cy="0" r="1" gradientTransform="translate(272 32) rotate(90) scale(20)">
          <stop stop-color="#c6d8ee"/>
          <stop offset="1" stop-color="#c6d8ee" stop-opacity="0"/>
        </radialGradient>
      </defs>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizePreviewLayoutMode(value: unknown) {
  return value === 'balanced' || value === 'right' || value === 'outline' ? value : 'balanced'
}

function buildBranchMarkup(layoutMode: 'balanced' | 'right' | 'outline') {
  if (layoutMode === 'outline') {
    return `
      <path d="M 160 110 C 160 122, 160 126, 160 136" stroke="#9ab6da" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M 160 136 C 160 144, 150 146, 138 146" stroke="#c7d3e2" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M 160 136 C 160 148, 160 152, 160 160" stroke="#c7d3e2" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <rect x="116" y="136" width="44" height="18" rx="9" fill="#ffffff" stroke="#e4e1dc"/>
      <rect x="138" y="156" width="44" height="18" rx="9" fill="#ffffff" stroke="#e4e1dc"/>
    `.trim()
  }

  if (layoutMode === 'balanced') {
    return `
      <path d="M 128 90 C 102 90, 94 72, 74 72" stroke="#9ab6da" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M 192 90 C 218 90, 226 68, 248 68" stroke="#9ab6da" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M 192 90 C 222 90, 232 116, 252 122" stroke="#cad6e4" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <rect x="46" y="60" width="48" height="20" rx="10" fill="#ffffff" stroke="#e4e1dc"/>
      <rect x="248" y="58" width="48" height="20" rx="10" fill="#ffffff" stroke="#e4e1dc"/>
      <rect x="252" y="112" width="44" height="20" rx="10" fill="#ffffff" stroke="#e4e1dc"/>
    `.trim()
  }

  return `
    <path d="M 192 90 C 220 90, 228 70, 250 66" stroke="#9ab6da" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M 192 90 C 224 90, 236 118, 254 122" stroke="#cad6e4" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <rect x="248" y="56" width="48" height="20" rx="10" fill="#ffffff" stroke="#e4e1dc"/>
    <rect x="252" y="112" width="44" height="20" rx="10" fill="#ffffff" stroke="#e4e1dc"/>
  `.trim()
}
