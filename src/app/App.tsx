export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="侧边栏">
        <div className="sidebar-group">
          <button type="button" className="sidebar-link">
            搜索
          </button>
          <button type="button" className="sidebar-link">
            首页
          </button>
        </div>
        <div className="sidebar-group">
          <button type="button" className="sidebar-link">
            新建页面
          </button>
        </div>
      </aside>

      <main className="page-panel">
        <div className="page-empty">未选择页面</div>
      </main>
    </div>
  )
}

export default App
