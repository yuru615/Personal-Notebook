# Direction 2 Phase 2 Clipboard Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only clipboard capture mode that can detect supported clipboard content, show a lightweight “save to inbox” prompt, and append confirmed captures into `收件箱` without disturbing normal copy/paste inside 知栖.

**Architecture:** Keep this lean. Reuse the existing workspace settings, inbox page, block model, asset import pipeline, and App-level lifecycle wiring. Do not add a new inbox data model, background daemon, or standalone settings page; instead, add one settings enum, one native clipboard-read command, one small prompt component, and one App effect that polls only while the feature is enabled.

**Tech Stack:** React 19, TypeScript, Zustand store, Vitest, Tauri 2, Rust commands, existing asset/storage pipeline

---

## File Map

- Modify: `src/domain/types.ts`
  - Add the new `clipboardCaptureMode` workspace setting type.
- Modify: `src/store/createWorkspaceStore.ts`
  - Normalize the new setting, persist setting changes, and append confirmed capture blocks into `收件箱`.
- Modify: `src/store/createWorkspaceStore.test.ts`
  - Cover default setting, persistence, inbox append behavior, and inbox self-repair.
- Modify: `src/ui/copy.ts`
  - Add strings for the sidebar setting and prompt labels.
- Modify: `src/components/sidebar/SidebarTree.tsx`
  - Add the clipboard capture mode controls into the existing utility menu.
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
  - Cover switching the new setting from the utility menu.
- Create: `src/components/shared/ClipboardCapturePrompt.tsx`
  - Render a small fixed bottom-right prompt with save/dismiss actions.
- Create: `src/components/shared/ClipboardCapturePrompt.test.tsx`
  - Cover labels, action callbacks, and disabled/saving state.
- Modify: `src/styles/index.css`
  - Style the new prompt so it sits above page content but below the search overlay.
- Modify: `src/lib/assets.ts`
  - Expose a tiny desktop-only helper for importing a copied media file path through the existing Tauri asset command.
- Modify: `src/lib/desktopLifecycle.ts`
  - Add the typed desktop clipboard candidate bridge and invoke the new native command.
- Modify: `src/lib/desktopLifecycle.test.ts`
  - Cover the new invoke wrapper and byte-array normalization.
- Create: `src-tauri/src/clipboard.rs`
  - Implement the native clipboard read command and the pure helpers around text/image/file parsing.
- Modify: `src-tauri/src/lib.rs`
  - Register the new clipboard command.
- Modify: `src-tauri/Cargo.toml`
  - Add the minimum crates needed to read clipboard text/image and Windows file-drop paths.
- Modify: `src/app/App.tsx`
  - Poll desktop clipboard when enabled, dedupe short-window repeats, skip foreground editor cases, and save confirmed captures into `收件箱`.
- Create: `src/app/App.clipboardCapture.test.tsx`
  - Cover prompt appearance, save-to-inbox flow, dedupe, and “do not interrupt active editor” behavior.
- Modify: `docs/updates.md`
  - Record the user-facing feature and verification.

---

### Task 1: Add the Setting and Inbox Append Action

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/store/createWorkspaceStore.ts`
- Modify: `src/store/createWorkspaceStore.test.ts`
- Modify: `src/ui/copy.ts`

- [ ] **Step 1: Write the failing store tests**

Add these cases near the existing settings/inbox tests in `src/store/createWorkspaceStore.test.ts`:

```ts
it('defaults clipboard capture mode to off and persists changes', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()

  expect(store.getState().settings.clipboardCaptureMode).toBe('off')

  await store.getState().setClipboardCaptureMode('prompt_to_inbox')

  expect(store.getState().settings.clipboardCaptureMode).toBe('prompt_to_inbox')
  expect(counted.getSnapshot()?.settings.clipboardCaptureMode).toBe('prompt_to_inbox')
})

