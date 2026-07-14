# Unified Exchange Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Unify page packages and full-workspace backups as portable .zhiqi ZIP archives, while retaining safe import of previous ZIP and JSON exports.

**Architecture:** Rust owns archive parsing, validation, asset streaming, ID rewriting, transactions, and compatibility. React only selects the right import route and renders results. Page imports remain additive; workspace restores remain destructive and require confirmation.

**Tech Stack:** Rust, serde, zip, rusqlite, Tauri 2, TypeScript, React, Vitest.

---

## File map

- src-tauri/src/storage/models.rs: exchange archive models and result types.
- src-tauri/src/storage/mod.rs: v2 readers/writers, historic readers, asset transaction handling, storage tests.
- src-tauri/src/storage/commands.rs and src-tauri/src/lib.rs: archive commands and registration.
- src/lib/storageClient.ts and src/lib/storageClient.test.ts: front-end archive API.
- src/app/App.tsx, src/app/App.test.tsx, src/ui/copy.ts: menus, filters, progress and messages.
- README.md and docs/updates.md: user instructions and verification record.

### Task 1: Implement v2 page package container and v1 compatibility

**Files:**

- Modify: src-tauri/src/storage/models.rs
- Modify: src-tauri/src/storage/mod.rs
- Test: src-tauri/src/storage/mod.rs

- [ ] **Step 1: Add failing layout and legacy tests**

Add a test by the existing page-package tests. Add a small test helper that converts the new payload to a current v1 page-package.json file.

~~~
#[test]
fn page_package_exports_exchange_v2_and_imports_legacy_zhixi() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    source.replace_workspace_backup(sample_snapshot()).expect("seed source");

    let archive = source.export_page_package("page_1").expect("export package");
    let mut zip = zip::ZipArchive::new(Cursor::new(archive.clone())).expect("read archive");
    let manifest: ExchangeArchiveManifest = serde_json::from_reader(
        &mut zip.by_name(EXCHANGE_MANIFEST_ENTRY).expect("manifest"),
    )
    .expect("parse manifest");
    assert_eq!(manifest.format, EXCHANGE_ARCHIVE_FORMAT);
    assert_eq!(manifest.format_version, EXCHANGE_ARCHIVE_VERSION);
    assert_eq!(manifest.kind, ExchangeArchiveKind::PagePackage);
    assert!(zip.by_name(EXCHANGE_PAYLOAD_ENTRY).is_ok());
    assert!(zip.by_name(EXCHANGE_ASSET_MANIFEST_ENTRY).is_ok());

    let legacy = rewrite_exchange_page_package_as_legacy(archive, "zhixi.page-package");
    let target = Storage::open_in_memory_for_tests().expect("target opens");
    target.replace_workspace_backup(sample_snapshot()).expect("seed target");
    assert_eq!(
        target.import_page_package(legacy).expect("import legacy").source_format,
        "legacy-zhixi-v1",
    );
}
~~~

- [ ] **Step 2: Prove the test is red**

Run:

~~~powershell
cd src-tauri
cargo test page_package_exports_exchange_v2_and_imports_legacy_zhixi
~~~

Expected: fail because the v2 models and compatibility reader do not exist.

- [ ] **Step 3: Add archive models and constants**

In models.rs, keep PagePackageManifest as a legacy-only reader. Add the following models; also add source_format to PagePackageImportResult.

