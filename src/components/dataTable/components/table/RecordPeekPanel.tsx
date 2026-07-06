import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getAssetUrl } from "../../../../lib/assets";
import RecordProperties from "../record/RecordProperties";
import type {
  AppState,
  Asset,
  Block,
  DatabaseRecord,
  Property,
} from "../../domain/types";
import { RecordOpenButton } from "./RecordOpenControl";
import type { TableOpenMode } from "./viewTypes";

type RecordPeekPanelProps = {
  state: AppState;
  record: DatabaseRecord;
  metadataProperties: Property[];
  blocks: Block[];
  assets: Record<string, Asset>;
  mode: Extract<TableOpenMode, "sidePeek" | "centerPeek">;
  onClose: () => void;
  onOpenFullPage: () => void;
  onTitleChange: (value: string) => void;
  onCellChange: (
    property: Property,
    value: string | boolean | string[],
  ) => void;
  onCreateOption?: (property: Property, label: string) => void;
  onDeleteOption?: (property: Property, optionId: string) => void;
};

function getBlockPreview(block: Block) {
  switch (block.type) {
    case "heading":
      return block.content || "空标题";
    case "todo":
      return block.content || "空待办";
    case "bulletedList":
      return block.content || "空列表";
    case "quote":
      return block.content || "空引用";
    case "code":
      return block.content || "空代码";
    case "image":
      return "图片";
    default:
      return block.content || "空文本";
  }
}

function AssetPreviewImage({ asset }: { asset: Asset }) {
  const [assetUrl, setAssetUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAssetUrl(null);

    void getAssetUrl(asset.id)
      .then((url) => {
        if (!cancelled) {
          setAssetUrl(url);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  return assetUrl ? (
    <img className="record-peek-image" src={assetUrl} alt={asset.name} />
  ) : (
    <p>图片加载中...</p>
  );
}

export default function RecordPeekPanel({
  state,
  record,
  metadataProperties,
  blocks,
  assets,
  mode,
  onClose,
  onOpenFullPage,
  onTitleChange,
  onCellChange,
  onCreateOption,
  onDeleteOption,
}: RecordPeekPanelProps) {
  const dialogLabel = mode === "sidePeek" ? "侧边预览" : "居中预览";
  const titleValue = record.title === "未命名记录" ? "" : record.title;

  return (
    <div
      className={
        mode === "sidePeek"
          ? "record-peek-overlay"
          : "record-peek-overlay is-center"
      }
    >
      <section
        role="dialog"
        aria-label={dialogLabel}
        className={
          mode === "sidePeek"
            ? "record-peek-panel"
            : "record-peek-panel is-center"
        }
      >
        <header className="record-peek-header">
          <div className="record-peek-caption">页面预览</div>
          <div className="record-peek-actions">
            <RecordOpenButton
              className="record-peek-open-button"
              variant="label"
              label="整页打开"
              onClick={onOpenFullPage}
            />
            <button
              type="button"
              className="toolbar-button toolbar-icon-button"
              aria-label="关闭预览"
              onClick={onClose}
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="record-peek-body">
          <div className="record-peek-title-row">
            <input
              aria-label="记录标题"
              className="record-page-title-input"
              value={titleValue}
              placeholder="未命名记录"
              onChange={(event) => onTitleChange(event.currentTarget.value)}
            />
          </div>

          <RecordProperties
            state={state}
            properties={metadataProperties}
            record={record}
            onCellChange={onCellChange}
            onCreateOption={onCreateOption}
            onDeleteOption={onDeleteOption}
          />

          <section className="record-peek-summary">
            <div className="record-peek-summary-header">页面内容</div>
            {blocks.length === 0 ? (
              <p className="record-empty-hint">页面还没有内容</p>
            ) : (
              <div className="record-peek-block-list">
                {blocks.slice(0, 4).map((block) => {
                  const asset = block.imageAssetId
                    ? assets[block.imageAssetId]
                    : undefined;

                  return (
                    <article key={block.id} className="record-peek-block">
                      <div className="record-peek-block-label">{block.type}</div>
                      {block.type === "image" && asset ? (
                        <AssetPreviewImage asset={asset} />
                      ) : (
                        <p>{getBlockPreview(block)}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
