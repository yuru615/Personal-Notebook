import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type NotionSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type NotionSelectProps = {
  ariaLabel: string;
  listboxLabel?: string;
  value: string;
  options: NotionSelectOption[];
  placeholder: string;
  disabled?: boolean;
  triggerClassName?: string;
  optionClassName?: string;
  onChange: (value: string) => void;
};

type FloatingPosition = {
  top: number;
  left: number;
  width: number;
};

const VIEWPORT_MARGIN = 16;
const FLOATING_OFFSET = 4;
const MIN_POPOVER_WIDTH = 180;

export default function NotionSelect({
  ariaLabel,
  listboxLabel,
  value,
  options,
  placeholder,
  disabled = false,
  triggerClassName,
  optionClassName,
  onChange,
}: NotionSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const floatingLayerRef = useRef<HTMLDivElement | null>(null);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition>({
    top: 0,
    left: 0,
    width: MIN_POPOVER_WIDTH,
  });
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value);

  const updateFloatingPosition = useCallback(() => {
    const triggerElement = triggerRef.current;

    if (!open || !triggerElement) {
      return;
    }

    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const renderedWidth = floatingLayerRef.current?.offsetWidth ?? 0;
    const width = Math.max(MIN_POPOVER_WIDTH, triggerRect.width, renderedWidth);
    const floatingHeight = floatingLayerRef.current?.offsetHeight ?? 0;
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
          : Math.max(
              VIEWPORT_MARGIN,
              viewportHeight - VIEWPORT_MARGIN - floatingHeight,
            );
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
  }, [open, options, updateFloatingPosition, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleDocumentMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target;

      if (
        target instanceof Node &&
        (triggerRef.current?.contains(target) ||
          floatingLayerRef.current?.contains(target) ||
          containerRef.current?.contains(target))
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

    const syncFloatingPosition = () => {
      updateFloatingPosition();
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", syncFloatingPosition);
    window.addEventListener("scroll", syncFloatingPosition, true);

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", syncFloatingPosition);
      window.removeEventListener("scroll", syncFloatingPosition, true);
    };
  }, [open, updateFloatingPosition]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  const containerClassName = open ? "notion-select is-open" : "notion-select";
  const triggerClasses = [
    selectedOption ? "notion-select-trigger" : "notion-select-trigger is-placeholder",
    triggerClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        className={triggerClasses}
        onClick={() => {
          if (disabled) {
            return;
          }

          setOpen((current) => !current);
        }}
      >
        <span className="notion-select-trigger-label">
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={floatingLayerRef}
              className="notion-select-floating-layer"
              style={{
                top: `${floatingPosition.top}px`,
                left: `${floatingPosition.left}px`,
                width: `${floatingPosition.width}px`,
              }}
            >
              <div
                id={listboxId}
                role="listbox"
                aria-label={listboxLabel ?? `${ariaLabel}选项`}
                className="notion-select-popover"
              >
                {options.map((option) => {
                  const isSelected = option.value === value;
                  const optionClasses = [
                    isSelected ? "notion-select-option is-selected" : "notion-select-option",
                    optionClassName,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <button
                      key={`${ariaLabel}-${option.value || "empty"}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      className={optionClasses}
                      onClick={() => {
                        if (option.disabled) {
                          return;
                        }

                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span>{option.label}</span>
                      {isSelected ? (
                        <Check size={14} strokeWidth={2} aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
