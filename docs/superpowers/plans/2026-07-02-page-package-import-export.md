# Page Package Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-facing full-workspace ZIP backup/restore with current-page-tree package export and top-level page-package import.

**Architecture:** Keep the existing Tauri storage boundary. React owns menu interaction, confirmation, progress, refresh, and navigation. Rust owns ZIP manifest parsing, page-tree/resource traversal, asset streaming, id rewriting, and SQLite writes.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust, rusqlite, zip, serde_json.

---

## File Structure

- Modify `src/ui/copy.ts`: rename backup/restore copy to page import/export copy.
- Modify `src/lib/storageClient.ts`: replace user-facing workspace archive command wrappers with page-package command wrappers while keeping `exportWorkspaceBackup` and `replaceWorkspaceBackup` for persistence.
- Modify `src/lib/assets.ts`: re-export page-package helpers used by `App`.
- Modify `src/app/App.tsx`: call page-package export/import commands, pass current page id, and navigate to imported root page.
- Modify `src/components/export/ExportImportPanel.tsx`: keep component shape and continue using the existing callback props.
- Modify tests in `src/components/export/ExportImportPanel.test.tsx`, `src/lib/storageClient.test.ts`, and `src/app/App.test.tsx`.
- Modify `src-tauri/src/storage/models.rs`: add page-package import result and page-package manifest model types.
- Modify `src-tauri/src/storage/commands.rs`: add Tauri commands for page-package export/import by bytes and by path.
- Modify `src-tauri/src/storage/mod.rs`: add page-package ZIP export/import implementation and Rust unit tests.
- Modify `src-tauri/src/lib.rs`: register new page-package commands and remove full-workspace archive commands from command registration.

Note on media asset ids: the current asset table uses `sha256 TEXT UNIQUE` and asset ids are derived from content. Do not break this storage invariant. During import, write assets through the existing asset storage path and rewrite page/data-table references to the returned `AssetMeta.id`. Pages, blocks, boards, data tables, and mindmaps must get new ids.

---

### Task 1: Add Typed Page-Package Client Commands

**Files:**
- Modify: `src/lib/storageClient.ts`
- Modify: `src/lib/assets.ts`
- Test: `src/lib/storageClient.test.ts`

- [ ] **Step 1: Write failing storage-client tests**

Add these tests to `src/lib/storageClient.test.ts` after the existing archive progress tests:

```ts
it('exports and imports page packages through typed Tauri commands', async () => {
  const { createTauriStorageClient } = await import('./storageClient')
  const bytes = new Uint8Array([80, 75, 3, 4])
  eventApi.invoke
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce({ rootPageId: 'page_imported' })
    .mockResolvedValueOnce({ rootPageId: 'page_imported_bytes' })

  const client = createTauriStorageClient()

  await client.exportPagePackageToPath('page_source', '/tmp/page.zip')
  await expect(client.exportPagePackage('page_source')).resolves.toBe(bytes)
  await expect(client.importPagePackageFromPath('/tmp/page.zip')).resolves.toEqual({
    rootPageId: 'page_imported',
  })
  await expect(client.importPagePackage(bytes)).resolves.toEqual({
    rootPageId: 'page_imported_bytes',
  })

  expect(eventApi.invoke).toHaveBeenNthCalledWith(1, 'export_page_package_to_path', {
    pageId: 'page_source',
    path: '/tmp/page.zip',
  })
  expect(eventApi.invoke).toHaveBeenNthCalledWith(2, 'export_page_package', {
    pageId: 'page_source',
  })
  expect(eventApi.invoke).toHaveBeenNthCalledWith(3, 'import_page_package_from_path', {
    path: '/tmp/page.zip',
  })
  expect(eventApi.invoke).toHaveBeenNthCalledWith(4, 'import_page_package', { bytes })
})

it('subscribes to archive progress for page-package path commands', async () => {
  const { createTauriStorageClient, WORKSPACE_ARCHIVE_PROGRESS_EVENT } = await import('./storageClient')
  const onProgress = vi.fn()

  eventApi.invoke.mockImplementationOnce(async (_command, args) => {
    eventApi.handlers[0]?.({
      payload: {
        taskId: args.taskId,
        operation: 'export',
        phase: 'processingAsset',
        current: 1,
        total: 1,
        bytesProcessed: 32,
        bytesTotal: 32,
        itemName: 'image.png',
      },
    })
  })

  const client = createTauriStorageClient()

  await client.exportPagePackageToPath('page_source', '/tmp/page.zip', onProgress)

  expect(eventApi.listen).toHaveBeenCalledWith(
    WORKSPACE_ARCHIVE_PROGRESS_EVENT,
    expect.any(Function),
  )
  expect(eventApi.invoke).toHaveBeenCalledWith('export_page_package_to_path', {
    pageId: 'page_source',
    path: '/tmp/page.zip',
    taskId: expect.any(String),
  })
  expect(onProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      taskId: expect.any(String),
      operation: 'export',
      phase: 'processingAsset',
      itemName: 'image.png',
    }),
  )
  expect(eventApi.unlisten).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npx vitest run src/lib/storageClient.test.ts
```

Expected: FAIL because `exportPagePackageToPath`, `exportPagePackage`, `importPagePackageFromPath`, and `importPagePackage` do not exist.

- [ ] **Step 3: Add client types and command wrappers**

In `src/lib/storageClient.ts`, add:

```ts
export interface PagePackageImportResult {
  rootPageId: string
}
```

Extend `WorkspaceStorageClient`:

```ts
exportPagePackageToPath(
  pageId: string,
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<void>
exportPagePackage(pageId: string): Promise<Uint8Array>
importPagePackage(bytes: Uint8Array): Promise<PagePackageImportResult>
importPagePackageFromPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<PagePackageImportResult>
```

