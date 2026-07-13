# Settings Center Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first working settings center page that centralizes current low-risk settings: sidebar layout and width, page defaults for new pages, workspace inbox and clipboard-capture preferences, import/export and cleanup actions, and one real app-level close-window behavior setting.

**Architecture:** Reuse the existing app shell, router, workspace store, and `zhiqi_settings` key-value table instead of inventing a second configuration stack. Keep workspace-scoped behavior inside `WorkspaceSettings`, persist app-only behavior through a small `AppSettings` repository, and make page defaults apply only when creating new pages or child pages so existing pages keep their explicit display values.

**Tech Stack:** React 19, TypeScript, Zustand vanilla, React Router, Vitest, Testing Library, Tauri 2, Rust, SQLite

---

## Scope Notes

- This plan only covers Phase 1 from `E:\Workspace\个人知识库-桌面端\docs\superpowers\specs\2026-07-08-settings-center-design.md`.
- Search tuning, backup scheduling, tray visibility toggles, startup behavior, and deeper desktop workflows stay out of this plan and should land in later follow-up plans.
- The plan intentionally prefers the smallest stable slice:
  - add one real app-level setting: close-window behavior
  - reuse the already-grounded workspace setting: clipboard capture mode
  - wire existing import/export/cleanup actions into the new settings surface instead of re-implementing them

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
  - Add shared settings contracts: `AppSettings`, `AppCloseAction`, `ClipboardCaptureMode`, and `PageDisplayDefaults`.
- Modify `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`
  - Centralize default page display values so the seed workspace and future page creation use the same defaults.
- Create `E:\Workspace\个人知识库-桌面端\src\lib\appSettingsRepository.ts`
  - Add a tiny app-settings persistence wrapper with Tauri and browser fallbacks.
- Create `E:\Workspace\个人知识库-桌面端\src\lib\appSettingsRepository.test.ts`
  - Lock browser fallback defaults and save behavior.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.ts`
  - Add `loadAppSettings()` and `saveAppSettings()` Tauri command wrappers.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`
  - Cover the new Tauri command names and payload shapes.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
  - Hold normalized `appSettings`, normalize expanded `WorkspaceSettings`, apply page defaults to new pages, and expose focused settings actions.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
  - Cover app settings defaults, page defaults behavior, and the already-added clipboard capture setting path.
- Create `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.tsx`
  - Render the settings page shell, left navigation, and Phase 1 settings panels.
- Create `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.test.tsx`
  - Cover section switching and the key form controls.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.tsx`
  - Add a stable `设置` entry to the existing sidebar utility menu.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`
  - Cover the new menu entry and navigation hook.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
  - Respect the app close-action setting when the desktop window close event fires.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
  - Cover both `hide_to_tray` and `quit` close paths.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
  - Create the `/settings/:section?` route, wire the new settings page, pass existing archive and cleanup actions through, and feed close-action state into desktop lifecycle registration.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`
  - Cover direct settings routing and entry from the sidebar utility menu.
- Modify `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
  - Add the new settings labels and category copy.
- Modify `E:\Workspace\个人知识库-桌面端\src\styles\index.css`
  - Add the settings center layout and control styling.
- Create `E:\Workspace\个人知识库-桌面端\src\styles\settingsCenterLayout.test.ts`
  - Lock the page shell and left-nav layout rules.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`
  - Define Rust-side `AppSettings`.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`
  - Expose `load_app_settings` and `save_app_settings`.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`
  - Persist app settings through a second `zhiqi_settings` record id and add round-trip regression tests.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`
  - Register the new Tauri commands.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`
  - Record the new settings center and Phase 1 behavior changes before commit.

### Task 1: Add TypeScript Settings Contracts And App Settings Repository

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\types.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\lib\storageClient.test.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\lib\appSettingsRepository.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\lib\appSettingsRepository.test.ts`

- [ ] **Step 1: Write the failing storage client and app settings repository tests**

Add this test to `src/lib/storageClient.test.ts`:

```ts
it('loads and saves app settings through dedicated Tauri commands', async () => {
  const appSettings = {
    closeAction: 'hide_to_tray' as const,
  }

  eventApi.invoke.mockResolvedValueOnce(appSettings).mockResolvedValueOnce(undefined)

  const client = createTauriStorageClient()

  await expect(client.loadAppSettings()).resolves.toEqual(appSettings)
  await client.saveAppSettings(appSettings)

  expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'load_app_settings')
  expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'save_app_settings', {
    settings: appSettings,
  })
})
```

