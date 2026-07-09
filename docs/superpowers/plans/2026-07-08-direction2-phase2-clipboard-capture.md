# Direction 2 Phase 2 Clipboard Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the first real desktop clipboard-capture loop for 知栖: detect supported clipboard content while the app is in the background, ask for one lightweight native confirmation, and append confirmed captures into `收件箱` without disturbing normal copy/paste inside the editor.

**Architecture:** Reuse the scaffolding that already exists in the repo: `clipboardCaptureMode`, `收件箱`, `appendClipboardCaptureToInbox`, settings center, existing block model, and existing asset pipeline. Add one Windows-first native bridge for clipboard candidate reading plus toast-action callbacks, one pure TypeScript clipboard parser for text/rich text into paragraph blocks, and one App-side controller hook that handles polling, dedupe, internal-copy suppression, and final save-to-inbox writes.

**Tech Stack:** React 19, TypeScript, DOMParser, Zustand vanilla store, Vitest, Tauri 2, Rust, `arboard`, `clipboard-win`, `image`, `tauri-winrt-notification`

---

## Scope Notes

- This plan **supersedes** `E:\Workspace\个人知识库-桌面端\docs\superpowers\plans\2026-07-07-direction2-phase2-clipboard-capture.md`.
- Current repo state already has:
  - `WorkspaceSettings.clipboardCaptureMode`
  - `setClipboardCaptureMode(...)`
  - `appendClipboardCaptureToInbox(...)`
  - settings-center UI for `关闭 / 复制后提示收进收件箱`
- Do **not** reopen or redesign those pieces unless the tests below prove they are incomplete.
- Ship only the approved `v1` scope:
  - text
  - rich text degraded to basic marks where stable
  - clipboard bitmap / copied image data
  - copied image files
- Do **not** add:
  - history list
  - manual-capture mode
  - audio / video / PDF / arbitrary file support
  - new inbox data model
  - auto-opening the main window after confirm
- Important platform note:
  - official Tauri notification actions are not the desktop path we want here
  - use a **Windows native toast bridge** via `tauri-winrt-notification` for the confirm action button
  - keep non-Windows behavior as a safe no-op for now instead of pretending parity

## File Structure

- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
  - Harden the existing inbox append action so captures append to existing inbox content instead of replacing it.
- Modify `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
  - Lock the existing clipboard scaffolding with real append coverage.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\richTextHtml.ts`
  - Extract DOM-to-`RichTextSegment[]` parsing helpers out of `RichTextEditable` into a pure reusable module.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\richTextHtml.test.ts`
  - Cover bold/italic/underline/link/line-break parsing from HTML.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\clipboardCapture.ts`
  - Convert clipboard plain text / HTML into paragraph blocks, apply the “split by paragraph, keep in-paragraph line breaks” rule, and expose small dedupe helpers.
- Create `E:\Workspace\个人知识库-桌面端\src\domain\clipboardCapture.test.ts`
  - Cover paragraph splitting, rich-text fallback, and summary text generation.
- Modify `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.tsx`
  - Reuse the extracted HTML parsing helpers instead of keeping a second parser copy inside the editor.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\assets.ts`
  - Expose the minimum helper for importing a copied local image file path into the existing asset store.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
  - Add typed clipboard-read, native-toast, and clipboard-confirm-event bridge helpers.
- Modify `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
  - Cover candidate normalization, notification invoke wiring, and event subscription cleanup.
- Create `E:\Workspace\个人知识库-桌面端\src\app\useDesktopClipboardCapture.ts`
  - Keep the App shell thin by isolating polling, dedupe, copy suppression, notification dispatch, and save-to-inbox handling in one hook.
- Create `E:\Workspace\个人知识库-桌面端\src\app\useDesktopClipboardCapture.test.tsx`
  - Cover polling, internal-copy suppression, dedupe, confirm-to-save flow, and failure behavior.
- Modify `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
  - Mount the hook once after bootstrap and pass the minimum dependencies into it.
- Modify `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`
  - Centralize the user-facing clipboard-capture strings used by the native notification bridge and failure messages.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\Cargo.toml`
  - Add the minimum Windows-first clipboard and toast crates.
- Create `E:\Workspace\个人知识库-桌面端\src-tauri\src\clipboard_capture.rs`
  - Implement native clipboard candidate reading and native toast notifications with a confirm action callback that emits back into the running app.