Add methods to `createTauriStorageClient()`:

```ts
exportPagePackageToPath(pageId, path, onProgress) {
  return invokeArchiveCommandWithProgress(
    'export_page_package_to_path',
    { pageId, path },
    onProgress,
  )
},

async exportPagePackage(pageId) {
  return normalizeByteArray(await invoke<Uint8Array | number[]>('export_page_package', { pageId }))
},

importPagePackage(bytes) {
  return invoke<PagePackageImportResult>('import_page_package', { bytes })
},

importPagePackageFromPath(path, onProgress) {
  return invokeArchiveCommandWithProgress<PagePackageImportResult>(
    'import_page_package_from_path',
    { path },
    onProgress,
  )
},
```

Make `invokeArchiveCommandWithProgress` generic and return the command result:

```ts
async function invokeArchiveCommandWithProgress<T = void>(
  command: string,
  args: Record<string, unknown>,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<T> {
  if (!onProgress) {
    return invoke<T>(command, args)
  }

  const taskId = createArchiveTaskId()
  const unlisten = await listen<WorkspaceArchiveProgress>(
    WORKSPACE_ARCHIVE_PROGRESS_EVENT,
    (event) => {
      if (event.payload.taskId === taskId) {
        onProgress(event.payload)
      }
    },
  )

  try {
    return await invoke<T>(command, { ...args, taskId })
  } finally {
    unlisten()
  }
}
```

In `src/lib/assets.ts`, add exports:

```ts
export function exportPagePackage(pageId: string) {
  return storageClient.exportPagePackage(pageId)
}

export function exportPagePackageToPath(
  pageId: string,
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
) {
  return storageClient.exportPagePackageToPath(pageId, path, onProgress)
}

export function importPagePackage(bytes: Uint8Array) {
  return storageClient.importPagePackage(bytes)
}

export function importPagePackageFromPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
) {
  return storageClient.importPagePackageFromPath(path, onProgress)
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
npx vitest run src/lib/storageClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storageClient.ts src/lib/assets.ts src/lib/storageClient.test.ts
git commit -m "feat: add page package storage client"
```

---

### Task 2: Replace Page Menu Copy and App Flow

**Files:**
- Modify: `src/ui/copy.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/components/export/ExportImportPanel.test.tsx`

- [ ] **Step 1: Write failing UI and app tests**

In `src/components/export/ExportImportPanel.test.tsx`, replace old label constants:

```ts
const OLD_CREATE_BACKUP_LABEL = '创建完整备份'
const OLD_RESTORE_BACKUP_LABEL = '从备份恢复'
const PAGE_PACKAGE_SECTION_LABEL = '页面导入导出'
const EXPORT_PAGE_LABEL = '导出当前页面'
const IMPORT_PAGE_PACKAGE_LABEL = '导入页面包'
```

Update the menu assertion:

```ts
expect(screen.getByText(PAGE_PACKAGE_SECTION_LABEL)).toBeInTheDocument()
expect(screen.getByRole('button', { name: EXPORT_PAGE_LABEL })).toBeInTheDocument()
expect(screen.getByRole('button', { name: IMPORT_PAGE_PACKAGE_LABEL })).toBeInTheDocument()
expect(screen.queryByRole('button', { name: OLD_CREATE_BACKUP_LABEL })).not.toBeInTheDocument()
expect(screen.queryByRole('button', { name: OLD_RESTORE_BACKUP_LABEL })).not.toBeInTheDocument()
```

In `src/app/App.test.tsx`, change the hoisted archive mock to page-package names:

```ts
const pagePackageStorage = vi.hoisted(() => ({
  exportPagePackageToPath: vi.fn(async () => undefined),
  exportPagePackage: vi.fn(async () => new Uint8Array([80, 75, 3, 4])),
  importPagePackageFromPath: vi.fn(async () => ({ rootPageId: 'page_imported' })),
  importPagePackage: vi.fn(async () => ({ rootPageId: 'page_imported' })),
}))
```

Update the `../lib/assets` mock:

```ts
vi.mock('../lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assets')>()
  return {
    ...actual,
    exportPagePackageToPath: pagePackageStorage.exportPagePackageToPath,
    exportPagePackage: pagePackageStorage.exportPagePackage,
    importPagePackageFromPath: pagePackageStorage.importPagePackageFromPath,
    importPagePackage: pagePackageStorage.importPagePackage,
  }
})
```

Add a desktop export assertion:

```ts
it('exports the current page package directly to the selected desktop path', async () => {
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  })
  const user = userEvent.setup()
  const pageId = 'page_archive_desktop'
  const snapshot: WorkspaceSnapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: pageId,
        parentId: null,
        title: '产品规划',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: pageId },
  }

  render(<App repository={createMemoryRepository(snapshot)} initialEntries={[`/pages/${pageId}`]} />)

  await screen.findByDisplayValue('产品规划')
  await user.click(screen.getByRole('button', { name: '页面菜单' }))
  await user.click(screen.getByRole('button', { name: '导出当前页面' }))

  await waitFor(() => {
    expect(fileAccess.pickSaveFilePath).toHaveBeenCalledWith({
      defaultPath: '产品规划.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
  })
  expect(pagePackageStorage.exportPagePackageToPath).toHaveBeenCalledWith(
    pageId,
    '/tmp/产品规划.zip',
    expect.any(Function),
  )
  expect(pagePackageStorage.exportPagePackage).not.toHaveBeenCalled()
  expect(fileAccess.saveBinaryFile).not.toHaveBeenCalled()
})
```

Add a desktop import assertion:

