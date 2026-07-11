import { FileText } from 'lucide-react'
import type { FileBlock as FileBlockRecord } from '../../../domain/types'

interface FileBlockProps {
  block: FileBlockRecord
  onOpen?: () => void
}

export function FileBlock({ block, onOpen }: FileBlockProps) {
  return (
    <div className="file-block" aria-label="附件">
      <FileText size={20} strokeWidth={1.8} aria-hidden="true" />
      <div className="file-block-copy">
        <strong>{block.name || '未命名附件'}</strong>
        <span>{block.mimeType || 'application/octet-stream'}</span>
      </div>
      <button
        className="file-block-open"
        type="button"
        disabled={!block.assetId || !onOpen}
        onClick={onOpen}
      >
        打开文件
      </button>
    </div>
  )
}