~~~rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExchangeArchiveKind {
    PagePackage,
    WorkspaceBackup,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeArchiveManifest {
    pub format: String,
    pub format_version: u32,
    pub kind: ExchangeArchiveKind,
    pub created_with: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackagePayload {
    pub root_page_id: String,
    pub pages: Vec<PageRecord>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArchivePayload {
    pub workspace: WorkspaceSnapshot,
}
~~~

In mod.rs, add the fixed format constants:

~~~rust
pub const EXCHANGE_ARCHIVE_FORMAT: &str = "zhiqi.exchange";
pub const EXCHANGE_ARCHIVE_VERSION: u32 = 2;
pub const EXCHANGE_MANIFEST_ENTRY: &str = "manifest.json";
pub const EXCHANGE_PAYLOAD_ENTRY: &str = "payload.json";
pub const EXCHANGE_ASSET_MANIFEST_ENTRY: &str = "assets/manifest.json";
const LEGACY_PAGE_PACKAGE_MANIFEST_ENTRY: &str = "page-package.json";
const LEGACY_PAGE_PACKAGE_KINDS: [&str; 2] = ["zhiqi.page-package", "zhixi.page-package"];
~~~

- [ ] **Step 4: Add one generic writer and migrate page-package export**

Replace the current page-package-only archive writer with this generic signature. Its body writes the v2 manifest, payload, asset manifest, then each asset using the existing progress callbacks and stream copying.

~~~rust
fn write_exchange_archive<W, F, P>(
    &self,
    kind: ExchangeArchiveKind,
    payload: &P,
    assets: &[AssetMeta],
    writer: W,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<W>
where
    W: Write + Seek,
    F: FnMut(WorkspaceArchiveProgress),
    P: Serialize,
{
    let manifest = ExchangeArchiveManifest {
        format: EXCHANGE_ARCHIVE_FORMAT.to_string(),
        format_version: EXCHANGE_ARCHIVE_VERSION,
        kind,
        created_with: env!("CARGO_PKG_VERSION").to_string(),
        created_at: now_iso(),
    };
    // Reuse the existing ZIP file and asset progress logic.
}
~~~

Build PagePackagePayload in write_page_package and pass it to this writer. Do not serialize asset metadata inside payload.json.

- [ ] **Step 5: Read v2 first, then explicitly supported v1 formats**

Extract archive parsing from import_page_package_reader. It first tries manifest.json; only an absent entry permits the historic reader. Validate the requested kind, format name and exact version. Map a new v2 archive to exchange-v2, current v1 to legacy-zhiqi-v1, and old v1 to legacy-zhixi-v1. Before any asset write, validate payload IDs, resource references, asset manifest paths and every asset entry. Reuse rewrite_block_ids_and_refs and rollback_tracked_assets for the actual insertion.

Use these stable errors:

~~~rust
StorageError::new("archive_wrong_kind", "archive kind does not match import route")
StorageError::new("archive_unsupported_version", "unsupported archive version")
StorageError::new("archive_corrupt", "archive metadata is missing or invalid")
StorageError::new("archive_missing_asset", "archive asset entry is missing")
~~~

- [ ] **Step 6: Run focused tests and commit**

Run:

~~~powershell
cd src-tauri
cargo test page_package_
cargo test legacy_zhixi
cd ..
git add src-tauri/src/storage/models.rs src-tauri/src/storage/mod.rs
git commit -m "feat: unify page package exchange format"
~~~

Expected: v2 page packages, zhiqi v1 packages, zhixi v1 packages, resource coverage and rollback tests pass.

### Task 2: Add portable full-workspace archive and restore

**Files:**

- Modify: src-tauri/src/storage/models.rs
- Modify: src-tauri/src/storage/mod.rs
- Modify: src-tauri/src/storage/commands.rs
- Modify: src-tauri/src/lib.rs
- Modify: src/lib/storageClient.ts
- Test: src-tauri/src/storage/mod.rs
- Test: src/lib/storageClient.test.ts

- [ ] **Step 1: Add red tests for media restoration, route protection, and JSON compatibility**

Create a workspace with an image asset, export it, import into a separate storage instance, then read the imported page block asset ID and assert its bytes. Also prove a page package passed to workspace import leaves the target snapshot unchanged. Test raw JSON bytes return source_format legacy-json-v1.

~~~
#[test]
fn workspace_exchange_archive_restores_media_and_rejects_page_package_kind() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    let asset = source.write_asset(WriteAssetInput {
        name: "diagram.png".to_string(),
        mime_type: "image/png".to_string(),
        bytes: b"diagram bytes".to_vec(),
    }).expect("write asset");
    source.replace_workspace_backup(snapshot_with_page_asset(asset.id)).expect("seed source");

    let archive = source.export_workspace_archive().expect("export archive");
    let target = Storage::open_in_memory_for_tests().expect("target opens");
    target.replace_workspace_backup(sample_snapshot()).expect("seed target");
    target.import_workspace_archive(archive).expect("restore archive");
    let asset_id = asset_id_from_page(&target.export_workspace_backup().expect("snapshot"));
    assert_eq!(target.read_asset(&asset_id).expect("read asset"), b"diagram bytes");

    let before = target.export_workspace_backup().expect("before");
    let page_archive = source.export_page_package("page_1").expect("page archive");
    assert_eq!(
        target.import_workspace_archive(page_archive).expect_err("wrong kind").code,
        "archive_wrong_kind",
    );
    assert_eq!(target.export_workspace_backup().expect("after"), before);
}
~~~

- [ ] **Step 2: Prove the tests are red**

Run:

~~~powershell
cd src-tauri
cargo test workspace_exchange_archive_restores_media_and_rejects_page_package_kind
cd ..
npx vitest run src/lib/storageClient.test.ts
~~~

Expected: fail because workspace archive APIs and commands do not exist.

- [ ] **Step 3: Implement workspace archive writer and restore transaction**

Add export_workspace_archive, export_workspace_archive_to_path, import_workspace_archive, and import_workspace_archive_from_path. Export a WorkspaceArchivePayload through Task 1's writer after collecting de-duplicated asset IDs from pages, synced groups and data tables.

~~~rust
pub fn export_workspace_archive(&self) -> StorageResult<Vec<u8>> {
    let mut ignore_progress = |_| {};
    self.write_workspace_archive(Cursor::new(Vec::new()), None, &mut ignore_progress)
        .map(|cursor| cursor.into_inner())
}

fn write_workspace_archive<W, F>(
    &self,
    writer: W,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<W>
where
    W: Write + Seek,
    F: FnMut(WorkspaceArchiveProgress),
{
    let snapshot = self.export_workspace_backup()?;
    let assets = self.load_workspace_archive_assets(&snapshot)?;
    self.write_exchange_archive(
        ExchangeArchiveKind::WorkspaceBackup,
        &WorkspaceArchivePayload { workspace: snapshot },
        &assets,
        writer,
        task_id,
        progress,
    )
}
~~~

For v2 input: validate all entries and resource references before writing, write files with assets::write_asset_from_reader while recording TrackedAssetWrite, rewrite asset IDs in page blocks, synced groups and data-table snapshots, then call the existing replacement logic inside one transaction. On any asset or database error, call rollback_tracked_assets. For non-ZIP bytes only, deserialize WorkspaceSnapshot and call the existing replacement method; return legacy-json-v1.

- [ ] **Step 4: Add Tauri commands and registration**

In commands.rs add binary commands plus path-and-progress counterparts. In lib.rs register all four. Preserve export_workspace_backup and replace_workspace_backup because normal persistence continues to use them.

~~~rust
#[tauri::command]
pub async fn export_workspace_archive(
    state: State<'_, StorageState>,
) -> StorageResult<Vec<u8>> {
    with_storage_blocking(state.inner().clone(), move |storage| storage.export_workspace_archive()).await
}

#[tauri::command]
pub async fn import_workspace_archive(
    state: State<'_, StorageState>,
    bytes: Vec<u8>,
) -> StorageResult<WorkspaceArchiveImportResult> {
    with_storage_blocking(state.inner().clone(), move |storage| storage.import_workspace_archive(bytes)).await
}
~~~

- [ ] **Step 5: Add storage-client interface and tests**

Define the result and four methods, using the existing byte normalizer and progress helper.

~~~ts
export interface WorkspaceArchiveImportResult {
  sourceFormat: 'exchange-v2' | 'legacy-json-v1'
}

exportWorkspaceArchiveToPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<void>
exportWorkspaceArchive(): Promise<Uint8Array>
importWorkspaceArchive(bytes: Uint8Array): Promise<WorkspaceArchiveImportResult>
importWorkspaceArchiveFromPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<WorkspaceArchiveImportResult>
~~~

Add matching sourceFormat union to PagePackageImportResult. Assert command names, command arguments, byte conversion, result conversion, and task-ID progress filtering.

- [ ] **Step 6: Run focused tests and commit**

Run:

~~~powershell
cd src-tauri
cargo test workspace_exchange_archive
cargo test page_package_import_rejects_workspace_archives
cd ..
npx vitest run src/lib/storageClient.test.ts
git add src-tauri/src/storage/models.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/commands.rs src-tauri/src/lib.rs src/lib/storageClient.ts src/lib/storageClient.test.ts
git commit -m "feat: add portable workspace archives"
~~~

Expected: media restore, wrong-route protection, historical JSON import, command wrappers and progress all pass.

### Task 3: Switch UI to .zhiqi and improve feedback

**Files:**

- Modify: src/app/App.tsx
- Modify: src/ui/copy.ts
- Modify: src/app/App.test.tsx

- [ ] **Step 1: Add red UI tests**

Change current assertions to require page export default product-plan.zhiqi, workspace default 知栖工作区备份.zhiqi, page import filters zhiqi plus zip, and workspace import filters zhiqi plus json. Mock archive_wrong_kind and assert the page route alerts:

~~~ts
expect(window.alert).toHaveBeenCalledWith(
  '这是工作区备份，请使用“导入完整备份”。',
)
~~~

Add a legacy-json-v1 successful restore assertion that checks the compatibility success message.
Add an export ordering assertion: set a delayed flushPendingSaves on the store, start 全部导出, assert exportWorkspaceArchiveToPath has not run, resolve the flush, then assert it runs. This preserves the existing state-snapshot guarantee after the export moves from React state to Rust storage.

- [ ] **Step 2: Prove the UI test is red**

Run:

~~~powershell
npx vitest run src/app/App.test.tsx
~~~

Expected: fail because the menu still writes JSON and generic errors.

- [ ] **Step 3: Replace the UI archive flows**

Use three filters:

~~~ts
const ZHIQI_ARCHIVE_FILE_FILTER = [{ name: '知栖归档', extensions: ['zhiqi'] }]
const PAGE_IMPORT_FILE_FILTER = [{ name: '知栖页面包', extensions: ['zhiqi', 'zip'] }]
const WORKSPACE_IMPORT_FILE_FILTER = [{ name: '知栖工作区备份', extensions: ['zhiqi', 'json'] }]
~~~

Page export becomes <page title>.zhiqi. Before either workspace export path, call and await flushPendingSaves so the Rust snapshot includes the latest editor state. Workspace export then calls exportWorkspaceArchiveToPath on desktop or exportWorkspaceArchive plus saveBinaryFile in the browser fallback. Workspace restore calls the new client path or binary method, retains confirmation and flushPendingSaves, then bootstraps the store. Remove createWorkspaceBackupSnapshot only after no UI caller remains; do not alter WorkspaceRepository persistence.

- [ ] **Step 4: Add a centralized error mapper and source-format success messages**

Add this pure helper to App.tsx and use it in both archive catch blocks.

~~~ts
function archiveErrorMessage(error: unknown, target: 'page' | 'workspace') {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  if (code === 'archive_wrong_kind') {
    return target === 'page'
      ? uiCopy.export.pageImportWrongKind
      : uiCopy.export.workspaceImportWrongKind
  }
  if (code === 'archive_unsupported_version') return uiCopy.export.unsupportedArchiveVersion
  if (code === 'archive_missing_asset') return uiCopy.export.archiveMissingAsset
  if (code === 'archive_corrupt') return uiCopy.export.archiveCorrupt
  return target === 'page' ? uiCopy.export.importError : uiCopy.export.workspaceImportError
}
~~~

Add the mapper strings plus legacyPageImportComplete and legacyWorkspaceImportComplete to ui/copy.ts. Use a legacy success string whenever sourceFormat is not exchange-v2.

- [ ] **Step 5: Run UI tests and commit**

Run:

~~~powershell
npx vitest run src/app/App.test.tsx src/lib/storageClient.test.ts
git add src/app/App.tsx src/app/App.test.tsx src/ui/copy.ts
git commit -m "feat: use unified archive format in import export UI"
~~~

Expected: exports default to zhiqi, historical extensions are import-only, existing confirmation and progress behavior remains, and feedback is actionable.

### Task 4: Document and verify the release-grade change

**Files:**

- Modify: README.md
- Modify: docs/updates.md

- [ ] **Step 1: Update user documentation**

Explain that new page packages and complete workspace backups are .zhiqi ZIP archives that contain structure plus referenced media. State that page import adds a top-level page, workspace restore overwrites after confirmation, legacy zip page packages and json workspace snapshots remain importable, and legacy JSON cannot recover media binary files it never contained.

Add a dated docs/updates.md entry covering the unified container, media-bearing backups, legacy compatibility, distinct errors, and actual command results.

- [ ] **Step 2: Run complete test, lint and build checks**

Run:

~~~powershell
cd src-tauri
cargo test
cd ..
npm test
npm run lint
npm run build
~~~

Expected: all Rust and frontend tests pass. If lint only reports pre-existing warnings, record their exact count and category.

- [ ] **Step 3: Verify Windows NSIS packaging**

Run with the required E-drive cache:

~~~powershell
$env:CARGO_TARGET_DIR='E:\BuildCache\cargo-target\zhixi\exchange-archive'
& '.\node_modules\.bin\tauri.cmd' build --config src-tauri\tauri.windows.conf.json --bundles nsis
~~~

Expected: NSIS bundle succeeds. Do not stage its executable or target directory.

- [ ] **Step 4: Commit documentation**

~~~powershell
git add README.md docs/updates.md
git commit -m "docs: document unified exchange archives"
~~~

## Self-review

- The plan covers the unified v2 container, two protected import semantics, historical zhixi and zhiqi page packages, historical JSON backups, assets, transaction cleanup, frontend messaging, documentation and packaging.
- It deliberately excludes whiteboard-only JSON, Markdown and other editor-level interchange formats.
- It adds no dependency and reuses the existing ZIP, stream-copy, transaction, progress and asset rollback capabilities.