it('appends confirmed clipboard capture blocks into the inbox page', async () => {
  const counted = createCountingRepository(createWorkspace())
  const store = createWorkspaceStore(counted.repository)

  await store.getState().bootstrap()
  await store.getState().appendClipboardCaptureToInbox(
    [
      { id: 'block_text', type: 'paragraph', text: 'Captured text' },
      {
        id: 'block_audio',
        type: 'audio',
        assetId: 'asset_audio',
        name: 'meeting.mp3',
        mimeType: 'audio/mpeg',
        caption: '',
      },
    ],
    '2026-07-07T08:09:00.000Z',
  )

  const inboxPageId = store.getState().settings.inboxPageId
  const inboxPage = store.getState().pages.find((page) => page.id === inboxPageId)

  expect(inboxPage?.blocks).toMatchObject([
    { type: 'paragraph', text: '剪贴板捕获 · 2026-07-07 08:09' },
    { type: 'paragraph', text: 'Captured text' },
    { type: 'audio', assetId: 'asset_audio', name: 'meeting.mp3' },
    { type: 'paragraph', text: '' },
  ])
})
```

- [ ] **Step 2: Run the targeted store test file and verify it fails**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`

Expected: FAIL with missing `clipboardCaptureMode`, missing `setClipboardCaptureMode`, and missing `appendClipboardCaptureToInbox`.

- [ ] **Step 3: Implement the minimal setting + inbox action**

Update `src/domain/types.ts`:

```ts
export type ClipboardCaptureMode = 'off' | 'prompt_to_inbox'

export interface WorkspaceSettings {
  lastOpenedPageId: PageId | null
  inboxPageId?: PageId | null
  sidebarLayout?: 'compact' | 'classic'
  sidebarWidth?: number
  pinnedSidebarItems?: SidebarPinnedItem[]
  clipboardCaptureMode?: ClipboardCaptureMode
}
```

Update the store surface in `src/store/createWorkspaceStore.ts`:

```ts
import type { ClipboardCaptureMode, BlockRecord, WorkspaceSettings } from '../domain/types'

export interface WorkspaceState {
  // ...
  setClipboardCaptureMode: (mode: ClipboardCaptureMode) => Promise<void>
  appendClipboardCaptureToInbox: (
    blocks: BlockRecord[],
    capturedAt?: string,
  ) => Promise<void>
}

function createSettings(
  lastOpenedPageId: PageId | null,
  sidebarLayout: NonNullable<WorkspaceSettings['sidebarLayout']> = 'compact',
  sidebarWidth = 272,
  pinnedSidebarItems: SidebarPinnedItem[] = [],
  inboxPageId: PageId | null = null,
  clipboardCaptureMode: ClipboardCaptureMode = 'off',
): WorkspaceSettings {
  return {
    lastOpenedPageId,
    inboxPageId,
    sidebarLayout,
    sidebarWidth,
    pinnedSidebarItems,
    clipboardCaptureMode,
  }
}
```

Normalize and persist the setting:

```ts
const clipboardCaptureMode =
  settings.clipboardCaptureMode === 'prompt_to_inbox' ? 'prompt_to_inbox' : 'off'

settings: {
  lastOpenedPageId: settings.lastOpenedPageId,
  inboxPageId,
  sidebarLayout,
  sidebarWidth,
  pinnedSidebarItems,
  clipboardCaptureMode,
}
```

Add the setter and append action:

```ts
setClipboardCaptureMode: async (mode) => {
  const state = get()
  if (state.settings.clipboardCaptureMode === mode) {
    return
  }

  const nextSettings = { ...state.settings, clipboardCaptureMode: mode }
  set({ settings: nextSettings, saveStatus: 'saving' })

  try {
    await repository.save(createSnapshotFromState({ ...state, settings: nextSettings }))
    set({ settings: nextSettings, saveStatus: 'saved' })
  } catch {
    set({ saveStatus: 'error' })
    throw new Error('Failed to update clipboard capture mode')
  }
},

appendClipboardCaptureToInbox: async (blocks, capturedAt = new Date().toISOString()) => {
  if (blocks.length === 0) {
    return
  }

  const inboxPage = await get().ensureInboxPage()
  const state = get()
  const label = formatClipboardCaptureLabel(capturedAt)
  const nextBlocks = [
    { id: createId('block'), type: 'paragraph' as const, text: `剪贴板捕获 · ${label}` },
    ...blocks.map((block) => structuredClone(block)),
    { id: createId('block'), type: 'paragraph' as const, text: '' },
  ]

  const nextPages = state.pages.map((page) =>
    page.id === inboxPage.id
      ? {
          ...page,
          updatedAt: new Date().toISOString(),
          blocks: [...page.blocks, ...nextBlocks],
        }
      : page,
  )

  set({ saveStatus: 'saving' })
  try {
    await repository.save(createSnapshotFromState({ ...state, pages: nextPages }))
    set({ pages: nextPages, saveStatus: 'saved' })
  } catch {
    set({ saveStatus: 'error' })
    throw new Error('Failed to append clipboard capture to inbox')
  }
},
```

Keep the timestamp formatter local and boring:

```ts
function formatClipboardCaptureLabel(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
```

Add copy entries in `src/ui/copy.ts`:

```ts
clipboardCapture: '剪贴板捕获',
clipboardCaptureOff: '关闭',
clipboardCapturePromptToInbox: '复制后提示保存到收件箱',
```

- [ ] **Step 4: Run the targeted store test file again**

Run: `npm test -- src/store/createWorkspaceStore.test.ts`

Expected: PASS for the new clipboard capture tests and no regressions in the existing store suite.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/store/createWorkspaceStore.ts src/store/createWorkspaceStore.test.ts src/ui/copy.ts
git commit -m "feat: add clipboard capture workspace setting"
```

---

### Task 2: Add the Desktop Clipboard Read Bridge

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/clipboard.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/desktopLifecycle.ts`
- Modify: `src/lib/desktopLifecycle.test.ts`

- [ ] **Step 1: Write the failing desktop bridge test**

Add this to `src/lib/desktopLifecycle.test.ts`:

```ts
it('reads a desktop clipboard candidate and normalizes image bytes', async () => {
  mocks.invoke.mockResolvedValue({
    kind: 'image',
    signature: 'sig_123',
    name: 'clipboard-image.png',
    mimeType: 'image/png',
    bytes: [137, 80, 78, 71],
  })

  const candidate = await readDesktopClipboardCandidate()

  expect(mocks.invoke).toHaveBeenCalledWith('read_clipboard_candidate')
  expect(candidate).toMatchObject({
    kind: 'image',
    signature: 'sig_123',
    name: 'clipboard-image.png',
    mimeType: 'image/png',
  })
  expect(candidate?.kind === 'image' ? candidate.bytes : null).toBeInstanceOf(Uint8Array)
})
```

- [ ] **Step 2: Run the desktop lifecycle test file and verify it fails**

Run: `npm test -- src/lib/desktopLifecycle.test.ts`

Expected: FAIL because `readDesktopClipboardCandidate` and the new invoke command do not exist yet.

- [ ] **Step 3: Implement the native command and the tiny TypeScript wrapper**

Add the minimum dependencies in `src-tauri/Cargo.toml`:

```toml
[dependencies]
arboard = "3"
image = { version = "0.25", default-features = false, features = ["png"] }

[target.'cfg(windows)'.dependencies]
clipboard-win = "5"
```

Create `src-tauri/src/clipboard.rs` with a focused command and helpers:

```rust
use arboard::Clipboard;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClipboardCandidate {
    Text { signature: String, text: String },
    Image { signature: String, name: String, mime_type: String, bytes: Vec<u8> },
    Audio { signature: String, path: String, name: String, mime_type: String },
    Video { signature: String, path: String, name: String, mime_type: String },
}

#[tauri::command]
pub fn read_clipboard_candidate() -> Result<Option<ClipboardCandidate>, String> {
    if let Some(file_candidate) = read_media_file_candidate()? {
        return Ok(Some(file_candidate));
    }

    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;

    if let Ok(text) = clipboard.get_text() {
        let trimmed = text.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(Some(ClipboardCandidate::Text {
                signature: sha256_hex(trimmed.as_bytes()),
                text: trimmed,
            }));
        }
    }

    if let Ok(image) = clipboard.get_image() {
        let png_bytes = encode_clipboard_image_png(image.width as u32, image.height as u32, image.bytes.as_ref())?;
        return Ok(Some(ClipboardCandidate::Image {
            signature: sha256_hex(&png_bytes),
            name: "clipboard-image.png".to_string(),
            mime_type: "image/png".to_string(),
            bytes: png_bytes,
        }));
    }

    Ok(None)
}
```

Keep the Windows file-drop path handling narrow:

```rust
#[cfg(target_os = "windows")]
fn read_media_file_candidate() -> Result<Option<ClipboardCandidate>, String> {
    let mut files = clipboard_win::get_clipboard(clipboard_win::formats::FileList)
        .map_err(|error| error.to_string())?;

    let path = match files.get(0) {
        Some(path) => path,
        None => return Ok(None),
    };

    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string();
    let mime_type = guess_media_mime_type(path);

    match mime_type.as_str() {
        "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/mp4" => Ok(Some(ClipboardCandidate::Audio {
            signature: sha256_hex(path.to_string_lossy().as_bytes()),
            path: path.to_string_lossy().into_owned(),
            name,
            mime_type,
        })),
        "video/mp4" | "video/webm" | "video/quicktime" => Ok(Some(ClipboardCandidate::Video {
            signature: sha256_hex(path.to_string_lossy().as_bytes()),
            path: path.to_string_lossy().into_owned(),
            name,
            mime_type,
        })),
        _ => Ok(None),
    }
}

#[cfg(not(target_os = "windows"))]
fn read_media_file_candidate() -> Result<Option<ClipboardCandidate>, String> {
    Ok(None)
}
```

Register the command in `src-tauri/src/lib.rs`:

```rust
mod clipboard;

.invoke_handler(tauri::generate_handler![
    open_external_url,
    clipboard::read_clipboard_candidate,
    // existing commands…
])
```

Expose the typed frontend wrapper in `src/lib/desktopLifecycle.ts`:

```ts
export type DesktopClipboardCandidate =
  | { kind: 'text'; signature: string; text: string }
  | { kind: 'image'; signature: string; name: string; mimeType: string; bytes: Uint8Array }
  | { kind: 'audio'; signature: string; path: string; name: string; mimeType: string }
  | { kind: 'video'; signature: string; path: string; name: string; mimeType: string }

export async function readDesktopClipboardCandidate(): Promise<DesktopClipboardCandidate | null> {
  if (!isTauri()) {
    return null
  }

  const candidate = await invoke<
    | (Omit<Extract<DesktopClipboardCandidate, { kind: 'image' }>, 'bytes'> & { bytes: Uint8Array | number[] })
    | Exclude<DesktopClipboardCandidate, { kind: 'image' }>
    | null
  >('read_clipboard_candidate')

  if (!candidate) {
    return null
  }

  if (candidate.kind === 'image') {
    return {
      ...candidate,
      bytes: candidate.bytes instanceof Uint8Array ? candidate.bytes : new Uint8Array(candidate.bytes),
    }
  }

  return candidate
}
```

- [ ] **Step 4: Run the focused desktop bridge tests**

Run: `npm test -- src/lib/desktopLifecycle.test.ts`

