import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

type RecordHeaderProps = {
  databaseName: string;
  databasePath?: string;
  showNavigation?: boolean;
  title: string;
  onTitleChange: (value: string) => void;
};

const BACK_LABEL = "返回表格";
const TITLE_LABEL = "记录标题";
const UNTITLED = "未命名记录";

export default function RecordHeader({
  databaseName,
  databasePath = "/",
  showNavigation = true,
  title,
  onTitleChange,
}: RecordHeaderProps) {
  const titleValue = title === UNTITLED ? "" : title;

  return (
    <header className="record-page-header">
      {showNavigation ? (
        <>
          <div className="record-page-back">
            <Link to={databasePath} className="record-back-link">
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
              {BACK_LABEL}
            </Link>
          </div>
          <div className="record-page-breadcrumb">
            <span>{databaseName}</span>
            <span>/</span>
            <span>记录页</span>
          </div>
        </>
      ) : null}
      <div className="record-page-title-row">
        <input
          aria-label={TITLE_LABEL}
          className="record-page-title-input"
          value={titleValue}
          placeholder={UNTITLED}
          onChange={(event) => onTitleChange(event.currentTarget.value)}
        />
      </div>
    </header>
  );
}
