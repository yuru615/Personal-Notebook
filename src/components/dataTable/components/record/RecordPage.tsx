import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type {
  BlockRecord as KnowledgeBlockRecord,
  BlockType as KnowledgeBlockType,
  PageRecord as KnowledgePageRecord,
} from "../../../../domain/types";
import { BlockEditor as KnowledgeBlockEditor } from "../../../editor/BlockEditor";
import { nowIso } from "../../domain/factory";
import type { Block, BlockType as RecordBlockType } from "../../domain/types";
import { useAppStore } from "../../store/AppStore";
import WorkspaceShell from "../layout/WorkspaceShell";
import ConfirmDialog from "../table/ConfirmDialog";
import LegacyBlockEditor from "./BlockEditor";
import RecordHeader from "./RecordHeader";
import RecordInsertMenu from "./RecordInsertMenu";
import RecordProperties from "./RecordProperties";

const LOADING_TEXT = "\u6b63\u5728\u52a0\u8f7d\u672c\u5730\u6570\u636e...";
const RECORD_NOT_FOUND = "\u8bb0\u5f55\u4e0d\u5b58\u5728";
const EMPTY_BODY_HINT =
  "\u8f93\u5165\u6587\u5b57\uff0c\u6216\u8f93\u5165 / \u67e5\u770b\u547d\u4ee4...";
const DELETE_BLOCK_TITLE = "\u5220\u9664\u5185\u5bb9\u5757";
const DELETE_BLOCK_DESCRIPTION =
  "\u8fd9\u4e2a\u5185\u5bb9\u5757\u4f1a\u4ece\u5f53\u524d\u8bb0\u5f55\u4e2d\u6c38\u4e45\u5220\u9664\u3002\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002";
const DELETE_CONFIRM_LABEL = "\u786e\u8ba4\u5220\u9664";
const DELETE_CANCEL_LABEL = "\u53d6\u6d88";
const KNOWLEDGE_RECORD_BLOCK_TYPES: KnowledgeBlockType[] = [
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "todo",
  "bulleted_list",
  "code",
  "image",
];
const KNOWLEDGE_EDITABLE_RECORD_TYPES: RecordBlockType[] = [
  "text",
  "heading",
  "todo",
  "bulletedList",
  "code",
  "image",
];

interface RecordPageProps {
  basePath: string;
  showSidebar?: boolean;
}