Expected: PASS for the new bridge test and no regression in tray/quit lifecycle tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/clipboard.rs src-tauri/src/lib.rs src/lib/desktopLifecycle.ts src/lib/desktopLifecycle.test.ts
git commit -m "feat: add desktop clipboard candidate bridge"
```

---

### Task 3: Add the Sidebar Setting and the Lightweight Prompt UI

**Files:**
- Modify: `src/components/sidebar/SidebarTree.tsx`
- Modify: `src/components/sidebar/SidebarTree.test.tsx`
- Create: `src/components/shared/ClipboardCapturePrompt.tsx`
- Create: `src/components/shared/ClipboardCapturePrompt.test.tsx`
- Modify: `src/styles/index.css`
- Modify: `src/ui/copy.ts`

- [ ] **Step 1: Write the failing UI tests**

Add a new setting menu case in `src/components/sidebar/SidebarTree.test.tsx`:

```ts
it('switches clipboard capture mode from the utility menu', async () => {
  const user = userEvent.setup()
  const onSetClipboardCaptureMode = vi.fn()

  render(
    <MemoryRouter>
      <SidebarTree
        pages={pages as never}
        currentPageId="page_parent"
        onCreatePage={vi.fn()}
        layout="compact"
        clipboardCaptureMode="off"
        onSetClipboardCaptureMode={onSetClipboardCaptureMode}
      />
    </MemoryRouter>,
  )

  await user.click(screen.getByRole('button', { name: '更多' }))
  await user.click(screen.getByRole('button', { name: '复制后提示保存到收件箱' }))

  expect(onSetClipboardCaptureMode).toHaveBeenCalledWith('prompt_to_inbox')
})
```

Create `src/components/shared/ClipboardCapturePrompt.test.tsx`:

```tsx
it('renders the save prompt and fires save/dismiss actions', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  const onDismiss = vi.fn()

  render(
    <ClipboardCapturePrompt
      title="检测到新的剪贴板内容"
      detail="可保存到收件箱"
      onSave={onSave}
      onDismiss={onDismiss}
    />,
  )

  await user.click(screen.getByRole('button', { name: '保存到收件箱' }))
  expect(onSave).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: '忽略' }))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the focused sidebar/prompt tests and verify they fail**

Run: `npm test -- src/components/sidebar/SidebarTree.test.tsx src/components/shared/ClipboardCapturePrompt.test.tsx`

Expected: FAIL because the new SidebarTree props, menu items, and prompt component do not exist yet.

- [ ] **Step 3: Implement the setting controls and prompt**

Extend `SidebarTree` props:

```ts
import type { ClipboardCaptureMode } from '../../domain/types'

interface SidebarTreeProps {
  // existing props…
  clipboardCaptureMode?: ClipboardCaptureMode
  onSetClipboardCaptureMode?: (mode: ClipboardCaptureMode) => void | Promise<void>
}
```

Add a new utility menu section in `src/components/sidebar/SidebarTree.tsx`:

```tsx
{onSetClipboardCaptureMode ? (
  <div className="page-menu-section">
    <div className="page-menu-section-label">{uiCopy.sidebar.clipboardCapture}</div>
    <button
      type="button"
      className="page-menu-action"
      aria-pressed={clipboardCaptureMode === 'off'}
      onClick={() => {
        setIsUtilityMenuOpen(false)
        void onSetClipboardCaptureMode('off')
      }}
    >
      <span className="page-menu-item-label">{uiCopy.sidebar.clipboardCaptureOff}</span>
    </button>
    <button
      type="button"
      className="page-menu-action"
      aria-pressed={clipboardCaptureMode === 'prompt_to_inbox'}
      onClick={() => {
        setIsUtilityMenuOpen(false)
        void onSetClipboardCaptureMode('prompt_to_inbox')
      }}
    >
      <span className="page-menu-item-label">{uiCopy.sidebar.clipboardCapturePromptToInbox}</span>
    </button>
  </div>
) : null}
```