- Modify `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`
  - Register the new commands and keep the bridge local to desktop runtime startup.
- Modify `E:\Workspace\个人知识库-桌面端\docs\updates.md`
  - Record the user-visible feature and verification.

## Tasks

### Task 1: Harden The Existing Store Scaffolding And Add Pure Clipboard Parsing

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\store\createWorkspaceStore.test.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\richTextHtml.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\richTextHtml.test.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\clipboardCapture.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\domain\clipboardCapture.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\components\editor\RichTextEditable.tsx`

- [ ] Add failing tests for:
  - `appendClipboardCaptureToInbox(...)` appends after existing inbox blocks instead of replacing them
  - plain text is split into multiple paragraph blocks by blank lines
  - line breaks inside one paragraph stay inside the same paragraph block
  - HTML text preserves the approved basic marks:
    - bold
    - italic
    - underline
    - link
    - `<br>` line breaks
  - invalid or unsupported HTML cleanly falls back to plain text paragraphs
- [ ] Run:
  - `npm run test -- src/store/createWorkspaceStore.test.ts src/domain/richTextHtml.test.ts src/domain/clipboardCapture.test.ts`
  - Confirm the new assertions fail for the expected reasons.
- [ ] Extract the DOM rich-text parser out of `RichTextEditable.tsx` into `src/domain/richTextHtml.ts` instead of inventing a second HTML walker just for clipboard capture.
- [ ] Add `src/domain/clipboardCapture.ts` with the minimum pure helpers:
  - `clipboardHtmlToParagraphBlocks(...)`
  - `clipboardPlainTextToParagraphBlocks(...)`
  - `buildClipboardTextBlocks(...)`
  - `isDuplicateClipboardSignature(...)`
- [ ] Fix `appendClipboardCaptureToInbox(...)` so it:
  - preserves existing inbox blocks
  - prepends the timestamp paragraph for each capture batch
  - clones incoming blocks before saving
  - preserves the approved trailing empty paragraph separator
- [ ] Re-run:
  - `npm run test -- src/store/createWorkspaceStore.test.ts src/domain/richTextHtml.test.ts src/domain/clipboardCapture.test.ts`

### Task 2: Add The Windows Native Clipboard Candidate And Toast Bridge

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\desktopLifecycle.test.ts`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\Cargo.toml`
- Create: `E:\Workspace\个人知识库-桌面端\src-tauri\src\clipboard_capture.rs`
- Modify: `E:\Workspace\个人知识库-桌面端\src-tauri\src\lib.rs`

- [ ] Add failing TypeScript and Rust tests for:
  - normalizing `number[]` image bytes into `Uint8Array`
  - subscribing/unsubscribing to a clipboard-confirm desktop event
  - text candidates carrying both plain text and optional HTML payload
  - image-file candidates only being returned for supported image files
  - native toast confirm action emitting back to the running app instead of opening the main window
- [ ] Run:
  - `npm run test -- src/lib/desktopLifecycle.test.ts`
  - `cargo test --manifest-path src-tauri/Cargo.toml clipboard_capture`
  - Confirm the new cases fail.
- [ ] Add the Rust-side bridge in `src-tauri/src/clipboard_capture.rs`:
  - `read_clipboard_candidate`
  - `show_clipboard_capture_notification`
  - `show_clipboard_capture_failure_notification`
- [ ] Keep candidate kinds intentionally narrow:
  - `text` with `text` and optional `html`
  - `image_bytes`
  - `image_file`
- [ ] Use the smallest native crates that fit the approved scope:
  - `arboard` for text / bitmap clipboard reads
  - `clipboard-win` for Windows HTML and file-list access
  - `image` for PNG encoding of raw clipboard bitmap bytes
  - `tauri-winrt-notification` for Windows toast + confirm button callback
- [ ] Keep non-Windows behavior safe:
  - `read_clipboard_candidate -> Ok(None)`
  - notification commands -> `Ok(())`
  - no fake desktop support on other platforms in this phase
- [ ] Add the TypeScript wrappers in `src/lib/desktopLifecycle.ts`:
  - `readDesktopClipboardCandidate()`
  - `showDesktopClipboardCaptureNotification(...)`
  - `showDesktopClipboardCaptureFailureNotification(...)`
  - `registerDesktopClipboardCaptureConfirm(...)`
- [ ] Re-run:
  - `npm run test -- src/lib/desktopLifecycle.test.ts`
  - `cargo test --manifest-path src-tauri/Cargo.toml clipboard_capture`

### Task 3: Wire Polling, Internal-Copy Suppression, Dedupe, And Save-To-Inbox

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\src\lib\assets.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\app\useDesktopClipboardCapture.ts`
- Create: `E:\Workspace\个人知识库-桌面端\src\app\useDesktopClipboardCapture.test.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\app\App.tsx`
- Modify: `E:\Workspace\个人知识库-桌面端\src\ui\copy.ts`