Create `src/lib/appSettingsRepository.test.ts` with:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createAppSettingsRepository } from './appSettingsRepository'

describe('appSettingsRepository', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns normalized defaults when browser storage is empty', async () => {
    const repository = createAppSettingsRepository({ isDesktop: false })

    await expect(repository.load()).resolves.toEqual({
      closeAction: 'hide_to_tray',
    })
  })

  it('persists browser app settings as a standalone document', async () => {
    const repository = createAppSettingsRepository({ isDesktop: false })

    await repository.save({
      closeAction: 'quit',
    })

    await expect(repository.load()).resolves.toEqual({
      closeAction: 'quit',
    })
  })
})
```

- [ ] **Step 2: Run the targeted frontend tests and verify failure**

Run:

```bash
npm run test -- src/lib/storageClient.test.ts src/lib/appSettingsRepository.test.ts
```

Expected:

- `storageClient.test.ts` fails because `loadAppSettings` and `saveAppSettings` do not exist yet
- `appSettingsRepository.test.ts` fails because the new repository file does not exist yet

- [ ] **Step 3: Add the minimal shared settings contracts and browser repository**

Update `src/domain/types.ts` with the new settings types:

```ts
export type PageFontFamily = 'default' | 'serif' | 'mono'
export type ClipboardCaptureMode = 'off' | 'prompt_to_inbox'
export type AppCloseAction = 'hide_to_tray' | 'quit'

export interface PageDisplayDefaults {
  isFullWidth: boolean
  isSmallText: boolean
  fontFamily: PageFontFamily
  showOutline: boolean
}

export interface AppSettings {
  closeAction?: AppCloseAction
}

export interface WorkspaceSettings {
  lastOpenedPageId: PageId | null
  inboxPageId?: PageId | null
  sidebarLayout?: 'compact' | 'classic'
  sidebarWidth?: number
  pinnedSidebarItems?: SidebarPinnedItem[]
  clipboardCaptureMode?: ClipboardCaptureMode
  pageDefaults?: Partial<PageDisplayDefaults>
}
```

Create `src/lib/appSettingsRepository.ts`:

```ts
import type { AppSettings } from '../domain/types'
import { createTauriStorageClient, type WorkspaceStorageClient } from './storageClient'
import { isDesktopRuntime } from './fileAccess'

const BROWSER_APP_SETTINGS_STORAGE_KEY = 'zhiqi.app.settings.v1'

export interface AppSettingsRepository {
  load(): Promise<AppSettings | null>
  save(settings: AppSettings): Promise<void>
}

interface CreateAppSettingsRepositoryOptions {
  client?: WorkspaceStorageClient
  isDesktop?: boolean
}

