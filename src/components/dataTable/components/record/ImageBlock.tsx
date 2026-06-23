import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ImageBlockProps = {
  src: string;
  alt: string;
  onReplace?: (file: File) => void;
};

const OPEN_IMAGE_PREVIEW_LABEL = "打开图片预览";
const IMAGE_PREVIEW_DIALOG = "图片预览";
const CLOSE_IMAGE_PREVIEW_LABEL = "关闭图片预览";
const REPLACE_IMAGE_LABEL = "替换图片";
const INLINE_REPLACE_LABEL = "替换";

function ReplaceImageAction({
  className,
  onReplace,
}: {
  className: string;
  onReplace: (file: File) => void;
}) {
  return (
    <label className={className}>
      <span>{INLINE_REPLACE_LABEL}</span>
      <input
        aria-label={REPLACE_IMAGE_LABEL}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            onReplace(file);
          }
        }}
      />
    </label>
  );
}

export default function ImageBlock({ src, alt, onReplace }: ImageBlockProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPreviewOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPreviewOpen]);

  return (
    <>
      <figure className="record-image-figure">
        <div className="record-image-surface">
          <button
            type="button"
            className="record-image-preview-trigger"
            aria-label={OPEN_IMAGE_PREVIEW_LABEL}
            onClick={() => setIsPreviewOpen(true)}
          >
            <img className="record-image" src={src} alt={alt} />
          </button>
          {onReplace ? (
            <div className="record-image-inline-toolbar">
              <ReplaceImageAction
                className="record-image-inline-action"
                onReplace={onReplace}
              />
            </div>
          ) : null}
        </div>
        <figcaption className="record-image-caption">
          <span className="record-image-caption-name" title={alt}>
            {alt}
          </span>
        </figcaption>
      </figure>

      {isPreviewOpen
        ? createPortal(
            <div
              className="record-image-preview-overlay"
              onClick={() => setIsPreviewOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={IMAGE_PREVIEW_DIALOG}
                className="record-image-preview-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="record-image-preview-header">
                  <span className="record-image-preview-name" title={alt}>
                    {alt}
                  </span>
                  <div className="record-image-preview-actions">
                    {onReplace ? (
                      <ReplaceImageAction
                        className="record-image-preview-action"
                        onReplace={onReplace}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="record-image-preview-action"
                      aria-label={CLOSE_IMAGE_PREVIEW_LABEL}
                      onClick={() => setIsPreviewOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                </div>
                <div className="record-image-preview-body">
                  <img
                    className="record-image-preview-image"
                    src={src}
                    alt={alt}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
