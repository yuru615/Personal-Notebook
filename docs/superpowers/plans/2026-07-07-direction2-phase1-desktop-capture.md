# Direction 2 Phase 1 Desktop Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first desktop-capture closed loop: a fixed `收件箱` system page, a sidebar `系统` section, and tray actions for `打开知栖 / 新建笔记 / 打开收件箱 / 退出`.

**Architecture:** Keep `收件箱` as a normal page and record its identity in `WorkspaceSettings`, then repair it during bootstrap when missing. Reuse the existing frontend store for page creation and navigation, and let the Tauri tray talk to the frontend through small desktop events instead of adding a new Rust-side page model.

**Tech Stack:** React 19, TypeScript, Zustand vanilla, React Router, Vitest, Testing Library, Tauri 2, Rust

---

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
  - Add the `inboxPageId` workspace setting contract.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`
  - Make new workspaces start with a fixed `收件箱` page plus the existing default page.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
  - Normalize `inboxPageId`, repair missing inbox pages during bootstrap, and expose one small `ensureInboxPage()` action.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
  - Lock bootstrap repair and inbox recreation behavior.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.tsx`
  - Add the `系统` section, render the inbox there, and filter the inbox out of `我的页面`.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`
  - Cover the new section and no-duplicate rendering rules.
- Modify `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
  - Add `系统` copy.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
  - Add desktop tray event constants and listener registration for `新建笔记` and `打开收件箱`.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
  - Cover the new tray event bridge.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
  - Register tray handlers early, wait for bootstrap, create or open pages through the store, and navigate through the router once a page id is ready.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`
  - Cover tray-driven `新建笔记` and `打开收件箱`.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`
  - Replace the old tray menu with the new menu ids, emit frontend tray events, and keep quit behavior unchanged.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`
  - Record the user-visible desktop entry changes.

### Task 1: Add Inbox Settings And Bootstrap Repair

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing store tests**

Add these tests to `src/store/createWorkspaceStore.test.ts`:

```ts
it('creates and remembers an inbox page when bootstrapping a legacy workspace', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()

  const inboxPageId = store.getState().settings.inboxPageId
  const inboxPage = store.getState().pages.find((page) => page.id === inboxPageId)

  expect(inboxPageId).toBeTruthy()
  expect(inboxPage).toMatchObject({
    parentId: null,
    title: '收件箱',
  })
  expect(store.getState().currentPageId).toBe('page_1')
})

it('repairs a broken inboxPageId during bootstrap', async () => {
  const workspace = createWorkspace()
  workspace.settings = {
    ...workspace.settings,
    inboxPageId: 'page_missing_inbox',
  }

  const counted = createCountingRepository(workspace)
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()

  expect(store.getState().settings.inboxPageId).not.toBe('page_missing_inbox')
  expect(
    store.getState().pages.some((page) => page.id === store.getState().settings.inboxPageId),
  ).toBe(true)
})

it('recreates the inbox page on demand after the current inbox page is deleted', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  const firstInboxId = store.getState().settings.inboxPageId!

  await store.getState().deletePage(firstInboxId)
  const rebuiltInbox = await store.getState().ensureInboxPage()

  expect(rebuiltInbox.title).toBe('收件箱')
  expect(rebuiltInbox.id).not.toBe(firstInboxId)
  expect(store.getState().settings.inboxPageId).toBe(rebuiltInbox.id)
})
```

- [ ] **Step 2: Run the store test file and verify failure**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

- the new inbox tests fail
- the existing store tests still run

- [ ] **Step 3: Add the minimal inbox contract and repair logic**

Update `src/domain/types.ts`:

```ts
export interface WorkspaceSettings {
  lastOpenedPageId: PageId | null
  inboxPageId?: PageId | null
  sidebarLayout?: 'compact' | 'classic'
  sidebarWidth?: number
  pinnedSidebarItems?: SidebarPinnedItem[]
}
```

Update `src/domain/seed.ts` so new workspaces start with both pages:

```ts
const inboxPage: PageRecord = {
  id: createId('page'),
  parentId: null,
  title: '收件箱',
  icon: '📥',
  cover: null,
  properties: {},
  isFullWidth: false,
  isSmallText: false,
  fontFamily: 'default',
  showOutline: true,
  blocks: [],
  createdAt: now,
  updatedAt: now,
}

