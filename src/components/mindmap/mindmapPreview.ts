import type { MindmapRecord } from '../../domain/types'

export function buildMindmapPreviewSvgDataUrl(mindmap: MindmapRecord): string {
  const layoutMode = normalizePreviewLayoutMode(mindmap.layoutMode)
  const rootText = escapeText(mindmap.nodes[mindmap.rootNodeId]?.text ?? '中心主题')
  const childCount = Object.values(mindmap.nodes).filter((node) => node.parentId === mindmap.rootNodeId).length
  const branchRightY = childCount > 0 ? 64 : 72

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="none" data-layout="${layoutMode}">
      <rect width="320" height="180" rx="14" fill="#ffffff"/>
      <rect x="0.5" y="0.5" width="319" height="179" rx="13.5" stroke="#e9e9e7"/>
      <line x1="88" y1="90" x2="120" y2="90" stroke="#c9c9c3" stroke-width="2"/>
      <line x1="200" y1="90" x2="232" y2="${branchRightY}" stroke="#c9c9c3" stroke-width="2"/>
      <line x1="200" y1="90" x2="232" y2="116" stroke="#d7d7d3" stroke-width="2"/>
      <rect x="120" y="68" width="80" height="44" rx="12" fill="#f7f7f5" stroke="#d7d7d3"/>
      <text x="160" y="94" text-anchor="middle" font-size="12" fill="#2f2f2b" font-family="Inter, Microsoft YaHei, sans-serif">${rootText}</text>
      <rect x="232" y="48" width="48" height="24" rx="8" fill="#ffffff" stroke="#e1e1dc"/>
      <rect x="232" y="104" width="48" height="24" rx="8" fill="#ffffff" stroke="#e1e1dc"/>
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