export default function RecordPage({ basePath, showSidebar = true }: RecordPageProps) {
  const { recordId = "" } = useParams();
  const { state, loaded, actions } = useAppStore();
  const [pendingDeleteBlockId, setPendingDeleteBlockId] = useState<string | null>(null);
  const record = state.records[recordId];
  const titleProperty = state.database.propertyOrder
    .map((id) => state.properties[id])
    .find((property) => property?.type === "title");
  const metadataProperties = state.database.propertyOrder
    .map((id) => state.properties[id])
    .filter((property) => property && property.type !== "title");
  const page = record ? state.recordPages[recordId] : undefined;
  const blocks = useMemo(
    () => (page ? page.blockIds.map((id) => state.blocks[id]).filter(Boolean) : []),
    [page, state.blocks],
  );
  const pendingDeleteBlock = pendingDeleteBlockId
    ? blocks.find((block) => block.id === pendingDeleteBlockId) ?? null
    : null;

  useEffect(() => {
    if (!pendingDeleteBlockId) {
      return;
    }

    if (blocks.some((block) => block.id === pendingDeleteBlockId)) {
      return;
    }

    setPendingDeleteBlockId(null);
  }, [blocks, pendingDeleteBlockId]);

  if (!loaded && !record) {
    return (
      <WorkspaceShell
        databaseName={state.database.name}
        activePage="record"
        databasePath={basePath}
        showSidebar={showSidebar}
      >
        <main className="record-page-shell">
          <p className="record-empty-hint">{LOADING_TEXT}</p>
        </main>
      </WorkspaceShell>
    );
  }

  if (!record) {
    return (
      <WorkspaceShell
        databaseName={state.database.name}
        activePage="record"
        databasePath={basePath}
        showSidebar={showSidebar}
      >
        <main className="record-page-shell">
          <h1>{RECORD_NOT_FOUND}</h1>
        </main>
      </WorkspaceShell>
    );
  }

  const handleTitleChange = (value: string) => {
    if (titleProperty) {
      actions.updateRecordValue(record.id, titleProperty, value);
    }
  };

  const appendBlock = (type: RecordBlockType) => {
    const lastBlockId = blocks.length > 0 ? blocks[blocks.length - 1].id : null;
    actions.addBlock(record.id, lastBlockId, type);
  };
  const canUseKnowledgeEditor = blocks.every(isKnowledgeEditableRecordBlock);
  const knowledgePage: KnowledgePageRecord = {
    id: `record-${record.id}`,
    parentId: null,
    title: record.title,
    icon: null,
    cover: null,
    blocks: blocks.map((block) => toKnowledgeBlock(block, state.assets)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  const insertKnowledgeBlock = (
    afterBlockId: string | null,
    type: KnowledgeBlockType,
    text = "",
  ) => {
    const recordType = toRecordBlockType(type);
    if (!recordType) {
      return null;
    }

    const blockId = actions.addBlock(record.id, afterBlockId, recordType);
    if (blockId && text) {
      actions.patchBlock(blockId, { content: text });
    }
    return blockId;
  };

  const updateKnowledgeBlock = (blockId: string, nextBlock: KnowledgeBlockRecord) => {
    const patch = toRecordBlockPatch(nextBlock);
    if (!patch) {
      return;
    }

    actions.patchBlock(blockId, patch);
    if (nextBlock.type === "image" && nextBlock.assetId) {
      actions.attachImageAsset(blockId, {
        id: nextBlock.assetId,
        kind: "image",
        name: nextBlock.name,
        mimeType: nextBlock.mimeType,
        createdAt: nowIso(),
      });
    }
  };

  const reorderKnowledgeBlock = (
    activeBlockId: string,
    overBlockId: string,
    position: "before" | "after",
  ) => {
    if (!page || activeBlockId === overBlockId) {
      return;
    }

    const withoutActive = page.blockIds.filter((id) => id !== activeBlockId);
    const overIndex = withoutActive.indexOf(overBlockId);
    if (overIndex < 0) {
      return;
    }

    const nextBlockIds = [...withoutActive];
    nextBlockIds.splice(position === "after" ? overIndex + 1 : overIndex, 0, activeBlockId);
    const nextBlocks = { ...state.blocks };
    nextBlockIds.forEach((blockId, index) => {
      const block = nextBlocks[blockId];
      if (block) {
        nextBlocks[blockId] = { ...block, order: index, updatedAt: nowIso() };
      }
    });

    actions.replaceState({
      ...state,
      recordPages: {
        ...state.recordPages,
        [record.id]: {
          ...page,
          blockIds: nextBlockIds,
          updatedAt: nowIso(),
        },
      },
      blocks: nextBlocks,
    });
  };

  return (
    <WorkspaceShell
      databaseName={state.database.name}
      activePage="record"
      databasePath={basePath}
      recordTitle={record.title}
      showSidebar={showSidebar}
    >
      <main className="record-page-shell">
        <RecordHeader
          databaseName={state.database.name}
          databasePath={basePath}
          showNavigation={showSidebar}
          title={record.title}
          onTitleChange={handleTitleChange}
        />

        <RecordProperties
          state={state}
          properties={metadataProperties}
          record={record}
          onCellChange={(property, value) =>
            actions.updateRecordValue(record.id, property, value)
          }
        />

        <section className="record-body">
          {canUseKnowledgeEditor ? (
            <KnowledgeBlockEditor
              page={knowledgePage}
              allPages={[knowledgePage]}
              allowedBlockTypes={KNOWLEDGE_RECORD_BLOCK_TYPES}
              onUpdateBlock={updateKnowledgeBlock}
              onInsert={(type) => insertKnowledgeBlock(null, type)}
              onInsertParagraph={(text) => {
                insertKnowledgeBlock(null, "paragraph", text);
              }}
              onInsertBlockAfter={(blockId, type) => insertKnowledgeBlock(blockId, type)}
              onDeleteBlock={(blockId) => setPendingDeleteBlockId(blockId)}
              onTurnInto={(blockId, type) => {
                const recordType = toRecordBlockType(type);
                if (recordType) {
                  actions.updateBlockType(blockId, recordType);
                }
              }}
              onReorderBlock={reorderKnowledgeBlock}
            />
          ) : (
            <>
              <RecordInsertMenu onSelect={appendBlock} />

              {blocks.length === 0 ? (
                <button
                  type="button"
                  className="record-empty-block"
                  onClick={() => appendBlock("text")}
                >
                  <span className="record-empty-block-plus" aria-hidden="true">
                    +
                  </span>
                  <span className="record-empty-block-text">{EMPTY_BODY_HINT}</span>
                </button>
              ) : null}

              {blocks.map((block, index) => (
                <LegacyBlockEditor
                  key={block.id}
                  block={block}
                  asset={block.imageAssetId ? state.assets[block.imageAssetId] : undefined}
                  canMoveUp={index > 0}
                  canMoveDown={index < blocks.length - 1}
                  onChange={(content) => actions.updateBlockContent(block.id, content)}
                  onTypeChange={(type) => actions.updateBlockType(block.id, type)}
                  onCheckedChange={(checked) =>
                    actions.updateBlockChecked(block.id, checked)
                  }
                  onDelete={() => setPendingDeleteBlockId(block.id)}
                  onMoveUp={() => actions.moveBlock(block.id, "up")}
                  onMoveDown={() => actions.moveBlock(block.id, "down")}
                  onInsertBelow={(type) => actions.addBlock(record.id, block.id, type)}
                  onImageUpload={async () => {
                    const { selectAndImportAsset } = await import("../../../../lib/assets");
                    const asset = await selectAndImportAsset("image");
                    if (!asset) {
                      return;
                    }
                    actions.attachImageAsset(block.id, {
                      id: asset.id,
                      kind: "image",
                      name: asset.name,
                      mimeType: asset.mimeType,
                      createdAt: nowIso(),
                    });
                  }}
                />
              ))}
            </>
          )}
        </section>

        {pendingDeleteBlock ? (
          <ConfirmDialog
            title={DELETE_BLOCK_TITLE}
            description={DELETE_BLOCK_DESCRIPTION}
            confirmLabel={DELETE_CONFIRM_LABEL}
            cancelLabel={DELETE_CANCEL_LABEL}
            danger
            onConfirm={() => {
              actions.deleteBlock(pendingDeleteBlock.id);
              setPendingDeleteBlockId(null);
            }}
            onCancel={() => setPendingDeleteBlockId(null)}
          />
        ) : null}
      </main>
    </WorkspaceShell>
  );
}

function isKnowledgeEditableRecordBlock(block: Block) {
  return KNOWLEDGE_EDITABLE_RECORD_TYPES.includes(block.type);
}

function toKnowledgeBlock(
  block: Block,
  assets: Record<string, { name: string; mimeType: string }>,
): KnowledgeBlockRecord {
  const textStyle = {
    textColor: block.textColor,
    backgroundColor: block.backgroundColor,
    textAlign: block.textAlign,
  };

  switch (block.type) {
    case "heading":
      return {
        id: block.id,
        type: "heading_1",
        text: block.content,
        richText: block.richText,
        ...textStyle,
      };
    case "todo":
      return {
        id: block.id,
        type: "todo",
        text: block.content,
        richText: block.richText,
        checked: block.checked ?? false,
        ...textStyle,
      };
    case "bulletedList":
      return {
        id: block.id,
        type: "bulleted_list",
        items: [block.content],
        ...textStyle,
      };
    case "code":
      return {
        id: block.id,
        type: "code",
        language: "text",
        text: block.content,
      };
    case "image": {
      const asset = block.imageAssetId ? assets[block.imageAssetId] : undefined;
      return {
        id: block.id,
        type: "image",
        assetId: block.imageAssetId ?? null,
        name: asset?.name ?? "",
        mimeType: asset?.mimeType ?? "",
        caption: block.content,
        alt: asset?.name ?? "",
      };
    }
    case "text":
    default:
      return {
        id: block.id,
        type: "paragraph",
        text: block.content,
        richText: block.richText,
        ...textStyle,
      };
  }
}

function toRecordBlockType(type: KnowledgeBlockType): RecordBlockType | null {
  switch (type) {
    case "paragraph":
      return "text";
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return "heading";
    case "todo":
      return "todo";
    case "bulleted_list":
      return "bulletedList";
    case "code":
      return "code";
    case "image":
      return "image";
    default:
      return null;
  }
}

function toRecordBlockPatch(block: KnowledgeBlockRecord): Partial<Block> | null {
  switch (block.type) {
    case "paragraph":
      return {
        type: "text",
        content: block.text,
        richText: block.richText,
        textColor: block.textColor,
        backgroundColor: block.backgroundColor,
        textAlign: block.textAlign,
        checked: undefined,
        imageAssetId: undefined,
      };
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return {
        type: "heading",
        content: block.text,
        richText: block.richText,
        textColor: block.textColor,
        backgroundColor: block.backgroundColor,
        textAlign: block.textAlign,
        checked: undefined,
        imageAssetId: undefined,
      };
    case "todo":
      return {
        type: "todo",
        content: block.text,
        richText: block.richText,
        textColor: block.textColor,
        backgroundColor: block.backgroundColor,
        textAlign: block.textAlign,
        checked: block.checked,
        imageAssetId: undefined,
      };
    case "bulleted_list":
      return {
        type: "bulletedList",
        content: block.items[0] ?? "",
        textColor: block.textColor,
        backgroundColor: block.backgroundColor,
        textAlign: block.textAlign,
        richText: undefined,
        checked: undefined,
        imageAssetId: undefined,
      };
    case "code":
      return {
        type: "code",
        content: block.text,
        richText: undefined,
        textColor: undefined,
        backgroundColor: undefined,
        textAlign: undefined,
        checked: undefined,
        imageAssetId: undefined,
      };
    case "image":
      return {
        type: "image",
        content: block.caption,
        richText: undefined,
        textColor: undefined,
        backgroundColor: undefined,
        textAlign: undefined,
        checked: undefined,
        imageAssetId: block.assetId ?? undefined,
      };
    default:
      return null;
  }
}
