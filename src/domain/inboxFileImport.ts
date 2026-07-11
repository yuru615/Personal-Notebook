import type { BlockRecord } from './types'
import { createBlock } from '../utils/blockFactory'

export function createInboxFileBlock(input: {
  assetId: string
  name: string
  mimeType: string
}): BlockRecord {
  const type = input.mimeType.startsWith('image/')
    ? 'image'
    : input.mimeType.startsWith('audio/')
      ? 'audio'
      : input.mimeType.startsWith('video/')
        ? 'video'
        : 'file'
  const block = createBlock(type)

  return {
    ...block,
    assetId: input.assetId,
    name: input.name,
    mimeType: input.mimeType,
    ...(type === 'image' ? { alt: input.name } : {}),
  } as BlockRecord
}