export function createAppSettingsRepository({
  client,
  isDesktop = isDesktopRuntime(),
}: CreateAppSettingsRepositoryOptions = {}): AppSettingsRepository {
  if (!isDesktop) {
    return {
      async load() {
        const value = window.localStorage.getItem(BROWSER_APP_SETTINGS_STORAGE_KEY)
        return value ? (JSON.parse(value) as AppSettings) : null
      },
      async save(settings) {
        window.localStorage.setItem(BROWSER_APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      },
    }
  }

  client ??= createTauriStorageClient()

  return {
    load() {
      return client.loadAppSettings()
    },
    save(settings) {
      return client.saveAppSettings(settings)
    },
  }
}
```

Extend `WorkspaceStorageClient` and `createTauriStorageClient()` in `src/lib/storageClient.ts`:

```ts
export interface WorkspaceStorageClient {
  exportWorkspaceBackup(): Promise<WorkspaceSnapshot | null>
  replaceWorkspaceBackup(snapshot: WorkspaceSnapshot): Promise<void>
  loadAppSettings(): Promise<AppSettings | null>
  saveAppSettings(settings: AppSettings): Promise<void>
  // ...
}

loadAppSettings() {
  return invoke<AppSettings | null>('load_app_settings')
},

saveAppSettings(settings) {
  return invoke<void>('save_app_settings', { settings })
},
```

- [ ] **Step 4: Re-run the targeted frontend tests**

Run:

```bash
npm run test -- src/lib/storageClient.test.ts src/lib/appSettingsRepository.test.ts
```

Expected:

- both new tests pass
- no unrelated files fail in this subset

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/lib/storageClient.ts src/lib/storageClient.test.ts src/lib/appSettingsRepository.ts src/lib/appSettingsRepository.test.ts
git commit -m "feat: add app settings contracts and repository"
```

### Task 2: Persist App Settings In Tauri Storage

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\models.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\commands.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\storage\mod.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`

- [ ] **Step 1: Write the failing Rust persistence regression**

Add this test to `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn saves_and_loads_app_settings_independently_from_workspace_settings() {
    let storage = Storage::open_in_memory_for_tests().expect("storage opens");
    let settings = AppSettings {
        close_action: Some("hide_to_tray".to_string()),
    };

    storage
        .save_app_settings(&settings)
        .expect("save app settings");

    assert_eq!(
        storage.load_app_settings().expect("load app settings"),
        Some(settings)
    );
    assert_eq!(storage.load_settings().expect("load workspace settings"), None);
}
```

- [ ] **Step 2: Run the Rust test and verify failure**

Run:

```bash
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml saves_and_loads_app_settings_independently_from_workspace_settings
```

Expected:

- the new test fails because `AppSettings`, `save_app_settings`, and `load_app_settings` do not exist yet

- [ ] **Step 3: Add the Rust-side app settings model and commands**

Add the model in `src-tauri/src/storage/models.rs`:

```rust
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_action: Option<String>,
}
```

Add a separate settings id and storage methods in `src-tauri/src/storage/mod.rs`:

```rust
const APP_SETTINGS_ID: &str = "appSettings";

fn save_app_settings(&self, settings: &AppSettings) -> StorageResult<()> {
    self.connection.execute(
        "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)
          ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
        params![APP_SETTINGS_ID, serde_json::to_string(settings)?],
    )?;
    Ok(())
}

