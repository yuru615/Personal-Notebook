import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Database,
  FileText,
  Search,
  Settings,
} from "lucide-react";

type WorkspaceShellProps = {
  databaseName: string;
  activePage: "database" | "record";
  databasePath?: string;
  recordTitle?: string;
  showSidebar?: boolean;
  children: ReactNode;
};

export default function WorkspaceShell({
  databaseName,
  activePage,
  databasePath = "/",
  recordTitle,
  showSidebar = true,
  children,
}: WorkspaceShellProps) {
  return (
    <div className={showSidebar ? "workspace-shell" : "workspace-shell workspace-shell--single"}>
      {showSidebar ? (
        <aside className="workspace-sidebar" aria-label="工作区导航">
          <div className="workspace-sidebar-header">
            <div className="workspace-avatar">WS</div>
            <div className="workspace-meta">
              <strong>实验软件</strong>
              <span>个人工作区</span>
            </div>
          </div>

          <div className="workspace-sidebar-group">
            <button type="button" className="workspace-sidebar-action">
              <Search size={14} strokeWidth={2} aria-hidden="true" />
              搜索
            </button>
            <button type="button" className="workspace-sidebar-action">
              <Settings size={14} strokeWidth={2} aria-hidden="true" />
              设置
            </button>
          </div>

          <div className="workspace-sidebar-group">
            <div className="workspace-sidebar-caption">页面</div>
            <Link
              to={databasePath}
              className={
                activePage === "database"
                  ? "workspace-nav-item is-active"
                  : "workspace-nav-item"
              }
            >
              <Database size={14} strokeWidth={2} aria-hidden="true" />
              {databaseName}
            </Link>
            {activePage === "record" ? (
              <div className="workspace-nav-subitem">
                <FileText size={14} strokeWidth={2} aria-hidden="true" />
                {recordTitle || "未命名记录"}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <div className="workspace-main">{children}</div>
    </div>
  );
}
