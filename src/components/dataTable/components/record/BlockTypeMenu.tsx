import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockType } from "../../domain/types";

type BlockTypeMenuProps = {
  value: BlockType;
  onChange: (type: BlockType) => void;
};

const BLOCK_TYPE_LABEL = "\u5757\u7c7b\u578b";
const FLOATING_OFFSET = 6;
const VIEWPORT_MARGIN = 12;
const MENU_MIN_WIDTH = 188;

const BLOCK_TYPES: Array<{ type: BlockType; label: string; icon: string }> = [
  { type: "text", label: "\u6587\u672c", icon: "T" },
  { type: "heading", label: "\u6807\u9898", icon: "H1" },
  { type: "todo", label: "\u5f85\u529e", icon: "[]" },
  { type: "bulletedList", label: "\u5217\u8868", icon: "*" },
  { type: "quote", label: "\u5f15\u7528", icon: '""' },
  { type: "code", label: "\u4ee3\u7801", icon: "{}" },
  { type: "image", label: "\u56fe\u7247", icon: "IMG" },
];

export default function BlockTypeMenu({ value, onChange }: BlockTypeMenuProps) {
  const [open, setOpen] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState({
    top: 0,
    left: 0,
    width: MENU_MIN_WIDTH,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingLayerRef = useRef<HTMLDivElement | null>(null);
  const selectedType = BLOCK_TYPES.find((type) => type.type === value) ?? BLOCK_TYPES[0];

  const updateFloatingPosition = useCallback(() => {
    const triggerElement = triggerRef.current;

    if (!open || !triggerElement) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const desiredWidth = Math.max(MENU_MIN_WIDTH, triggerRect.width);
    const renderedWidth = floatingLayerRef.current?.offsetWidth ?? desiredWidth;
    const width = Math.max(desiredWidth, renderedWidth);
    const floatingHeight = floatingLayerRef.current?.offsetHeight ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = triggerRect.left;
    let top = triggerRect.bottom + FLOATING_OFFSET;

    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, viewportWidth - VIEWPORT_MARGIN - width),
    );

    if (floatingHeight > 0 && top + floatingHeight > viewportHeight - VIEWPORT_MARGIN) {
      const flippedTop = triggerRect.top - FLOATING_OFFSET - floatingHeight;

      top =
        flippedTop >= VIEWPORT_MARGIN
          ? flippedTop
          : Math.max(VIEWPORT_MARGIN, viewportHeight - VIEWPORT_MARGIN - floatingHeight);
    }

    setFloatingPosition((current) =>
      current.top === top && current.left === left && current.width === width
        ? current
        : { top, left, width },
    );
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updateFloatingPosition();
    const frameId = window.requestAnimationFrame(updateFloatingPosition);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, updateFloatingPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        triggerRef.current?.contains(target) ||
        floatingLayerRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
    };

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", updateFloatingPosition);
    window.addEventListener("scroll", updateFloatingPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", updateFloatingPosition);
      window.removeEventListener("scroll", updateFloatingPosition, true);
    };
  }, [open, updateFloatingPosition]);

  const renderMenu = () => {
    if (!open || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <div
        ref={floatingLayerRef}
        className="record-block-type-floating-layer"
        style={{
          top: `${floatingPosition.top}px`,
          left: `${floatingPosition.left}px`,
          width: `${floatingPosition.width}px`,
        }}
      >
        <div
          className="record-block-type-menu"
          role="listbox"
          aria-label={`${BLOCK_TYPE_LABEL}\u9009\u9879`}
        >
          {BLOCK_TYPES.map((type) => {
            const selected = type.type === value;

            return (
              <button
                key={type.type}
                type="button"
                className={
                  selected
                    ? "record-block-type-option is-selected"
                    : "record-block-type-option"
                }
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(type.type);
                  setOpen(false);
                }}
              >
                <span className="record-block-type-option-icon" aria-hidden="true">
                  {type.icon}
                </span>
                <span className="record-block-type-option-label">{type.label}</span>
                {selected ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="record-block-type-wrapper">
      <button
        ref={triggerRef}
        type="button"
        className="record-block-type"
        aria-label={BLOCK_TYPE_LABEL}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="record-block-type-current-icon" aria-hidden="true">
          {selectedType.icon}
        </span>
        <span className="record-block-type-current-label">{selectedType.label}</span>
        <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {renderMenu()}
    </div>
  );
}
