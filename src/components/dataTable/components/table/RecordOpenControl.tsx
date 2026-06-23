import { ArrowUpRight } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type RecordOpenControlVariant = "icon" | "label";

type RecordOpenSharedProps = {
  ariaLabel?: string;
  label?: string;
  title?: string;
  className?: string;
  variant?: RecordOpenControlVariant;
};

type RecordOpenButtonProps = RecordOpenSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

type RecordOpenLinkProps = RecordOpenSharedProps &
  Omit<LinkProps, "children" | "className" | "title" | "aria-label">;

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function getAccessibleLabel({
  ariaLabel,
  label,
}: Pick<RecordOpenSharedProps, "ariaLabel" | "label">) {
  return ariaLabel ?? label;
}

function RecordOpenContent({
  label,
  variant,
}: {
  label?: string;
  variant: RecordOpenControlVariant;
}) {
  return (
    <>
      <ArrowUpRight size={13} strokeWidth={2.1} aria-hidden="true" />
      {variant === "label" && label ? (
        <span className="record-open-control-label">{label}</span>
      ) : null}
    </>
  );
}

export function RecordOpenButton({
  ariaLabel,
  className,
  label,
  title,
  type = "button",
  variant = "icon",
  ...props
}: RecordOpenButtonProps) {
  const accessibleLabel = getAccessibleLabel({ ariaLabel, label });

  return (
    <button
      {...props}
      type={type}
      aria-label={accessibleLabel}
      title={title ?? accessibleLabel}
      className={joinClassNames(
        "record-open-control",
        variant === "icon"
          ? "record-open-control--icon"
          : "record-open-control--label",
        className,
      )}
    >
      <RecordOpenContent label={label} variant={variant} />
    </button>
  );
}

export function RecordOpenLink({
  ariaLabel,
  className,
  label,
  title,
  variant = "icon",
  ...props
}: RecordOpenLinkProps) {
  const accessibleLabel = getAccessibleLabel({ ariaLabel, label });

  return (
    <Link
      {...props}
      aria-label={accessibleLabel}
      title={title ?? accessibleLabel}
      className={joinClassNames(
        "record-open-control",
        variant === "icon"
          ? "record-open-control--icon"
          : "record-open-control--label",
        className,
      )}
    >
      <RecordOpenContent label={label} variant={variant} />
    </Link>
  );
}