return {
  boards: [],
  dataTables: [],
  mindmaps: [],
  pages: [inboxPage, page],
  pageProperties: createDefaultPagePropertyDefinitions(now),
  settings: {
    lastOpenedPageId: page.id,
    inboxPageId: inboxPage.id,
    sidebarLayout: 'compact',
  },
}
```

Add the smallest possible repair path to `src/store/createWorkspaceStore.ts`:

```ts
function createSettings(
  lastOpenedPageId: PageId | null,
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']> = 'compact',
  sidebarWidth = 272,
  pinnedSidebarItems: SidebarPinnedItem[] = [],
  inboxPageId: PageId | null = null,
): WorkspaceSettings {
  return {
    lastOpenedPageId,
    inboxPageId,
    sidebarLayout,
    sidebarWidth,
    pinnedSidebarItems,
  }
}

function ensureInboxPageInSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const inboxPageId = snapshot.settings.inboxPageId
  const existingInbox = snapshot.pages.find((page) => page.id === inboxPageId)

  if (existingInbox) {
    return snapshot
  }

  const inboxPage = createPageRecord(undefined, '收件箱')
  inboxPage.icon = '📥'

  return {
    ...snapshot,
    pages: [inboxPage, ...snapshot.pages],
    settings: {
      ...snapshot.settings,
      inboxPageId: inboxPage.id,
    },
  }
}
```

Expose one store action:

```ts
ensureInboxPage: async () => {
  const state = get()
  const existingInbox = state.pages.find((page) => page.id === state.settings.inboxPageId)

  if (existingInbox) {
    return existingInbox
  }

  const inboxPage = createPageRecord(undefined, '收件箱')
  inboxPage.icon = '📥'
  const nextSettings = createSettings(
    state.settings.lastOpenedPageId,
    state.settings.sidebarLayout ?? 'compact',
    state.settings.sidebarWidth ?? 272,
    state.settings.pinnedSidebarItems ?? [],
    inboxPage.id,
  )

  const nextSnapshot = createSnapshotFromState({
    ...state,
    pages: [inboxPage, ...state.pages],
    settings: nextSettings,
  })

  pushUndoSnapshot(state)
  set({ saveStatus: 'saving' })
  await repository.save(nextSnapshot)
  set({
    boards: nextSnapshot.boards,
    pages: nextSnapshot.pages,
    settings: nextSettings,
    saveStatus: 'saved',
  })

  return inboxPage
}
```

- [ ] **Step 4: Re-run the focused inbox tests**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

- the new inbox tests pass
- the existing store tests stay green

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/seed.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: add inbox page bootstrap contract"
```

