import type { ReactNode } from "react";

type ToolbarPopoverProps = {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function ToolbarPopover({
  title,
  children,
  className,
  bodyClassName,
}: ToolbarPopoverProps) {
  const popoverClassName = className
    ? `database-toolbar-popover ${className}`
    : "database-toolbar-popover";
  const bodyClassNames = bodyClassName
    ? `database-toolbar-popover-body ${bodyClassName}`
    : "database-toolbar-popover-body";

  return (
    <section className={popoverClassName} aria-label={title}>
      <div className="database-toolbar-popover-header">
        <h2>{title}</h2>
      </div>
      <div className={bodyClassNames}>{children}</div>
    </section>
  );
}