- [ ] Add failing hook tests for:
  - no polling when mode is `off`
  - supported clipboard candidate triggers one native notification when mode is `prompt_to_inbox`
  - same signature inside the dedupe window does not notify twice
  - a `copy` event that originated inside 知栖 suppresses the next capture check
  - confirm event saves text blocks into `收件箱`
  - confirm event saves clipboard bitmap into assets and writes an image block
  - confirm event imports a copied local image file path and writes an image block
  - failed asset import shows a failure notification and writes no broken block
- [ ] Run:
  - `npm run test -- src/app/useDesktopClipboardCapture.test.tsx`
  - Confirm the new hook cases fail.
- [ ] Keep the App shell lazy and thin:
  - create `useDesktopClipboardCapture(...)`
  - mount it once from `App.tsx`
  - do not turn `App.tsx` into another 300-line state machine
- [ ] Inside the hook, implement only the approved runtime rules:
  - poll only after workspace bootstrap
  - poll only on desktop runtime
  - poll only when `clipboardCaptureMode === 'prompt_to_inbox'`
  - do **not** skip processing just because the window is hidden; background capture depends on this
  - use a short in-app copy suppression window for editor-originated `copy` events
  - dedupe by candidate signature within a short fixed window
  - keep a pending-candidate map keyed by signature until the native confirm callback arrives
- [ ] Materialize confirmed content through existing pipelines:
  - text/html -> paragraph blocks via `src/domain/clipboardCapture.ts`
  - bitmap bytes -> `writeAssetBytes(...)` + image block
  - image file path -> import helper in `src/lib/assets.ts` + image block
  - all saves -> existing `appendClipboardCaptureToInbox(...)`
- [ ] Re-run:
  - `npm run test -- src/app/useDesktopClipboardCapture.test.tsx`
  - `npm run test -- src/store/createWorkspaceStore.test.ts src/domain/richTextHtml.test.ts src/domain/clipboardCapture.test.ts src/lib/desktopLifecycle.test.ts src/app/useDesktopClipboardCapture.test.tsx`

### Task 4: Final Notes, Regression, And Windows Build Verification

**Files:**
- Modify: `E:\Workspace\个人知识库-桌面端\docs\updates.md`

- [ ] Add a new update entry describing:
  - desktop clipboard capture v1 scope
  - Windows native notification confirm behavior
  - text + image support only
  - internal-copy suppression
  - dedupe and inbox append behavior
- [ ] Run the focused regression set:
  - `npm run test -- src/store/createWorkspaceStore.test.ts src/domain/richTextHtml.test.ts src/domain/clipboardCapture.test.ts src/lib/desktopLifecycle.test.ts src/app/useDesktopClipboardCapture.test.tsx`
- [ ] Run desktop-side Rust verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml clipboard_capture`
- [ ] Run the production build:
  - `npm run build`
- [ ] Run the Windows desktop package smoke build:
  - `npm run tauri:build:windows`

## Self-Review

- Spec coverage:
  - keeps the existing `关闭 / 复制后提示收进收件箱` settings model
  - supports only the approved `文字 + 图片` range
  - respects “段落拆成多个块，段内换行保留”
  - uses background-capable native Windows confirmation instead of an in-app popup
  - keeps save-to-inbox writes in the existing store instead of creating a second persistence path
- Placeholder scan:
  - no `TODO`
  - no “similar to above”
  - no deferred “implement later” gaps
- Risk check:
  - explicitly avoids reopening settings-center scope that already landed
  - explicitly avoids non-image file capture and other direction-2 phase creep
  - explicitly notes that desktop confirm actions are Windows-first in this phase