### Task 2: Render The System Section And Remove Inbox Duplication

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`

- [ ] **Step 1: Write the failing sidebar tests**

Add these tests to `src/components/sidebar/SidebarTree.test.tsx`:

```ts
it('renders the inbox page inside a system section', () => {
  render(
    <MemoryRouter>
      <SidebarTree
        pages={[
          { ...pages[0], id: 'page_inbox', title: '收件箱' },
          ...pages,
        ] as never}
        currentPageId="page_parent"
        inboxPageId="page_inbox"
        onCreatePage={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getByText('系统')).toBeInTheDocument()
  expect(screen.getByLabelText('系统')).toBeInTheDocument()
  expect(within(screen.getByLabelText('系统')).getByRole('link', { name: '收件箱' })).toBeInTheDocument()
})

it('does not render the inbox page again inside my pages', () => {
  render(
    <MemoryRouter>
      <SidebarTree
        pages={[
          { ...pages[0], id: 'page_inbox', title: '收件箱' },
          ...pages,
        ] as never}
        currentPageId="page_parent"
        inboxPageId="page_inbox"
        onCreatePage={vi.fn()}
      />
    </MemoryRouter>,
  )

  expect(screen.getAllByRole('link', { name: '收件箱' })).toHaveLength(1)
})

it('lets users collapse and expand the system section', async () => {
  const user = userEvent.setup()

  render(
    <MemoryRouter>
      <SidebarTree
        pages={[
          { ...pages[0], id: 'page_inbox', title: '收件箱' },
          ...pages,
        ] as never}
        currentPageId="page_parent"
        inboxPageId="page_inbox"
        onCreatePage={vi.fn()}
      />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '收起系统' }))
  expect(screen.queryByLabelText('系统')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '展开系统' }))
  expect(screen.getByLabelText('系统')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the sidebar test file and verify failure**

Run:

```bash
npm run test -- src/components/sidebar/SidebarTree.test.tsx
```

Expected:

- the new `系统 / 收件箱` tests fail
- the existing sidebar tests still run

- [ ] **Step 3: Implement the system section with one inbox prop**

Add copy in `src/ui/copy.ts`:

```ts
sidebar: {
  ariaLabel: '侧边栏',
  systemSection: '系统',
  search: '搜索',
  // keep the rest unchanged
}
```

Extend the `SidebarTree` props and section keys:

```ts
type SidebarSectionKey = 'system' | 'pinned' | 'shared' | 'my_pages'

interface SidebarTreeProps {
  pages: PageRecord[]
  inboxPageId?: PageId | null
  // keep the rest unchanged
}
```

Filter the main tree and render the inbox above it:

```ts
const systemInboxPage = useMemo(
  () => pages.find((page) => page.id === inboxPageId) ?? null,
  [inboxPageId, pages],
)

const visiblePages = useMemo(
  () =>
    buildVisiblePageItems(
      pages.filter((page) => page.id !== inboxPageId),
      expandedPageIds,
    ),
  [expandedPageIds, inboxPageId, pages],
)
```

Render the section before `星标置顶`:

```tsx
{renderSidebarSection({
  sectionKey: 'system',
  title: uiCopy.sidebar.systemSection,
  hidden: systemInboxPage === null,
  children: systemInboxPage ? (
    <div className="sidebar-tree" aria-label={uiCopy.sidebar.systemSection}>
      <NavLink to={`/pages/${systemInboxPage.id}`} className={({ isActive }) => getSidebarItemClassName(isActive)}>
        <span className="sidebar-tree-icon" aria-hidden="true">{systemInboxPage.icon ?? '📥'}</span>
        <span className="sidebar-tree-label">{systemInboxPage.title}</span>
      </NavLink>
    </div>
  ) : null,
})}
```

Pass the prop from `src/app/App.tsx`:

```tsx
<SidebarTree
  pages={pages}
  dataTables={dataTables}
  currentPageId={currentPageId}
  inboxPageId={state.settings.inboxPageId ?? null}
  // keep the rest unchanged
/>
```

- [ ] **Step 4: Re-run the sidebar tests**

Run:

```bash
npm run test -- src/components/sidebar/SidebarTree.test.tsx
```

Expected:

- the new system-section tests pass
- the existing sidebar tree coverage stays green

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/SidebarTree.tsx src/components/sidebar/SidebarTree.test.tsx src/ui/copy.ts src/app/App.tsx
git commit -m "feat: add system inbox section"
```

### Task 3: Bridge Tray Events To The Frontend Store And Router

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`

- [ ] **Step 1: Write the failing desktop event tests**

Add these tests to `src/lib/desktopLifecycle.test.ts`:

```ts
it('wires the tray new-note event to the provided handler', async () => {
  const onNewNote = vi.fn(async () => undefined)
  const onOpenInbox = vi.fn(async () => undefined)
  let newNoteHandler: (() => Promise<void>) | null = null

  mocks.listen.mockImplementation(async (event, handler) => {
    if (event === 'zhiqi://tray-new-note') {
      newNoteHandler = handler
    }
    return () => undefined
  })

  await registerDesktopTrayActions({ onNewNote, onOpenInbox })
  await newNoteHandler?.()

  expect(onNewNote).toHaveBeenCalledTimes(1)
})

it('wires the tray open-inbox event to the provided handler', async () => {
  const onNewNote = vi.fn(async () => undefined)
  const onOpenInbox = vi.fn(async () => undefined)
  let openInboxHandler: (() => Promise<void>) | null = null

  mocks.listen.mockImplementation(async (event, handler) => {
    if (event === 'zhiqi://tray-open-inbox') {
      openInboxHandler = handler
    }
    return () => undefined
  })

  await registerDesktopTrayActions({ onNewNote, onOpenInbox })
  await openInboxHandler?.()

  expect(onOpenInbox).toHaveBeenCalledTimes(1)
})
```

Extend `src/app/App.test.tsx` with tray navigation coverage:

```ts
const desktopLifecycle = vi.hoisted(() => ({
  registerDesktopPendingSaveFlush: vi.fn(async () => () => undefined),
  registerDesktopTrayActions: vi.fn(async () => () => undefined),
}))

it('creates and opens a new top-level note from the desktop tray action', async () => {
  const snapshot: WorkspaceSnapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page_root',
        parentId: null,
        title: 'Home',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: 'page_root' },
  }

  render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_root']} />)
  await screen.findByDisplayValue('Home')

  const handlers = desktopLifecycle.registerDesktopTrayActions.mock.calls.at(-1)?.[0]
  await handlers?.onNewNote()

  expect(await screen.findByDisplayValue('未命名')).toBeInTheDocument()
})

it('opens the inbox page from the desktop tray action', async () => {
  const snapshot: WorkspaceSnapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: 'page_root',
        parentId: null,
        title: 'Home',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-07T00:00:00.000Z',
        updatedAt: '2026-07-07T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: 'page_root' },
  }

  render(<App repository={createMemoryRepository(snapshot)} initialEntries={['/pages/page_root']} />)
  await screen.findByDisplayValue('Home')

  const handlers = desktopLifecycle.registerDesktopTrayActions.mock.calls.at(-1)?.[0]
  await handlers?.onOpenInbox()

  expect(await screen.findByDisplayValue('收件箱')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the desktop lifecycle and app tests and verify failure**

Run:

```bash
npm run test -- src/lib/desktopLifecycle.test.ts src/app/App.test.tsx
```

Expected:

- the new tray tests fail
- the existing close/quit lifecycle tests still run

- [ ] **Step 3: Add a separate tray-event bridge and route request flow**

In `src/lib/desktopLifecycle.ts`, add new event names and a tiny registrar:

```ts
export const DESKTOP_TRAY_NEW_NOTE_EVENT = 'zhiqi://tray-new-note'
export const DESKTOP_TRAY_OPEN_INBOX_EVENT = 'zhiqi://tray-open-inbox'

interface DesktopTrayHandlers {
  onNewNote: () => Promise<void> | void
  onOpenInbox: () => Promise<void> | void
}

export async function registerDesktopTrayActions({
  onNewNote,
  onOpenInbox,
}: DesktopTrayHandlers): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => undefined
  }

  const unlistenNewNote = await listen(DESKTOP_TRAY_NEW_NOTE_EVENT, async () => {
    await onNewNote()
  })
  const unlistenOpenInbox = await listen(DESKTOP_TRAY_OPEN_INBOX_EVENT, async () => {
    await onOpenInbox()
  })

  return () => {
    unlistenNewNote()
    unlistenOpenInbox()
  }
}
```

In `src/app/App.tsx`, keep routing imperative state tiny:

```ts
interface DesktopRouteRequest {
  pageId: string
  nonce: number
}