```ts
it('imports a page package as a new top-level page and navigates to it', async () => {
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const user = userEvent.setup()
  const pageId = 'page_import_source'
  const snapshot: WorkspaceSnapshot = {
    boards: [],
    dataTables: [],
    mindmaps: [],
    pages: [
      {
        id: pageId,
        parentId: null,
        title: '当前页面',
        icon: null,
        cover: null,
        blocks: [],
        createdAt: '2026-07-02T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    settings: { lastOpenedPageId: pageId },
  }

  pagePackageStorage.importPagePackageFromPath.mockResolvedValueOnce({
    rootPageId: 'page_imported',
  })

  render(<App repository={createMemoryRepository(snapshot)} initialEntries={[`/pages/${pageId}`]} />)

  await screen.findByDisplayValue('当前页面')
  await user.click(screen.getByRole('button', { name: '页面菜单' }))
  await user.click(screen.getByRole('button', { name: '导入页面包' }))

  await waitFor(() => {
    expect(fileAccess.openLocalFilePath).toHaveBeenCalledWith({
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
  })
  expect(confirm).toHaveBeenCalledWith('导入会新增为一个顶层页面，确认继续吗？')
  expect(pagePackageStorage.importPagePackageFromPath).toHaveBeenCalledWith(
    '/tmp/工作区备份.zip',
    expect.any(Function),
  )

  confirm.mockRestore()
})
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
npx vitest run src/components/export/ExportImportPanel.test.tsx src/app/App.test.tsx
```

Expected: FAIL because copy and app flow still use full-workspace archive names.

- [ ] **Step 3: Update copy and app imports**

In `src/ui/copy.ts`, replace `export` copy with:

```ts
export: {
  section: '页面导入导出',
  archive: '导出当前页面',
  importArchive: '导入页面包',
  exportingArchive: '正在导出当前页面',
  preparingImport: '正在准备导入页面包',
  importingArchive: '正在导入页面包',
  refreshingWorkspace: '正在刷新工作区',
  exportComplete: '当前页面已导出',
  importComplete: '页面包导入完成',
  exportError: '导出失败，请稍后重试。',
  importConfirm: '导入会新增为一个顶层页面，确认继续吗？',
  importError: '导入失败，请检查页面包格式。',
},
```

In `src/app/App.tsx`, replace imports from `../lib/assets`:

```ts
import {
  exportPagePackageToPath,
  exportPagePackage,
  importPagePackageFromPath,
  importPagePackage,
} from '../lib/assets'
```

Update the export branch to call page-package helpers:

```ts
const latestState = store.getState()
const currentPageId = latestState.currentPageId
const currentPage = latestState.pages.find((page) => page.id === currentPageId)

if (!currentPageId) {
  return
}

const defaultPath = `${sanitizeFileName(currentPage?.title ?? '')}.zip`
```

Desktop export call:

```ts
await exportPagePackageToPath(currentPageId, path, (progress) => {
  showArchiveProgress(uiCopy.export.exportingArchive, progress)
})
```

Browser fallback export call:

```ts
const contents = await exportPagePackage(currentPageId)
```

Desktop import call:

```ts
const result = await importPagePackageFromPath(file.path, (progress) => {
  showArchiveProgress(uiCopy.export.importingArchive, progress)
})
showArchiveTask({ label: uiCopy.export.refreshingWorkspace, percent: 95 })
await store.getState().bootstrap()
finishArchiveTask(uiCopy.export.importComplete)
return result.rootPageId
```

Browser fallback import call:

```ts
const result = await importPagePackage(file.contents)
showArchiveTask({ label: uiCopy.export.refreshingWorkspace, percent: 95 })
await store.getState().bootstrap()
finishArchiveTask(uiCopy.export.importComplete)
return result.rootPageId
```

- [ ] **Step 4: Run focused tests to verify they pass**

Run:

```bash
npx vitest run src/components/export/ExportImportPanel.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/copy.ts src/app/App.tsx src/app/App.test.tsx src/components/export/ExportImportPanel.test.tsx
git commit -m "feat: switch menu to page packages"
```

---

### Task 3: Implement Rust Page-Package Export

**Files:**
- Modify: `src-tauri/src/storage/models.rs`
- Modify: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: Write failing Rust export tests**

In the `#[cfg(test)] mod tests` section of `src-tauri/src/storage/mod.rs`, add:

```rust
#[test]
fn page_package_exports_current_page_tree_only() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    let asset = source
        .write_asset(WriteAssetInput {
            name: "image.png".to_string(),
            mime_type: "image/png".to_string(),
            bytes: b"image".to_vec(),
        })
        .expect("write asset");
    let mut snapshot = sample_snapshot();
    snapshot.pages.push(PageRecord {
        id: "page_child".to_string(),
        parent_id: Some("page_1".to_string()),
        title: "Child".to_string(),
        icon: None,
        cover: None,
        is_full_width: None,
        is_small_text: None,
        font_family: None,
        show_outline: None,
        blocks: vec![json!({
            "id": "block_image",
            "type": "image",
            "assetId": asset.id,
            "name": "image.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "image"
        })],
        created_at: "2026-07-02T00:00:00.000Z".to_string(),
        updated_at: "2026-07-02T00:00:00.000Z".to_string(),
    });
    snapshot.pages.push(PageRecord {
        id: "page_unrelated".to_string(),
        parent_id: None,
        title: "Unrelated".to_string(),
        icon: None,
        cover: None,
        is_full_width: None,
        is_small_text: None,
        font_family: None,
        show_outline: None,
        blocks: vec![],
        created_at: "2026-07-02T00:00:00.000Z".to_string(),
        updated_at: "2026-07-02T00:00:00.000Z".to_string(),
    });
    source
        .replace_workspace_backup(snapshot)
        .expect("replace snapshot");

    let archive = source
        .export_page_package("page_1")
        .expect("export page package");
    let cursor = Cursor::new(archive);
    let mut archive = zip::ZipArchive::new(cursor).expect("read archive");
    let manifest: PagePackageManifest = {
        let mut manifest_entry = archive
            .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
            .expect("page package manifest");
        serde_json::from_reader(&mut manifest_entry).expect("parse manifest")
    };

    assert_eq!(manifest.kind, PAGE_PACKAGE_KIND);
    assert_eq!(manifest.version, PAGE_PACKAGE_VERSION);
    assert_eq!(manifest.root_page_id, "page_1");
    assert_eq!(
        manifest.pages.iter().map(|page| page.id.as_str()).collect::<Vec<_>>(),
        vec!["page_1", "page_child"]
    );
    assert!(manifest.pages.iter().all(|page| page.id != "page_unrelated"));
    assert_eq!(manifest.assets.iter().map(|asset| asset.id.as_str()).collect::<Vec<_>>(), vec![asset.id.as_str()]);
    archive
        .by_name(&format!("assets/{}", asset.relative_path))
        .expect("asset entry exists");
}
```