Create `src/components/shared/ClipboardCapturePrompt.tsx`:

```tsx
interface ClipboardCapturePromptProps {
  title: string
  detail: string
  saving?: boolean
  onSave: () => void
  onDismiss: () => void
}

export function ClipboardCapturePrompt({
  title,
  detail,
  saving = false,
  onSave,
  onDismiss,
}: ClipboardCapturePromptProps) {
  return (
    <div className="clipboard-capture-prompt" role="status" aria-live="polite">
      <div className="clipboard-capture-prompt-title">{title}</div>
      <div className="clipboard-capture-prompt-detail">{detail}</div>
      <div className="clipboard-capture-prompt-actions">
        <button
          type="button"
          className="clipboard-capture-prompt-secondary"
          onClick={onDismiss}
          disabled={saving}
        >
          忽略
        </button>
        <button
          type="button"
          className="clipboard-capture-prompt-primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存到收件箱'}
        </button>
      </div>
    </div>
  )
}
```

Style it in `src/styles/index.css`:

```css
.clipboard-capture-prompt {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 74;
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 24px));
  padding: 14px;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 18px 36px rgba(15, 23, 42, 0.12),
    0 4px 12px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(12px);
}
```

- [ ] **Step 4: Run the focused sidebar/prompt tests again**

Run: `npm test -- src/components/sidebar/SidebarTree.test.tsx src/components/shared/ClipboardCapturePrompt.test.tsx`

Expected: PASS for the new mode-switch and prompt tests, with no regressions in the sidebar suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/SidebarTree.tsx src/components/sidebar/SidebarTree.test.tsx src/components/shared/ClipboardCapturePrompt.tsx src/components/shared/ClipboardCapturePrompt.test.tsx src/styles/index.css src/ui/copy.ts
git commit -m "feat: add clipboard capture controls and prompt"
```

---

### Task 4: Wire Polling, Dedupe, and Save-to-Inbox in App

**Files:**
- Modify: `src/lib/assets.ts`
- Modify: `src/app/App.tsx`
- Create: `src/app/App.clipboardCapture.test.tsx`

- [ ] **Step 1: Write the failing App integration tests**

Create `src/app/App.clipboardCapture.test.tsx` with these focused cases:

```tsx
it('shows a clipboard prompt and saves a text capture into the inbox', async () => {
  vi.useFakeTimers()
  mockReadDesktopClipboardCandidate
    .mockResolvedValueOnce({
      kind: 'text',
      signature: 'sig_text_1',
      text: 'Copied from another app',
    })
    .mockResolvedValue(null)

  const repository = createMemoryRepository({
    ...createSeedWorkspace(),
    settings: {
      ...createSeedWorkspace().settings,
      clipboardCaptureMode: 'prompt_to_inbox',
    },
  })
  const store = createWorkspaceStore(repository)

  render(<App store={store} initialEntries={['/']} />)

  await act(async () => {
    vi.advanceTimersByTime(1600)
  })

  await userEvent.click(await screen.findByRole('button', { name: '保存到收件箱' }))

  const inboxPageId = store.getState().settings.inboxPageId
  const inboxPage = store.getState().pages.find((page) => page.id === inboxPageId)
  expect(inboxPage?.blocks.some((block) => block.type === 'paragraph' && 'text' in block && block.text.includes('Copied from another app'))).toBe(true)
})

