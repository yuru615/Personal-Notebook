import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockType } from "../../domain/types";

type RecordInsertMenuProps = {
  onSelect: (type: BlockType) => void;
  triggerLabel?: string;
  triggerText?: string | null;
  triggerClassName?: string;
  triggerPlusClassName?: string;
  menuClassName?: string;
};

const MENU_LABEL = "\u6dfb\u52a0\u5185\u5bb9";
const FLOATING_OFFSET = 6;
const VIEWPORT_MARGIN = 12;
const MENU_MIN_WIDTH = 220;

const OPTIONS: Array<{ type: BlockType; label: string; icon: string }> = [
  { type: "text", label: "\u6587\u672c", icon: "T" },
  { type: "heading", label: "\u6807\u9898", icon: "H1" },
  { type: "todo", label: "\u5f85\u529e", icon: "[]" },
  { type: "bulletedList", label: "\u5217\u8868", icon: "*" },
  { type: "quote", label: "\u5f15\u7528", icon: '""' },
  { type: "code", label: "\u4ee3\u7801", icon: "{}" },
  { type: "image", label: "\u56fe\u7247", icon: "IMG" },
];

export default function RecordInsertMenu({
  onSelect,
  triggerLabel = MENU_LABEL,
  triggerText,
  triggerClassName = "toolbar-button",
  triggerPlusClassName = "record-insert-trigger-plus",
  menuClassName,
}: RecordInsertMenuProps) {
  const [open, setOpen] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState({
    top: 0,
    left: 0,
    width: MENU_MIN_WIDTH,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingLayerRef = useRef<HTMLDivElement | null>(null);
  const triggerContent = triggerText === undefined ? triggerLabel : triggerText;

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
        className="record-insert-floating-layer"
        style={{
          top: `${floatingPosition.top}px`,
          left: `${floatingPosition.left}px`,
          width: `${floatingPosition.width}px`,
        }}
      >
        <div
          className={menuClassName ? `record-insert-menu ${menuClassName}` : "record-insert-menu"}
          role="menu"
          aria-label={`${triggerLabel}\u83dc\u5355`}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              className="record-insert-option"
              role="menuitem"
              onClick={() => {
                onSelect(option.type);
                setOpen(false);
              }}
            >
              <span className="record-insert-icon" aria-hidden="true">
                {option.icon}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="record-insert-wrapper">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className={triggerPlusClassName} aria-hidden="true">
          +
        </span>
        {triggerContent ? (
          <span className="record-insert-trigger-text">{triggerContent}</span>
        ) : null}
      </button>
      {renderMenu()}
    </div>
  );
}