const [desktopRouteRequest, setDesktopRouteRequest] = useState<DesktopRouteRequest | null>(null)
```

Register tray actions early in `App`, wait for bootstrap, then use the store:

```ts
let unlistenDesktopTray: (() => void) | null = null

void registerDesktopTrayActions({
  onNewNote: async () => {
    await bootstrapPromiseRef.current
    const page = await store.getState().createPage(undefined, { setCurrent: true })
    setDesktopRouteRequest({ pageId: page.id, nonce: Date.now() })
  },
  onOpenInbox: async () => {
    await bootstrapPromiseRef.current
    const page = await store.getState().ensureInboxPage()
    await store.getState().setCurrentPage(page.id)
    setDesktopRouteRequest({ pageId: page.id, nonce: Date.now() })
  },
})
  .then((unlisten) => {
    if (isActive) {
      unlistenDesktopTray = unlisten
      return
    }

    unlisten()
  })
  .catch(() => undefined)
```

Pass the request into `AppRoutes` and navigate there:

```ts
useEffect(() => {
  if (!desktopRouteRequest) {
    return
  }

  navigate(`/pages/${desktopRouteRequest.pageId}`, { replace: false })
}, [desktopRouteRequest, navigate])
```

- [ ] **Step 4: Re-run the desktop tray tests**

Run:

```bash
npm run test -- src/lib/desktopLifecycle.test.ts src/app/App.test.tsx
```

Expected:

- the tray bridge tests pass
- the existing desktop close and quit lifecycle tests stay green

- [ ] **Step 5: Commit**

```bash
git add src/lib/desktopLifecycle.ts src/lib/desktopLifecycle.test.ts src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: wire tray actions to inbox and new notes"
```

### Task 4: Replace The Tauri Tray Menu With The New Desktop Entry Menu

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`

