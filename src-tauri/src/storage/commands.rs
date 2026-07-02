use tauri::{async_runtime, AppHandle, Emitter, State};

use super::{
    AssetMeta, BoardRecord, BootstrapPayload, DataTableRecord, DeleteResult, ImportAssetFileInput,
    LoadedPage, MindmapRecord, PageRecord, SaveResult, SearchResult, Storage, StorageError,
    StorageResult, StorageState, WorkspaceArchiveProgress, WorkspaceSnapshot, WriteAssetInput,
    WORKSPACE_ARCHIVE_PROGRESS_EVENT,
};

#[tauri::command]
pub fn bootstrap_workspace(state: State<'_, StorageState>) -> StorageResult<BootstrapPayload> {
    state.with_storage(|storage| storage.bootstrap_workspace())
}

#[tauri::command]
pub fn export_workspace_backup(
    state: State<'_, StorageState>,
) -> StorageResult<Option<WorkspaceSnapshot>> {
    state.with_storage(|storage| storage.load_workspace_backup())
}

#[tauri::command]
pub fn replace_workspace_backup(
    state: State<'_, StorageState>,
    payload: WorkspaceSnapshot,
) -> StorageResult<()> {
    state.with_storage(|storage| storage.replace_workspace_backup(payload))
}

#[tauri::command]
pub async fn export_workspace_archive(state: State<'_, StorageState>) -> StorageResult<Vec<u8>> {
    with_storage_blocking(state.inner().clone(), |storage| {
        storage.export_workspace_archive()
    })
    .await
}

#[tauri::command]
pub async fn export_workspace_archive_to_path(
    app: AppHandle,
    state: State<'_, StorageState>,
    path: String,
    task_id: Option<String>,
) -> StorageResult<()> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        if task_id.is_none() {
            return storage.export_workspace_archive_to_path(&path);
        }

        storage.export_workspace_archive_to_path_with_progress(
            &path,
            task_id.as_deref(),
            &mut |progress| emit_archive_progress(&app, progress),
        )
    })
    .await
}

#[tauri::command]
pub async fn import_workspace_archive(
    state: State<'_, StorageState>,
    bytes: Vec<u8>,
) -> StorageResult<()> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        storage.import_workspace_archive(bytes)
    })
    .await
}

#[tauri::command]
pub async fn import_workspace_archive_from_path(
    app: AppHandle,
    state: State<'_, StorageState>,
    path: String,
    task_id: Option<String>,
) -> StorageResult<()> {
    with_storage_blocking(state.inner().clone(), move |storage| {
        if task_id.is_none() {
            return storage.import_workspace_archive_from_path(&path);
        }

        storage.import_workspace_archive_from_path_with_progress(
            &path,
            task_id.as_deref(),
            &mut |progress| emit_archive_progress(&app, progress),
        )
    })
    .await
}

fn emit_archive_progress(app: &AppHandle, progress: WorkspaceArchiveProgress) {
    let _ = app.emit(WORKSPACE_ARCHIVE_PROGRESS_EVENT, progress);
}

async fn with_storage_blocking<T>(
    state: StorageState,
    task: impl FnOnce(&Storage) -> StorageResult<T> + Send + 'static,
) -> StorageResult<T>
where
    T: Send + 'static,
{
    async_runtime::spawn_blocking(move || state.with_storage(task))
        .await
        .map_err(|error| StorageError::new("internal_error", error.to_string()))?
}

#[tauri::command]
pub fn load_page(state: State<'_, StorageState>, page_id: String) -> StorageResult<LoadedPage> {
    state.with_storage(|storage| storage.load_page(&page_id))
}

#[tauri::command]
pub fn save_page(state: State<'_, StorageState>, page: PageRecord) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_page(page))
}

#[tauri::command]
pub fn delete_page_branch(
    state: State<'_, StorageState>,
    page_id: String,
) -> StorageResult<DeleteResult> {
    state.with_storage(|storage| storage.delete_page_branch(&page_id))
}

#[tauri::command]
pub fn save_board(state: State<'_, StorageState>, board: BoardRecord) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_board(board))
}

#[tauri::command]
pub fn load_board_snapshot(
    state: State<'_, StorageState>,
    board_id: String,
) -> StorageResult<serde_json::Value> {
    state.with_storage(|storage| storage.load_board_snapshot(&board_id))
}

#[tauri::command]
pub fn save_mindmap(
    state: State<'_, StorageState>,
    mindmap: MindmapRecord,
) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_mindmap(mindmap))
}

#[tauri::command]
pub fn load_mindmap_snapshot(
    state: State<'_, StorageState>,
    mindmap_id: String,
) -> StorageResult<serde_json::Value> {
    state.with_storage(|storage| storage.load_mindmap_snapshot(&mindmap_id))
}

#[tauri::command]
pub fn load_data_table(
    state: State<'_, StorageState>,
    data_table_id: String,
) -> StorageResult<DataTableRecord> {
    state.with_storage(|storage| storage.load_data_table(&data_table_id))
}

#[tauri::command]
pub fn save_data_table_metadata(
    state: State<'_, StorageState>,
    data_table: DataTableRecord,
) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_data_table(data_table))
}

#[tauri::command]
pub fn save_data_table_record(
    state: State<'_, StorageState>,
    data_table: DataTableRecord,
) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_data_table(data_table))
}

#[tauri::command]
pub fn delete_data_table_record(
    state: State<'_, StorageState>,
    data_table: DataTableRecord,
) -> StorageResult<SaveResult> {
    state.with_storage(|storage| storage.save_data_table(data_table))
}

#[tauri::command]
pub fn write_asset(
    state: State<'_, StorageState>,
    input: WriteAssetInput,
) -> StorageResult<AssetMeta> {
    state.with_storage(|storage| storage.write_asset(input))
}

#[tauri::command]
pub fn import_asset_file(
    state: State<'_, StorageState>,
    input: ImportAssetFileInput,
) -> StorageResult<AssetMeta> {
    state.with_storage(|storage| storage.import_asset_file(input))
}

#[tauri::command]
pub fn read_asset(state: State<'_, StorageState>, asset_id: String) -> StorageResult<Vec<u8>> {
    state.with_storage(|storage| storage.read_asset(&asset_id))
}

#[tauri::command]
pub fn get_asset_file_path(
    state: State<'_, StorageState>,
    asset_id: String,
) -> StorageResult<String> {
    state.with_storage(|storage| storage.get_asset_file_path(&asset_id))
}

#[tauri::command]
pub fn cleanup_orphan_assets(state: State<'_, StorageState>) -> Result<usize, StorageError> {
    state.with_storage(|storage| storage.cleanup_orphan_assets())
}

#[tauri::command]
pub fn search_workspace(
    state: State<'_, StorageState>,
    query: String,
    limit: Option<usize>,
) -> StorageResult<Vec<SearchResult>> {
    state.with_storage(|storage| storage.search_workspace(&query, limit.unwrap_or(30)))
}