fn load_app_settings(&self) -> StorageResult<Option<AppSettings>> {
    self.connection
        .query_row(
            "SELECT record_json FROM zhiqi_settings WHERE id = ?1",
            [APP_SETTINGS_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .map(|json| serde_json::from_str::<AppSettings>(&json).map_err(Into::into))
        .transpose()
}
```

Expose Tauri commands in `src-tauri/src/storage/commands.rs`:

```rust
#[tauri::command]
pub fn load_app_settings(state: State<'_, StorageState>) -> Result<Option<AppSettings>, String> {
    state
        .0
        .load_app_settings()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_app_settings(state: State<'_, StorageState>, settings: AppSettings) -> Result<(), String> {
    state
        .0
        .save_app_settings(&settings)
        .map_err(|error| error.to_string())
}
```

Register the commands in `src-tauri/src/lib.rs`:

```rust
storage::commands::load_app_settings,
storage::commands::save_app_settings,
```

- [ ] **Step 4: Re-run the Rust regression and the storage client tests**

Run:

```bash
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml saves_and_loads_app_settings_independently_from_workspace_settings
npm run test -- src/lib/storageClient.test.ts
```

Expected:

- the Rust app-settings regression passes
- the storage client test still passes against the same command names

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/storage/models.rs src-tauri/src/storage/commands.rs src-tauri/src/storage/mod.rs src-tauri/src/lib.rs
git commit -m "feat: persist app settings in tauri storage"
```

### Task 3: Normalize Store Settings And Apply Page Defaults To New Pages Only

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\domain\seed.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`

- [ ] **Step 1: Write the failing store tests**

Add this helper near the top of `src/store/createWorkspaceStore.test.ts`:

```ts
function createMemoryAppSettingsRepository(initial: AppSettings | null = null) {
  let settings = initial ? structuredClone(initial) : null
  let saveCalls = 0

  return {
    repository: {
      async load() {
        return settings
      },
      async save(next: AppSettings) {
        settings = structuredClone(next)
        saveCalls += 1
      },
    },
    getSettings() {
      return settings
    },
    getSaveCalls() {
      return saveCalls
    },
  }
}
```

Add these tests:

```ts
it('loads app settings defaults and persists close action changes', async () => {
  const counted = createCountingRepository(createWorkspace())
  const appSettings = createMemoryAppSettingsRepository()
  const store = createWorkspaceStore(counted.repository, appSettings.repository as never)

  await store.getState().bootstrap()

  expect(store.getState().appSettings.closeAction).toBe('hide_to_tray')

  await store.getState().setAppCloseAction('quit')

  expect(store.getState().appSettings.closeAction).toBe('quit')
  expect(appSettings.getSettings()).toEqual({ closeAction: 'quit' })
  expect(appSettings.getSaveCalls()).toBe(1)
})

it('applies workspace page defaults to new top-level pages without rewriting existing pages', async () => {
  const counted = createCountingRepository(createWorkspace())
  const appSettings = createMemoryAppSettingsRepository()
  const store = createWorkspaceStore(counted.repository, appSettings.repository as never)

  await store.getState().bootstrap()
  await store.getState().setPageDefaults({
    isFullWidth: true,
    isSmallText: true,
    fontFamily: 'serif',
    showOutline: false,
  })

  const created = await store.getState().createPage(undefined, { setCurrent: false })
  const original = store.getState().pages.find((page) => page.id === 'page_1')

  expect(created).toMatchObject({
    isFullWidth: true,
    isSmallText: true,
    fontFamily: 'serif',
    showOutline: false,
  })
  expect(original).toMatchObject({
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
  })
})
```

Keep the already-present clipboard capture regression in this file as part of the red-to-green loop:

```ts
it("defaults clipboard capture mode to 'off' and persists changes", async () => {
  // existing test body stays in place
})
```

- [ ] **Step 2: Run the store test file and verify failure**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

- the new app settings and page defaults tests fail
- the clipboard capture test still fails until the settings normalization path is extended

- [ ] **Step 3: Add normalized defaults, focused settings actions, and new-page wiring**

In `src/domain/seed.ts`, add shared defaults:

```ts
import type { PageDisplayDefaults, PageRecord, WorkspaceSnapshot } from './types'

export const DEFAULT_PAGE_DISPLAY_DEFAULTS: PageDisplayDefaults = {
  isFullWidth: false,
  isSmallText: false,
  fontFamily: 'default',
  showOutline: true,
}

export function createPageWithDefaults(
  page: Pick<PageRecord, 'id' | 'parentId' | 'title' | 'icon' | 'cover' | 'blocks' | 'createdAt' | 'updatedAt'>,
  defaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
): PageRecord {
  return {
    ...page,
    properties: {},
    ...defaults,
  }
}
```

In `src/store/createWorkspaceStore.ts`, extend the store contract:

```ts
import type { AppSettings, AppCloseAction, ClipboardCaptureMode, PageDisplayDefaults } from '../domain/types'
import { createAppSettingsRepository, type AppSettingsRepository } from '../lib/appSettingsRepository'

interface WorkspaceState {
  settings: WorkspaceSettings
  appSettings: AppSettings
  setAppCloseAction: (closeAction: AppCloseAction) => Promise<void>
  setClipboardCaptureMode: (mode: ClipboardCaptureMode) => Promise<void>
  setPageDefaults: (defaults: Partial<PageDisplayDefaults>) => Promise<void>
  // ...
}
```

Use focused normalizers:

```ts
function normalizeAppSettings(settings: AppSettings | null | undefined): AppSettings {
  return {
    closeAction: settings?.closeAction === 'quit' ? 'quit' : 'hide_to_tray',
  }
}

function normalizePageDefaults(defaults: Partial<PageDisplayDefaults> | undefined): PageDisplayDefaults {
  return {
    isFullWidth: defaults?.isFullWidth === true,
    isSmallText: defaults?.isSmallText === true,
    fontFamily: defaults?.fontFamily === 'serif' || defaults?.fontFamily === 'mono' ? defaults.fontFamily : 'default',
    showOutline: defaults?.showOutline !== false,
  }
}
```

Expand `createSettings(...)` and `normalizeSettings(...)`:

```ts
function createSettings(
  lastOpenedPageId: PageId | null,
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']> = 'compact',
  sidebarWidth = 272,
  pinnedSidebarItems: SidebarPinnedItem[] = [],
  inboxPageId: PageId | null = null,
  clipboardCaptureMode: ClipboardCaptureMode = 'off',
  pageDefaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
): WorkspaceSettings {
  return {
    lastOpenedPageId,
    inboxPageId,
    sidebarLayout,
    sidebarWidth,
    pinnedSidebarItems,
    clipboardCaptureMode,
    pageDefaults,
  }
}
```

Make new pages and child pages use normalized page defaults:

```ts
function createPageRecord(
  parentId: PageId | undefined,
  title = UNTITLED_PAGE_TITLE,
  defaults: PageDisplayDefaults = DEFAULT_PAGE_DISPLAY_DEFAULTS,
): PageRecord {
  return {
    id: createId('page'),
    parentId: parentId ?? null,
    title,
    icon: null,
    cover: null,
    properties: {},
    ...defaults,
    blocks: [],
    createdAt: now,
    updatedAt: now,
  }
}
```

Thread the same `defaults` into the two inline child-page creation branches now hardcoding `false / default / true`.

Load app settings during bootstrap:

```ts
const normalizedAppSettings = normalizeAppSettings(await appSettingsRepository.load())
set({
  // existing snapshot state
  appSettings: normalizedAppSettings,
})
```

Add the focused actions:

```ts
setAppCloseAction: async (closeAction) => {
  const nextSettings = normalizeAppSettings({ closeAction })
  set({ appSettings: nextSettings })
  await appSettingsRepository.save(nextSettings)
},

setClipboardCaptureMode: async (mode) => {
  const nextSettings = createSettings(
    state.currentPageId,
    state.settings.sidebarLayout ?? 'compact',
    state.settings.sidebarWidth ?? 272,
    state.settings.pinnedSidebarItems ?? [],
    state.settings.inboxPageId ?? null,
    mode,
    normalizePageDefaults(state.settings.pageDefaults),
  )
  // persist through workspace repository
},

setPageDefaults: async (defaults) => {
  const nextDefaults = normalizePageDefaults({
    ...state.settings.pageDefaults,
    ...defaults,
  })
  // persist through workspace repository
},
```

- [ ] **Step 4: Re-run the store tests**

Run:

```bash
npm run test -- src/store/createWorkspaceStore.test.ts
```

Expected:

- the new app settings test passes
- the page defaults test passes
- the existing clipboard capture mode regression now passes through the same normalization path

- [ ] **Step 5: Commit**

```bash
git add src/domain/seed.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts
git commit -m "feat: normalize settings and page defaults"
```

### Task 4: Add The Settings Route, Sidebar Entry, And Phase 1 Settings UI

**Files:**
- Create: `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.tsx`
- Test: `E:\Workspace\个人知识库-桌面端\src\components\settings\SettingsCenter.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.tsx`
- Test: `E:\Workspace\个人知识库-桌面端\src\components\sidebar\SidebarTree.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Test: `E:\Workspace\个人知识库-桌面端\src\app\App.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\styles\index.css`
- Test: `E:\Workspace\个人知识库-桌面端\src\styles\settingsCenterLayout.test.ts`

- [ ] **Step 1: Write the failing route and component tests**

Create `src/components/settings/SettingsCenter.test.tsx` with:

```ts
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsCenter } from './SettingsCenter'

it('switches sections and edits page defaults from the left navigation', async () => {
  const user = userEvent.setup()
  const onSectionChange = vi.fn()
  const onSetPageDefaults = vi.fn()

  render(
    <SettingsCenter
      activeSection="general"
      appSettings={{ closeAction: 'hide_to_tray' }}
      workspaceSettings={{
        lastOpenedPageId: 'page_1',
        sidebarLayout: 'compact',
        sidebarWidth: 272,
        clipboardCaptureMode: 'off',
        pageDefaults: {
          isFullWidth: false,
          isSmallText: false,
          fontFamily: 'default',
          showOutline: true,
        },
      }}
      onSectionChange={onSectionChange}
      onSetPageDefaults={onSetPageDefaults}
      onSetAppCloseAction={vi.fn()}
      onSetSidebarLayout={vi.fn()}
      onSetSidebarWidth={vi.fn()}
      onSetClipboardCaptureMode={vi.fn()}
      onExportWorkspace={vi.fn()}
      onImportArchive={vi.fn()}
      onCleanupOrphanBoards={vi.fn()}
      onCleanupOrphanDataTables={vi.fn()}
      onOpenInbox={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('button', { name: '编辑与页面默认' }))
  expect(onSectionChange).toHaveBeenCalledWith('editing_page_defaults')

  await user.click(screen.getByRole('checkbox', { name: '新页面默认自适应正文宽度' }))
  expect(onSetPageDefaults).toHaveBeenCalledWith({ isFullWidth: true })
})
```

Add this test to `src/app/App.test.tsx`:

```ts
it('opens the settings center from the sidebar utility menu', async () => {
  const user = userEvent.setup()
  const snapshot = createTestWorkspace()
  const store = createWorkspaceStore(createMemoryRepository(snapshot))

  render(<App store={store} initialEntries={['/pages/page_1']} />)

  await screen.findByText('快速开始')
  await user.click(screen.getByRole('button', { name: '更多' }))
  await user.click(screen.getByRole('button', { name: '设置' }))

  expect(await screen.findByRole('heading', { name: '设置中心' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '通用' })).toBeInTheDocument()
})
```

Add this test to `src/components/sidebar/SidebarTree.test.tsx`:

```ts
it('renders a settings action in the utility menu', async () => {
  const user = userEvent.setup()

  render(
    <MemoryRouter>
      <SidebarTree
        pages={pages as never}
        currentPageId="page_parent"
        onCreatePage={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '更多' }))
  expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument()
})
```

Create `src/styles/settingsCenterLayout.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { cssRule } from './testUtils'

describe('settings center layout', () => {
  it('keeps a fixed left navigation and a flexible content column', () => {
    expect(cssRule('.settings-center')).toContain('display: grid;')
    expect(cssRule('.settings-center')).toContain('grid-template-columns: 220px minmax(0, 1fr);')
    expect(cssRule('.settings-center-nav')).toContain('position: sticky;')
    expect(cssRule('.settings-center-panel')).toContain('min-width: 0;')
  })
})
```

- [ ] **Step 2: Run the UI and layout tests and verify failure**

Run:

```bash
npm run test -- src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.test.tsx src/app/App.test.tsx src/styles/settingsCenterLayout.test.ts
```

Expected:

- the settings component test fails because the component does not exist yet
- the app and sidebar tests fail because there is no settings entry or route yet
- the style test fails because the CSS selectors do not exist yet

- [ ] **Step 3: Add the settings page shell, sidebar entry, and route wiring**

Create `src/components/settings/SettingsCenter.tsx` with a small, prop-driven shell:

```tsx
const SETTINGS_SECTIONS = [
  { key: 'general', label: '通用' },
  { key: 'appearance_sidebar', label: '外观与侧边栏' },
  { key: 'editing_page_defaults', label: '编辑与页面默认' },
  { key: 'search_knowledge', label: '搜索与知识组织' },
  { key: 'import_export', label: '导入导出' },
  { key: 'desktop', label: '桌面端' },
  { key: 'data_maintenance', label: '数据与维护' },
  { key: 'experimental', label: '实验功能' },
] as const

export function SettingsCenter(props: SettingsCenterProps) {
  return (
    <div className="settings-center">
      <aside className="settings-center-nav" aria-label="设置分类">
        <h1 className="settings-center-title">设置中心</h1>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={clsx('settings-center-nav-item', props.activeSection === section.key && 'is-active')}
            onClick={() => props.onSectionChange(section.key)}
          >
            {section.label}
          </button>
        ))}
      </aside>
      <section className="settings-center-panel">
        {props.activeSection === 'general' ? <GeneralSection {...props} /> : null}
        {props.activeSection === 'appearance_sidebar' ? <AppearanceSection {...props} /> : null}
        {props.activeSection === 'editing_page_defaults' ? <EditingDefaultsSection {...props} /> : null}
        {props.activeSection === 'import_export' ? <ImportExportSection {...props} /> : null}
        {props.activeSection === 'desktop' ? <DesktopSection {...props} /> : null}
        {props.activeSection === 'data_maintenance' ? <MaintenanceSection {...props} /> : null}
        {props.activeSection === 'search_knowledge' ? <ReadOnlyPhaseTwoSection /> : null}
        {props.activeSection === 'experimental' ? <EmptyExperimentalSection /> : null}
      </section>
    </div>
  )
}
```

Keep the controls small and real:

```tsx
<button type="button" onClick={() => onSetSidebarLayout('compact')}>紧凑模式</button>
<button type="button" onClick={() => onSetSidebarLayout('classic')}>经典模式</button>
<input
  type="range"
  min={220}
  max={Math.max(220, Math.round(window.innerWidth / 4))}
  value={workspaceSettings.sidebarWidth ?? 272}
  onChange={(event) => onSetSidebarWidth(Number(event.currentTarget.value))}
/>
<label>
  <input
    type="checkbox"
    checked={workspaceSettings.pageDefaults?.isFullWidth === true}
    onChange={(event) => onSetPageDefaults({ isFullWidth: event.currentTarget.checked })}
  />
  新页面默认自适应正文宽度
</label>
```

In `src/components/sidebar/SidebarTree.tsx`, extend the utility menu props:

```tsx
interface SidebarTreeProps {
  onOpenSettings?: () => void
}
```

Add the new button before export:

```tsx
{onOpenSettings ? (
  <button
    type="button"
    className="page-menu-action"
    onClick={() => {
      setIsUtilityMenuOpen(false)
      void onOpenSettings()
    }}
  >
    <span className="page-menu-item-label">设置</span>
  </button>
) : null}
```

In `src/app/App.tsx`, add a settings route and wire props through:

```tsx
<SidebarTree
  // existing props
  onOpenSettings={() => {
    navigate('/settings/general')
  }}
/>
```

Add the route:

```tsx
<Route
  path="/settings/:section?"
  element={
    <SettingsRoute
      appSettings={state.appSettings}
      workspaceSettings={state.settings}
      onSetAppCloseAction={(closeAction) => store.getState().setAppCloseAction(closeAction)}
      onSetSidebarLayout={(layout) => store.getState().setSidebarLayout(layout)}
      onSetSidebarWidth={(width) => store.getState().setSidebarWidth(width)}
      onSetClipboardCaptureMode={(mode) => store.getState().setClipboardCaptureMode(mode)}
      onSetPageDefaults={(defaults) => store.getState().setPageDefaults(defaults)}
      onOpenInbox={() => store.getState().ensureInboxPage().then((page) => navigate(`/pages/${page.id}`))}
      onExportWorkspace={onExportWorkspace}
      onImportArchive={onImportArchive}
      onCleanupOrphanBoards={onCleanupOrphanBoards}
      onCleanupOrphanDataTables={onCleanupOrphanDataTables}
    />
  }
/>
```

Add copy in `src/ui/copy.ts`:

```ts
settings: {
  title: '设置',
  centerTitle: '设置中心',
  general: '通用',
  appearanceSidebar: '外观与侧边栏',
  editingDefaults: '编辑与页面默认',
  searchKnowledge: '搜索与知识组织',
  importExport: '导入导出',
  desktop: '桌面端',
  dataMaintenance: '数据与维护',
  experimental: '实验功能',
},
```

Add layout styles in `src/styles/index.css`:

```css
.settings-center {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 28px;
  width: min(1120px, 100%);
  margin: 0 auto;
}

.settings-center-nav {
  position: sticky;
  top: 68px;
  align-self: start;
}

.settings-center-panel {
  min-width: 0;
}
```

- [ ] **Step 4: Re-run the UI and layout tests**

Run:

```bash
npm run test -- src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.test.tsx src/app/App.test.tsx src/styles/settingsCenterLayout.test.ts
```

Expected:

- the settings component test passes
- the sidebar menu now exposes a `设置` action
- the app route test reaches the settings center
- the layout CSS test passes

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsCenter.tsx src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.tsx src/components/sidebar/SidebarTree.test.tsx src/app/App.tsx src/app/App.test.tsx src/ui/copy.ts src/styles/index.css src/styles/settingsCenterLayout.test.ts
git commit -m "feat: add settings center shell and route"
```

### Task 5: Respect Desktop Close Action, Update The Changelog, And Run Final Verification

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
- Test: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] **Step 1: Write the failing desktop close behavior regression**

Add this test to `src/lib/desktopLifecycle.test.ts`:

```ts
it('quits after flushing pending saves when close action is quit', async () => {
  let closeHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null

  mocks.onCloseRequested.mockImplementation(async (handler) => {
    closeHandler = handler
    return () => undefined
  })

  await registerDesktopPendingSaveFlush(
    async () => undefined,
    () => 'quit',
  )

  await closeHandler?.({ preventDefault: () => undefined })

  expect(mocks.invoke).toHaveBeenCalledWith(QUIT_AFTER_PENDING_SAVES_COMMAND)
  expect(mocks.hide).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the desktop lifecycle test and verify failure**

Run:

```bash
npm run test -- src/lib/desktopLifecycle.test.ts
```

Expected:

- the new test fails because `registerDesktopPendingSaveFlush` does not accept a close-action getter yet

- [ ] **Step 3: Implement close-action-aware desktop flush registration**

Update `src/lib/desktopLifecycle.ts`:

```ts
type CloseAction = 'hide_to_tray' | 'quit'

export async function registerDesktopPendingSaveFlush(
  flushPendingSaves: FlushPendingSaves,
  getCloseAction: () => CloseAction = () => 'hide_to_tray',
) {
  if (!isTauri()) {
    return () => undefined
  }

  const currentWindow = getCurrentWindow()
  const unlistenClose = await currentWindow.onCloseRequested(async (event) => {
    event.preventDefault()

    try {
      await flushPendingSaves()
      if (getCloseAction() === 'quit') {
        await invoke(QUIT_AFTER_PENDING_SAVES_COMMAND)
        return
      }
      await currentWindow.hide()
    } catch {
      // Keep the app alive if the final save failed; the store has already marked saveStatus.
    }
  })

  // existing quit listener code stays in place
}
```

Pass the getter from `src/app/App.tsx`:

```ts
void registerDesktopPendingSaveFlush(
  flushPendingSaves,
  () => store.getState().appSettings.closeAction ?? 'hide_to_tray',
)
```

Update `docs/updates.md` with a new dated entry before commit:

```md
## 2026-07-08 设置中心 Phase 1

提交：未提交

简要描述：

把分散在侧边栏、页面显示和桌面行为里的低风险设置统一收到了应用级设置中心里，先落地第一期可用版本。

详细描述：
- 新增应用级设置中心路由与左侧分类导航。
- 收口侧边栏布局、侧边栏宽度、页面默认显示、剪贴板捕获模式和窗口关闭行为。
- 把工作区导入导出与孤立资源清理动作放进设置中心统一入口。
- 新增 `AppSettings` 持久化，和现有 `WorkspaceSettings` 分开保存。

验证情况：
- 已通过 targeted Vitest、Rust storage regression 和 `npm run build`。
```

- [ ] **Step 4: Run the final verification set**

Run:

```bash
npm run test -- src/lib/appSettingsRepository.test.ts src/lib/storageClient.test.ts src/store/createWorkspaceStore.test.ts src/components/settings/SettingsCenter.test.tsx src/components/sidebar/SidebarTree.test.tsx src/lib/desktopLifecycle.test.ts src/app/App.test.tsx src/styles/settingsCenterLayout.test.ts
$env:CARGO_TARGET_DIR='E:\Workspace\个人知识库-桌面端\.cargo-target'; cargo test --manifest-path src-tauri/Cargo.toml saves_and_loads_app_settings_independently_from_workspace_settings
npm run build
```

Expected:

- all targeted Vitest files pass
- the Rust app settings regression passes
- the production build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/lib/desktopLifecycle.ts src/lib/desktopLifecycle.test.ts docs/updates.md
git commit -m "feat: ship settings center phase 1"
```

## Self-Review

- Spec coverage:
  - app-level settings page, not page-tree content: Task 4
  - left navigation plus right panel shell: Task 4
  - initial `AppSettings / WorkspaceSettings / Page Defaults` split: Tasks 1-3
  - page defaults affect only new pages: Task 3
  - existing low-risk settings surfaced: Tasks 3-4
  - desktop close behavior as first app-level behavior: Task 5
  - import/export and maintenance actions folded into one place: Task 4
- Placeholder scan:
  - no `TODO`, `TBD`, or “implement later” steps remain inside executable tasks
  - later-phase scope is called out only in `Scope Notes`, not inside task steps
- Type consistency:
  - `AppSettings.closeAction` uses `hide_to_tray | quit`
  - `WorkspaceSettings.clipboardCaptureMode` uses `off | prompt_to_inbox`
  - `WorkspaceSettings.pageDefaults` maps to `PageDisplayDefaults`

## Follow-Up Plans After This One

- Phase 2: search tuning, import/export preferences, backup scheduling, and data repair controls
- Phase 3: tray visibility, startup behavior, quick capture, and deeper desktop-local workflow settings