- [ ] **Step 1: Write the failing Rust tray mapping assertions**

Replace the tray menu mapping test in `src-tauri/src/lib.rs` with:

```rust
#[test]
fn maps_tray_menu_ids_to_actions() {
    assert_eq!(
        TrayMenuAction::from_menu_id("show-window"),
        Some(TrayMenuAction::ShowWindow)
    );
    assert_eq!(
        TrayMenuAction::from_menu_id("new-note"),
        Some(TrayMenuAction::NewNote)
    );
    assert_eq!(
        TrayMenuAction::from_menu_id("open-inbox"),
        Some(TrayMenuAction::OpenInbox)
    );
    assert_eq!(
        TrayMenuAction::from_menu_id("quit-app"),
        Some(TrayMenuAction::QuitApp)
    );
}
```

- [ ] **Step 2: Run the Rust test and verify failure**

Run:

```bash
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml maps_tray_menu_ids_to_actions
```

Expected:

- the new tray enum test fails because `new-note` and `open-inbox` do not exist yet

- [ ] **Step 3: Implement the new menu ids and event emission**

Update the constants and enum:

```rust
const TRAY_SHOW_WINDOW_ID: &str = "show-window";
const TRAY_NEW_NOTE_ID: &str = "new-note";
const TRAY_OPEN_INBOX_ID: &str = "open-inbox";
const TRAY_QUIT_APP_ID: &str = "quit-app";
const FRONTEND_TRAY_NEW_NOTE_EVENT: &str = "zhiqi://tray-new-note";
const FRONTEND_TRAY_OPEN_INBOX_EVENT: &str = "zhiqi://tray-open-inbox";

enum TrayMenuAction {
    ShowWindow,
    NewNote,
    OpenInbox,
    QuitApp,
}
```

Update the id mapping:

```rust
match id {
    TRAY_SHOW_WINDOW_ID => Some(Self::ShowWindow),
    TRAY_NEW_NOTE_ID => Some(Self::NewNote),
    TRAY_OPEN_INBOX_ID => Some(Self::OpenInbox),
    TRAY_QUIT_APP_ID => Some(Self::QuitApp),
    _ => None,
}
```

Replace the menu items in `setup_tray`:

