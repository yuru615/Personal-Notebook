import { makeId, nowIso } from "./factory";
import type { AppState, Asset, Block, BlockType } from "./types";

function normalizeOrder(state: AppState, recordId: string, blockIds: string[]) {
  const page = state.recordPages[recordId];
  if (!page) {
    return state;
  }

  const nextBlocks = { ...state.blocks };
  blockIds.forEach((blockId, index) => {
    const block = nextBlocks[blockId];
    if (!block) {
      return;
    }

    nextBlocks[blockId] = {
      ...block,
      order: index,
    };
  });

  return {
    ...state,
    recordPages: {
      ...state.recordPages,
      [recordId]: {
        ...page,
        blockIds,
        updatedAt: nowIso(),
      },
    },
    blocks: nextBlocks,
  };
}

export function addBlockAfter(
  state: AppState,
  recordId: string,
  afterBlockId: string | null,
  type: BlockType,
  blockId = makeId("block"),
) {
  const page = state.recordPages[recordId];
  if (!page) {
    return state;
  }

  const timestamp = nowIso();
  const block: Block = {
    id: blockId,
    type,
    recordId,
    content: "",
    checked: type === "todo" ? false : undefined,
    imageAssetId: undefined,
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const insertAfterIndex = afterBlockId
    ? page.blockIds.indexOf(afterBlockId)
    : page.blockIds.length - 1;
  const insertIndex = insertAfterIndex < 0 ? page.blockIds.length : insertAfterIndex + 1;
  const nextBlockIds = [
    ...page.blockIds.slice(0, insertIndex),
    block.id,
    ...page.blockIds.slice(insertIndex),
  ];

  return normalizeOrder(
    {
      ...state,
      blocks: {
        ...state.blocks,
        [block.id]: block,
      },
    },
    recordId,
    nextBlockIds,
  );
}

export function updateBlockContent(
  state: AppState,
  blockId: string,
  content: string,
) {
  const block = state.blocks[blockId];
  if (!block) {
    return state;
  }

  return {
    ...state,
    blocks: {
      ...state.blocks,
      [blockId]: {
        ...block,
        content,
        updatedAt: nowIso(),
      },
    },
  };
}

export function updateBlockType(
  state: AppState,
  blockId: string,
  type: BlockType,
) {
  const block = state.blocks[blockId];
  if (!block) {
    return state;
  }

  return {
    ...state,
    blocks: {
      ...state.blocks,
      [blockId]: {
        ...block,
        type,
        checked: type === "todo" ? false : undefined,
        imageAssetId: type === "image" ? block.imageAssetId : undefined,
        updatedAt: nowIso(),
      },
    },
  };
}

export function updateBlockChecked(
  state: AppState,
  blockId: string,
  checked: boolean,
) {
  const block = state.blocks[blockId];
  if (!block || block.type !== "todo") {
    return state;
  }

  return {
    ...state,
    blocks: {
      ...state.blocks,
      [blockId]: {
        ...block,
        checked,
        updatedAt: nowIso(),
      },
    },
  };
}

export function deleteBlock(state: AppState, blockId: string) {
  const block = state.blocks[blockId];
  if (!block) {
    return state;
  }

  const page = state.recordPages[block.recordId];
  if (!page) {
    return state;
  }

  const nextBlocks = { ...state.blocks };
  delete nextBlocks[blockId];
  const nextAssets = { ...state.assets };
  if (block.imageAssetId) {
    delete nextAssets[block.imageAssetId];
  }

  return normalizeOrder(
    {
      ...state,
      assets: nextAssets,
      blocks: nextBlocks,
    },
    block.recordId,
    page.blockIds.filter((id) => id !== blockId),
  );
}

export function moveBlock(
  state: AppState,
  blockId: string,
  direction: "up" | "down",
) {
  const block = state.blocks[blockId];
  if (!block) {
    return state;
  }

  const page = state.recordPages[block.recordId];
  if (!page) {
    return state;
  }

  const currentIndex = page.blockIds.indexOf(blockId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= page.blockIds.length) {
    return state;
  }

  const nextIds = [...page.blockIds];
  [nextIds[currentIndex], nextIds[targetIndex]] = [
    nextIds[targetIndex],
    nextIds[currentIndex],
  ];

  return normalizeOrder(state, block.recordId, nextIds);
}

export function attachImageAsset(state: AppState, blockId: string, asset: Asset) {
  const block = state.blocks[blockId];
  if (!block) {
    return state;
  }

  return {
    ...state,
    assets: {
      ...state.assets,
      [asset.id]: asset,
    },
    blocks: {
      ...state.blocks,
      [blockId]: {
        ...block,
        imageAssetId: asset.id,
        updatedAt: nowIso(),
      },
    },
  };
}
