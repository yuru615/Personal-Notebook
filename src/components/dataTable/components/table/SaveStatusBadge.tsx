type SaveStatusBadgeProps = {
  status: "idle" | "saving" | "saved" | "failed";
};

const COPY: Record<SaveStatusBadgeProps["status"], string | null> = {
  idle: null,
  saving: "正在保存...",
  saved: "已保存",
  failed: "保存失败",
};

export default function SaveStatusBadge({ status }: SaveStatusBadgeProps) {
  const text = COPY[status];

  if (!text) {
    return null;
  }

  return (
    <span className={`save-status-badge save-status-badge--${status}`}>
      {text}
    </span>
  );
}
