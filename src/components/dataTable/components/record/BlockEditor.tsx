import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import type { Asset, Block, BlockType } from "../../domain/types";
import BlockTypeMenu from "./BlockTypeMenu";
import ImageBlock from "./ImageBlock";
import RecordInsertMenu from "./RecordInsertMenu";

const BLOCK_CONTENT_LABEL = "\u5757\u5185\u5bb9";
const UPLOAD_IMAGE_LABEL = "\u4e0a\u4f20\u56fe\u7247";
const INSERT_BELOW_LABEL = "\u5728\u4e0b\u65b9\u6dfb\u52a0\u5185\u5bb9";
const MOVE_UP_LABEL = "\u4e0a\u79fb";
const MOVE_DOWN_LABEL = "\u4e0b\u79fb";
const DELETE_LABEL = "\u5220\u9664";
const HEADING_PLACEHOLDER = "\u6807\u9898";
const TODO_PLACEHOLDER = "\u5f85\u529e\u4e8b\u9879";
const TODO_CHECKBOX_LABEL = "\u5f85\u529e\u5b8c\u6210\u72b6\u6001";
const QUOTE_PLACEHOLDER = "\u5f15\u7528\u5185\u5bb9";
const CODE_PLACEHOLDER = "\u4ee3\u7801";
const LIST_ITEM_PLACEHOLDER = "\u5217\u8868\u9879";
const TEXT_PLACEHOLDER =
  "\u8f93\u5165\u6587\u5b57\uff0c\u6216\u8f93\u5165 / \u67e5\u770b\u547d\u4ee4...";

type BlockEditorProps = {
  block: Block;
  asset?: Asset;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (content: string) => void;
  onTypeChange: (type: BlockType) => void;
  onCheckedChange: (checked: boolean) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertBelow: (type: BlockType) => void;
  onImageUpload?: (file: File) => void;
};

export default function BlockEditor({
  block,
  asset,
  canMoveUp,
  canMoveDown,
  onChange,
  onTypeChange,
  onCheckedChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onInsertBelow,
  onImageUpload,
}: BlockEditorProps) {
  return (
    <article className="record-block">
      <div className="record-block-left-rail">
        <RecordInsertMenu
          onSelect={onInsertBelow}
          triggerLabel={INSERT_BELOW_LABEL}
          triggerText={null}
          triggerClassName="record-inline-insert-trigger"
          triggerPlusClassName="record-inline-insert-plus"
          menuClassName="record-inline-insert-menu"
        />
        <span className="record-block-drag" aria-hidden="true">
          <GripVertical size={14} strokeWidth={2} />
        </span>
        <BlockTypeMenu value={block.type} onChange={onTypeChange} />
        <div className="record-block-actions">
          <button
            type="button"
            className="record-block-action-icon-button"
            aria-label={MOVE_UP_LABEL}
            title={MOVE_UP_LABEL}
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            <ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="record-block-action-icon-button"
            aria-label={MOVE_DOWN_LABEL}
            title={MOVE_DOWN_LABEL}
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            <ArrowDown size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="record-block-action-icon-button"
            aria-label={DELETE_LABEL}
            title={DELETE_LABEL}
            onClick={onDelete}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {block.type === "heading" ? (
        <input
          type="text"
          aria-label={BLOCK_CONTENT_LABEL}
          className="record-block-textarea record-block-heading"
          value={block.content}
          placeholder={HEADING_PLACEHOLDER}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      ) : block.type === "image" ? (
        <div className="record-image-upload-area">
          {asset ? (
            <ImageBlock
              src={asset.dataUrl}
              alt={asset.name}
              onReplace={onImageUpload}
            />
          ) : (
            <label className="record-image-upload">
              <span>{`+ ${UPLOAD_IMAGE_LABEL}`}</span>
              <input
                aria-label={UPLOAD_IMAGE_LABEL}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    onImageUpload?.(file);
                  }
                }}
              />
            </label>
          )}
        </div>
      ) : block.type === "todo" ? (
        <div
          className={`record-block-todo${block.checked ? " is-checked" : ""}`}
        >
          <input
            aria-label={TODO_CHECKBOX_LABEL}
            className="record-block-checkbox"
            type="checkbox"
            checked={Boolean(block.checked)}
            onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          />
          <input
            type="text"
            aria-label={BLOCK_CONTENT_LABEL}
            className="record-block-textarea"
            value={block.content}
            placeholder={TODO_PLACEHOLDER}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : block.type === "quote" ? (
        <div className="record-block-quote">
          <textarea
            aria-label={BLOCK_CONTENT_LABEL}
            className="record-block-textarea record-block-quote-text"
            value={block.content}
            rows={2}
            placeholder={QUOTE_PLACEHOLDER}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : block.type === "code" ? (
        <div className="record-block-code">
          <textarea
            aria-label={BLOCK_CONTENT_LABEL}
            className="record-block-textarea record-block-code-text"
            value={block.content}
            rows={4}
            placeholder={CODE_PLACEHOLDER}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : block.type === "bulletedList" ? (
        <div className="record-block-list-item">
          <span className="record-block-bullet" aria-hidden="true">
            *
          </span>
          <input
            type="text"
            aria-label={BLOCK_CONTENT_LABEL}
            className="record-block-textarea"
            value={block.content}
            placeholder={LIST_ITEM_PLACEHOLDER}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : (
        <textarea
          aria-label={BLOCK_CONTENT_LABEL}
          className="record-block-textarea"
          value={block.content}
          rows={1}
          placeholder={TEXT_PLACEHOLDER}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </article>
  );
}