- [ ] **Step 2: Run the Rust test to verify it fails**

Run:

```bash
cd src-tauri && cargo test page_package_exports_current_page_tree_only
```

Expected: FAIL because page-package types and export methods do not exist.

- [ ] **Step 3: Add page-package manifest model**

In `src-tauri/src/storage/models.rs`, add:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackageImportResult {
    pub root_page_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackageManifest {
    pub kind: String,
    pub version: u32,
    pub root_page_id: String,
    pub pages: Vec<PageRecord>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    pub assets: Vec<AssetMeta>,
}
```

Re-export these models in `src-tauri/src/storage/mod.rs` if the module already has a model export list:

```rust
pub use models::{
    AssetMeta, BoardRecord, BootstrapPayload, DataTableRecord, DeleteResult, ImportAssetFileInput,
    LoadedPage, MindmapRecord, PagePackageImportResult, PagePackageManifest, PageMeta, PageRecord,
    SaveResult, SearchResult, WorkspaceSettings, WorkspaceSnapshot, WriteAssetInput,
};
```

- [ ] **Step 4: Add export constants and helper collection functions**

Near the existing archive constants in `src-tauri/src/storage/mod.rs`, add:

```rust
pub const PAGE_PACKAGE_KIND: &str = "zhiqi.page-package";
pub const PAGE_PACKAGE_VERSION: u32 = 1;
pub const PAGE_PACKAGE_MANIFEST_ENTRY: &str = "page-package.json";
```

Add helpers near existing archive helper functions:

```rust
fn collect_ref_ids_from_pages(pages: &[PageRecord], ref_kind: &str) -> Vec<String> {
    let mut ids = Vec::new();
    for page in pages {
        for block in &page.blocks {
            let Some(block_type) = block.get("type").and_then(Value::as_str) else {
                continue;
            };
            let id = match (ref_kind, block_type) {
                ("board", "whiteboard") => block.get("boardId").and_then(Value::as_str),
                ("data_table", "data_table") | ("data_table", "data_table_inline") => {
                    block.get("databaseId").and_then(Value::as_str)
                }
                ("mindmap", "mindmap") => block.get("mindmapId").and_then(Value::as_str),
                _ => None,
            };
            if let Some(id) = id {
                if !ids.iter().any(|existing| existing == id) {
                    ids.push(id.to_string());
                }
            }
        }
    }
    ids
}

fn collect_asset_ids_from_pages(pages: &[PageRecord]) -> Vec<String> {
    let mut ids = Vec::new();
    for page in pages {
        for block in &page.blocks {
            let Some(block_type) = block.get("type").and_then(Value::as_str) else {
                continue;
            };
            if matches!(block_type, "image" | "video" | "audio") {
                if let Some(asset_id) = block.get("assetId").and_then(Value::as_str) {
                    if !ids.iter().any(|existing| existing == asset_id) {
                        ids.push(asset_id.to_string());
                    }
                }
            }
        }
    }
    ids
}

fn collect_asset_ids_from_data_tables(data_tables: &[DataTableRecord]) -> Vec<String> {
    let mut ids = Vec::new();
    for data_table in data_tables {
        let Some(assets) = data_table.snapshot.get("assets").and_then(Value::as_object) else {
            continue;
        };
        for asset_id in assets.keys() {
            if !ids.iter().any(|existing| existing == asset_id) {
                ids.push(asset_id.clone());
            }
        }
    }
    ids
}
```

- [ ] **Step 5: Add export methods**

Inside `impl Storage`, add methods next to the existing workspace archive methods:

```rust
pub fn export_page_package(&self, page_id: &str) -> StorageResult<Vec<u8>> {
    let mut ignore_progress = |_| {};
    self.write_page_package(page_id, Cursor::new(Vec::new()), None, &mut ignore_progress)
        .map(|cursor| cursor.into_inner())
}

pub fn export_page_package_to_path(&self, page_id: &str, path: impl AsRef<Path>) -> StorageResult<()> {
    let mut ignore_progress = |_| {};
    self.export_page_package_to_path_with_progress(page_id, path, None, &mut ignore_progress)
}

pub fn export_page_package_to_path_with_progress<F>(
    &self,
    page_id: &str,
    path: impl AsRef<Path>,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<()>
where
    F: FnMut(WorkspaceArchiveProgress),
{
    let file = fs::File::create(path)?;
    let writer = BufWriter::new(file);
    let mut writer = self.write_page_package(page_id, writer, task_id, progress)?;
    writer.flush()?;
    Ok(())
}
```

Add `write_page_package`:

```rust
fn write_page_package<W, F>(
    &self,
    page_id: &str,
    writer: W,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<W>
where
    W: Write + Seek,
    F: FnMut(WorkspaceArchiveProgress),
{
    let branch_ids = self.descendant_page_ids(page_id)?;
    if branch_ids.is_empty() {
        return Err(StorageError::not_found(format!("page not found: {page_id}")));
    }
    let branch_id_set = branch_ids.iter().collect::<std::collections::HashSet<_>>();
    let pages = self
        .load_pages()?
        .into_iter()
        .filter(|page| branch_id_set.contains(&page.id))
        .collect::<Vec<_>>();
    let board_ids = collect_ref_ids_from_pages(&pages, "board");
    let data_table_ids = collect_ref_ids_from_pages(&pages, "data_table");
    let mindmap_ids = collect_ref_ids_from_pages(&pages, "mindmap");
    let boards = self
        .load_boards()?
        .into_iter()
        .filter(|board| board_ids.iter().any(|id| id == &board.id))
        .collect::<Vec<_>>();
    let data_tables = self
        .load_data_tables()?
        .into_iter()
        .filter(|data_table| data_table_ids.iter().any(|id| id == &data_table.id))
        .collect::<Vec<_>>();
    let mindmaps = self
        .load_mindmaps()?
        .into_iter()
        .filter(|mindmap| mindmap_ids.iter().any(|id| id == &mindmap.id))
        .collect::<Vec<_>>();
    let mut asset_ids = collect_asset_ids_from_pages(&pages);
    for asset_id in collect_asset_ids_from_data_tables(&data_tables) {
        if !asset_ids.iter().any(|existing| existing == &asset_id) {
            asset_ids.push(asset_id);
        }
    }
    let assets = assets::load_assets_by_ids(&self.connection, &asset_ids)?;
    let manifest = PagePackageManifest {
        kind: PAGE_PACKAGE_KIND.to_string(),
        version: PAGE_PACKAGE_VERSION,
        root_page_id: page_id.to_string(),
        pages,
        boards,
        data_tables,
        mindmaps,
        assets,
    };

    self.write_page_package_archive(manifest, writer, task_id, progress)
}
```

Add `write_page_package_archive` by copying the existing `write_workspace_archive` structure but use `PAGE_PACKAGE_MANIFEST_ENTRY` instead of `workspace.json`, and use `manifest.assets` instead of global referenced assets.

- [ ] **Step 6: Add asset lookup helper**

In `src-tauri/src/storage/assets.rs`, add:

```rust
pub fn load_assets_by_ids(
    connection: &Connection,
    asset_ids: &[String],
) -> StorageResult<Vec<AssetMeta>> {
    let mut assets = Vec::new();
    for asset_id in asset_ids {
        let asset = connection
            .query_row(
                "SELECT id, sha256, name, mime_type, byte_size, relative_path, created_at
                  FROM zhiqi_assets WHERE id = ?1",
                [asset_id],
                |row| {
                    Ok(AssetMeta {
                        id: row.get(0)?,
                        sha256: row.get(1)?,
                        name: row.get(2)?,
                        mime_type: row.get(3)?,
                        byte_size: row.get(4)?,
                        relative_path: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .optional()?;
        if let Some(asset) = asset {
            assets.push(asset);
        }
    }
    Ok(assets)
}
```

Import `rusqlite::OptionalExtension` at the top of `assets.rs`:

```rust
use rusqlite::{params, Connection, OptionalExtension};
```

- [ ] **Step 7: Run the Rust export test**

Run:

```bash
cd src-tauri && cargo test page_package_exports_current_page_tree_only
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/storage/models.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/assets.rs
git commit -m "feat: export page packages"
```

---

### Task 4: Implement Rust Page-Package Import and Id Rewriting

**Files:**
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/storage/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust import tests**

Add this test to `src-tauri/src/storage/mod.rs`:

```rust
#[test]
fn page_package_import_adds_new_top_level_tree_with_new_ids() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    let asset = source
        .write_asset(WriteAssetInput {
            name: "image.png".to_string(),
            mime_type: "image/png".to_string(),
            bytes: b"image".to_vec(),
        })
        .expect("write asset");
    let mut snapshot = sample_snapshot();
    snapshot.pages[0].blocks.push(json!({
        "id": "block_image",
        "type": "image",
        "assetId": asset.id,
        "name": "image.png",
        "mimeType": "image/png",
        "caption": "",
        "alt": "image"
    }));
    snapshot.pages.push(PageRecord {
        id: "page_child".to_string(),
        parent_id: Some("page_1".to_string()),
        title: "Child".to_string(),
        icon: None,
        cover: None,
        is_full_width: None,
        is_small_text: None,
        font_family: None,
        show_outline: None,
        blocks: vec![],
        created_at: "2026-07-02T00:00:00.000Z".to_string(),
        updated_at: "2026-07-02T00:00:00.000Z".to_string(),
    });
    source
        .replace_workspace_backup(snapshot)
        .expect("replace snapshot");
    let archive = source.export_page_package("page_1").expect("export package");

    let target = Storage::open_in_memory_for_tests().expect("target opens");
    let existing_snapshot = sample_snapshot();
    target
        .replace_workspace_backup(existing_snapshot.clone())
        .expect("seed target");

    let result = target
        .import_page_package(archive)
        .expect("import page package");
    let imported = target.export_workspace_backup().expect("export target");

    assert_ne!(result.root_page_id, "page_1");
    assert!(imported.pages.iter().any(|page| page.id == "page_1"));
    let imported_root = imported
        .pages
        .iter()
        .find(|page| page.id == result.root_page_id)
        .expect("imported root exists");
    assert_eq!(imported_root.parent_id, None);
    assert_eq!(imported_root.title, "Home");
    let imported_child = imported
        .pages
        .iter()
        .find(|page| page.parent_id.as_deref() == Some(result.root_page_id.as_str()))
        .expect("imported child exists");
    assert_ne!(imported_child.id, "page_child");
    let image_block = imported_root
        .blocks
        .iter()
        .find(|block| block.get("type").and_then(Value::as_str) == Some("image"))
        .expect("image block exists");
    assert_ne!(image_block.get("id").and_then(Value::as_str), Some("block_image"));
    assert!(image_block.get("assetId").and_then(Value::as_str).is_some());
}

#[test]
fn page_package_import_rejects_workspace_archives() {
    let source = Storage::open_in_memory_for_tests().expect("source opens");
    source
        .replace_workspace_backup(sample_snapshot())
        .expect("seed source");
    let workspace_archive = source
        .export_workspace_archive()
        .expect("export workspace archive");
    let target = Storage::open_in_memory_for_tests().expect("target opens");
    target
        .replace_workspace_backup(sample_snapshot())
        .expect("seed target");
    let before = target.export_workspace_backup().expect("snapshot before");

    let error = target
        .import_page_package(workspace_archive)
        .expect_err("workspace archive rejected");

    assert_eq!(error.code(), "invalid_payload");
    assert_eq!(target.export_workspace_backup().expect("snapshot after"), before);
}
```

- [ ] **Step 2: Run the Rust import tests to verify they fail**

Run:

```bash
cd src-tauri && cargo test page_package_import
```

Expected: FAIL because import methods and id-rewrite helpers do not exist.

- [ ] **Step 3: Add import methods**

Inside `impl Storage`, add:

```rust
pub fn import_page_package(&self, bytes: Vec<u8>) -> StorageResult<PagePackageImportResult> {
    let mut ignore_progress = |_| {};
    let cursor = Cursor::new(bytes);
    self.import_page_package_reader(cursor, None, &mut ignore_progress)
}

pub fn import_page_package_from_path(&self, path: impl AsRef<Path>) -> StorageResult<PagePackageImportResult> {
    let mut ignore_progress = |_| {};
    self.import_page_package_from_path_with_progress(path, None, &mut ignore_progress)
}

pub fn import_page_package_from_path_with_progress<F>(
    &self,
    path: impl AsRef<Path>,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<PagePackageImportResult>
where
    F: FnMut(WorkspaceArchiveProgress),
{
    let file = fs::File::open(path)?;
    self.import_page_package_reader(BufReader::new(file), task_id, progress)
}
```

- [ ] **Step 4: Add id generation and JSON rewrite helpers**

Add helpers near archive helpers:

```rust
fn import_id(prefix: &str, counter: &mut u64) -> String {
    *counter += 1;
    format!("{prefix}_import_{}_{}", now_millis(), counter)
}

fn rewrite_block_ids_and_refs(
    blocks: &mut [Value],
    page_id_map: &std::collections::HashMap<String, String>,
    board_id_map: &std::collections::HashMap<String, String>,
    data_table_id_map: &std::collections::HashMap<String, String>,
    mindmap_id_map: &std::collections::HashMap<String, String>,
    asset_id_map: &std::collections::HashMap<String, String>,
    counter: &mut u64,
) {
    for block in blocks {
        let Some(object) = block.as_object_mut() else {
            continue;
        };
        if object.contains_key("id") {
            object.insert("id".to_string(), Value::String(import_id("block", counter)));
        }
        if let Some(Value::String(page_id)) = object.get_mut("pageId") {
            if let Some(next_id) = page_id_map.get(page_id) {
                *page_id = next_id.clone();
            }
        }
        if let Some(Value::String(board_id)) = object.get_mut("boardId") {
            if let Some(next_id) = board_id_map.get(board_id) {
                *board_id = next_id.clone();
            }
        }
        if let Some(Value::String(database_id)) = object.get_mut("databaseId") {
            if let Some(next_id) = data_table_id_map.get(database_id) {
                *database_id = next_id.clone();
            }
        }
        if let Some(Value::String(mindmap_id)) = object.get_mut("mindmapId") {
            if let Some(next_id) = mindmap_id_map.get(mindmap_id) {
                *mindmap_id = next_id.clone();
            }
        }
        if let Some(Value::String(asset_id)) = object.get_mut("assetId") {
            if let Some(next_id) = asset_id_map.get(asset_id) {
                *asset_id = next_id.clone();
            }
        }
    }
}
```

Add a data-table asset rewrite helper:

```rust
fn rewrite_data_table_asset_refs(
    snapshot: &mut Value,
    asset_id_map: &std::collections::HashMap<String, String>,
) {
    if let Some(assets) = snapshot.get_mut("assets").and_then(Value::as_object_mut) {
        let old_assets = std::mem::take(assets);
        for (asset_id, mut asset_value) in old_assets {
            let next_asset_id = asset_id_map.get(&asset_id).cloned().unwrap_or(asset_id);
            if let Some(object) = asset_value.as_object_mut() {
                object.insert("id".to_string(), Value::String(next_asset_id.clone()));
            }
            assets.insert(next_asset_id, asset_value);
        }
    }
    if let Some(blocks) = snapshot.get_mut("blocks").and_then(Value::as_object_mut) {
        for block in blocks.values_mut() {
            if let Some(image_asset_id) = block
                .get_mut("imageAssetId")
                .and_then(Value::as_str)
                .map(str::to_string)
            {
                if let Some(next_id) = asset_id_map.get(&image_asset_id) {
                    if let Some(object) = block.as_object_mut() {
                        object.insert("imageAssetId".to_string(), Value::String(next_id.clone()));
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 5: Implement `import_page_package_reader`**

Add:

```rust
fn import_page_package_reader<R, F>(
    &self,
    reader: R,
    task_id: Option<&str>,
    progress: &mut F,
) -> StorageResult<PagePackageImportResult>
where
    R: Read + Seek,
    F: FnMut(WorkspaceArchiveProgress),
{
    let mut archive = zip::ZipArchive::new(reader).map_err(zip_error)?;
    report_archive_progress(
        task_id,
        progress,
        WorkspaceArchiveOperation::Import,
        WorkspaceArchiveProgressPhase::Preparing,
        0,
        0,
        0,
        0,
        None,
    );
    let manifest: PagePackageManifest = {
        let mut manifest_entry = archive
            .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
            .map_err(|_| StorageError::invalid_payload("not a zhiqi page package"))?;
        serde_json::from_reader(&mut manifest_entry)?
    };
    if manifest.kind != PAGE_PACKAGE_KIND || manifest.version != PAGE_PACKAGE_VERSION {
        return Err(StorageError::invalid_payload("unsupported page package"));
    }
    if !manifest.pages.iter().any(|page| page.id == manifest.root_page_id) {
        return Err(StorageError::invalid_payload("page package root is missing"));
    }

    let total_assets = manifest.assets.len() as u64;
    let bytes_total = total_asset_bytes(&manifest.assets);
    let mut bytes_processed = 0;
    let mut asset_id_map = std::collections::HashMap::new();

    for (index, asset) in manifest.assets.iter().enumerate() {
        let archive_path = format!("assets/{}", asset.relative_path);
        let mut asset_file = archive.by_name(&archive_path).map_err(zip_error)?;
        let current = index as u64 + 1;
        let item_name = asset.name.clone();
        let mut copied_for_asset = 0;
        let imported = assets::write_asset_from_reader(
            &self.connection,
            &self.assets_dir,
            asset.name.clone(),
            asset.mime_type.clone(),
            &mut asset_file,
            &mut |asset_copied| {
                copied_for_asset = asset_copied;
                report_archive_progress(
                    task_id,
                    progress,
                    WorkspaceArchiveOperation::Import,
                    WorkspaceArchiveProgressPhase::ProcessingAsset,
                    current,
                    total_assets,
                    bytes_processed + asset_copied,
                    bytes_total,
                    Some(item_name.clone()),
                );
            },
        )?;
        bytes_processed += copied_for_asset;
        asset_id_map.insert(asset.id.clone(), imported.id);
    }

    let mut counter = 0;
    let mut page_id_map = std::collections::HashMap::new();
    let mut board_id_map = std::collections::HashMap::new();
    let mut data_table_id_map = std::collections::HashMap::new();
    let mut mindmap_id_map = std::collections::HashMap::new();
    for page in &manifest.pages {
        page_id_map.insert(page.id.clone(), import_id("page", &mut counter));
    }
    for board in &manifest.boards {
        board_id_map.insert(board.id.clone(), import_id("board", &mut counter));
    }
    for data_table in &manifest.data_tables {
        data_table_id_map.insert(data_table.id.clone(), import_id("database", &mut counter));
    }
    for mindmap in &manifest.mindmaps {
        mindmap_id_map.insert(mindmap.id.clone(), import_id("mindmap", &mut counter));
    }

    let root_page_id = page_id_map
        .get(&manifest.root_page_id)
        .cloned()
        .ok_or_else(|| StorageError::invalid_payload("page package root is missing"))?;

    self.with_transaction(|| {
        let mut board_position = self.next_position("zhiqi_boards");
        for board in &manifest.boards {
            let mut next_board = board.clone();
            next_board.id = board_id_map[&board.id].clone();
            self.insert_board(&next_board, board_position)?;
            board_position += 1;
        }

        let mut data_table_position = self.next_position("zhiqi_data_tables");
        for data_table in &manifest.data_tables {
            let mut next_data_table = data_table.clone();
            next_data_table.id = data_table_id_map[&data_table.id].clone();
            rewrite_data_table_asset_refs(&mut next_data_table.snapshot, &asset_id_map);
            if let Some(database) = next_data_table
                .snapshot
                .get_mut("database")
                .and_then(Value::as_object_mut)
            {
                database.insert("id".to_string(), Value::String(next_data_table.id.clone()));
            }
            self.insert_data_table(&next_data_table, data_table_position)?;
            data_table_position += 1;
        }

        let mut mindmap_position = self.next_position("zhiqi_mindmaps");
        for mindmap in &manifest.mindmaps {
            let mut next_mindmap = mindmap.clone();
            next_mindmap.id = mindmap_id_map[&mindmap.id].clone();
            self.insert_mindmap(&next_mindmap, mindmap_position)?;
            mindmap_position += 1;
        }

        let mut page_position = self.next_position("zhiqi_pages");
        for page in &manifest.pages {
            let mut next_page = page.clone();
            next_page.id = page_id_map[&page.id].clone();
            next_page.parent_id = page
                .parent_id
                .as_ref()
                .and_then(|parent_id| page_id_map.get(parent_id).cloned());
            rewrite_block_ids_and_refs(
                &mut next_page.blocks,
                &page_id_map,
                &board_id_map,
                &data_table_id_map,
                &mindmap_id_map,
                &asset_id_map,
                &mut counter,
            );
            self.insert_page(&next_page, page_position)?;
            page_position += 1;
        }
        self.rebuild_resource_search_documents()?;
        Ok(())
    })?;

    report_archive_progress(
        task_id,
        progress,
        WorkspaceArchiveOperation::Import,
        WorkspaceArchiveProgressPhase::Complete,
        total_assets,
        total_assets,
        bytes_total,
        bytes_total,
        None,
    );

    Ok(PagePackageImportResult { root_page_id })
}
```

- [ ] **Step 6: Add Tauri commands**

In `src-tauri/src/storage/commands.rs`, import `PagePackageImportResult` and add:

```rust
#[tauri::command]
pub async fn export_page_package(
    state: State<'_, StorageState>,
    page_id: String,
) -> StorageResult<Vec<u8>> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        storage.export_page_package(&page_id)
    })
    .await
}

#[tauri::command]
pub async fn export_page_package_to_path(
    app: AppHandle,
    state: State<'_, StorageState>,
    page_id: String,
    path: String,
    task_id: Option<String>,
) -> StorageResult<()> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        if task_id.is_none() {
            return storage.export_page_package_to_path(&page_id, &path);
        }
        storage.export_page_package_to_path_with_progress(
            &page_id,
            &path,
            task_id.as_deref(),
            &mut |progress| emit_archive_progress(&app, progress),
        )
    })
    .await
}

#[tauri::command]
pub async fn import_page_package(
    state: State<'_, StorageState>,
    bytes: Vec<u8>,
) -> StorageResult<PagePackageImportResult> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        storage.import_page_package(bytes)
    })
    .await
}

#[tauri::command]
pub async fn import_page_package_from_path(
    app: AppHandle,
    state: State<'_, StorageState>,
    path: String,
    task_id: Option<String>,
) -> StorageResult<PagePackageImportResult> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        if task_id.is_none() {
            return storage.import_page_package_from_path(&path);
        }
        storage.import_page_package_from_path_with_progress(
            &path,
            task_id.as_deref(),
            &mut |progress| emit_archive_progress(&app, progress),
        )
    })
    .await
}
```

In `src-tauri/src/lib.rs`, register these commands:

```rust
storage::commands::export_page_package,
storage::commands::export_page_package_to_path,
storage::commands::import_page_package,
storage::commands::import_page_package_from_path,
```

Remove these from the command registration after the frontend no longer imports them:

```rust
storage::commands::export_workspace_archive,
storage::commands::export_workspace_archive_to_path,
storage::commands::import_workspace_archive,
storage::commands::import_workspace_archive_from_path,
```

- [ ] **Step 7: Run Rust import tests**

Run:

```bash
cd src-tauri && cargo test page_package_import
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/storage/mod.rs src-tauri/src/storage/commands.rs src-tauri/src/lib.rs
git commit -m "feat: import page packages"
```

---

### Task 5: Remove Full-Workspace Archive UI Surface and Verify

**Files:**
- Modify: `src/lib/storageClient.ts`
- Modify: `src/lib/assets.ts`
- Modify: `src/lib/storageClient.test.ts`
- Modify: `src/app/App.test.tsx`
- Modify: `README.md`
- Test: frontend and Rust suites

- [ ] **Step 1: Remove full-workspace archive client exports**

In `src/lib/storageClient.ts`, remove user-facing methods from `WorkspaceStorageClient` if no longer used:

```ts
exportWorkspaceArchiveToPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<void>
exportWorkspaceArchive(): Promise<Uint8Array>
importWorkspaceArchive(bytes: Uint8Array): Promise<void>
importWorkspaceArchiveFromPath(
  path: string,
  onProgress?: WorkspaceArchiveProgressHandler,
): Promise<void>
```

Remove their `createTauriStorageClient()` implementations. Keep `exportWorkspaceBackup()` and `replaceWorkspaceBackup()` because `WorkspaceRepository` uses them for normal persistence.

In `src/lib/assets.ts`, remove:

```ts
export function exportWorkspaceArchive() { ... }
export function exportWorkspaceArchiveToPath(...) { ... }
export function importWorkspaceArchive(...) { ... }
export function importWorkspaceArchiveFromPath(...) { ... }
```

- [ ] **Step 2: Remove obsolete frontend tests**

In `src/lib/storageClient.test.ts`, remove or rewrite tests whose only purpose is full-workspace archive commands:

```ts
it('exports and imports complete workspace archive bytes', ...)
it('subscribes to archive progress while exporting directly to a path', ...)
it('imports complete workspace archives directly from a desktop path with progress', ...)
it('normalizes archive bytes returned from Tauri into a Uint8Array', ...)
```

Keep page-package equivalents from Task 1.

In `src/app/App.test.tsx`, remove assertions that mention:

```ts
创建完整备份
从备份恢复
正在导出完整备份
正在恢复完整备份
完整备份已导出
备份恢复完成
```

Keep page-package assertions from Task 2.

- [ ] **Step 3: Update README copy**

In `README.md`, replace backup wording in the feature list:

```md
- 📦 **页面包导出**：支持导出当前页面及其子页面，包含页面引用的结构化资源和文件资产。
- ♻️ **页面包导入**：支持把页面包导入为新的顶层页面，不覆盖现有本地内容。
```

Replace the data section with:

```md
工作区核心数据保存在本地 SQLite 数据库 `zhiqi.db` 中。页面包 ZIP 导出会生成页面包清单和相关文件资产；页面包导入会新增为顶层页面树，不覆盖现有页面。删除和清理资源前仍建议谨慎确认。
```

- [ ] **Step 4: Run focused frontend tests**

Run:

```bash
npx vitest run src/lib/storageClient.test.ts src/components/export/ExportImportPanel.test.tsx src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run focused Rust tests**

Run:

```bash
cd src-tauri && cargo test page_package
```

Expected: PASS.

- [ ] **Step 6: Run project verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add README.md src/lib/storageClient.ts src/lib/assets.ts src/lib/storageClient.test.ts src/app/App.test.tsx
git commit -m "refactor: remove workspace archive UI surface"
```

---

## Self-Review

- Spec coverage: current page plus descendants export is covered by Task 3; top-level import without overwrite is covered by Task 4; UI copy and full-workspace removal are covered by Tasks 2 and 5; progress and path-based desktop handling are covered by Tasks 1, 2, and 4.
- Placeholder scan: no placeholder markers or deferred instructions remain.
- Type consistency: frontend result type is `PagePackageImportResult { rootPageId: string }`; Rust result type is `PagePackageImportResult { root_page_id: String }` with camelCase serde mapping; Tauri command names match storage-client wrappers.
- Implementation constraint noted: media asset rows remain content-addressed by existing schema; import rewrites references to the returned asset id instead of breaking asset deduplication.