```rust
let show_window = MenuItem::with_id(app, TRAY_SHOW_WINDOW_ID, "打开知栖", true, None::<&str>)?;
let new_note = MenuItem::with_id(app, TRAY_NEW_NOTE_ID, "新建笔记", true, None::<&str>)?;
let open_inbox = MenuItem::with_id(app, TRAY_OPEN_INBOX_ID, "打开收件箱", true, None::<&str>)?;
let quit_app = MenuItem::with_id(app, TRAY_QUIT_APP_ID, "退出", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&show_window, &new_note, &open_inbox, &separator, &quit_app])?;
```

Emit the frontend events after focusing the window:

```rust
fn show_window_and_emit<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event_name: &str) {
    show_main_window(app);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit(event_name, ());
    }
}

fn handle_tray_menu_action<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: TrayMenuAction) {
    match action {
        TrayMenuAction::ShowWindow => show_main_window(app),
        TrayMenuAction::NewNote => show_window_and_emit(app, FRONTEND_TRAY_NEW_NOTE_EVENT),
        TrayMenuAction::OpenInbox => show_window_and_emit(app, FRONTEND_TRAY_OPEN_INBOX_EVENT),
        TrayMenuAction::QuitApp => request_app_quit_after_frontend_flush(app),
    }
}
```

- [ ] **Step 4: Re-run the Rust tray tests**

Run:

```bash
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml maps_tray_menu_ids_to_actions
```

Expected:

- the tray mapping test passes

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: update tray menu for inbox flow"
```

### Task 5: Update The Change Log And Run Final Verification

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Add the update note**

Append a new top entry to `docs/updates.md` that says:

```md
## 2026-07-07 方向 2 第一阶段桌面入口

提交：未提交

简要描述：

把桌面端的方向 2 起步入口落地成最小闭环：左侧新增 `系统` 分组和固定 `收件箱`，托盘新增 `打开知栖 / 新建笔记 / 打开收件箱 / 退出`，并打通托盘动作到本地页面创建与跳转。

详细描述：

- `收件箱` 作为普通页面进入工作区设置管理，并在旧工作区缺失时自动修复。
- 左侧侧边栏新增 `系统` 分组，`收件箱` 不再重复显示在 `我的页面`。
- 托盘 `新建笔记` 会在 `我的页面` 顶层创建普通页面并立即打开。
- 托盘 `打开收件箱` 会在需要时修复 `收件箱`，然后直接跳转过去。
- 桌面事件桥继续沿用现有前端监听模式，没有引入第二套 Rust 侧页面模型。

验证情况：

- 已通过 inbox store 回归、SidebarTree 回归、desktopLifecycle 回归、App tray 路由回归。
- 已通过 Rust tray 菜单映射测试。
- 已通过 `npm run build`。
```

- [ ] **Step 2: Run the focused JS regression set**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts src/components/sidebar/SidebarTree.test.tsx src/lib/desktopLifecycle.test.ts src/app/App.test.tsx
```

Expected:

- all four focused test files pass

- [ ] **Step 3: Run the Rust tray regression**

Run:

```bash
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml maps_tray_menu_ids_to_actions
```

Expected:

- the tray mapping test passes

- [ ] **Step 4: Run the build**

Run:

```bash
npm run build
```

Expected:

- the frontend production build completes successfully

- [ ] **Step 5: Commit**

```bash
git add docs/updates.md
git commit -m "docs: record direction2 phase1 desktop entry"
```

## Self-Review

- Spec coverage:
  - fixed `收件箱` page contract: Task 1
  - sidebar `系统` section and no duplicate display: Task 2
  - tray-to-frontend bridge and bootstrap-safe handling: Task 3
  - new Tauri tray menu and event emission: Task 4
  - updates log and verification: Task 5
- Placeholder scan:
  - no `TODO` or `TBD`
  - every task names exact files and commands
  - every code-changing step includes a concrete snippet
- Type consistency:
  - `inboxPageId` is used consistently in settings, store, sidebar, and app routing
  - desktop tray event names are consistent between Rust and TypeScript

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-direction2-phase1-desktop-capture.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