it('does not show the clipboard prompt while the current editor is focused', async () => {
  vi.useFakeTimers()
  mockReadDesktopClipboardCandidate.mockResolvedValue({
    kind: 'text',
    signature: 'sig_text_2',
    text: 'Do not interrupt',
  })

  const repository = createMemoryRepository({
    ...createSeedWorkspace(),
    settings: {
      ...createSeedWorkspace().settings,
      clipboardCaptureMode: 'prompt_to_inbox',
    },
  })
  const store = createWorkspaceStore(repository)

  render(<App store={store} initialEntries={['/pages/page_1']} />)

  const titleInput = await screen.findByDisplayValue(/快速开始|未命名|收件箱/)
  titleInput.focus()

  await act(async () => {
    vi.advanceTimersByTime(1600)
  })

  expect(screen.queryByText('检测到新的剪贴板内容')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the App clipboard tests and verify they fail**

Run: `npm test -- src/app/App.clipboardCapture.test.tsx`

Expected: FAIL because App does not yet poll clipboard, render the prompt, or save confirmed captures.

- [ ] **Step 3: Implement the App polling loop and save pipeline**

Add a tiny helper in `src/lib/assets.ts` so App can reuse the existing desktop asset import command for copied file paths:

```ts
export function importAssetPath(path: string, mimeType: string) {
  return storageClient.importAssetFile({ path, mimeType })
}
```

In `src/app/App.tsx`, add the prompt state and poll effect:

```ts
const [clipboardPrompt, setClipboardPrompt] = useState<DesktopClipboardCandidate | null>(null)
const [clipboardPromptSaving, setClipboardPromptSaving] = useState(false)
const lastClipboardSignatureRef = useRef<string | null>(null)
const lastClipboardSeenAtRef = useRef(0)

function shouldSkipClipboardPrompt() {
  if (!document.hasFocus()) {
    return false
  }

  return isEditableShortcutTarget(document.activeElement)
}
```

Use a simple polling effect instead of a background service:

```ts
useEffect(() => {
  if (!isBootstrapped) {
    return
  }

  if (!isDesktopRuntime() || (state.settings.clipboardCaptureMode ?? 'off') !== 'prompt_to_inbox') {
    return
  }

  let disposed = false

  async function pollClipboard() {
    if (disposed || document.visibilityState === 'hidden' || shouldSkipClipboardPrompt()) {
      return
    }

    const candidate = await readDesktopClipboardCandidate()

    if (!candidate || disposed) {
      return
    }

    const now = Date.now()
    if (
      candidate.signature === lastClipboardSignatureRef.current &&
      now - lastClipboardSeenAtRef.current < 10_000
    ) {
      return
    }

    lastClipboardSignatureRef.current = candidate.signature
    lastClipboardSeenAtRef.current = now
    setClipboardPrompt(candidate)
  }

  const intervalId = window.setInterval(() => {
    void pollClipboard()
  }, 1500)

  const onFocus = () => {
    void pollClipboard()
  }

  window.addEventListener('focus', onFocus)
  void pollClipboard()

  return () => {
    disposed = true
    window.clearInterval(intervalId)
    window.removeEventListener('focus', onFocus)
  }
}, [isBootstrapped, state.settings.clipboardCaptureMode])
```

Materialize the candidate with the existing asset pipeline and append it to inbox:

```ts
async function buildClipboardBlocks(candidate: DesktopClipboardCandidate) {
  if (candidate.kind === 'text') {
    return [{ id: createId('block'), type: 'paragraph' as const, text: candidate.text }]
  }

  if (candidate.kind === 'image') {
    const asset = await writeAssetBytes({
      name: candidate.name,
      mimeType: candidate.mimeType,
      bytes: candidate.bytes,
    })

    return [{
      id: createId('block'),
      type: 'image' as const,
      assetId: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      caption: '',
      alt: '',
    }]
  }

  const asset = await importAssetPath(candidate.path, candidate.mimeType)

  return [{
    id: createId('block'),
    type: candidate.kind,
    assetId: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    caption: '',
  }]
}

async function handleSaveClipboardPrompt() {
  if (!clipboardPrompt) {
    return
  }

  setClipboardPromptSaving(true)
  try {
    const blocks = await buildClipboardBlocks(clipboardPrompt)
    await store.getState().appendClipboardCaptureToInbox(blocks)
    setClipboardPrompt(null)
  } catch {
    window.alert('保存剪贴板内容失败，请稍后重试。')
  } finally {
    setClipboardPromptSaving(false)
  }
}
```

Render the prompt near the end of the App shell tree:

```tsx
{clipboardPrompt ? (
  <ClipboardCapturePrompt
    title="检测到新的剪贴板内容"
    detail={describeClipboardPrompt(clipboardPrompt)}
    saving={clipboardPromptSaving}
    onSave={() => {
      void handleSaveClipboardPrompt()
    }}
    onDismiss={() => setClipboardPrompt(null)}
  />
) : null}
```

Use a tiny description helper:

```ts
function describeClipboardPrompt(candidate: DesktopClipboardCandidate) {
  if (candidate.kind === 'text') {
    return '可保存到收件箱'
  }

  return `${candidate.name} · 可保存到收件箱`
}
```

- [ ] **Step 4: Run the focused clipboard tests**

Run: `npm test -- src/app/App.clipboardCapture.test.tsx`

Expected: PASS for prompt show/save/skip behavior.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assets.ts src/app/App.tsx src/app/App.clipboardCapture.test.tsx
git commit -m "feat: wire clipboard capture prompt to inbox"
```

---

### Task 5: Update the Changelog and Run Final Verification

**Files:**
- Modify: `docs/updates.md`

- [ ] **Step 1: Update `docs/updates.md`**

Add one new dated entry with the required structure:

```md
## 2026-07-07 - 剪贴板捕获 v1

### 简要描述
- 新增桌面端剪贴板捕获设置，支持关闭或复制后提示保存到收件箱
- 新增轻量保存提示，可把文本、图片、音频、视频捕获到收件箱
- 复用现有页面、块和资源管线，不新增第二套收件箱数据模型

### 详细描述
- 侧边栏更多菜单新增“剪贴板捕获”设置项
- 桌面端新增剪贴板候选读取命令，支持文本、图片和媒体文件路径
- App 在开启模式下轮询剪贴板并做短窗口去重
- 当前正在知栖里输入时不弹提示，避免打断正常编辑
- 用户确认后内容按“说明行 + 内容块 + 空行”写入收件箱

### 验证
- `npm test -- src/store/createWorkspaceStore.test.ts src/lib/desktopLifecycle.test.ts src/components/sidebar/SidebarTree.test.tsx src/components/shared/ClipboardCapturePrompt.test.tsx src/app/App.clipboardCapture.test.tsx`
- `npm run build`
- `npm run tauri:build:windows`
```

- [ ] **Step 2: Run the focused regression suite**

Run:

```bash
npm test -- src/store/createWorkspaceStore.test.ts src/lib/desktopLifecycle.test.ts src/components/sidebar/SidebarTree.test.tsx src/components/shared/ClipboardCapturePrompt.test.tsx src/app/App.clipboardCapture.test.tsx
```

Expected: PASS across store, bridge, sidebar, prompt, and App clipboard tests.

- [ ] **Step 3: Run the production frontend build**

Run: `npm run build`

Expected: PASS with no TypeScript or Vite build errors.

- [ ] **Step 4: Run the Windows desktop build smoke check**

Run: `npm run tauri:build:windows`

Expected: PASS, confirming the new Rust clipboard command compiles cleanly in the desktop app target.

- [ ] **Step 5: Commit**

```bash
git add docs/updates.md
git commit -m "docs: record clipboard capture v1"
```

---

## Self-Review

- **Spec coverage:** Covered the new setting, desktop detection, light prompt, inbox append structure, foreground-editor skip rule, dedupe window, supported types, and verification.
- **Placeholder scan:** No `TODO`, `TBD`, or “similar to above” placeholders remain.
- **Type consistency:** The plan uses one setting name (`clipboardCaptureMode`), one store action (`setClipboardCaptureMode`), one inbox append action (`appendClipboardCaptureToInbox`), and one desktop bridge entry point (`readDesktopClipboardCandidate`) everywhere.
