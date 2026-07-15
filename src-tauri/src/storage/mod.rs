mod assets;
mod auto_backup;
pub mod commands;
mod error;
mod mcp;
mod models;
mod schema;
mod search;

use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{self, BufReader, BufWriter, Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;

pub use error::{StorageError, StorageResult};
pub use mcp::{McpWhiteboardUpdate, McpWhiteboardUpdateResult, McpWriteBatch, McpWriteResult};
#[allow(unused_imports)]
pub use auto_backup::AutoBackupRecord;
#[allow(unused_imports)]
pub use models::PagePackageImportResult;
pub use models::{
    AppSettings, AssetMeta, BoardRecord, BootstrapPayload, DataTableRecord, DeleteResult,
    ExchangeArchiveManifest, ImportAssetFileInput, LoadedPage, McpSettings, MindmapRecord,
    PageMeta, PagePackageManifest, PagePackagePayload, PagePropertyDefinition, PageRecord,
    SaveResult, SearchResult, SyncedBlockGroupRecord, TrackedAssetWrite, WorkspaceSettings,
    WorkspaceArchivePayload, WorkspaceSnapshot, WriteAssetInput,
};

const DATABASE_FILE_NAME: &str = "zhiqi.db";
const ASSETS_DIR_NAME: &str = "zhiqi-assets";
const SETTINGS_ID: &str = "workspace";
const APP_SETTINGS_ID: &str = "appSettings";
const PAGE_PROPERTIES_SETTINGS_ID: &str = "page_properties";
#[allow(dead_code)]
pub const PAGE_PACKAGE_KIND: &str = "zhiqi.page-package";
const LEGACY_PAGE_PACKAGE_KIND: &str = "zhixi.page-package";
#[allow(dead_code)]
pub const PAGE_PACKAGE_VERSION: u32 = 1;
#[allow(dead_code)]
pub const PAGE_PACKAGE_MANIFEST_ENTRY: &str = "page-package.json";
pub const EXCHANGE_ARCHIVE_FORMAT: &str = "zhiqi.exchange";
pub const EXCHANGE_ARCHIVE_VERSION: u32 = 2;
pub const EXCHANGE_MANIFEST_ENTRY: &str = "manifest.json";
pub const EXCHANGE_PAYLOAD_ENTRY: &str = "payload.json";
pub const EXCHANGE_ASSET_MANIFEST_ENTRY: &str = "assets/manifest.json";
const EXCHANGE_PAGE_PACKAGE_KIND: &str = "page-package";
const EXCHANGE_WORKSPACE_BACKUP_KIND: &str = "workspace-backup";
pub const WORKSPACE_ARCHIVE_PROGRESS_EVENT: &str = "zhiqi://workspace-archive-progress";
static IMPORT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceArchiveOperation {
    Export,
    Import,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceArchiveProgressPhase {
    Preparing,
    WritingMetadata,
    ProcessingAsset,
    Finalizing,
    Complete,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArchiveProgress {
    pub task_id: String,
    pub operation: WorkspaceArchiveOperation,
    pub phase: WorkspaceArchiveProgressPhase,
    pub current: u64,
    pub total: u64,
    pub bytes_processed: u64,
    pub bytes_total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_name: Option<String>,
}

#[derive(Clone)]
pub struct StorageState {
    storage: Arc<Mutex<Storage>>,
}

impl StorageState {
    pub fn open(data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        Ok(Self {
            storage: Arc::new(Mutex::new(Storage::open(data_dir)?)),
        })
    }

    pub fn with_storage<T>(
        &self,
        task: impl FnOnce(&Storage) -> StorageResult<T>,
    ) -> StorageResult<T> {
        let storage = self
            .storage
            .lock()
            .map_err(|_| StorageError::new("conflict", "storage lock poisoned"))?;
        task(&storage)
    }

    #[cfg(test)]
    pub fn open_in_memory_for_tests() -> StorageResult<Self> {
        Ok(Self {
            storage: Arc::new(Mutex::new(Storage::open_in_memory_for_tests()?)),
        })
    }
}

pub struct Storage {
    connection: Connection,
    assets_dir: PathBuf,
    auto_backup_dir: PathBuf,
}

impl Storage {
    pub fn open(data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        let data_dir = data_dir.as_ref();
        fs::create_dir_all(data_dir)?;
        let connection = Connection::open(data_dir.join(DATABASE_FILE_NAME))?;
        let storage = Self {
            connection,
            assets_dir: data_dir.join(ASSETS_DIR_NAME),
            auto_backup_dir: data_dir.join(auto_backup::AUTO_BACKUP_DIR_NAME),
        };
        schema::initialize_schema(&storage.connection)?;
        if storage.search_documents_need_rebuild()? {
            storage.rebuild_search_documents()?;
        }
        Ok(storage)
    }

    #[cfg(test)]
    pub fn open_in_memory_for_tests() -> StorageResult<Self> {
        let connection = Connection::open_in_memory()?;
        let storage = Self {
            connection,
            assets_dir: unique_test_assets_dir(),
            auto_backup_dir: unique_test_data_dir("auto-backups").join(auto_backup::AUTO_BACKUP_DIR_NAME),
        };
        schema::initialize_schema(&storage.connection)?;
        Ok(storage)
    }

    #[cfg(test)]
    pub fn schema_version(&self) -> StorageResult<i64> {
        self.connection
            .query_row(
                "SELECT value FROM zhiqi_meta WHERE key = 'schema_version'",
                [],
                |row| row.get::<_, String>(0),
            )?
            .parse::<i64>()
            .map_err(|error| StorageError::invalid_payload(error.to_string()))
    }

    #[cfg(test)]
    pub fn pragma_string(&self, name: &str) -> StorageResult<String> {
        self.connection
            .query_row(&format!("PRAGMA {name}"), [], |row| row.get(0))
            .map_err(Into::into)
    }

    #[cfg(test)]
    pub fn pragma_i64(&self, name: &str) -> StorageResult<i64> {
        self.connection
            .query_row(&format!("PRAGMA {name}"), [], |row| row.get(0))
            .map_err(Into::into)
    }

    pub fn has_workspace(&self) -> StorageResult<bool> {
        let count: i64 = self.connection.query_row(
            "SELECT COUNT(*) FROM zhiqi_settings WHERE id = ?1",
            [SETTINGS_ID],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn bootstrap_workspace(&self) -> StorageResult<BootstrapPayload> {
        Ok(BootstrapPayload {
            pages: self
                .load_pages()?
                .iter()
                .map(PageMeta::from)
                .collect::<Vec<_>>(),
            boards: self.load_boards()?,
            data_tables: self.load_data_tables()?,
            mindmaps: self.load_mindmaps()?,
            synced_block_groups: self.load_synced_block_groups()?,
            settings: self.load_settings()?,
        })
    }

    pub fn export_workspace_backup(&self) -> StorageResult<WorkspaceSnapshot> {
        let settings = self
            .load_settings()?
            .ok_or_else(|| StorageError::not_found("workspace settings not found"))?;

        Ok(WorkspaceSnapshot {
            boards: self.load_boards()?,
            data_tables: self.load_data_tables()?,
            mindmaps: self.load_mindmaps()?,
            synced_block_groups: self.load_synced_block_groups()?,
            pages: self.load_pages()?,
            page_properties: self.load_page_properties()?,
            settings,
        })
    }

    pub fn export_workspace_archive(&self) -> StorageResult<Vec<u8>> {
        let workspace = self.export_workspace_backup()?;
        let assets = self.load_workspace_archive_assets(&workspace)?;
        let payload = WorkspaceArchivePayload { workspace };
        let manifest = ExchangeArchiveManifest {
            format: EXCHANGE_ARCHIVE_FORMAT.to_string(),
            format_version: EXCHANGE_ARCHIVE_VERSION,
            kind: EXCHANGE_WORKSPACE_BACKUP_KIND.to_string(),
            created_with: env!("CARGO_PKG_VERSION").to_string(),
            created_at: now_nanos().to_string(),
        };
        let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let metadata_options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        archive
            .start_file(EXCHANGE_MANIFEST_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &manifest)?;
        archive
            .start_file(EXCHANGE_PAYLOAD_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &payload)?;
        archive
            .start_file(EXCHANGE_ASSET_MANIFEST_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &assets)?;
        for asset in &assets {
            let path = assets::asset_file_path(&self.connection, &self.assets_dir, &asset.id)?;
            let mut asset_file = fs::File::open(path)?;
            archive
                .start_file(
                    format!("assets/{}", asset.relative_path),
                    archive_options_for_asset(asset),
                )
                .map_err(zip_error)?;
            io::copy(&mut asset_file, &mut archive)?;
        }
        Ok(archive.finish().map_err(zip_error)?.into_inner())
    }

    pub fn import_workspace_archive(&self, bytes: Vec<u8>) -> StorageResult<()> {
        let mut archive = match zip::ZipArchive::new(Cursor::new(bytes.clone())) {
            Ok(archive) => archive,
            Err(_) => {
                let snapshot: WorkspaceSnapshot = serde_json::from_slice(&bytes)?;
                return self.replace_workspace_backup(snapshot);
            }
        };
        let manifest: ExchangeArchiveManifest =
            read_archive_json(&mut archive, EXCHANGE_MANIFEST_ENTRY)?;
        if manifest.format != EXCHANGE_ARCHIVE_FORMAT
            || manifest.format_version != EXCHANGE_ARCHIVE_VERSION
        {
            return Err(StorageError::new(
                "archive_unsupported_version",
                "unsupported exchange archive version",
            ));
        }
        if manifest.kind != EXCHANGE_WORKSPACE_BACKUP_KIND {
            return Err(StorageError::new(
                "archive_wrong_kind",
                "page package cannot restore a workspace backup",
            ));
        }
        let mut payload: WorkspaceArchivePayload =
            read_archive_json(&mut archive, EXCHANGE_PAYLOAD_ENTRY)?;
        let assets: Vec<AssetMeta> =
            read_archive_json(&mut archive, EXCHANGE_ASSET_MANIFEST_ENTRY)?;
        self.ensure_workspace_archive_assets_are_complete(&payload.workspace, &assets)?;

        let mut asset_id_map = std::collections::HashMap::new();
        let mut tracked_assets = Vec::new();
        let asset_result = (|| {
            for asset in &assets {
                let path = format!("assets/{}", asset.relative_path);
                let mut entry = archive.by_name(&path).map_err(|_| {
                    StorageError::new("archive_missing_asset", format!("archive asset is missing: {path}"))
                })?;
                let imported = assets::write_asset_from_reader(
                    &self.connection,
                    &self.assets_dir,
                    asset.name.clone(),
                    asset.mime_type.clone(),
                    &mut entry,
                    &mut |_| {},
                )?;
                asset_id_map.insert(asset.id.clone(), imported.meta.id.clone());
                tracked_assets.push(imported);
            }
            Ok(())
        })();
        if let Err(error) = asset_result {
            return Err(self.rollback_tracked_assets(&tracked_assets, error));
        }

        rewrite_workspace_asset_refs(&mut payload.workspace, &asset_id_map);
        if let Err(error) = self.replace_workspace_backup(payload.workspace) {
            return Err(self.rollback_tracked_assets(&tracked_assets, error));
        }
        Ok(())
    }

    fn load_workspace_archive_assets(
        &self,
        workspace: &WorkspaceSnapshot,
    ) -> StorageResult<Vec<AssetMeta>> {
        let mut asset_ids = collect_asset_ids_from_pages(&workspace.pages);
        for asset_id in collect_asset_ids_from_synced_groups(&workspace.synced_block_groups) {
            if !asset_ids.contains(&asset_id) {
                asset_ids.push(asset_id);
            }
        }
        for asset_id in collect_asset_ids_from_data_tables(&workspace.data_tables) {
            if !asset_ids.contains(&asset_id) {
                asset_ids.push(asset_id);
            }
        }
        assets::load_assets_by_ids(&self.connection, &asset_ids)
    }

    fn ensure_workspace_archive_assets_are_complete(
        &self,
        workspace: &WorkspaceSnapshot,
        assets: &[AssetMeta],
    ) -> StorageResult<()> {
        for asset_id in self.load_workspace_archive_asset_ids(workspace) {
            if !assets.iter().any(|asset| asset.id == asset_id) {
                return Err(StorageError::new(
                    "archive_missing_asset",
                    format!("workspace asset is missing from archive: {asset_id}"),
                ));
            }
        }
        Ok(())
    }

    fn load_workspace_archive_asset_ids(&self, workspace: &WorkspaceSnapshot) -> Vec<String> {
        let mut asset_ids = collect_asset_ids_from_pages(&workspace.pages);
        for asset_id in collect_asset_ids_from_synced_groups(&workspace.synced_block_groups) {
            if !asset_ids.contains(&asset_id) {
                asset_ids.push(asset_id);
            }
        }
        for asset_id in collect_asset_ids_from_data_tables(&workspace.data_tables) {
            if !asset_ids.contains(&asset_id) {
                asset_ids.push(asset_id);
            }
        }
        asset_ids
    }

    pub fn load_workspace_backup(&self) -> StorageResult<Option<WorkspaceSnapshot>> {
        if !self.has_workspace()? {
            return Ok(None);
        }

        self.export_workspace_backup().map(Some)
    }

    pub fn replace_workspace_backup(&self, snapshot: WorkspaceSnapshot) -> StorageResult<()> {
        self.replace_workspace_backup_with_expected_board_updated_ats(snapshot, None)
    }

    pub fn replace_workspace_backup_with_expected_board_updated_ats(
        &self,
        snapshot: WorkspaceSnapshot,
        expected_board_updated_ats: Option<&BTreeMap<String, String>>,
    ) -> StorageResult<()> {
        self.with_transaction(|| {
            if let Some(expected_board_updated_ats) = expected_board_updated_ats {
                self.ensure_expected_board_updated_ats(expected_board_updated_ats)?;
                self.ensure_expected_mcp_revision(
                    snapshot.settings.mcp_revision.unwrap_or_default(),
                )?;
            }
            let app_settings = self.load_app_settings()?;
            let mcp_audit_log = {
                let mut statement = self.connection.prepare(
                    "SELECT id, created_at, client_name, tool_name, page_id, created_ids_json
                     FROM zhiqi_mcp_audit_log",
                )?;
                let rows = statement.query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                })?;
                rows.collect::<Result<Vec<_>, _>>()?
            };
            self.clear_workspace()?;
            self.save_settings(&snapshot.settings)?;
            self.save_page_properties(&snapshot.page_properties)?;

            for (position, page) in snapshot.pages.iter().enumerate() {
                self.insert_page(page, position)?;
            }
            for (position, board) in snapshot.boards.iter().enumerate() {
                self.insert_board(board, position)?;
            }
            for (position, data_table) in snapshot.data_tables.iter().enumerate() {
                self.insert_data_table(data_table, position)?;
            }
            for (position, mindmap) in snapshot.mindmaps.iter().enumerate() {
                self.insert_mindmap(mindmap, position)?;
            }
            for group in &snapshot.synced_block_groups {
                self.insert_synced_block_group(group)?;
            }
            self.rebuild_search_documents()?;

            if let Some(app_settings) = &app_settings {
                self.save_app_settings(app_settings)?;
            }
            for (id, created_at, client_name, tool_name, page_id, created_ids_json) in mcp_audit_log
            {
                if self.page_position(&page_id)?.is_some() {
                    self.connection.execute(
                        "INSERT INTO zhiqi_mcp_audit_log
                           (id, created_at, client_name, tool_name, page_id, created_ids_json)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![
                            id,
                            created_at,
                            client_name,
                            tool_name,
                            page_id,
                            created_ids_json
                        ],
                    )?;
                }
            }

            Ok(())
        })
    }

    pub fn load_page(&self, page_id: &str) -> StorageResult<LoadedPage> {
        self.load_page_record(page_id).map(Into::into)
    }

    pub fn save_page(&self, mut page: PageRecord) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = match self.page_position(&page.id)? {
                Some(position) => {
                    let persisted = self.load_page_record(&page.id)?;
                    merge_missing_remote_blocks(&mut page, &persisted);
                    position
                }
                None => self.next_position("zhiqi_pages"),
            };
            self.insert_page(&page, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: page.id })
        })
    }

    pub fn append_mcp_page_blocks(
        &self,
        page_id: &str,
        blocks: Vec<Value>,
        updated_at: String,
    ) -> StorageResult<SaveResult> {
        let created_ids = blocks
            .iter()
            .filter_map(|block| block.get("id").and_then(Value::as_str))
            .map(str::to_string)
            .collect::<Vec<_>>();

        if blocks.is_empty() {
            return Err(StorageError::invalid_payload(
                "at least one block is required",
            ));
        }

        self.with_transaction(|| {
            let mut page = self.load_page_record(page_id)?;
            page.blocks.extend(blocks);
            page.updated_at = updated_at.clone();
            let position = self
                .page_position(&page.id)?
                .ok_or_else(|| StorageError::not_found("page not found"))?;
            self.insert_page(&page, position)?;
            self.rebuild_resource_search_documents()?;
            self.connection.execute(
                "INSERT INTO zhiqi_mcp_audit_log (id, created_at, client_name, tool_name, page_id, created_ids_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    format!("mcp_audit_{}", created_ids.first().map(String::as_str).unwrap_or(page_id)),
                    updated_at,
                    "local-mcp",
                    "append_content",
                    page_id,
                    serde_json::to_string(&created_ids)?,
                ],
            )?;
            Ok(SaveResult { id: page.id })
        })
    }

    pub fn delete_page_branch(&self, page_id: &str) -> StorageResult<DeleteResult> {
        self.with_transaction(|| {
            let deleted_ids = self.descendant_page_ids(page_id)?;
            self.connection
                .execute("DELETE FROM zhiqi_pages WHERE id = ?1", [page_id])?;
            for deleted_id in &deleted_ids {
                search::delete_documents_for_owner(&self.connection, "page", deleted_id)?;
            }
            self.rebuild_resource_search_documents()?;
            Ok(DeleteResult { deleted_ids })
        })
    }

    pub fn save_board(
        &self,
        board: BoardRecord,
        expected_updated_at: Option<&str>,
    ) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = self.board_position(&board.id)?;
            if let (Some(expected_updated_at), Some(_)) = (expected_updated_at, position) {
                let current_updated_at: String = self.connection.query_row(
                    "SELECT updated_at FROM zhiqi_boards WHERE id = ?1",
                    [&board.id],
                    |row| row.get(0),
                )?;
                if current_updated_at != expected_updated_at {
                    return Err(StorageError::new(
                        "conflict",
                        format!("board was updated by another writer: {}", board.id),
                    ));
                }
            }
            let position = position.unwrap_or_else(|| self.next_position("zhiqi_boards"));
            self.insert_board(&board, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: board.id })
        })
    }

    fn ensure_expected_board_updated_ats(
        &self,
        expected_board_updated_ats: &BTreeMap<String, String>,
    ) -> StorageResult<()> {
        for (board_id, expected_updated_at) in expected_board_updated_ats {
            let current_updated_at = self
                .connection
                .query_row(
                    "SELECT updated_at FROM zhiqi_boards WHERE id = ?1",
                    [board_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if current_updated_at.as_deref() != Some(expected_updated_at) {
                return Err(StorageError::new(
                    "conflict",
                    format!("board was updated by another writer: {board_id}"),
                ));
            }
        }
        Ok(())
    }

    fn ensure_expected_mcp_revision(&self, expected_revision: i64) -> StorageResult<()> {
        let current_revision = self
            .load_settings()?
            .and_then(|settings| settings.mcp_revision)
            .unwrap_or_default();
        if current_revision != expected_revision {
            return Err(StorageError::new(
                "conflict",
                "workspace was updated by MCP; reload before saving",
            ));
        }
        Ok(())
    }

    fn advance_mcp_revision(&self) -> StorageResult<()> {
        let mut settings = self.load_settings()?.unwrap_or_default();
        settings.mcp_revision = Some(
            settings
                .mcp_revision
                .unwrap_or_default()
                .checked_add(1)
                .ok_or_else(|| StorageError::new("conflict", "MCP revision limit reached"))?,
        );
        self.save_settings(&settings)
    }

    pub fn load_board_snapshot(&self, board_id: &str) -> StorageResult<Value> {
        self.connection
            .query_row(
                "SELECT snapshot_json FROM zhiqi_board_snapshots WHERE board_id = ?1",
                [board_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => {
                    StorageError::not_found(format!("board not found: {board_id}"))
                }
                other => StorageError::database(other),
            })
            .and_then(|json| serde_json::from_str(&json).map_err(Into::into))
    }

    pub fn save_mindmap(&self, mindmap: MindmapRecord) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = self
                .mindmap_position(&mindmap.id)?
                .unwrap_or_else(|| self.next_position("zhiqi_mindmaps"));
            self.insert_mindmap(&mindmap, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: mindmap.id })
        })
    }

    pub fn load_mindmap_snapshot(&self, mindmap_id: &str) -> StorageResult<Value> {
        self.connection
            .query_row(
                "SELECT snapshot_json FROM zhiqi_mindmap_snapshots WHERE mindmap_id = ?1",
                [mindmap_id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => {
                    StorageError::not_found(format!("mindmap not found: {mindmap_id}"))
                }
                other => StorageError::database(other),
            })
            .and_then(|json| serde_json::from_str(&json).map_err(Into::into))
    }

    pub fn load_data_table(&self, data_table_id: &str) -> StorageResult<DataTableRecord> {
        self.load_data_table_record(data_table_id)
    }

    pub fn save_data_table(&self, data_table: DataTableRecord) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = self
                .data_table_position(&data_table.id)?
                .unwrap_or_else(|| self.next_position("zhiqi_data_tables"));
            self.insert_data_table(&data_table, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: data_table.id })
        })
    }

    pub fn write_asset(&self, input: WriteAssetInput) -> StorageResult<AssetMeta> {
        assets::write_asset(&self.connection, &self.assets_dir, input)
    }

    pub fn write_asset_tracked(&self, input: WriteAssetInput) -> StorageResult<TrackedAssetWrite> {
        assets::write_asset_tracked(&self.connection, &self.assets_dir, input)
    }

    pub fn import_asset_file(&self, input: ImportAssetFileInput) -> StorageResult<AssetMeta> {
        let path = PathBuf::from(&input.path);
        let name = path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .ok_or_else(|| StorageError::invalid_payload("asset path has no file name"))?
            .to_string();
        let bytes = fs::read(path)?;

        self.write_asset(WriteAssetInput {
            name,
            mime_type: input.mime_type,
            bytes,
        })
    }

    pub fn read_asset(&self, asset_id: &str) -> StorageResult<Vec<u8>> {
        assets::read_asset(&self.connection, &self.assets_dir, asset_id)
    }

    pub fn get_asset_file_path(&self, asset_id: &str) -> StorageResult<String> {
        assets::asset_file_path(&self.connection, &self.assets_dir, asset_id)?
            .into_os_string()
            .into_string()
            .map_err(|_| StorageError::invalid_payload("asset path is not valid utf-8"))
    }

    pub fn cleanup_orphan_assets(&self) -> StorageResult<usize> {
        assets::cleanup_orphan_assets(&self.connection, &self.assets_dir)
    }

    pub fn remove_asset_if_unreferenced(&self, asset_id: &str) -> StorageResult<bool> {
        assets::remove_asset_if_unreferenced(&self.connection, &self.assets_dir, asset_id)
    }

    pub fn rollback_tracked_asset(&self, written: &TrackedAssetWrite) -> StorageResult<bool> {
        if !written.created {
            return Ok(false);
        }

        self.remove_asset_if_unreferenced(&written.meta.id)
    }

    pub(crate) fn rollback_tracked_assets(
        &self,
        written_assets: &[TrackedAssetWrite],
        mut error: StorageError,
    ) -> StorageError {
        for written in written_assets
            .iter()
            .rev()
            .filter(|written| written.created)
        {
            if let Err(rollback_error) = self.rollback_tracked_asset(written) {
                error.message.push_str(&format!(
                    "; failed to roll back asset {} at {}: {}",
                    written.meta.id,
                    self.assets_dir.join(&written.meta.relative_path).display(),
                    rollback_error.message
                ));
            }
        }
        error
    }

    #[allow(dead_code)]
    pub fn export_page_package(&self, page_id: &str) -> StorageResult<Vec<u8>> {
        let mut ignore_progress = |_| {};
        self.write_page_package(page_id, Cursor::new(Vec::new()), None, &mut ignore_progress)
            .map(|cursor| cursor.into_inner())
    }

    #[allow(dead_code)]
    pub fn export_page_package_to_path(
        &self,
        page_id: &str,
        path: impl AsRef<Path>,
    ) -> StorageResult<()> {
        let mut ignore_progress = |_| {};
        self.export_page_package_to_path_with_progress(page_id, path, None, &mut ignore_progress)
    }

    #[allow(dead_code)]
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

    pub fn import_page_package(&self, bytes: Vec<u8>) -> StorageResult<PagePackageImportResult> {
        let mut ignore_progress = |_| {};
        let cursor = Cursor::new(bytes);
        self.import_page_package_reader(cursor, None, &mut ignore_progress)
    }

    pub fn import_page_package_from_path(
        &self,
        path: impl AsRef<Path>,
    ) -> StorageResult<PagePackageImportResult> {
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

    #[allow(dead_code)]
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
            return Err(StorageError::not_found(format!(
                "page not found: {page_id}"
            )));
        }
        let branch_id_set = branch_ids.iter().collect::<std::collections::HashSet<_>>();
        let mut pages = self
            .load_pages()?
            .into_iter()
            .filter(|page| branch_id_set.contains(&page.id))
            .collect::<Vec<_>>();
        if let Some(root_page) = pages.iter_mut().find(|page| page.id == page_id) {
            root_page.parent_id = None;
        }
        let synced_group_ids = collect_synced_group_ids_from_pages(&pages);
        let synced_block_groups = normalize_exported_synced_block_groups(
            self.load_synced_block_groups()?
                .into_iter()
                .filter(|group| synced_group_ids.iter().any(|id| id == &group.id))
                .collect::<Vec<_>>(),
            &pages,
        );
        ensure_resource_ids_exist(
            &synced_group_ids,
            synced_block_groups.iter().map(|group| group.id.as_str()),
            "synced block group",
        )?;
        let mut board_ids = collect_ref_ids_from_pages(&pages, "board");
        for board_id in collect_ref_ids_from_synced_groups(&synced_block_groups, "board") {
            if !board_ids.iter().any(|existing| existing == &board_id) {
                board_ids.push(board_id);
            }
        }
        let mut data_table_ids = collect_ref_ids_from_pages(&pages, "data_table");
        for data_table_id in collect_ref_ids_from_synced_groups(&synced_block_groups, "data_table")
        {
            if !data_table_ids
                .iter()
                .any(|existing| existing == &data_table_id)
            {
                data_table_ids.push(data_table_id);
            }
        }
        let mut mindmap_ids = collect_ref_ids_from_pages(&pages, "mindmap");
        for mindmap_id in collect_ref_ids_from_synced_groups(&synced_block_groups, "mindmap") {
            if !mindmap_ids.iter().any(|existing| existing == &mindmap_id) {
                mindmap_ids.push(mindmap_id);
            }
        }
        let boards = self
            .load_boards()?
            .into_iter()
            .filter(|board| board_ids.iter().any(|id| id == &board.id))
            .collect::<Vec<_>>();
        ensure_resource_ids_exist(
            &board_ids,
            boards.iter().map(|board| board.id.as_str()),
            "board",
        )?;
        let data_tables = self
            .load_data_tables()?
            .into_iter()
            .filter(|data_table| data_table_ids.iter().any(|id| id == &data_table.id))
            .collect::<Vec<_>>();
        ensure_resource_ids_exist(
            &data_table_ids,
            data_tables.iter().map(|data_table| data_table.id.as_str()),
            "data table",
        )?;
        let mindmaps = self
            .load_mindmaps()?
            .into_iter()
            .filter(|mindmap| mindmap_ids.iter().any(|id| id == &mindmap.id))
            .collect::<Vec<_>>();
        ensure_resource_ids_exist(
            &mindmap_ids,
            mindmaps.iter().map(|mindmap| mindmap.id.as_str()),
            "mindmap",
        )?;
        let mut asset_ids = collect_asset_ids_from_pages(&pages);
        for asset_id in collect_asset_ids_from_synced_groups(&synced_block_groups) {
            if !asset_ids.iter().any(|existing| existing == &asset_id) {
                asset_ids.push(asset_id);
            }
        }
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
            synced_block_groups,
            assets,
        };

        self.write_page_package_archive(manifest, writer, task_id, progress)
    }

    #[allow(dead_code)]
    fn write_page_package_archive<W, F>(
        &self,
        manifest: PagePackageManifest,
        writer: W,
        task_id: Option<&str>,
        progress: &mut F,
    ) -> StorageResult<W>
    where
        W: Write + Seek,
        F: FnMut(WorkspaceArchiveProgress),
    {
        let PagePackageManifest {
            root_page_id,
            pages,
            boards,
            data_tables,
            mindmaps,
            synced_block_groups,
            assets,
            ..
        } = manifest;
        let payload = PagePackagePayload {
            root_page_id,
            pages,
            boards,
            data_tables,
            mindmaps,
            synced_block_groups,
        };
        let exchange_manifest = ExchangeArchiveManifest {
            format: EXCHANGE_ARCHIVE_FORMAT.to_string(),
            format_version: EXCHANGE_ARCHIVE_VERSION,
            kind: EXCHANGE_PAGE_PACKAGE_KIND.to_string(),
            created_with: env!("CARGO_PKG_VERSION").to_string(),
            created_at: now_nanos().to_string(),
        };
        let total_assets = assets.len() as u64;
        let bytes_total = total_asset_bytes(&assets);
        let mut bytes_processed = 0;
        let mut archive = zip::ZipWriter::new(writer);
        let metadata_options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Export,
            WorkspaceArchiveProgressPhase::Preparing,
            0,
            total_assets,
            0,
            bytes_total,
            None,
        );

        archive
            .start_file(EXCHANGE_MANIFEST_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &exchange_manifest)?;

        archive
            .start_file(EXCHANGE_PAYLOAD_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &payload)?;

        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Export,
            WorkspaceArchiveProgressPhase::WritingMetadata,
            0,
            total_assets,
            0,
            bytes_total,
            None,
        );

        archive
            .start_file(EXCHANGE_ASSET_MANIFEST_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &assets)?;

        for (index, asset) in assets.iter().enumerate() {
            let path = assets::asset_file_path(&self.connection, &self.assets_dir, &asset.id)?;
            let mut asset_file = fs::File::open(path)?;
            let current = index as u64 + 1;
            archive
                .start_file(
                    format!("assets/{}", asset.relative_path),
                    archive_options_for_asset(&asset),
                )
                .map_err(zip_error)?;

            report_archive_progress(
                task_id,
                progress,
                WorkspaceArchiveOperation::Export,
                WorkspaceArchiveProgressPhase::ProcessingAsset,
                current,
                total_assets,
                bytes_processed,
                bytes_total,
                Some(asset.name.clone()),
            );

            let copied = copy_with_progress(&mut asset_file, &mut archive, |asset_copied| {
                report_archive_progress(
                    task_id,
                    progress,
                    WorkspaceArchiveOperation::Export,
                    WorkspaceArchiveProgressPhase::ProcessingAsset,
                    current,
                    total_assets,
                    bytes_processed + asset_copied,
                    bytes_total,
                    Some(asset.name.clone()),
                );
            })?;
            bytes_processed += copied;
        }

        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Export,
            WorkspaceArchiveProgressPhase::Finalizing,
            total_assets,
            total_assets,
            bytes_processed,
            bytes_total,
            None,
        );

        let writer = archive.finish().map_err(zip_error)?;
        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Export,
            WorkspaceArchiveProgressPhase::Complete,
            total_assets,
            total_assets,
            bytes_total,
            bytes_total,
            None,
        );
        Ok(writer)
    }

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
        let manifest = if archive.by_name(EXCHANGE_MANIFEST_ENTRY).is_ok() {
            let exchange_manifest: ExchangeArchiveManifest =
                read_archive_json(&mut archive, EXCHANGE_MANIFEST_ENTRY)?;
            if exchange_manifest.format != EXCHANGE_ARCHIVE_FORMAT
                || exchange_manifest.format_version != EXCHANGE_ARCHIVE_VERSION
            {
                return Err(StorageError::new(
                    "archive_unsupported_version",
                    "unsupported exchange archive version",
                ));
            }
            if exchange_manifest.kind != EXCHANGE_PAGE_PACKAGE_KIND {
                return Err(StorageError::new(
                    "archive_wrong_kind",
                    "workspace backup cannot be imported as a page package",
                ));
            }
            let payload: PagePackagePayload =
                read_archive_json(&mut archive, EXCHANGE_PAYLOAD_ENTRY)?;
            let assets: Vec<AssetMeta> =
                read_archive_json(&mut archive, EXCHANGE_ASSET_MANIFEST_ENTRY)?;
            PagePackageManifest {
                kind: PAGE_PACKAGE_KIND.to_string(),
                version: PAGE_PACKAGE_VERSION,
                root_page_id: payload.root_page_id,
                pages: payload.pages,
                boards: payload.boards,
                data_tables: payload.data_tables,
                mindmaps: payload.mindmaps,
                synced_block_groups: payload.synced_block_groups,
                assets,
            }
        } else {
            let manifest: PagePackageManifest =
                read_archive_json(&mut archive, PAGE_PACKAGE_MANIFEST_ENTRY)?;
            let is_supported_kind =
                manifest.kind == PAGE_PACKAGE_KIND || manifest.kind == LEGACY_PAGE_PACKAGE_KIND;
            if !is_supported_kind || manifest.version != PAGE_PACKAGE_VERSION {
                return Err(StorageError::invalid_payload("unsupported page package"));
            }
            manifest
        };
        if !manifest
            .pages
            .iter()
            .any(|page| page.id == manifest.root_page_id)
        {
            return Err(StorageError::invalid_payload(
                "page package root is missing",
            ));
        }
        validate_page_package_manifest(&manifest)?;

        let total_assets = manifest.assets.len() as u64;
        let bytes_total = total_asset_bytes(&manifest.assets);

        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Import,
            WorkspaceArchiveProgressPhase::WritingMetadata,
            0,
            total_assets,
            0,
            bytes_total,
            None,
        );

        for asset in &manifest.assets {
            let archive_path = format!("assets/{}", asset.relative_path);
            if let Err(error) = archive.by_name(&archive_path) {
                return Err(match error {
                    zip::result::ZipError::FileNotFound => StorageError::invalid_payload(format!(
                        "page package asset entry is missing: {archive_path}"
                    )),
                    other => zip_error(other),
                });
            }
        }

        let mut counter = 0;
        let mut page_id_map = std::collections::HashMap::new();
        let mut board_id_map = std::collections::HashMap::new();
        let mut data_table_id_map = std::collections::HashMap::new();
        let mut mindmap_id_map = std::collections::HashMap::new();
        let mut page_reserved_ids = std::collections::HashSet::new();
        let mut board_reserved_ids = std::collections::HashSet::new();
        let mut data_table_reserved_ids = std::collections::HashSet::new();
        let mut mindmap_reserved_ids = std::collections::HashSet::new();
        let mut synced_group_reserved_ids = std::collections::HashSet::new();
        for page in &manifest.pages {
            page_id_map.insert(
                page.id.clone(),
                self.import_record_id("page", "zhiqi_pages", &mut page_reserved_ids)?,
            );
        }
        for board in &manifest.boards {
            board_id_map.insert(
                board.id.clone(),
                self.import_record_id("board", "zhiqi_boards", &mut board_reserved_ids)?,
            );
        }
        for data_table in &manifest.data_tables {
            data_table_id_map.insert(
                data_table.id.clone(),
                self.import_record_id(
                    "database",
                    "zhiqi_data_tables",
                    &mut data_table_reserved_ids,
                )?,
            );
        }
        for mindmap in &manifest.mindmaps {
            mindmap_id_map.insert(
                mindmap.id.clone(),
                self.import_record_id("mindmap", "zhiqi_mindmaps", &mut mindmap_reserved_ids)?,
            );
        }
        let mut synced_group_id_map = std::collections::HashMap::new();
        for group in &manifest.synced_block_groups {
            synced_group_id_map.insert(
                group.id.clone(),
                self.import_record_id(
                    "synced_group",
                    "zhiqi_synced_block_groups",
                    &mut synced_group_reserved_ids,
                )?,
            );
        }
        let mut synced_instance_id_map = std::collections::HashMap::new();
        for page in &manifest.pages {
            for block in &page.blocks {
                let Some(object) = block.as_object() else {
                    continue;
                };
                if object.get("type").and_then(Value::as_str) != Some("synced_block") {
                    continue;
                }
                let Some(instance_id) = object
                    .get("instanceId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                else {
                    continue;
                };
                synced_instance_id_map
                    .entry(instance_id)
                    .or_insert_with(|| import_id("instance", &mut counter));
            }
        }

        let root_page_id = page_id_map
            .get(&manifest.root_page_id)
            .cloned()
            .ok_or_else(|| StorageError::invalid_payload("page package root is missing"))?;
        let ordered_pages = ordered_page_package_pages(&manifest.pages, &manifest.root_page_id)?;
        let mut asset_id_map = std::collections::HashMap::new();
        let mut bytes_processed = 0;
        let mut tracked_assets = Vec::new();

        let asset_result = (|| {
            for (index, asset) in manifest.assets.iter().enumerate() {
                let archive_path = format!("assets/{}", asset.relative_path);
                let mut asset_file = archive.by_name(&archive_path).map_err(zip_error)?;
                let current = index as u64 + 1;
                let item_name = asset.name.clone();
                let mut copied_for_asset = 0;

                report_archive_progress(
                    task_id,
                    progress,
                    WorkspaceArchiveOperation::Import,
                    WorkspaceArchiveProgressPhase::ProcessingAsset,
                    current,
                    total_assets,
                    bytes_processed,
                    bytes_total,
                    Some(item_name.clone()),
                );

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
                asset_id_map.insert(asset.id.clone(), imported.meta.id.clone());
                tracked_assets.push(imported);
            }
            Ok(())
        })();
        if let Err(error) = asset_result {
            return Err(self.rollback_tracked_assets(&tracked_assets, error));
        }

        let import_result = self.with_transaction(|| {
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
                rewrite_data_table_block_ids(&mut next_data_table.snapshot, &mut counter);
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

            for group in &manifest.synced_block_groups {
                let mut next_group = group.clone();
                next_group.id = synced_group_id_map[&group.id].clone();
                next_group.primary_instance_id = synced_instance_id_map
                    .get(&group.primary_instance_id)
                    .cloned()
                    .unwrap_or_else(|| group.primary_instance_id.clone());
                rewrite_block_ids_and_refs(
                    &mut next_group.blocks,
                    &page_id_map,
                    &board_id_map,
                    &data_table_id_map,
                    &mindmap_id_map,
                    &asset_id_map,
                    &synced_group_id_map,
                    &synced_instance_id_map,
                    &mut counter,
                );
                self.insert_synced_block_group(&next_group)?;
            }

            let mut page_position = self.next_position("zhiqi_pages");
            for page in ordered_pages {
                let mut next_page = page.clone();
                next_page.id = page_id_map[&page.id].clone();
                next_page.parent_id = if page.id == manifest.root_page_id {
                    None
                } else {
                    page.parent_id
                        .as_ref()
                        .and_then(|parent_id| page_id_map.get(parent_id).cloned())
                };
                rewrite_block_ids_and_refs(
                    &mut next_page.blocks,
                    &page_id_map,
                    &board_id_map,
                    &data_table_id_map,
                    &mindmap_id_map,
                    &asset_id_map,
                    &synced_group_id_map,
                    &synced_instance_id_map,
                    &mut counter,
                );
                self.insert_page(&next_page, page_position)?;
                page_position += 1;
            }
            self.rebuild_resource_search_documents()?;
            Ok(())
        });
        if let Err(error) = import_result {
            return Err(self.rollback_tracked_assets(&tracked_assets, error));
        }

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

    pub fn search_workspace(&self, query: &str, limit: usize) -> StorageResult<Vec<SearchResult>> {
        search::search(&self.connection, query, limit)
    }

    #[cfg(test)]
    pub fn block_ref_count(&self) -> StorageResult<i64> {
        self.connection
            .query_row("SELECT COUNT(*) FROM zhiqi_block_refs", [], |row| {
                row.get(0)
            })
            .map_err(Into::into)
    }

    fn with_transaction<T>(&self, task: impl FnOnce() -> StorageResult<T>) -> StorageResult<T> {
        if !self.connection.is_autocommit() {
            return Err(StorageError::new(
                "conflict",
                "storage transaction requires an autocommit connection",
            ));
        }

        self.connection.execute_batch("BEGIN IMMEDIATE")?;
        match task() {
            Ok(value) => match self.connection.execute_batch("COMMIT") {
                Ok(()) => Ok(value),
                Err(commit_error) => {
                    let mut error = StorageError::new(
                        "database_error",
                        format!("failed to commit storage transaction: {commit_error}"),
                    );
                    if let Err(rollback_error) = self.connection.execute_batch("ROLLBACK") {
                        error.message.push_str(&format!(
                            "; failed to roll back storage transaction: {rollback_error}"
                        ));
                    }
                    Err(error)
                }
            },
            Err(mut error) => {
                if let Err(rollback_error) = self.connection.execute_batch("ROLLBACK") {
                    error.message.push_str(&format!(
                        "; failed to roll back storage transaction: {rollback_error}"
                    ));
                }
                Err(error)
            }
        }
    }

    fn clear_workspace(&self) -> StorageResult<()> {
        for table in [
            "zhiqi_search_documents_fts",
            "zhiqi_search_documents",
            "zhiqi_asset_refs",
            "zhiqi_data_table_blocks",
            "zhiqi_data_table_record_pages",
            "zhiqi_data_table_records",
            "zhiqi_data_table_views",
            "zhiqi_data_table_properties",
            "zhiqi_data_tables",
            "zhiqi_mindmap_snapshots",
            "zhiqi_mindmaps",
            "zhiqi_board_snapshots",
            "zhiqi_boards",
            "zhiqi_synced_block_groups",
            "zhiqi_block_refs",
            "zhiqi_page_contents",
            "zhiqi_pages",
            "zhiqi_settings",
        ] {
            self.connection
                .execute(&format!("DELETE FROM {table}"), [])?;
        }
        Ok(())
    }

    fn save_settings(&self, settings: &WorkspaceSettings) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)
              ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
            params![SETTINGS_ID, serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    pub fn save_app_settings(&self, settings: &AppSettings) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)
              ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
            params![APP_SETTINGS_ID, serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    fn save_page_properties(&self, definitions: &[PagePropertyDefinition]) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)
              ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
            params![
                PAGE_PROPERTIES_SETTINGS_ID,
                serde_json::to_string(definitions)?
            ],
        )?;
        Ok(())
    }

    fn load_settings(&self) -> StorageResult<Option<WorkspaceSettings>> {
        self.connection
            .query_row(
                "SELECT record_json FROM zhiqi_settings WHERE id = ?1",
                [SETTINGS_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }

    pub fn load_app_settings(&self) -> StorageResult<Option<AppSettings>> {
        self.connection
            .query_row(
                "SELECT record_json FROM zhiqi_settings WHERE id = ?1",
                [APP_SETTINGS_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }

    fn load_page_properties(&self) -> StorageResult<Vec<PagePropertyDefinition>> {
        self.connection
            .query_row(
                "SELECT record_json FROM zhiqi_settings WHERE id = ?1",
                [PAGE_PROPERTIES_SETTINGS_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|json| {
                serde_json::from_str::<Vec<PagePropertyDefinition>>(&json)
                    .map_err(StorageError::from)
            })
            .transpose()?
            .map(Ok)
            .unwrap_or_else(|| Ok(Vec::new()))
    }

    fn insert_page(&self, page: &PageRecord, position: usize) -> StorageResult<()> {
        let page_property_definitions = self.load_page_properties()?;
        let synced_block_groups = self.load_synced_block_groups()?;
        self.connection.execute(
            "INSERT INTO zhiqi_pages
              (id, parent_id, title, icon, cover, is_full_width, is_small_text, font_family,
                show_outline, show_properties, position, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
              ON CONFLICT(id) DO UPDATE SET
                parent_id = excluded.parent_id,
                title = excluded.title,
                icon = excluded.icon,
                cover = excluded.cover,
                is_full_width = excluded.is_full_width,
                is_small_text = excluded.is_small_text,
                font_family = excluded.font_family,
                show_outline = excluded.show_outline,
                show_properties = excluded.show_properties,
                position = excluded.position,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                page.id,
                page.parent_id,
                page.title,
                page.icon,
                page.cover,
                option_bool_to_i64(page.is_full_width),
                option_bool_to_i64(page.is_small_text),
                page.font_family,
                option_bool_to_i64(page.show_outline),
                option_bool_to_i64(page.show_properties),
                position as i64,
                page.created_at,
                page.updated_at
            ],
        )?;
        self.connection.execute(
            "INSERT INTO zhiqi_page_contents (page_id, blocks_json, properties_json) VALUES (?1, ?2, ?3)
              ON CONFLICT(page_id) DO UPDATE SET
                blocks_json = excluded.blocks_json,
                properties_json = excluded.properties_json",
            params![
                page.id,
                serde_json::to_string(&page.blocks)?,
                serialize_page_properties(page.properties.as_ref())?
            ],
        )?;
        self.replace_block_refs(page)?;
        search::replace_page_document(
            &self.connection,
            page,
            &page_property_definitions,
            &synced_block_groups,
        )?;
        Ok(())
    }

    fn replace_block_refs(&self, page: &PageRecord) -> StorageResult<()> {
        self.connection.execute(
            "DELETE FROM zhiqi_block_refs WHERE page_id = ?1",
            [&page.id],
        )?;
        self.connection.execute(
            "DELETE FROM zhiqi_asset_refs WHERE owner_kind = 'page' AND owner_id = ?1",
            [&page.id],
        )?;

        for block in &page.blocks {
            let Some(block_id) = block.get("id").and_then(Value::as_str) else {
                continue;
            };
            let Some(block_type) = block.get("type").and_then(Value::as_str) else {
                continue;
            };
            let ref_info = match block_type {
                "whiteboard" => block
                    .get("boardId")
                    .and_then(Value::as_str)
                    .map(|id| ("board", id)),
                "data_table" | "data_table_inline" => block
                    .get("databaseId")
                    .and_then(Value::as_str)
                    .map(|id| ("data_table", id)),
                "mindmap" => block
                    .get("mindmapId")
                    .and_then(Value::as_str)
                    .map(|id| ("mindmap", id)),
                _ => None,
            };

            if let Some((ref_kind, ref_id)) = ref_info {
                self.connection.execute(
                    "INSERT OR IGNORE INTO zhiqi_block_refs (page_id, block_id, ref_kind, ref_id)
                      VALUES (?1, ?2, ?3, ?4)",
                    params![page.id, block_id, ref_kind, ref_id],
                )?;
            }

            if matches!(block_type, "image" | "video" | "audio" | "file") {
                if let Some(asset_id) = block.get("assetId").and_then(Value::as_str) {
                    self.connection.execute(
                        "INSERT OR IGNORE INTO zhiqi_asset_refs (asset_id, owner_kind, owner_id)
                          SELECT ?1, 'page', ?2
                          WHERE EXISTS (SELECT 1 FROM zhiqi_assets WHERE id = ?1)",
                        params![asset_id, &page.id],
                    )?;
                }
            }
        }

        Ok(())
    }

    fn insert_board(&self, board: &BoardRecord, position: usize) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_boards (id, title, position, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                position = excluded.position,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                board.id,
                board.title,
                position as i64,
                board.created_at,
                board.updated_at
            ],
        )?;
        self.connection.execute(
            "INSERT INTO zhiqi_board_snapshots (board_id, snapshot_json) VALUES (?1, ?2)
              ON CONFLICT(board_id) DO UPDATE SET snapshot_json = excluded.snapshot_json",
            params![board.id, serde_json::to_string(&board.snapshot)?],
        )?;
        Ok(())
    }

    fn insert_mindmap(&self, mindmap: &MindmapRecord, position: usize) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_mindmaps (id, title, position, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                position = excluded.position,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                mindmap.id,
                mindmap.title,
                position as i64,
                mindmap.created_at,
                mindmap.updated_at
            ],
        )?;
        self.connection.execute(
            "INSERT INTO zhiqi_mindmap_snapshots (mindmap_id, snapshot_json) VALUES (?1, ?2)
              ON CONFLICT(mindmap_id) DO UPDATE SET snapshot_json = excluded.snapshot_json",
            params![mindmap.id, serde_json::to_string(&mindmap.snapshot)?],
        )?;
        Ok(())
    }

    fn insert_synced_block_group(&self, group: &SyncedBlockGroupRecord) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_synced_block_groups
              (id, blocks_json, primary_instance_id, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5)
              ON CONFLICT(id) DO UPDATE SET
                blocks_json = excluded.blocks_json,
                primary_instance_id = excluded.primary_instance_id,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                group.id,
                serde_json::to_string(&group.blocks)?,
                group.primary_instance_id,
                group.created_at,
                group.updated_at
            ],
        )?;
        self.replace_synced_block_group_asset_refs(group)?;
        Ok(())
    }

    fn replace_synced_block_group_asset_refs(
        &self,
        group: &SyncedBlockGroupRecord,
    ) -> StorageResult<()> {
        self.connection.execute(
            "DELETE FROM zhiqi_asset_refs WHERE owner_kind = 'synced_block_group' AND owner_id = ?1",
            [&group.id],
        )?;

        for block in &group.blocks {
            let Some(block_type) = block.get("type").and_then(Value::as_str) else {
                continue;
            };
            if matches!(block_type, "image" | "video" | "audio" | "file") {
                if let Some(asset_id) = block.get("assetId").and_then(Value::as_str) {
                    self.connection.execute(
                        "INSERT OR IGNORE INTO zhiqi_asset_refs (asset_id, owner_kind, owner_id)
                          SELECT ?1, 'synced_block_group', ?2
                          WHERE EXISTS (SELECT 1 FROM zhiqi_assets WHERE id = ?1)",
                        params![asset_id, &group.id],
                    )?;
                }
            }
        }

        Ok(())
    }

    fn insert_data_table(
        &self,
        data_table: &DataTableRecord,
        position: usize,
    ) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhiqi_data_tables
              (id, title, icon, cover, position, snapshot_json, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                icon = excluded.icon,
                cover = excluded.cover,
                position = excluded.position,
                snapshot_json = excluded.snapshot_json,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                data_table.id,
                data_table.title,
                data_table.icon,
                data_table.cover,
                position as i64,
                serde_json::to_string(&data_table.snapshot)?,
                data_table.created_at,
                data_table.updated_at
            ],
        )?;
        self.replace_data_table_parts(data_table)?;
        Ok(())
    }

    fn replace_data_table_parts(&self, data_table: &DataTableRecord) -> StorageResult<()> {
        for table in [
            "zhiqi_data_table_blocks",
            "zhiqi_data_table_record_pages",
            "zhiqi_data_table_records",
            "zhiqi_data_table_views",
            "zhiqi_data_table_properties",
        ] {
            self.connection.execute(
                &format!("DELETE FROM {table} WHERE data_table_id = ?1"),
                [&data_table.id],
            )?;
        }
        self.replace_data_table_asset_refs(data_table)?;

        let snapshot = &data_table.snapshot;
        insert_ordered_object_rows(
            &self.connection,
            "zhiqi_data_table_properties",
            &data_table.id,
            snapshot.pointer("/database/propertyOrder"),
            snapshot.get("properties"),
        )?;
        insert_ordered_object_rows(
            &self.connection,
            "zhiqi_data_table_views",
            &data_table.id,
            snapshot.pointer("/database/viewOrder"),
            snapshot.pointer("/database/views"),
        )?;

        if let Some(records) = snapshot.get("records").and_then(Value::as_object) {
            for (position, (record_id, record)) in records.iter().enumerate() {
                let title = record
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                self.connection.execute(
                    "INSERT INTO zhiqi_data_table_records
                      (data_table_id, id, title, record_json, position, created_at, updated_at)
                      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        data_table.id,
                        record_id,
                        title,
                        serde_json::to_string(record)?,
                        position as i64,
                        record.get("createdAt").and_then(Value::as_str),
                        record.get("updatedAt").and_then(Value::as_str)
                    ],
                )?;
            }
        }

        if let Some(record_pages) = snapshot.get("recordPages").and_then(Value::as_object) {
            for (record_id, record_page) in record_pages {
                self.connection.execute(
                    "INSERT INTO zhiqi_data_table_record_pages (data_table_id, record_id, record_json)
                      VALUES (?1, ?2, ?3)",
                    params![
                        data_table.id,
                        record_id,
                        serde_json::to_string(record_page)?
                    ],
                )?;
            }
        }

        if let Some(blocks) = snapshot.get("blocks").and_then(Value::as_object) {
            for (position, (block_id, block)) in blocks.iter().enumerate() {
                self.connection.execute(
                    "INSERT INTO zhiqi_data_table_blocks
                      (data_table_id, id, record_id, record_json, position)
                      VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        data_table.id,
                        block_id,
                        block.get("recordId").and_then(Value::as_str),
                        serde_json::to_string(block)?,
                        block
                            .get("order")
                            .and_then(Value::as_i64)
                            .unwrap_or(position as i64)
                    ],
                )?;
            }
        }

        Ok(())
    }

    fn replace_data_table_asset_refs(&self, data_table: &DataTableRecord) -> StorageResult<()> {
        self.connection.execute(
            "DELETE FROM zhiqi_asset_refs WHERE owner_kind = 'data_table' AND owner_id = ?1",
            [&data_table.id],
        )?;

        let Some(assets) = data_table.snapshot.get("assets").and_then(Value::as_object) else {
            return Ok(());
        };

        for asset_id in assets.keys() {
            self.connection.execute(
                "INSERT OR IGNORE INTO zhiqi_asset_refs (asset_id, owner_kind, owner_id)
                  SELECT ?1, 'data_table', ?2
                  WHERE EXISTS (SELECT 1 FROM zhiqi_assets WHERE id = ?1)",
                params![asset_id, &data_table.id],
            )?;
        }

        Ok(())
    }

    fn rebuild_resource_search_documents(&self) -> StorageResult<()> {
        for board in self.load_boards()? {
            search::replace_board_document(
                &self.connection,
                &board.id,
                &board.title,
                self.page_id_for_ref("board", &board.id)?,
            )?;
        }
        for data_table in self.load_data_tables()? {
            search::replace_data_table_documents(
                &self.connection,
                &data_table,
                self.page_id_for_ref("data_table", &data_table.id)?,
            )?;
        }
        for mindmap in self.load_mindmaps()? {
            search::replace_mindmap_document(
                &self.connection,
                &mindmap.id,
                &mindmap.title,
                self.page_id_for_ref("mindmap", &mindmap.id)?,
            )?;
        }
        Ok(())
    }

    fn rebuild_search_documents(&self) -> StorageResult<()> {
        self.connection
            .execute("DELETE FROM zhiqi_search_documents_fts", [])?;
        self.connection
            .execute("DELETE FROM zhiqi_search_documents", [])?;

        let page_property_definitions = self.load_page_properties()?;
        let synced_block_groups = self.load_synced_block_groups()?;
        for page in self.load_pages()? {
            search::replace_page_document(
                &self.connection,
                &page,
                &page_property_definitions,
                &synced_block_groups,
            )?;
        }
        self.rebuild_resource_search_documents()
    }

    fn search_documents_need_rebuild(&self) -> StorageResult<bool> {
        let has_pages: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM zhiqi_pages LIMIT 1)",
            [],
            |row| row.get(0),
        )?;
        if !has_pages {
            return Ok(false);
        }

        let has_any_documents: bool = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM zhiqi_search_documents LIMIT 1)",
            [],
            |row| row.get(0),
        )?;
        if !has_any_documents {
            return Ok(true);
        }

        self.connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM zhiqi_search_documents
                    WHERE kind = 'page' AND document_id NOT LIKE 'page:%:%'
                    LIMIT 1
                )",
                [],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    fn page_id_for_ref(&self, ref_kind: &str, ref_id: &str) -> StorageResult<Option<String>> {
        self.connection
            .query_row(
                "SELECT page_id FROM zhiqi_block_refs WHERE ref_kind = ?1 AND ref_id = ?2
                  ORDER BY page_id ASC LIMIT 1",
                params![ref_kind, ref_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn load_pages(&self) -> StorageResult<Vec<PageRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT p.id, p.parent_id, p.title, p.icon, p.cover, p.is_full_width,
              p.is_small_text, p.font_family, p.show_outline, p.show_properties,
              c.blocks_json, c.properties_json, p.created_at, p.updated_at
              FROM zhiqi_pages p
              JOIN zhiqi_page_contents c ON c.page_id = p.id
              ORDER BY p.position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<i64>>(8)?,
                row.get::<_, Option<i64>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
            ))
        })?;
        let mut pages = Vec::new();

        for row in rows {
            let (
                id,
                parent_id,
                title,
                icon,
                cover,
                is_full_width,
                is_small_text,
                font_family,
                show_outline,
                show_properties,
                blocks_json,
                properties_json,
                created_at,
                updated_at,
            ) = row?;

            pages.push(PageRecord {
                id,
                parent_id,
                title,
                icon,
                cover,
                properties: deserialize_page_properties(&properties_json)?,
                is_full_width: option_i64_to_bool(is_full_width),
                is_small_text: option_i64_to_bool(is_small_text),
                font_family,
                show_outline: option_i64_to_bool(show_outline),
                show_properties: option_i64_to_bool(show_properties),
                blocks: serde_json::from_str(&blocks_json).unwrap_or_default(),
                created_at,
                updated_at,
            });
        }

        Ok(pages)
    }

    fn load_page_record(&self, page_id: &str) -> StorageResult<PageRecord> {
        self.load_pages()?
            .into_iter()
            .find(|page| page.id == page_id)
            .ok_or_else(|| StorageError::not_found(format!("page not found: {page_id}")))
    }

    fn load_boards(&self) -> StorageResult<Vec<BoardRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT b.id, b.title, s.snapshot_json, b.created_at, b.updated_at
              FROM zhiqi_boards b
              JOIN zhiqi_board_snapshots s ON s.board_id = b.id
              ORDER BY b.position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let snapshot_json: String = row.get(2)?;
            Ok(BoardRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                snapshot: serde_json::from_str(&snapshot_json).unwrap_or(Value::Null),
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn load_data_tables(&self) -> StorageResult<Vec<DataTableRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, icon, cover, snapshot_json, created_at, updated_at
              FROM zhiqi_data_tables
              ORDER BY position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let snapshot_json: String = row.get(4)?;
            Ok(DataTableRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                cover: row.get(3)?,
                snapshot: serde_json::from_str(&snapshot_json).unwrap_or(Value::Null),
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn load_data_table_record(&self, data_table_id: &str) -> StorageResult<DataTableRecord> {
        self.load_data_tables()?
            .into_iter()
            .find(|data_table| data_table.id == data_table_id)
            .ok_or_else(|| {
                StorageError::not_found(format!("data table not found: {data_table_id}"))
            })
    }

    fn load_mindmaps(&self) -> StorageResult<Vec<MindmapRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT m.id, m.title, s.snapshot_json, m.created_at, m.updated_at
              FROM zhiqi_mindmaps m
              JOIN zhiqi_mindmap_snapshots s ON s.mindmap_id = m.id
              ORDER BY m.position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let snapshot_json: String = row.get(2)?;
            Ok(MindmapRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                snapshot: serde_json::from_str(&snapshot_json).unwrap_or(Value::Null),
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn load_synced_block_groups(&self) -> StorageResult<Vec<SyncedBlockGroupRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT id, blocks_json, primary_instance_id, created_at, updated_at
              FROM zhiqi_synced_block_groups
              ORDER BY rowid ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let blocks_json: String = row.get(1)?;
            Ok(SyncedBlockGroupRecord {
                id: row.get(0)?,
                blocks: serde_json::from_str(&blocks_json).unwrap_or_default(),
                primary_instance_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn descendant_page_ids(&self, page_id: &str) -> StorageResult<Vec<String>> {
        let mut statement = self.connection.prepare(
            "WITH RECURSIVE branch(id) AS (
              SELECT id FROM zhiqi_pages WHERE id = ?1
              UNION ALL
              SELECT zhiqi_pages.id FROM zhiqi_pages JOIN branch ON zhiqi_pages.parent_id = branch.id
            )
            SELECT id FROM branch",
        )?;
        let rows = statement.query_map([page_id], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn page_position(&self, page_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhiqi_pages", page_id)
    }

    fn board_position(&self, board_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhiqi_boards", board_id)
    }

    fn data_table_position(&self, data_table_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhiqi_data_tables", data_table_id)
    }

    fn mindmap_position(&self, mindmap_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhiqi_mindmaps", mindmap_id)
    }

    fn position_for_id(&self, table: &str, id: &str) -> StorageResult<Option<usize>> {
        self.connection
            .query_row(
                &format!("SELECT position FROM {table} WHERE id = ?1"),
                [id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .map(|position| {
                usize::try_from(position)
                    .map_err(|error| StorageError::invalid_payload(error.to_string()))
            })
            .transpose()
    }

    fn next_position(&self, table: &str) -> usize {
        self.connection
            .query_row(
                &format!("SELECT COALESCE(MAX(position), -1) + 1 FROM {table}"),
                [],
                |row| row.get::<_, i64>(0),
            )
            .ok()
            .and_then(|position| usize::try_from(position).ok())
            .unwrap_or_default()
    }

    fn import_record_id(
        &self,
        prefix: &str,
        table: &str,
        reserved_ids: &mut std::collections::HashSet<String>,
    ) -> StorageResult<String> {
        let mut counter = 0;
        for _ in 0..100 {
            let candidate = import_id(prefix, &mut counter);
            if reserved_ids.contains(&candidate) || self.id_exists(table, &candidate)? {
                continue;
            }
            reserved_ids.insert(candidate.clone());
            return Ok(candidate);
        }

        Err(StorageError::new(
            "conflict",
            format!("failed to generate unique {prefix} import id"),
        ))
    }

    fn id_exists(&self, table: &str, id: &str) -> StorageResult<bool> {
        let count: i64 = self.connection.query_row(
            &format!("SELECT COUNT(*) FROM {table} WHERE id = ?1"),
            [id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }
}

fn merge_missing_remote_blocks(local: &mut PageRecord, persisted: &PageRecord) {
    if local.updated_at == persisted.updated_at {
        return;
    }
    let local_ids = local
        .blocks
        .iter()
        .filter_map(|block| block.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<HashSet<_>>();
    local.blocks.extend(
        persisted
            .blocks
            .iter()
            .filter(|block| {
                block
                    .get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| !local_ids.contains(id))
            })
            .cloned(),
    );
}

fn insert_ordered_object_rows(
    connection: &Connection,
    table: &str,
    data_table_id: &str,
    order_value: Option<&Value>,
    object_value: Option<&Value>,
) -> StorageResult<()> {
    let Some(object) = object_value.and_then(Value::as_object) else {
        return Ok(());
    };
    let mut ordered_ids = Vec::new();

    if let Some(order) = order_value.and_then(Value::as_array) {
        for item in order {
            if let Some(id) = item.as_str() {
                if object.contains_key(id) && !ordered_ids.contains(&id.to_string()) {
                    ordered_ids.push(id.to_string());
                }
            }
        }
    }

    for id in object.keys() {
        if !ordered_ids.contains(id) {
            ordered_ids.push(id.clone());
        }
    }

    for (position, id) in ordered_ids.iter().enumerate() {
        if let Some(record) = object.get(id) {
            connection.execute(
                &format!(
                    "INSERT INTO {table} (data_table_id, id, record_json, position)
                      VALUES (?1, ?2, ?3, ?4)"
                ),
                params![
                    data_table_id,
                    id,
                    serde_json::to_string(record)?,
                    position as i64
                ],
            )?;
        }
    }

    Ok(())
}

fn archive_options_for_asset(asset: &AssetMeta) -> zip::write::FileOptions {
    zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(asset.byte_size > u32::MAX as i64)
}

fn total_asset_bytes(assets: &[AssetMeta]) -> u64 {
    assets
        .iter()
        .map(|asset| asset.byte_size.max(0) as u64)
        .sum()
}

fn ensure_resource_ids_exist<'a>(
    requested_ids: &[String],
    loaded_ids: impl Iterator<Item = &'a str>,
    label: &str,
) -> StorageResult<()> {
    let loaded_ids = loaded_ids.collect::<std::collections::HashSet<_>>();
    for id in requested_ids {
        if !loaded_ids.contains(id.as_str()) {
            return Err(StorageError::not_found(format!("{label} not found: {id}")));
        }
    }
    Ok(())
}

fn validate_page_package_manifest(manifest: &PagePackageManifest) -> StorageResult<()> {
    let page_ids = collect_unique_manifest_ids(
        manifest.pages.iter().map(|page| page.id.as_str()),
        manifest.pages.len(),
        "duplicate page id in page package",
    )?;
    let board_ids = collect_unique_manifest_ids(
        manifest.boards.iter().map(|board| board.id.as_str()),
        manifest.boards.len(),
        "duplicate board id in page package",
    )?;
    let data_table_ids = collect_unique_manifest_ids(
        manifest
            .data_tables
            .iter()
            .map(|data_table| data_table.id.as_str()),
        manifest.data_tables.len(),
        "duplicate data table id in page package",
    )?;
    let mindmap_ids = collect_unique_manifest_ids(
        manifest.mindmaps.iter().map(|mindmap| mindmap.id.as_str()),
        manifest.mindmaps.len(),
        "duplicate mindmap id in page package",
    )?;
    let synced_group_ids = collect_unique_manifest_ids(
        manifest
            .synced_block_groups
            .iter()
            .map(|group| group.id.as_str()),
        manifest.synced_block_groups.len(),
        "duplicate synced block group id in page package",
    )?;
    let asset_ids = collect_unique_manifest_ids(
        manifest.assets.iter().map(|asset| asset.id.as_str()),
        manifest.assets.len(),
        "duplicate asset id in page package",
    )?;
    let root_page = manifest
        .pages
        .iter()
        .find(|page| page.id == manifest.root_page_id)
        .ok_or_else(|| StorageError::invalid_payload("page package root is missing"))?;
    if root_page.parent_id.is_some() {
        return Err(StorageError::invalid_payload(
            "page package root must not have a parent",
        ));
    }

    for page in &manifest.pages {
        if page.id != manifest.root_page_id {
            let parent_id = page.parent_id.as_deref().ok_or_else(|| {
                StorageError::invalid_payload(format!(
                    "page package non-root page has no parent: {}",
                    page.id
                ))
            })?;
            validate_manifest_ref(&page_ids, parent_id, "page parent")?;
        }
        for block in &page.blocks {
            validate_json_ref(block, "pageId", &page_ids, "page")?;
            validate_json_ref(block, "boardId", &board_ids, "board")?;
            validate_json_ref(block, "databaseId", &data_table_ids, "data table")?;
            validate_json_ref(block, "mindmapId", &mindmap_ids, "mindmap")?;
            validate_json_ref(block, "groupId", &synced_group_ids, "synced block group")?;
            validate_json_ref(block, "assetId", &asset_ids, "asset")?;
        }
    }
    validate_page_package_tree_connected(manifest)?;

    let mut synced_instances_by_group: std::collections::HashMap<
        &str,
        std::collections::HashSet<&str>,
    > = std::collections::HashMap::new();
    for page in &manifest.pages {
        for block in &page.blocks {
            let Some(object) = block.as_object() else {
                continue;
            };
            if object.get("type").and_then(Value::as_str) != Some("synced_block") {
                continue;
            }
            let Some(group_id) = object.get("groupId").and_then(Value::as_str) else {
                continue;
            };
            let Some(instance_id) = object.get("instanceId").and_then(Value::as_str) else {
                continue;
            };
            synced_instances_by_group
                .entry(group_id)
                .or_default()
                .insert(instance_id);
        }
    }

    for group in &manifest.synced_block_groups {
        let group_instances = synced_instances_by_group
            .get(group.id.as_str())
            .ok_or_else(|| {
                StorageError::invalid_payload(format!(
                    "synced block group has no page instances in package: {}",
                    group.id
                ))
            })?;
        if !group_instances.contains(group.primary_instance_id.as_str()) {
            return Err(StorageError::invalid_payload(format!(
                "synced block group primary instance is missing from package: {}",
                group.id
            )));
        }
        for block in &group.blocks {
            if block.get("type").and_then(Value::as_str) == Some("synced_block") {
                return Err(StorageError::invalid_payload(
                    "page package synced block group must not contain nested synced_block",
                ));
            }
            validate_json_ref(block, "pageId", &page_ids, "page")?;
            validate_json_ref(block, "boardId", &board_ids, "board")?;
            validate_json_ref(block, "databaseId", &data_table_ids, "data table")?;
            validate_json_ref(block, "mindmapId", &mindmap_ids, "mindmap")?;
            validate_json_ref(block, "assetId", &asset_ids, "asset")?;
        }
    }

    for data_table in &manifest.data_tables {
        if let Some(database_id) = data_table
            .snapshot
            .pointer("/database/id")
            .and_then(Value::as_str)
        {
            validate_manifest_ref(&data_table_ids, database_id, "data table database")?;
        }
        if let Some(assets) = data_table.snapshot.get("assets").and_then(Value::as_object) {
            for (asset_id, asset_value) in assets {
                validate_manifest_ref(&asset_ids, asset_id, "data table asset")?;
                validate_json_ref(asset_value, "id", &asset_ids, "data table asset")?;
            }
        }
        if let Some(blocks) = data_table.snapshot.get("blocks").and_then(Value::as_object) {
            for block in blocks.values() {
                validate_json_ref(block, "imageAssetId", &asset_ids, "data table block asset")?;
            }
        }
    }

    Ok(())
}

fn validate_page_package_tree_connected(manifest: &PagePackageManifest) -> StorageResult<()> {
    let mut children_by_parent: std::collections::HashMap<&str, Vec<&str>> =
        std::collections::HashMap::new();
    for page in &manifest.pages {
        if let Some(parent_id) = page.parent_id.as_deref() {
            children_by_parent
                .entry(parent_id)
                .or_default()
                .push(page.id.as_str());
        }
    }

    let mut visited = std::collections::HashSet::new();
    let mut stack = vec![manifest.root_page_id.as_str()];
    while let Some(page_id) = stack.pop() {
        if !visited.insert(page_id) {
            continue;
        }
        if let Some(children) = children_by_parent.get(page_id) {
            stack.extend(children.iter().copied());
        }
    }

    if visited.len() == manifest.pages.len() {
        return Ok(());
    }

    Err(StorageError::invalid_payload(
        "page package pages must form one tree rooted at the package root",
    ))
}

fn ordered_page_package_pages<'a>(
    pages: &'a [PageRecord],
    root_page_id: &str,
) -> StorageResult<Vec<&'a PageRecord>> {
    let page_by_id = pages
        .iter()
        .map(|page| (page.id.as_str(), page))
        .collect::<std::collections::HashMap<_, _>>();
    let mut children_by_parent: std::collections::HashMap<&str, Vec<&PageRecord>> =
        std::collections::HashMap::new();
    for page in pages {
        if let Some(parent_id) = page.parent_id.as_deref() {
            children_by_parent.entry(parent_id).or_default().push(page);
        }
    }

    let mut ordered = Vec::with_capacity(pages.len());
    let mut queue = std::collections::VecDeque::from([root_page_id]);
    while let Some(page_id) = queue.pop_front() {
        let page = page_by_id
            .get(page_id)
            .copied()
            .ok_or_else(|| StorageError::invalid_payload("page package root is missing"))?;
        ordered.push(page);
        if let Some(children) = children_by_parent.get(page_id) {
            for child in children {
                queue.push_back(child.id.as_str());
            }
        }
    }

    Ok(ordered)
}

fn collect_unique_manifest_ids<'a>(
    ids: impl Iterator<Item = &'a str>,
    expected_len: usize,
    message: &'static str,
) -> StorageResult<std::collections::HashSet<&'a str>> {
    let ids = ids.collect::<std::collections::HashSet<_>>();
    if ids.len() != expected_len {
        return Err(StorageError::invalid_payload(message));
    }
    Ok(ids)
}

fn validate_json_ref(
    value: &Value,
    field: &str,
    valid_ids: &std::collections::HashSet<&str>,
    label: &str,
) -> StorageResult<()> {
    if let Some(id) = value.get(field).and_then(Value::as_str) {
        validate_manifest_ref(valid_ids, id, label)?;
    }
    Ok(())
}

fn validate_manifest_ref(
    valid_ids: &std::collections::HashSet<&str>,
    id: &str,
    label: &str,
) -> StorageResult<()> {
    if valid_ids.contains(id) {
        return Ok(());
    }
    Err(StorageError::invalid_payload(format!(
        "page package references missing {label}: {id}"
    )))
}

fn import_id(prefix: &str, counter: &mut u64) -> String {
    *counter += 1;
    let sequence = IMPORT_ID_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
    format!(
        "{prefix}_import_{}_{}_{}",
        std::process::id(),
        now_nanos(),
        sequence + *counter
    )
}

fn rewrite_rich_text_relation_segments(
    rich_text: &mut [Value],
    page_id_map: &std::collections::HashMap<String, String>,
) {
    for segment in rich_text {
        let Some(object) = segment.as_object_mut() else {
            continue;
        };
        let Some(page_id) = object
            .get("pageId")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };

        if let Some(next_id) = page_id_map.get(&page_id) {
            object.insert("pageId".to_string(), Value::String(next_id.clone()));
            continue;
        }

        object.remove("pageId");
        object.remove("relationKind");
    }
}

fn rewrite_block_ids_and_refs(
    blocks: &mut [Value],
    page_id_map: &std::collections::HashMap<String, String>,
    board_id_map: &std::collections::HashMap<String, String>,
    data_table_id_map: &std::collections::HashMap<String, String>,
    mindmap_id_map: &std::collections::HashMap<String, String>,
    asset_id_map: &std::collections::HashMap<String, String>,
    synced_group_id_map: &std::collections::HashMap<String, String>,
    synced_instance_id_map: &std::collections::HashMap<String, String>,
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
        if let Some(Value::String(group_id)) = object.get_mut("groupId") {
            if let Some(next_id) = synced_group_id_map.get(group_id) {
                *group_id = next_id.clone();
            }
        }
        if let Some(Value::String(instance_id)) = object.get_mut("instanceId") {
            if let Some(next_id) = synced_instance_id_map.get(instance_id) {
                *instance_id = next_id.clone();
            }
        }
        if let Some(rich_text) = object.get_mut("richText").and_then(Value::as_array_mut) {
            rewrite_rich_text_relation_segments(rich_text, page_id_map);
        }
    }
}

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
                .and_then(|value| value.as_str())
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

fn rewrite_workspace_asset_refs(
    workspace: &mut WorkspaceSnapshot,
    asset_id_map: &std::collections::HashMap<String, String>,
) {
    for page in &mut workspace.pages {
        rewrite_block_asset_refs(&mut page.blocks, asset_id_map);
    }
    for group in &mut workspace.synced_block_groups {
        rewrite_block_asset_refs(&mut group.blocks, asset_id_map);
    }
    for data_table in &mut workspace.data_tables {
        rewrite_data_table_asset_refs(&mut data_table.snapshot, asset_id_map);
    }
}

fn rewrite_block_asset_refs(
    blocks: &mut [Value],
    asset_id_map: &std::collections::HashMap<String, String>,
) {
    for block in blocks {
        let Some(object) = block.as_object_mut() else {
            continue;
        };
        let Some(asset_id) = object
            .get("assetId")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            continue;
        };
        if let Some(next_id) = asset_id_map.get(&asset_id) {
            object.insert("assetId".to_string(), Value::String(next_id.clone()));
        }
    }
}

fn rewrite_data_table_block_ids(snapshot: &mut Value, counter: &mut u64) {
    let Some(blocks) = snapshot.get("blocks").and_then(Value::as_object) else {
        return;
    };
    let block_id_map = blocks
        .keys()
        .map(|block_id| (block_id.clone(), import_id("block", counter)))
        .collect::<std::collections::HashMap<_, _>>();
    if block_id_map.is_empty() {
        return;
    }

    if let Some(blocks) = snapshot.get_mut("blocks").and_then(Value::as_object_mut) {
        let old_blocks = std::mem::take(blocks);
        for (block_id, mut block_value) in old_blocks {
            let next_block_id = block_id_map.get(&block_id).cloned().unwrap_or(block_id);
            if let Some(object) = block_value.as_object_mut() {
                object.insert("id".to_string(), Value::String(next_block_id.clone()));
            }
            blocks.insert(next_block_id, block_value);
        }
    }

    if let Some(record_pages) = snapshot
        .get_mut("recordPages")
        .and_then(Value::as_object_mut)
    {
        for record_page in record_pages.values_mut() {
            let Some(block_ids) = record_page
                .get_mut("blockIds")
                .and_then(Value::as_array_mut)
            else {
                continue;
            };
            for block_id in block_ids {
                let Some(next_block_id) = block_id
                    .as_str()
                    .and_then(|id| block_id_map.get(id))
                    .cloned()
                else {
                    continue;
                };
                *block_id = Value::String(next_block_id);
            }
        }
    }
}

#[allow(dead_code)]
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

fn collect_synced_group_ids_from_pages(pages: &[PageRecord]) -> Vec<String> {
    let mut ids = Vec::new();

    for page in pages {
        for block in &page.blocks {
            if block.get("type").and_then(Value::as_str) != Some("synced_block") {
                continue;
            }
            let Some(group_id) = block.get("groupId").and_then(Value::as_str) else {
                continue;
            };
            if !ids.iter().any(|existing| existing == group_id) {
                ids.push(group_id.to_string());
            }
        }
    }

    ids
}

fn collect_ref_ids_from_synced_groups(
    groups: &[SyncedBlockGroupRecord],
    ref_kind: &str,
) -> Vec<String> {
    let pages = groups
        .iter()
        .enumerate()
        .map(|(index, group)| PageRecord {
            id: format!("group_page_{index}"),
            parent_id: None,
            title: String::new(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: group.blocks.clone(),
            created_at: group.created_at.clone(),
            updated_at: group.updated_at.clone(),
        })
        .collect::<Vec<_>>();
    collect_ref_ids_from_pages(&pages, ref_kind)
}

fn normalize_exported_synced_block_groups(
    groups: Vec<SyncedBlockGroupRecord>,
    pages: &[PageRecord],
) -> Vec<SyncedBlockGroupRecord> {
    groups
        .into_iter()
        .map(|mut group| {
            let instance_ids = pages
                .iter()
                .flat_map(|page| page.blocks.iter())
                .filter(|block| {
                    block.get("type").and_then(Value::as_str) == Some("synced_block")
                        && block.get("groupId").and_then(Value::as_str) == Some(group.id.as_str())
                })
                .filter_map(|block| {
                    block
                        .get("instanceId")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>();
            if !instance_ids
                .iter()
                .any(|instance_id| instance_id == &group.primary_instance_id)
            {
                if let Some(next_primary) = instance_ids.first() {
                    group.primary_instance_id = next_primary.clone();
                }
            }
            group
        })
        .collect()
}

#[allow(dead_code)]
fn collect_asset_ids_from_pages(pages: &[PageRecord]) -> Vec<String> {
    let mut ids = Vec::new();

    for page in pages {
        for block in &page.blocks {
            let Some(block_type) = block.get("type").and_then(Value::as_str) else {
                continue;
            };
            if matches!(block_type, "image" | "video" | "audio" | "file") {
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

fn collect_asset_ids_from_synced_groups(groups: &[SyncedBlockGroupRecord]) -> Vec<String> {
    let pages = groups
        .iter()
        .enumerate()
        .map(|(index, group)| PageRecord {
            id: format!("group_page_{index}"),
            parent_id: None,
            title: String::new(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: group.blocks.clone(),
            created_at: group.created_at.clone(),
            updated_at: group.updated_at.clone(),
        })
        .collect::<Vec<_>>();
    collect_asset_ids_from_pages(&pages)
}

#[allow(dead_code)]
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

fn report_archive_progress<F>(
    task_id: Option<&str>,
    progress: &mut F,
    operation: WorkspaceArchiveOperation,
    phase: WorkspaceArchiveProgressPhase,
    current: u64,
    total: u64,
    bytes_processed: u64,
    bytes_total: u64,
    item_name: Option<String>,
) where
    F: FnMut(WorkspaceArchiveProgress),
{
    if let Some(task_id) = task_id {
        progress(WorkspaceArchiveProgress {
            task_id: task_id.to_string(),
            operation,
            phase,
            current,
            total,
            bytes_processed,
            bytes_total,
            item_name,
        });
    }
}

fn copy_with_progress<R, W, F>(reader: &mut R, writer: &mut W, mut progress: F) -> io::Result<u64>
where
    R: Read,
    W: Write,
    F: FnMut(u64),
{
    let mut buffer = [0_u8; 1024 * 1024];
    let mut copied = 0_u64;

    loop {
        let bytes_read = reader.read(&mut buffer)?;

        if bytes_read == 0 {
            break;
        }

        writer.write_all(&buffer[..bytes_read])?;
        copied += bytes_read as u64;
        progress(copied);
    }

    Ok(copied)
}

fn zip_error(error: zip::result::ZipError) -> StorageError {
    match error {
        zip::result::ZipError::Io(error) => StorageError::io(error),
        zip::result::ZipError::FileNotFound => StorageError::not_found("archive entry not found"),
        other => StorageError::invalid_payload(other.to_string()),
    }
}

fn read_archive_json<R, T>(
    archive: &mut zip::ZipArchive<R>,
    entry_name: &str,
) -> StorageResult<T>
where
    R: Read + Seek,
    T: DeserializeOwned,
{
    let mut entry = archive
        .by_name(entry_name)
        .map_err(|_| StorageError::invalid_payload(format!("archive entry is missing: {entry_name}")))?;
    serde_json::from_reader(&mut entry).map_err(Into::into)
}

fn option_bool_to_i64(value: Option<bool>) -> Option<i64> {
    value.map(|flag| if flag { 1 } else { 0 })
}

fn option_i64_to_bool(value: Option<i64>) -> Option<bool> {
    value.map(|flag| flag != 0)
}

fn serialize_page_properties(value: Option<&Value>) -> StorageResult<String> {
    serde_json::to_string(
        &value
            .cloned()
            .unwrap_or_else(|| Value::Object(serde_json::Map::new())),
    )
    .map_err(Into::into)
}

fn deserialize_page_properties(value: &str) -> StorageResult<Option<Value>> {
    let properties = serde_json::from_str::<Value>(value)?;
    let is_empty_object = properties
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(false);

    Ok(if is_empty_object {
        None
    } else {
        Some(properties)
    })
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
fn unique_test_assets_dir() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!("zhiqi-storage-test-{}-{nanos}", std::process::id()))
}

#[cfg(test)]
fn unique_test_data_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!(
        "zhiqi-storage-test-{label}-{}-{nanos}",
        std::process::id()
    ))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use serde_json::json;

    use super::*;

    #[test]
    fn uses_zhiqi_storage_file_and_asset_names() {
        assert_eq!(DATABASE_FILE_NAME, "zhiqi.db");
        assert_eq!(ASSETS_DIR_NAME, "zhiqi-assets");
    }

    #[test]
    fn uses_zhiqi_prefix_for_sqlite_schema_names() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let table_names = sqlite_object_names(&storage, "table");
        let custom_index_names = sqlite_object_names(&storage, "index")
            .into_iter()
            .filter(|name| !name.starts_with("sqlite_"))
            .collect::<Vec<_>>();

        assert!(table_names.iter().all(|name| name.starts_with("zhiqi_")));
        assert!(custom_index_names
            .iter()
            .all(|name| name.starts_with("idx_zhiqi_")));
        assert!(table_names.contains(&"zhiqi_pages".to_string()));
        assert!(table_names.contains(&"zhiqi_assets".to_string()));
        assert!(table_names.contains(&"zhiqi_search_documents_fts".to_string()));
    }

    fn sqlite_object_names(storage: &Storage, object_type: &str) -> Vec<String> {
        let mut statement = storage
            .connection
            .prepare(
                "SELECT name FROM sqlite_schema
                 WHERE type = ?1 AND name NOT LIKE 'sqlite_%'
                 ORDER BY name ASC",
            )
            .expect("prepare sqlite schema query");
        statement
            .query_map([object_type], |row| row.get::<_, String>(0))
            .expect("query sqlite schema")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect sqlite schema names")
    }

    fn sample_snapshot() -> WorkspaceSnapshot {
        WorkspaceSnapshot {
            boards: vec![BoardRecord {
                id: "board_1".to_string(),
                title: "Board".to_string(),
                snapshot: json!({ "elements": [] }),
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            }],
            data_tables: vec![DataTableRecord {
                id: "database_1".to_string(),
                title: "Projects".to_string(),
                icon: None,
                cover: None,
                snapshot: json!({
                    "version": 1,
                    "database": {
                        "id": "database_1",
                        "name": "Projects",
                        "propertyOrder": [],
                        "activeViewId": "view_1",
                        "viewOrder": ["view_1"],
                        "views": {},
                        "createdAt": "2026-06-30T00:00:00.000Z",
                        "updatedAt": "2026-06-30T00:00:00.000Z"
                    },
                    "properties": {},
                    "records": {
                        "record_1": {
                            "id": "record_1",
                            "title": "Launch plan",
                            "values": {},
                            "createdAt": "2026-06-30T00:00:00.000Z",
                            "updatedAt": "2026-06-30T00:00:00.000Z"
                        }
                    },
                    "recordPages": {},
                    "blocks": {},
                    "assets": {}
                }),
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            }],
            mindmaps: vec![MindmapRecord {
                id: "mindmap_1".to_string(),
                title: "Map".to_string(),
                snapshot: json!({ "id": "root", "title": "Map" }),
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            }],
            synced_block_groups: Vec::new(),
            pages: vec![PageRecord {
                id: "page_1".to_string(),
                parent_id: None,
                title: "Home".to_string(),
                icon: Some("N".to_string()),
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![
                    json!({ "id": "block_1", "type": "paragraph", "text": "Hello storage engine" }),
                    json!({ "id": "block_2", "type": "whiteboard", "boardId": "board_1" }),
                    json!({ "id": "block_3", "type": "data_table", "databaseId": "database_1" }),
                    json!({ "id": "block_4", "type": "mindmap", "mindmapId": "mindmap_1" }),
                ],
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            }],
            page_properties: Vec::new(),
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_1".to_string()),
                ..WorkspaceSettings::default()
            },
        }
    }

    #[test]
    fn rejects_stale_board_saves_without_overwriting_a_newer_snapshot() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let original = sample_snapshot().boards.remove(0);
        storage
            .save_board(original.clone(), None)
            .expect("save initial board");
        let mcp_board = BoardRecord {
            snapshot: json!({ "shapes": [{ "id": "mcp-node" }] }),
            updated_at: "2026-07-13T00:00:00.000Z".to_string(),
            ..original.clone()
        };
        storage
            .save_board(mcp_board.clone(), Some(&original.updated_at))
            .expect("save matching expected version");
        let stale_local = BoardRecord {
            snapshot: json!({ "shapes": [{ "id": "local-node" }] }),
            updated_at: "2026-07-12T00:00:00.000Z".to_string(),
            ..original.clone()
        };

        let error = storage
            .save_board(stale_local, Some(&original.updated_at))
            .expect_err("stale save is rejected");

        assert_eq!(error.code, "conflict");
        assert_eq!(
            storage
                .load_mcp_whiteboard(&original.id)
                .expect("load current board")
                .snapshot,
            mcp_board.snapshot
        );
    }

    #[test]
    fn rejects_a_stale_full_workspace_replace_without_clearing_the_mcp_board() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let original = sample_snapshot();
        let original_board = original.boards[0].clone();
        storage
            .replace_workspace_backup(original.clone())
            .expect("seed workspace");
        let mcp_board = BoardRecord {
            snapshot: json!({ "shapes": [{ "id": "mcp-node" }] }),
            updated_at: "2026-07-13T00:00:00.000Z".to_string(),
            ..original_board.clone()
        };
        storage
            .save_board(mcp_board.clone(), None)
            .expect("persist MCP board");
        let mut stale_replace = original.clone();
        stale_replace.pages[0].title = "Stale local title".to_string();

        let error = storage
            .replace_workspace_backup_with_expected_board_updated_ats(
                stale_replace,
                Some(&std::collections::BTreeMap::from([(
                    original_board.id.clone(),
                    original_board.updated_at.clone(),
                )])),
            )
            .expect_err("stale full replace is rejected");

        assert_eq!(error.code, "conflict");
        assert_eq!(
            storage
                .load_mcp_whiteboard(&original_board.id)
                .expect("MCP board survives")
                .snapshot,
            mcp_board.snapshot
        );
        assert_eq!(
            storage
                .load_page_record("page_1")
                .expect("page survives")
                .title,
            original.pages[0].title
        );
    }

    #[test]
    fn rejects_a_stale_full_workspace_replace_after_mcp_creates_a_child_page() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let original = sample_snapshot();
        storage
            .replace_workspace_backup(original.clone())
            .expect("seed workspace");

        storage
            .create_mcp_page(
                PageRecord {
                    id: "page_mcp_child".to_string(),
                    parent_id: Some("page_1".to_string()),
                    title: "MCP child".to_string(),
                    icon: None,
                    cover: None,
                    properties: None,
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: Vec::new(),
                    created_at: "2026-07-13T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-13T00:00:00.000Z".to_string(),
                },
                Some("block_mcp_child".to_string()),
            )
            .expect("MCP creates child page");

        let error = storage
            .replace_workspace_backup_with_expected_board_updated_ats(
                original.clone(),
                Some(&std::collections::BTreeMap::new()),
            )
            .expect_err("stale full replace is rejected");

        assert_eq!(error.code, "conflict");
        assert!(storage.load_page_record("page_mcp_child").is_ok());
        assert!(storage
            .load_page_record("page_1")
            .expect("parent remains")
            .blocks
            .iter()
            .any(|block| block["id"] == "block_mcp_child"));
    }

    #[test]
    fn rejects_a_stale_full_workspace_replace_after_mcp_creates_a_whiteboard() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let original = sample_snapshot();
        storage
            .replace_workspace_backup(original.clone())
            .expect("seed workspace");

        storage
            .append_mcp_content(McpWriteBatch {
                page_id: "page_1".to_string(),
                blocks: vec![json!({
                    "id": "block_mcp_whiteboard",
                    "type": "whiteboard",
                    "boardId": "board_mcp_new",
                })],
                boards: vec![BoardRecord {
                    id: "board_mcp_new".to_string(),
                    title: "MCP board".to_string(),
                    snapshot: json!({ "shapes": [], "connections": [] }),
                    created_at: "2026-07-13T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-13T00:00:00.000Z".to_string(),
                }],
                data_tables: Vec::new(),
                mindmaps: Vec::new(),
                updated_at: "2026-07-13T00:00:00.000Z".to_string(),
                client_name: "test".to_string(),
                tool_name: "append_content".to_string(),
            })
            .expect("MCP creates whiteboard");

        let error = storage
            .replace_workspace_backup_with_expected_board_updated_ats(
                original,
                Some(&std::collections::BTreeMap::new()),
            )
            .expect_err("stale full replace is rejected");

        assert_eq!(error.code, "conflict");
        assert!(storage.load_mcp_whiteboard("board_mcp_new").is_ok());
        assert!(storage
            .load_page_record("page_1")
            .expect("page remains")
            .blocks
            .iter()
            .any(|block| block["boardId"] == "board_mcp_new"));
    }

    #[test]
    fn replaces_workspace_when_all_expected_board_versions_match() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let original = sample_snapshot();
        let original_board = original.boards[0].clone();
        storage
            .replace_workspace_backup(original.clone())
            .expect("seed workspace");
        let mut replacement = original.clone();
        replacement.pages[0].title = "Updated local title".to_string();

        storage
            .replace_workspace_backup_with_expected_board_updated_ats(
                replacement,
                Some(&std::collections::BTreeMap::from([(
                    original_board.id,
                    original_board.updated_at,
                )])),
            )
            .expect("matching full replace succeeds");

        assert_eq!(
            storage
                .load_page_record("page_1")
                .expect("load replaced page")
                .title,
            "Updated local title"
        );
    }

    #[test]
    fn workspace_backup_and_bootstrap_include_synced_block_groups() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot_value =
            serde_json::to_value(sample_snapshot()).expect("serialize snapshot");
        snapshot_value["syncedBlockGroups"] = json!([
            {
                "id": "group_1",
                "blocks": [
                    {
                        "id": "group_block_1",
                        "type": "paragraph",
                        "text": "Shared alpha note"
                    }
                ],
                "primaryInstanceId": "instance_1",
                "createdAt": "2026-07-06T00:00:00.000Z",
                "updatedAt": "2026-07-06T00:00:00.000Z"
            }
        ]);
        let snapshot: WorkspaceSnapshot =
            serde_json::from_value(snapshot_value).expect("deserialize snapshot");

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace workspace");

        let exported = serde_json::to_value(
            storage
                .export_workspace_backup()
                .expect("export workspace backup"),
        )
        .expect("serialize exported workspace");
        assert_eq!(
            exported
                .pointer("/syncedBlockGroups/0/id")
                .and_then(Value::as_str),
            Some("group_1")
        );

        let bootstrap = serde_json::to_value(storage.bootstrap_workspace().expect("bootstrap"))
            .expect("serialize bootstrap");
        assert_eq!(
            bootstrap
                .pointer("/syncedBlockGroups/0/id")
                .and_then(Value::as_str),
            Some("group_1")
        );
    }

    #[test]
    fn preserves_extended_workspace_settings_fields_when_loading_and_saving() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.settings = WorkspaceSettings {
            last_opened_page_id: Some("page_1".to_string()),
            mcp_revision: Some(3),
            inbox_page_id: Some("page_inbox".to_string()),
            welcome_page_id: Some("page_welcome".to_string()),
            welcome_guide_version: Some(2),
            sidebar_layout: Some("compact".to_string()),
            sidebar_width: Some(272),
            pinned_sidebar_items: vec![json!({
                "kind": "page",
                "pageId": "page_1"
            })],
            clipboard_capture_mode: Some("off".to_string()),
            block_selection_start_mode: Some("content_allowed".to_string()),
            link_open_mode: Some("modifier".to_string()),
            page_defaults: Some(json!({ "showOutline": true })),
            search_preferences: Some(json!({ "includePageProperties": true })),
        };

        storage
            .replace_workspace_backup(snapshot.clone())
            .expect("replace workspace");

        let exported = storage
            .export_workspace_backup()
            .expect("export workspace backup");

        assert_eq!(exported.settings, snapshot.settings);
    }

    #[test]
    fn preserves_block_selection_start_mode_when_loading_and_saving() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot_value =
            serde_json::to_value(sample_snapshot()).expect("serialize snapshot");
        snapshot_value["settings"]["blockSelectionStartMode"] = json!("content_allowed");
        let snapshot: WorkspaceSnapshot =
            serde_json::from_value(snapshot_value).expect("deserialize snapshot");

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace workspace");

        let exported = serde_json::to_value(
            storage
                .export_workspace_backup()
                .expect("export workspace backup"),
        )
        .expect("serialize exported workspace");

        assert_eq!(
            exported
                .pointer("/settings/blockSelectionStartMode")
                .and_then(Value::as_str),
            Some("content_allowed")
        );
    }

    #[test]
    fn saves_and_loads_app_settings_independently_from_workspace_settings() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let settings = AppSettings {
            close_action: Some("hide_to_tray".to_string()),
            accent_theme: Some("violet".to_string()),
            auto_backup: models::AutoBackupSettings::default(),
            mcp: Some(models::McpSettings {
                enabled: true,
                port: 38_472,
                token: "test-token".to_string(),
            }),
        };

        storage
            .save_app_settings(&settings)
            .expect("save app settings");

        assert_eq!(
            storage.load_app_settings().expect("load app settings"),
            Some(settings)
        );
        assert_eq!(
            storage.load_settings().expect("load workspace settings"),
            None
        );
    }

    #[test]
    fn workspace_replacement_preserves_app_settings() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");
        let settings = AppSettings {
            close_action: Some("hide_to_tray".to_string()),
            accent_theme: Some("violet".to_string()),
            auto_backup: models::AutoBackupSettings::default(),
            mcp: Some(models::McpSettings {
                enabled: true,
                port: 38_472,
                token: "preserved-token".to_string(),
            }),
        };
        storage
            .save_app_settings(&settings)
            .expect("save app settings");
        let snapshot = storage
            .export_workspace_backup()
            .expect("export workspace backup");

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace workspace backup");

        assert_eq!(
            storage.load_app_settings().expect("load app settings"),
            Some(settings)
        );
    }

    #[test]
    fn page_package_export_includes_referenced_synced_groups_resources_and_assets() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "shared-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"shared image".to_vec(),
            })
            .expect("write asset");
        let mut snapshot_value =
            serde_json::to_value(sample_snapshot()).expect("serialize snapshot");
        snapshot_value["pages"] = json!([
            {
                "id": "page_sync",
                "parentId": null,
                "title": "Synced Root",
                "icon": null,
                "cover": null,
                "properties": {},
                "blocks": [
                    {
                        "id": "block_sync",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_1",
                        "mode": "sync"
                    }
                ],
                "createdAt": "2026-07-06T00:00:00.000Z",
                "updatedAt": "2026-07-06T00:00:00.000Z"
            }
        ]);
        snapshot_value["syncedBlockGroups"] = json!([
            {
                "id": "group_1",
                "blocks": [
                    {
                        "id": "group_block_1",
                        "type": "whiteboard",
                        "boardId": "board_1"
                    },
                    {
                        "id": "group_block_2",
                        "type": "data_table",
                        "databaseId": "database_1"
                    },
                    {
                        "id": "group_block_3",
                        "type": "mindmap",
                        "mindmapId": "mindmap_1"
                    },
                    {
                        "id": "group_block_4",
                        "type": "image",
                        "assetId": asset.id,
                        "name": "shared-image.png",
                        "mimeType": "image/png"
                    }
                ],
                "primaryInstanceId": "instance_outside_package",
                "createdAt": "2026-07-06T00:00:00.000Z",
                "updatedAt": "2026-07-06T00:00:00.000Z"
            }
        ]);
        let snapshot: WorkspaceSnapshot =
            serde_json::from_value(snapshot_value).expect("deserialize snapshot");
        storage
            .replace_workspace_backup(snapshot)
            .expect("replace workspace");

        let archive = storage
            .export_page_package("page_sync")
            .expect("export page package");
        let manifest = serde_json::to_value(read_exported_page_package_manifest(archive))
            .expect("serialize manifest");

        assert_eq!(
            manifest
                .pointer("/syncedBlockGroups/0/id")
                .and_then(Value::as_str),
            Some("group_1")
        );
        assert_eq!(
            manifest
                .pointer("/syncedBlockGroups/0/primaryInstanceId")
                .and_then(Value::as_str),
            Some("instance_1")
        );
        assert_eq!(
            manifest.pointer("/boards/0/id").and_then(Value::as_str),
            Some("board_1")
        );
        assert_eq!(
            manifest.pointer("/dataTables/0/id").and_then(Value::as_str),
            Some("database_1")
        );
        assert_eq!(
            manifest.pointer("/mindmaps/0/id").and_then(Value::as_str),
            Some("mindmap_1")
        );
        assert_eq!(
            manifest.pointer("/assets/0/id").and_then(Value::as_str),
            Some(asset.id.as_str())
        );
    }

    #[test]
    fn page_package_import_rewrites_synced_group_and_instance_ids() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot_value =
            serde_json::to_value(sample_snapshot()).expect("serialize snapshot");
        snapshot_value["pages"] = json!([
            {
                "id": "page_sync_root",
                "parentId": null,
                "title": "Synced Root",
                "icon": null,
                "cover": null,
                "properties": {},
                "blocks": [
                    {
                        "id": "block_sync_root",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_1",
                        "mode": "sync"
                    }
                ],
                "createdAt": "2026-07-06T00:00:00.000Z",
                "updatedAt": "2026-07-06T00:00:00.000Z"
            },
            {
                "id": "page_sync_child",
                "parentId": "page_sync_root",
                "title": "Synced Child",
                "icon": null,
                "cover": null,
                "properties": {},
                "blocks": [
                    {
                        "id": "block_sync_child",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_2",
                        "mode": "reference"
                    }
                ],
                "createdAt": "2026-07-06T00:01:00.000Z",
                "updatedAt": "2026-07-06T00:01:00.000Z"
            }
        ]);
        snapshot_value["syncedBlockGroups"] = json!([
            {
                "id": "group_1",
                "blocks": [
                    {
                        "id": "group_block_1",
                        "type": "paragraph",
                        "text": "Shared alpha note"
                    }
                ],
                "primaryInstanceId": "instance_1",
                "createdAt": "2026-07-06T00:00:00.000Z",
                "updatedAt": "2026-07-06T00:00:00.000Z"
            }
        ]);
        let snapshot: WorkspaceSnapshot =
            serde_json::from_value(snapshot_value).expect("deserialize snapshot");
        source
            .replace_workspace_backup(snapshot)
            .expect("replace source workspace");
        let archive = source
            .export_page_package("page_sync_root")
            .expect("export page package");

        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        target
            .import_page_package(archive)
            .expect("import page package");

        let imported = serde_json::to_value(
            target
                .export_workspace_backup()
                .expect("export imported workspace"),
        )
        .expect("serialize imported workspace");
        let imported_group = imported
            .pointer("/syncedBlockGroups/0")
            .and_then(Value::as_object)
            .expect("imported synced group");
        let imported_group_id = imported_group
            .get("id")
            .and_then(Value::as_str)
            .expect("imported group id");
        let imported_primary_instance_id = imported_group
            .get("primaryInstanceId")
            .and_then(Value::as_str)
            .expect("imported primary instance id");

        assert_ne!(imported_group_id, "group_1");
        assert_ne!(imported_primary_instance_id, "instance_1");

        let pages = imported
            .get("pages")
            .and_then(Value::as_array)
            .expect("imported pages");
        let synced_blocks = pages
            .iter()
            .filter_map(|page| page.get("blocks").and_then(Value::as_array))
            .flatten()
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("synced_block"))
            .collect::<Vec<_>>();

        assert_eq!(synced_blocks.len(), 2);
        for block in &synced_blocks {
            assert_eq!(
                block.get("groupId").and_then(Value::as_str),
                Some(imported_group_id)
            );
            assert_ne!(
                block.get("instanceId").and_then(Value::as_str),
                Some("instance_1")
            );
            assert_ne!(
                block.get("instanceId").and_then(Value::as_str),
                Some("instance_2")
            );
        }
        assert!(synced_blocks.iter().any(|block| {
            block.get("instanceId").and_then(Value::as_str) == Some(imported_primary_instance_id)
        }));
    }

    fn read_exported_page_package_manifest_from_archive<R>(
        source_archive: &mut zip::ZipArchive<R>,
    ) -> PagePackageManifest
    where
        R: Read + Seek,
    {
        let mut payload: Value = {
            let mut payload_entry = source_archive
                .by_name(EXCHANGE_PAYLOAD_ENTRY)
                .expect("page package payload");
            serde_json::from_reader(&mut payload_entry).expect("parse payload")
        };
        let assets: Value = {
            let mut asset_manifest_entry = source_archive
                .by_name(EXCHANGE_ASSET_MANIFEST_ENTRY)
                .expect("asset manifest");
            serde_json::from_reader(&mut asset_manifest_entry).expect("parse asset manifest")
        };
        let payload_object = payload.as_object_mut().expect("payload object");
        payload_object.insert("kind".to_string(), Value::String(PAGE_PACKAGE_KIND.to_string()));
        payload_object.insert(
            "version".to_string(),
            Value::Number(PAGE_PACKAGE_VERSION.into()),
        );
        payload_object.insert("assets".to_string(), assets);
        serde_json::from_value(payload).expect("parse page package manifest")
    }

    fn read_exported_page_package_manifest(archive: Vec<u8>) -> PagePackageManifest {
        let mut source_archive =
            zip::ZipArchive::new(Cursor::new(archive)).expect("read source archive");
        read_exported_page_package_manifest_from_archive(&mut source_archive)
    }

    fn rewrite_page_package_manifest(
        archive: Vec<u8>,
        rewrite: impl FnOnce(&mut PagePackageManifest),
    ) -> Vec<u8> {
        let mut source_archive =
            zip::ZipArchive::new(Cursor::new(archive)).expect("read source archive");
        let mut manifest = read_exported_page_package_manifest_from_archive(&mut source_archive);
        let mut asset_entries = Vec::new();
        for asset in &manifest.assets {
            let path = format!("assets/{}", asset.relative_path);
            let mut entry = source_archive.by_name(&path).expect("asset entry");
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).expect("read asset entry");
            asset_entries.push((path, asset.clone(), bytes));
        }

        rewrite(&mut manifest);

        let mut bytes = Cursor::new(Vec::new());
        {
            let mut rewritten_archive = zip::ZipWriter::new(&mut bytes);
            let metadata_options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            rewritten_archive
                .start_file(PAGE_PACKAGE_MANIFEST_ENTRY, metadata_options)
                .expect("start page package manifest");
            serde_json::to_writer(&mut rewritten_archive, &manifest).expect("write manifest");
            rewritten_archive
                .start_file("assets/manifest.json", metadata_options)
                .expect("start asset manifest");
            serde_json::to_writer(&mut rewritten_archive, &manifest.assets)
                .expect("write asset manifest");
            for (path, asset, bytes) in asset_entries {
                rewritten_archive
                    .start_file(path, archive_options_for_asset(&asset))
                    .expect("start asset entry");
                rewritten_archive
                    .write_all(&bytes)
                    .expect("write asset entry");
            }
            rewritten_archive.finish().expect("finish archive");
        }
        bytes.into_inner()
    }

    #[test]
    fn initializes_schema_with_wal_foreign_keys_and_version() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");

        assert_eq!(
            storage.schema_version().expect("schema version"),
            schema::SCHEMA_VERSION
        );
        assert_eq!(
            storage.pragma_string("journal_mode").expect("journal mode"),
            "memory"
        );
        assert_eq!(storage.pragma_i64("foreign_keys").expect("foreign keys"), 1);
    }

    #[test]
    fn replaces_and_exports_workspace_snapshot() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let snapshot = sample_snapshot();

        storage
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");

        assert_eq!(
            storage.export_workspace_backup().expect("export snapshot"),
            snapshot
        );
    }

    #[test]
    fn workspace_backup_round_trips_page_properties() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.page_properties = vec![PagePropertyDefinition {
            id: "prop_tags".to_string(),
            key: "tags".to_string(),
            name: "标签".to_string(),
            property_type: "multiSelect".to_string(),
            config: json!({ "options": [] }),
            created_at: "2026-07-05T00:00:00.000Z".to_string(),
            updated_at: "2026-07-05T00:00:00.000Z".to_string(),
        }];
        snapshot.pages[0].properties = Some(json!({
            "prop_tags": ["产品", "搜索"]
        }));

        storage
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");

        let exported = storage.export_workspace_backup().expect("export snapshot");
        assert_eq!(exported.page_properties, snapshot.page_properties);
        assert_eq!(exported.pages[0].properties, snapshot.pages[0].properties);
    }

    #[test]
    fn workspace_backup_round_trips_hidden_page_properties_panel() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot_value =
            serde_json::to_value(sample_snapshot()).expect("serialize snapshot");
        snapshot_value["pages"][0]["showProperties"] = json!(false);
        let snapshot: WorkspaceSnapshot =
            serde_json::from_value(snapshot_value).expect("deserialize snapshot");

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let exported = serde_json::to_value(
            storage
                .export_workspace_backup()
                .expect("export workspace backup"),
        )
        .expect("serialize exported workspace");
        assert_eq!(
            exported.pointer("/pages/0/showProperties"),
            Some(&json!(false))
        );
    }

    #[test]
    fn workspace_archive_restores_media_and_rejects_page_packages() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "diagram.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"diagram bytes".to_vec(),
            })
            .expect("write source asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_diagram",
            "type": "image",
            "assetId": asset.id,
            "name": "diagram.png",
            "mimeType": "image/png"
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("seed source workspace");

        let archive = source
            .export_workspace_archive()
            .expect("export workspace archive");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target workspace");
        target
            .import_workspace_archive(archive)
            .expect("restore workspace archive");
        let imported = target.export_workspace_backup().expect("export restored workspace");
        let imported_asset_id = imported.pages[0]
            .blocks
            .iter()
            .find(|block| block.get("id").and_then(Value::as_str) == Some("block_diagram"))
            .and_then(|block| block.get("assetId").and_then(Value::as_str))
            .expect("restored image asset id");
        assert_eq!(
            target.read_asset(imported_asset_id).expect("read restored asset"),
            b"diagram bytes"
        );

        let before = target.export_workspace_backup().expect("snapshot before wrong route");
        let page_archive = source
            .export_page_package("page_1")
            .expect("export page package");
        let error = target
            .import_workspace_archive(page_archive)
            .expect_err("page package rejected by workspace restore");
        assert_eq!(error.code, "archive_wrong_kind");
        assert_eq!(target.export_workspace_backup().expect("snapshot after wrong route"), before);
    }

    #[test]
    fn auto_backup_writes_complete_archives_and_keeps_the_newest_fourteen() {
        let data_dir = unique_test_data_dir("auto-backup-archives");
        let storage = Storage::open(&data_dir).expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "diagram.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"diagram bytes".to_vec(),
            })
            .expect("write source asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_diagram",
            "type": "image",
            "assetId": asset.id,
            "name": "diagram.png",
            "mimeType": "image/png"
        }));
        storage
            .replace_workspace_backup(snapshot)
            .expect("seed workspace");

        for index in 0..15 {
            storage
                .create_auto_backup_at(
                    UNIX_EPOCH + Duration::from_secs(1_700_000_000 + index),
                    14,
                )
                .expect("backup succeeds");
        }

        let backups = storage.list_auto_backups().expect("backups list");
        assert_eq!(backups.len(), 14);
        assert!(backups
            .iter()
            .all(|backup| backup.file_name.ends_with(".zhiqi")));

        for backup in backups {
            let archive = std::fs::read(storage.auto_backup_dir.join(backup.file_name))
                .expect("read automatic backup archive");
            let target = Storage::open_in_memory_for_tests().expect("target opens");
            target
                .replace_workspace_backup(sample_snapshot())
                .expect("seed target workspace");
            target
                .import_workspace_archive(archive)
                .expect("restore automatic backup archive");
            let imported = target
                .export_workspace_backup()
                .expect("export restored workspace");
            let imported_asset_id = imported.pages[0]
                .blocks
                .iter()
                .find(|block| block.get("id").and_then(Value::as_str) == Some("block_diagram"))
                .and_then(|block| block.get("assetId").and_then(Value::as_str))
                .expect("restored image asset id");
            assert_eq!(
                target.read_asset(imported_asset_id).expect("read restored asset"),
                b"diagram bytes"
            );
        }

        drop(storage);
        std::fs::remove_dir_all(data_dir).expect("remove test data directory");
    }

    #[test]
    fn failed_auto_backup_keeps_previously_published_archives() {
        let data_dir = unique_test_data_dir("auto-backup-failure");
        let storage = Storage::open(&data_dir).expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "diagram.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"diagram bytes".to_vec(),
            })
            .expect("write source asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_diagram",
            "type": "image",
            "assetId": asset.id,
            "name": "diagram.png",
            "mimeType": "image/png"
        }));
        storage
            .replace_workspace_backup(snapshot)
            .expect("seed workspace");
        for index in 0..2 {
            storage
                .create_auto_backup_at(
                    UNIX_EPOCH + Duration::from_secs(1_700_000_000 + index),
                    2,
                )
                .expect("publish initial backup");
        }
        let previous = storage.list_auto_backups().expect("list published backups");

        std::fs::remove_file(
            assets::asset_file_path(&storage.connection, &storage.assets_dir, &asset.id)
                .expect("locate source asset"),
        )
        .expect("remove source asset to make archive export fail");
        assert!(storage
            .create_auto_backup_at(UNIX_EPOCH + Duration::from_secs(1_700_000_002), 1)
            .is_err());

        assert_eq!(storage.list_auto_backups().expect("list after failure"), previous);
        assert!(previous.iter().all(|backup| storage
            .auto_backup_dir
            .join(&backup.file_name)
            .is_file()));

        drop(storage);
        std::fs::remove_dir_all(data_dir).expect("remove test data directory");
    }

    #[test]
    fn failed_auto_backup_publish_keeps_previously_published_archives() {
        let data_dir = unique_test_data_dir("auto-backup-publish-failure");
        let mut storage = Storage::open(&data_dir).expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");
        for index in 0..2 {
            storage
                .create_auto_backup_at(
                    UNIX_EPOCH + Duration::from_secs(1_700_000_000 + index),
                    2,
                )
                .expect("publish initial backup");
        }
        let published_dir = storage.auto_backup_dir.clone();
        let previous = storage.list_auto_backups().expect("list published backups");
        let blocked_parent = data_dir.join("auto-backup-blocker");
        std::fs::write(&blocked_parent, b"not a directory").expect("write blocking file");
        storage.auto_backup_dir = blocked_parent.join("child");

        assert!(storage
            .create_auto_backup_at(UNIX_EPOCH + Duration::from_secs(1_700_000_002), 1)
            .is_err());
        assert!(previous
            .iter()
            .all(|backup| published_dir.join(&backup.file_name).is_file()));
        assert_eq!(
            std::fs::read_dir(&published_dir)
                .expect("read published backup directory")
                .count(),
            previous.len()
        );

        drop(storage);
        std::fs::remove_dir_all(data_dir).expect("remove test data directory");
    }

    #[test]
    fn auto_backup_cleanup_ignores_temporary_and_unmanaged_files() {
        let data_dir = unique_test_data_dir("auto-backup-cleanup");
        let storage = Storage::open(&data_dir).expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");
        storage
            .create_auto_backup_at(UNIX_EPOCH + Duration::from_secs(1_700_000_000), 2)
            .expect("publish initial backup");

        let temporary = storage.auto_backup_dir.join(".auto-writing.tmp");
        let unmanaged = storage.auto_backup_dir.join("manual-backup.zhiqi");
        std::fs::write(&temporary, b"unfinished").expect("write temporary file");
        std::fs::write(&unmanaged, b"manual backup").expect("write unmanaged backup");

        storage
            .create_auto_backup_at(UNIX_EPOCH + Duration::from_secs(1_700_000_001), 1)
            .expect("publish retained backup");

        assert_eq!(storage.list_auto_backups().expect("list retained backups").len(), 1);
        assert!(temporary.is_file());
        assert!(unmanaged.is_file());

        drop(storage);
        std::fs::remove_dir_all(data_dir).expect("remove test data directory");
    }

    #[test]
    fn loading_page_reads_one_page_content_and_tracks_refs() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("replace snapshot");

        let loaded = storage.load_page("page_1").expect("load page");

        assert_eq!(loaded.title, "Home");
        assert_eq!(loaded.blocks.len(), 4);
        assert_eq!(storage.block_ref_count().expect("block refs"), 3);
    }

    #[test]
    fn search_finds_page_body_resource_titles_and_data_table_records() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("replace snapshot");

        let body_results = storage
            .search_workspace("storage", 10)
            .expect("search body");
        assert!(body_results
            .iter()
            .any(|result| result.kind == "page" && result.page_id == "page_1"));

        let board_results = storage.search_workspace("board", 10).expect("search board");
        assert!(board_results
            .iter()
            .any(|result| result.kind == "whiteboard"
                && result.board_id.as_deref() == Some("board_1")));

        let record_results = storage
            .search_workspace("launch", 10)
            .expect("search record");
        assert!(record_results
            .iter()
            .any(|result| result.kind == "data_table_record"
                && result.record_id.as_deref() == Some("record_1")));
    }

    #[test]
    fn search_returns_property_hit_metadata_and_multiple_page_hits() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.page_properties = vec![PagePropertyDefinition {
            id: "prop_tags".to_string(),
            key: "tags".to_string(),
            name: "标签".to_string(),
            property_type: "multiSelect".to_string(),
            config: json!({ "options": [] }),
            created_at: "2026-07-05T00:00:00.000Z".to_string(),
            updated_at: "2026-07-05T00:00:00.000Z".to_string(),
        }];
        snapshot.pages[0].title = "Product Plan".to_string();
        snapshot.pages[0].properties = Some(json!({
            "prop_tags": ["product", "search"]
        }));
        snapshot.pages[0].blocks = vec![
            json!({ "id": "block_1", "type": "paragraph", "text": "product launch notes" }),
            json!({
                "id": "block_2",
                "type": "image",
                "name": "Capture001.png",
                "mimeType": "image/png",
                "caption": "",
                "alt": ""
            }),
        ];

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let results = storage.search_workspace("product", 20).expect("search");
        assert!(results
            .iter()
            .any(|result| result.match_source == "property" && result.source_label == "标签"));
        assert!(
            results
                .iter()
                .filter(|result| result.page_id == "page_1")
                .count()
                >= 2
        );
    }

    #[test]
    fn search_workspace_keeps_media_file_names_and_descriptions_in_excerpts() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages = vec![PageRecord {
            id: "page_media".to_string(),
            parent_id: None,
            title: "Media Library".to_string(),
            icon: None,
            cover: None,
            properties: Some(json!({})),
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![
                json!({
                    "id": "block_image",
                    "type": "image",
                    "name": "Capture001.png",
                    "mimeType": "image/png",
                    "caption": "首页截图",
                    "alt": "搜索弹窗"
                }),
                json!({
                    "id": "block_audio",
                    "type": "audio",
                    "name": "meeting.mp3",
                    "mimeType": "audio/mpeg",
                    "caption": "访谈录音"
                }),
            ],
            created_at: "2026-07-06T00:00:00.000Z".to_string(),
            updated_at: "2026-07-06T00:00:00.000Z".to_string(),
        }];

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let image_results = storage
            .search_workspace("首页截图", 10)
            .expect("search image");
        assert!(image_results.iter().any(|result| {
            result.page_id == "page_media"
                && result.block_id.as_deref() == Some("block_image")
                && result.match_source == "media"
                && result.excerpt == "Capture001.png / 首页截图 / 搜索弹窗"
        }));

        let audio_results = storage
            .search_workspace("访谈录音", 10)
            .expect("search audio");
        assert!(audio_results.iter().any(|result| {
            result.page_id == "page_media"
                && result.block_id.as_deref() == Some("block_audio")
                && result.match_source == "media"
                && result.excerpt == "meeting.mp3 / 访谈录音"
        }));
    }

    #[test]
    fn search_workspace_returns_relation_hits_with_block_ids() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let snapshot = WorkspaceSnapshot {
            boards: vec![],
            data_tables: vec![],
            mindmaps: vec![],
            synced_block_groups: vec![],
            page_properties: vec![],
            pages: vec![
                PageRecord {
                    id: "page_target".to_string(),
                    parent_id: None,
                    title: "Product Plan".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
                PageRecord {
                    id: "page_source".to_string(),
                    parent_id: None,
                    title: "Meeting Notes".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![json!({
                        "id": "block_relation",
                        "type": "paragraph",
                        "text": "See Product Plan",
                        "richText": [
                            { "text": "See " },
                            { "text": "Product Plan", "pageId": "page_target", "relationKind": "link" }
                        ]
                    })],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
            ],
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_source".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let results = storage
            .search_workspace("Product Plan", 20)
            .expect("search");
        assert!(results.iter().any(|result| {
            result.page_id == "page_source"
                && result.block_id.as_deref() == Some("block_relation")
                && result.match_source == "page_link"
        }));
    }

    #[test]
    fn search_workspace_expands_synced_and_reference_instances_per_page() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let snapshot = WorkspaceSnapshot {
            boards: vec![],
            data_tables: vec![],
            mindmaps: vec![],
            synced_block_groups: vec![SyncedBlockGroupRecord {
                id: "group_1".to_string(),
                blocks: vec![json!({
                    "id": "group_block_1",
                    "type": "paragraph",
                    "text": "Shared alpha note"
                })],
                primary_instance_id: "instance_sync".to_string(),
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            }],
            page_properties: vec![],
            pages: vec![
                PageRecord {
                    id: "page_sync".to_string(),
                    parent_id: None,
                    title: "Sync Page".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![json!({
                        "id": "container_sync",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_sync",
                        "mode": "sync"
                    })],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
                PageRecord {
                    id: "page_reference".to_string(),
                    parent_id: None,
                    title: "Reference Page".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![json!({
                        "id": "container_reference",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_reference",
                        "mode": "reference"
                    })],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
            ],
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_sync".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let results = storage
            .search_workspace("Shared alpha note", 20)
            .expect("search");

        assert!(results.iter().any(|result| {
            result.page_id == "page_sync"
                && result.block_id.as_deref() == Some("container_sync")
                && result.match_source == "synced_block"
                && result.source_label == "同步块内容"
        }));
        assert!(results.iter().any(|result| {
            result.page_id == "page_reference"
                && result.block_id.as_deref() == Some("container_reference")
                && result.match_source == "reference_block"
                && result.source_label == "引用块内容"
        }));
    }

    #[test]
    fn search_workspace_keeps_multiple_synced_hits_on_same_page() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let snapshot = WorkspaceSnapshot {
            boards: vec![],
            data_tables: vec![],
            mindmaps: vec![],
            synced_block_groups: vec![SyncedBlockGroupRecord {
                id: "group_1".to_string(),
                blocks: vec![json!({
                    "id": "group_block_1",
                    "type": "paragraph",
                    "text": "Shared alpha note"
                })],
                primary_instance_id: "instance_sync".to_string(),
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            }],
            page_properties: vec![],
            pages: vec![PageRecord {
                id: "page_multi".to_string(),
                parent_id: None,
                title: "Multi Instance Page".to_string(),
                icon: None,
                cover: None,
                properties: Some(json!({})),
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![
                    json!({
                        "id": "container_sync",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_sync",
                        "mode": "sync"
                    }),
                    json!({
                        "id": "container_reference",
                        "type": "synced_block",
                        "groupId": "group_1",
                        "instanceId": "instance_reference",
                        "mode": "reference"
                    }),
                ],
                created_at: "2026-07-06T00:00:00.000Z".to_string(),
                updated_at: "2026-07-06T00:00:00.000Z".to_string(),
            }],
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_multi".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let results = storage
            .search_workspace("Shared alpha note", 20)
            .expect("search");
        let instance_hits = results
            .iter()
            .filter(|result| {
                result.page_id == "page_multi"
                    && matches!(
                        result.block_id.as_deref(),
                        Some("container_sync") | Some("container_reference")
                    )
            })
            .count();

        assert_eq!(instance_hits, 2);
    }

    #[test]
    fn deleting_page_search_documents_does_not_touch_prefix_collisions() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages = vec![
            PageRecord {
                id: "page_1".to_string(),
                parent_id: None,
                title: "Alpha".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![json!({
                    "id": "block_alpha",
                    "type": "paragraph",
                    "text": "alpha body"
                })],
                created_at: "2026-07-05T00:00:00.000Z".to_string(),
                updated_at: "2026-07-05T00:00:00.000Z".to_string(),
            },
            PageRecord {
                id: "page_10".to_string(),
                parent_id: None,
                title: "Beta".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![json!({
                    "id": "block_beta",
                    "type": "paragraph",
                    "text": "beta body"
                })],
                created_at: "2026-07-05T00:00:00.000Z".to_string(),
                updated_at: "2026-07-05T00:00:00.000Z".to_string(),
            },
        ];
        snapshot.boards = Vec::new();
        snapshot.data_tables = Vec::new();
        snapshot.mindmaps = Vec::new();
        snapshot.settings.last_opened_page_id = Some("page_1".to_string());

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        search::delete_documents_for_owner(&storage.connection, "page", "page_1")
            .expect("delete page_1 docs");

        let page_1_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_search_documents WHERE document_id LIKE 'page:page_1:%'",
                [],
                |row| row.get(0),
            )
            .expect("count page_1 docs");
        let page_10_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_search_documents WHERE document_id LIKE 'page:page_10:%'",
                [],
                |row| row.get(0),
            )
            .expect("count page_10 docs");

        assert_eq!(page_1_count, 0);
        assert!(page_10_count > 0);
        assert!(storage
            .search_workspace("beta", 10)
            .expect("search surviving page")
            .iter()
            .any(|result| result.page_id == "page_10"));
    }

    #[test]
    fn malformed_properties_json_fails_on_export_instead_of_disappearing() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("replace snapshot");
        storage
            .connection
            .execute(
                "UPDATE zhiqi_page_contents SET properties_json = 'not-json' WHERE page_id = 'page_1'",
                [],
            )
            .expect("corrupt properties json");

        let error = storage
            .export_workspace_backup()
            .expect_err("invalid properties json should fail");

        assert_eq!(error.code, "invalid_payload");
    }

    #[test]
    fn opening_v1_database_migrates_columns_and_rebuilds_search_documents() {
        let data_dir = unique_test_data_dir("v1-open");
        fs::create_dir_all(&data_dir).expect("create test data dir");
        let database_path = data_dir.join(DATABASE_FILE_NAME);
        let connection = Connection::open(&database_path).expect("open v1 database");
        connection
            .execute_batch(
                "
                CREATE TABLE zhiqi_meta (
                  key TEXT PRIMARY KEY NOT NULL,
                  value TEXT NOT NULL
                );
                CREATE TABLE zhiqi_settings (
                  id TEXT PRIMARY KEY NOT NULL,
                  record_json TEXT NOT NULL
                );
                CREATE TABLE zhiqi_pages (
                  id TEXT PRIMARY KEY NOT NULL,
                  parent_id TEXT,
                  title TEXT NOT NULL,
                  icon TEXT,
                  cover TEXT,
                  is_full_width INTEGER,
                  is_small_text INTEGER,
                  font_family TEXT,
                  show_outline INTEGER,
                  position INTEGER NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE zhiqi_page_contents (
                  page_id TEXT PRIMARY KEY NOT NULL,
                  blocks_json TEXT NOT NULL
                );
                CREATE TABLE zhiqi_search_documents (
                  document_id TEXT PRIMARY KEY NOT NULL,
                  kind TEXT NOT NULL,
                  page_id TEXT NOT NULL,
                  board_id TEXT,
                  database_id TEXT,
                  record_id TEXT,
                  title TEXT NOT NULL,
                  icon TEXT,
                  excerpt TEXT NOT NULL,
                  body TEXT NOT NULL
                );
                CREATE VIRTUAL TABLE zhiqi_search_documents_fts USING fts5(
                  document_id UNINDEXED,
                  kind UNINDEXED,
                  page_id UNINDEXED,
                  board_id UNINDEXED,
                  database_id UNINDEXED,
                  record_id UNINDEXED,
                  title,
                  icon UNINDEXED,
                  excerpt UNINDEXED,
                  body
                );
                ",
            )
            .expect("create v1 schema");
        connection
            .execute(
                "INSERT INTO zhiqi_meta (key, value) VALUES ('schema_version', '1')",
                [],
            )
            .expect("insert schema version");
        connection
            .execute(
                "INSERT INTO zhiqi_settings (id, record_json) VALUES (?1, ?2)",
                params![SETTINGS_ID, r#"{"lastOpenedPageId":"page_1"}"#],
            )
            .expect("insert settings");
        connection
            .execute(
                "INSERT INTO zhiqi_pages
                  (id, parent_id, title, icon, cover, is_full_width, is_small_text, font_family, show_outline, position, created_at, updated_at)
                  VALUES (?1, NULL, ?2, NULL, NULL, NULL, NULL, NULL, NULL, 0, ?3, ?3)",
                params!["page_1", "Legacy Home", "2026-07-05T00:00:00.000Z"],
            )
            .expect("insert page");
        connection
            .execute(
                "INSERT INTO zhiqi_page_contents (page_id, blocks_json) VALUES (?1, ?2)",
                params![
                    "page_1",
                    r#"[{"id":"block_1","type":"paragraph","text":"legacy body"}]"#
                ],
            )
            .expect("insert page content");
        connection
            .execute(
                "INSERT INTO zhiqi_search_documents
                  (document_id, kind, page_id, board_id, database_id, record_id, title, icon, excerpt, body)
                  VALUES (?1, 'page', 'page_1', NULL, NULL, NULL, 'Legacy Home', NULL, 'legacy body', 'legacy body')",
                ["page:page_1"],
            )
            .expect("insert legacy search document");
        connection
            .execute(
                "INSERT INTO zhiqi_search_documents_fts
                  (document_id, kind, page_id, board_id, database_id, record_id, title, icon, excerpt, body)
                  VALUES (?1, 'page', 'page_1', NULL, NULL, NULL, 'Legacy Home', NULL, 'legacy body', 'legacy body')",
                ["page:page_1"],
            )
            .expect("insert legacy fts document");
        drop(connection);

        let storage = Storage::open(&data_dir).expect("open migrated storage");

        assert_eq!(
            storage.schema_version().expect("schema version"),
            schema::SCHEMA_VERSION
        );
        let page_content_columns = storage
            .connection
            .prepare("PRAGMA table_info(zhiqi_page_contents)")
            .expect("prepare page content pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query page content pragma")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect page content columns");
        let page_columns = storage
            .connection
            .prepare("PRAGMA table_info(zhiqi_pages)")
            .expect("prepare page pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query page pragma")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect page columns");
        let search_document_columns = storage
            .connection
            .prepare("PRAGMA table_info(zhiqi_search_documents)")
            .expect("prepare search document pragma")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query search document pragma")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect search document columns");
        let search_results = storage
            .search_workspace("legacy", 10)
            .expect("search migrated database");
        let rebuilt_page_docs: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_search_documents WHERE document_id LIKE 'page:page_1:%'",
                [],
                |row| row.get(0),
            )
            .expect("count rebuilt page docs");
        let legacy_docs: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_search_documents WHERE document_id = 'page:page_1'",
                [],
                |row| row.get(0),
            )
            .expect("count legacy docs");

        assert!(page_content_columns
            .iter()
            .any(|name| name == "properties_json"));
        assert!(page_columns
            .iter()
            .any(|name| name == "show_properties"));
        assert!(search_document_columns
            .iter()
            .any(|name| name == "match_source"));
        assert!(search_document_columns
            .iter()
            .any(|name| name == "source_label"));
        assert!(rebuilt_page_docs >= 2);
        assert_eq!(legacy_docs, 0);
        assert!(search_results
            .iter()
            .any(|result| result.page_id == "page_1" && !result.match_source.is_empty()));
    }

    #[test]
    fn search_clamps_untrusted_limits() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let mut snapshot = sample_snapshot();
        snapshot.boards = Vec::new();
        snapshot.data_tables = Vec::new();
        snapshot.mindmaps = Vec::new();
        snapshot.pages = (0..120)
            .map(|index| PageRecord {
                id: format!("page_{index}"),
                parent_id: None,
                title: format!("Page {index}"),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![json!({
                    "id": format!("block_{index}"),
                    "type": "paragraph",
                    "text": "commonneedle"
                })],
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            })
            .collect();
        snapshot.settings.last_opened_page_id = Some("page_0".to_string());

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let results = storage
            .search_workspace("commonneedle", usize::MAX)
            .expect("search");

        assert_eq!(results.len(), 100);
    }

    #[test]
    fn asset_store_deduplicates_and_reads_bytes() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let first = storage
            .write_asset(WriteAssetInput {
                name: "hello.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"hello".to_vec(),
            })
            .expect("write first asset");
        let second = storage
            .write_asset(WriteAssetInput {
                name: "copy.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"hello".to_vec(),
            })
            .expect("write second asset");

        assert_eq!(first.id, second.id);
        assert_eq!(storage.read_asset(&first.id).expect("read asset"), b"hello");
    }

    #[test]
    fn tracked_asset_write_reports_new_asset_as_created() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");

        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "new.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"new asset".to_vec(),
            })
            .expect("write tracked asset");

        assert!(written.created);
        assert_eq!(
            storage.read_asset(&written.meta.id).expect("read asset"),
            b"new asset"
        );
    }

    #[test]
    fn tracked_asset_write_reports_deduplicated_asset_as_existing() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let first = storage
            .write_asset_tracked(WriteAssetInput {
                name: "first.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"same bytes".to_vec(),
            })
            .expect("write first asset");

        let second = storage
            .write_asset_tracked(WriteAssetInput {
                name: "second.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"same bytes".to_vec(),
            })
            .expect("write duplicate asset");

        assert!(first.created);
        assert!(!second.created);
        assert_eq!(second.meta.id, first.meta.id);
    }

    #[test]
    fn asset_writes_reject_active_transaction_without_changes() {
        use sha2::Digest;

        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let first_bytes = b"active transaction write".to_vec();
        let second_bytes = b"active transaction tracked write".to_vec();
        let first_sha = hex::encode(sha2::Sha256::digest(&first_bytes));
        let second_sha = hex::encode(sha2::Sha256::digest(&second_bytes));
        let first_path = storage
            .assets_dir
            .join(&first_sha[..2])
            .join(format!("{first_sha}.txt"));
        let second_path = storage
            .assets_dir
            .join(&second_sha[..2])
            .join(format!("{second_sha}.txt"));
        storage
            .connection
            .execute("BEGIN IMMEDIATE", [])
            .expect("begin outer transaction");

        let first_error = storage
            .write_asset(WriteAssetInput {
                name: "first.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: first_bytes,
            })
            .expect_err("plain asset write rejects active transaction");
        let second_error = storage
            .write_asset_tracked(WriteAssetInput {
                name: "second.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: second_bytes,
            })
            .expect_err("tracked asset write rejects active transaction");

        assert_eq!(first_error.code, "conflict");
        assert_eq!(second_error.code, "conflict");
        assert!(!storage.connection.is_autocommit());
        assert_eq!(
            storage
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count asset rows"),
            0
        );
        assert!(!first_path.exists());
        assert!(!second_path.exists());
        storage
            .connection
            .execute("ROLLBACK", [])
            .expect("rollback outer transaction");
    }

    #[test]
    fn remove_asset_rejects_active_transaction_without_changes() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "keep.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"keep during outer transaction".to_vec(),
            })
            .expect("write asset");
        let asset_path = storage.assets_dir.join(&written.meta.relative_path);
        storage
            .connection
            .execute("BEGIN IMMEDIATE", [])
            .expect("begin outer transaction");

        let error = storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect_err("asset removal rejects active transaction");

        assert_eq!(error.code, "conflict");
        assert!(!storage.connection.is_autocommit());
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&written.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count asset rows"),
            1
        );
        assert_eq!(
            std::fs::read(&asset_path).expect("asset file remains"),
            b"keep during outer transaction"
        );
        storage
            .connection
            .execute("ROLLBACK", [])
            .expect("rollback outer transaction");
    }

    #[test]
    fn cleanup_orphan_assets_rejects_active_transaction_without_changes() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "orphan.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"orphan protected by transaction boundary".to_vec(),
            })
            .expect("write orphan asset");
        let final_path = storage.assets_dir.join(&written.meta.relative_path);
        storage
            .connection
            .execute("BEGIN IMMEDIATE", [])
            .expect("begin outer transaction");

        let error = storage
            .cleanup_orphan_assets()
            .expect_err("orphan cleanup rejects active transaction");

        assert_eq!(error.code, "conflict");
        assert!(!storage.connection.is_autocommit());
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&written.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count orphan asset row"),
            1
        );
        assert_eq!(
            std::fs::read(final_path).expect("orphan final remains"),
            b"orphan protected by transaction boundary"
        );
        storage
            .connection
            .execute("ROLLBACK", [])
            .expect("rollback outer transaction");
    }

    #[test]
    fn tracked_asset_writes_are_serialized_across_connections() {
        let data_dir = unique_test_data_dir("tracked-asset-concurrency");
        let first_storage = Storage::open(&data_dir).expect("first storage opens");
        let second_storage = Storage::open(&data_dir).expect("second storage opens");
        let barrier = Arc::new(std::sync::Barrier::new(3));
        let bytes = Arc::new(vec![0x5a; 32 * 1024 * 1024]);

        let first_barrier = barrier.clone();
        let first_bytes = bytes.clone();
        let first_thread = std::thread::spawn(move || {
            first_barrier.wait();
            first_storage.write_asset_tracked(WriteAssetInput {
                name: "first.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                bytes: first_bytes.as_ref().clone(),
            })
        });
        let second_barrier = barrier.clone();
        let second_bytes = bytes.clone();
        let second_thread = std::thread::spawn(move || {
            second_barrier.wait();
            second_storage.write_asset_tracked(WriteAssetInput {
                name: "second.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                bytes: second_bytes.as_ref().clone(),
            })
        });

        barrier.wait();
        let first = first_thread
            .join()
            .expect("first thread joins")
            .expect("first write succeeds");
        let second = second_thread
            .join()
            .expect("second thread joins")
            .expect("second write succeeds");

        assert_eq!(usize::from(first.created) + usize::from(second.created), 1);
        assert_eq!(first.meta.id, second.meta.id);
        let verifier = Storage::open(&data_dir).expect("verifier opens");
        assert_eq!(
            verifier
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count asset rows"),
            1
        );
        assert_eq!(
            verifier.read_asset(&first.meta.id).expect("read asset"),
            bytes.as_ref().as_slice()
        );
        drop(verifier);
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[test]
    fn failed_competing_asset_write_keeps_file_published_by_other_connection() {
        let assets_dir =
            unique_test_data_dir("tracked-asset-failed-competition").join(ASSETS_DIR_NAME);
        let auto_backup_dir = assets_dir
            .parent()
            .expect("test assets directory has parent")
            .join(auto_backup::AUTO_BACKUP_DIR_NAME);
        let first_connection = Connection::open_in_memory().expect("first connection opens");
        schema::initialize_schema(&first_connection).expect("first schema initializes");
        let second_connection = Connection::open_in_memory().expect("second connection opens");
        schema::initialize_schema(&second_connection).expect("second schema initializes");
        second_connection
            .execute_batch(
                "CREATE TRIGGER fail_asset_insert
                 BEFORE INSERT ON zhiqi_assets
                 BEGIN
                   SELECT RAISE(FAIL, 'forced competing insert failure');
                 END;",
            )
            .expect("install failure trigger");

        let first_storage = Storage {
            connection: first_connection,
            assets_dir: assets_dir.clone(),
            auto_backup_dir: auto_backup_dir.clone(),
        };
        let second_storage = Storage {
            connection: second_connection,
            assets_dir: assets_dir.clone(),
            auto_backup_dir,
        };
        let start = Arc::new(std::sync::Barrier::new(3));
        let (published_tx, published_rx) = std::sync::mpsc::channel();
        let bytes = b"shared competing asset".to_vec();

        let first_start = start.clone();
        let first_bytes = bytes.clone();
        let first_thread = std::thread::spawn(move || {
            first_start.wait();
            let written = first_storage.write_asset_tracked(WriteAssetInput {
                name: "winner.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: first_bytes,
            });
            published_tx.send(()).expect("signal published asset");
            (first_storage, written)
        });
        let second_start = start.clone();
        let second_thread = std::thread::spawn(move || {
            second_start.wait();
            published_rx.recv().expect("wait for published asset");
            let written = second_storage.write_asset_tracked(WriteAssetInput {
                name: "loser.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes,
            });
            (second_storage, written)
        });

        start.wait();
        let (first_storage, first) = first_thread.join().expect("first thread joins");
        let first = first.expect("first write succeeds");
        let (second_storage, second) = second_thread.join().expect("second thread joins");
        let error = second.expect_err("competing database insert fails");

        assert!(first.created);
        assert_eq!(error.code, "database_error");
        assert_eq!(
            first_storage
                .read_asset(&first.meta.id)
                .expect("published asset remains readable"),
            b"shared competing asset"
        );
        assert_eq!(
            second_storage
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count failed connection rows"),
            0
        );
        drop(first_storage);
        drop(second_storage);
        let _ = std::fs::remove_dir_all(
            assets_dir
                .parent()
                .expect("test assets directory has parent"),
        );
    }

    #[test]
    fn tracked_asset_write_never_replaces_existing_regular_final_file() {
        use sha2::Digest;

        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let bytes = b"expected content-addressed bytes".to_vec();
        let sha256 = hex::encode(sha2::Sha256::digest(&bytes));
        let final_path = storage
            .assets_dir
            .join(&sha256[..2])
            .join(format!("{sha256}.txt"));
        std::fs::create_dir_all(final_path.parent().expect("final path has parent"))
            .expect("create final parent");
        std::fs::write(&final_path, b"pre-existing sentinel").expect("write existing final");

        let error = storage
            .write_asset_tracked(WriteAssetInput {
                name: "asset.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes,
            })
            .expect_err("existing final file is never replaced");
        let final_file_name = final_path
            .file_name()
            .expect("final path has file name")
            .to_string_lossy();

        assert_eq!(error.code, "conflict");
        assert!(
            error.message.contains(final_file_name.as_ref()),
            "error did not include final path: {error:?}"
        );
        assert_eq!(
            std::fs::read(&final_path).expect("read existing final"),
            b"pre-existing sentinel"
        );
        assert_eq!(
            storage
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count asset rows"),
            0
        );
    }

    #[test]
    fn independent_databases_sharing_assets_dir_do_not_replace_winner_file() {
        let assets_dir =
            unique_test_data_dir("tracked-asset-independent-databases").join(ASSETS_DIR_NAME);
        let auto_backup_dir = assets_dir
            .parent()
            .expect("test assets directory has parent")
            .join(auto_backup::AUTO_BACKUP_DIR_NAME);
        let winner_connection = Connection::open_in_memory().expect("winner connection opens");
        schema::initialize_schema(&winner_connection).expect("winner schema initializes");
        let loser_connection = Connection::open_in_memory().expect("loser connection opens");
        schema::initialize_schema(&loser_connection).expect("loser schema initializes");
        let winner = Storage {
            connection: winner_connection,
            assets_dir: assets_dir.clone(),
            auto_backup_dir: auto_backup_dir.clone(),
        };
        let loser = Storage {
            connection: loser_connection,
            assets_dir: assets_dir.clone(),
            auto_backup_dir,
        };
        let bytes = b"shared independent database asset".to_vec();

        let written = winner
            .write_asset_tracked(WriteAssetInput {
                name: "winner.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                bytes: bytes.clone(),
            })
            .expect("winner writes asset");
        let error = loser
            .write_asset_tracked(WriteAssetInput {
                name: "loser.bin".to_string(),
                mime_type: "application/octet-stream".to_string(),
                bytes: bytes.clone(),
            })
            .expect_err("loser cannot replace winner final");

        assert_eq!(error.code, "conflict");
        assert_eq!(
            winner
                .read_asset(&written.meta.id)
                .expect("winner asset reads"),
            bytes
        );
        assert_eq!(
            loser
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count loser rows"),
            0
        );
    }

    #[test]
    fn tracked_asset_write_explicitly_rolls_back_deferred_commit_failure() {
        use sha2::Digest;

        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER force_asset_commit_failure
                 AFTER INSERT ON zhiqi_assets
                 BEGIN
                   INSERT INTO zhiqi_asset_refs (asset_id, owner_kind, owner_id)
                   VALUES ('asset_missing', 'test', 'commit_failure');
                 END;
                 PRAGMA defer_foreign_keys = ON;",
            )
            .expect("install deferred commit failure");
        let bytes = b"deferred commit failure".to_vec();
        let sha256 = hex::encode(sha2::Sha256::digest(&bytes));
        let final_path = storage
            .assets_dir
            .join(&sha256[..2])
            .join(format!("{sha256}.txt"));

        let error = storage
            .write_asset_tracked(WriteAssetInput {
                name: "deferred.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes,
            })
            .expect_err("deferred foreign key fails commit");

        assert_eq!(error.code, "database_error");
        assert!(error.message.contains("failed to commit asset write"));
        assert!(storage.connection.is_autocommit());
        assert_eq!(
            storage
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count asset rows"),
            0
        );
        assert!(!final_path.exists());
    }

    #[test]
    fn rollback_tracked_asset_ignores_deduplicated_asset() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let first = storage
            .write_asset_tracked(WriteAssetInput {
                name: "first.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"shared asset".to_vec(),
            })
            .expect("write first asset");
        let duplicate = storage
            .write_asset_tracked(WriteAssetInput {
                name: "duplicate.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"shared asset".to_vec(),
            })
            .expect("write duplicate asset");
        let asset_path = storage.assets_dir.join(&first.meta.relative_path);

        assert!(!duplicate.created);
        assert!(!storage
            .rollback_tracked_asset(&duplicate)
            .expect("deduplicated asset is not rolled back"));
        assert!(asset_path.exists());
        assert_eq!(
            storage.read_asset(&first.meta.id).expect("read asset"),
            b"shared asset"
        );
    }

    #[test]
    fn rollback_tracked_asset_keeps_recreated_generation() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let bytes = b"recreated asset generation".to_vec();
        let original = storage
            .write_asset_tracked(WriteAssetInput {
                name: "original.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: bytes.clone(),
            })
            .expect("write original generation");
        let original_path = storage.assets_dir.join(&original.meta.relative_path);

        assert!(original.created);
        assert!(storage
            .remove_asset_if_unreferenced(&original.meta.id)
            .expect("remove original generation"));
        assert!(!original_path.exists());

        let recreated = storage
            .write_asset_tracked(WriteAssetInput {
                name: "recreated.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: bytes.clone(),
            })
            .expect("write recreated generation");
        let recreated_path = storage.assets_dir.join(&recreated.meta.relative_path);

        assert!(recreated.created);
        assert_ne!(recreated.meta.id, original.meta.id);
        assert_eq!(recreated.meta.relative_path, original.meta.relative_path);
        assert!(!storage
            .rollback_tracked_asset(&original)
            .expect("stale rollback ignores recreated generation"));
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&recreated.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count recreated generation row"),
            1
        );
        assert!(recreated_path.exists());
        assert_eq!(
            std::fs::read(&recreated_path).expect("read recreated generation file"),
            bytes
        );
        assert_eq!(
            storage
                .read_asset(&recreated.meta.id)
                .expect("read recreated generation through storage"),
            b"recreated asset generation"
        );
    }

    #[test]
    fn remove_asset_if_unreferenced_removes_file_and_row() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "temporary.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"temporary asset".to_vec(),
            })
            .expect("write tracked asset");
        let asset_path = storage.assets_dir.join(&written.meta.relative_path);

        assert!(storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect("remove unreferenced asset"));
        assert!(!asset_path.exists());
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&written.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count asset rows"),
            0
        );
        assert!(!storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect("missing asset is not removed again"));
    }

    #[test]
    fn remove_asset_if_unreferenced_keeps_referenced_asset() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "referenced.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"referenced asset".to_vec(),
            })
            .expect("write tracked asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_referenced_asset",
            "type": "image",
            "assetId": written.meta.id,
            "name": "referenced.png",
            "mimeType": "image/png"
        }));
        storage
            .replace_workspace_backup(snapshot)
            .expect("save asset reference");
        let asset_path = storage.assets_dir.join(&written.meta.relative_path);

        assert!(!storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect("referenced asset is retained"));
        assert!(asset_path.exists());
        assert_eq!(
            storage.read_asset(&written.meta.id).expect("read asset"),
            b"referenced asset"
        );
    }

    #[test]
    fn remove_asset_if_unreferenced_keeps_row_when_file_removal_fails() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "cannot-remove.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"cannot remove".to_vec(),
            })
            .expect("write tracked asset");
        let asset_path = storage.assets_dir.join(&written.meta.relative_path);
        std::fs::remove_file(&asset_path).expect("replace asset file");
        std::fs::create_dir(&asset_path).expect("create directory at asset path");

        let error = storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect_err("directory cannot be removed as a file");

        assert_eq!(error.code, "io_error");
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&written.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count asset rows"),
            1
        );
        std::fs::remove_dir(asset_path).expect("remove test directory");
    }

    #[test]
    fn remove_asset_restores_row_and_file_when_commit_fails() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let written = storage
            .write_asset_tracked(WriteAssetInput {
                name: "guarded.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes: b"guarded asset".to_vec(),
            })
            .expect("write tracked asset");
        let final_path = storage.assets_dir.join(&written.meta.relative_path);
        storage
            .connection
            .execute_batch(
                "CREATE TABLE test_asset_guards (
                   asset_id TEXT NOT NULL
                     REFERENCES zhiqi_assets(id)
                     DEFERRABLE INITIALLY DEFERRED
                 );",
            )
            .expect("create deferred asset guard");
        storage
            .connection
            .execute(
                "INSERT INTO test_asset_guards (asset_id) VALUES (?1)",
                [&written.meta.id],
            )
            .expect("insert deferred asset guard");

        let error = storage
            .remove_asset_if_unreferenced(&written.meta.id)
            .expect_err("deferred foreign key fails removal commit");

        assert_eq!(error.code, "database_error");
        assert!(storage.connection.is_autocommit());
        assert_eq!(
            storage
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE id = ?1",
                    [&written.meta.id],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count restored asset row"),
            1
        );
        assert_eq!(
            std::fs::read(final_path).expect("restored final reads"),
            b"guarded asset"
        );
    }

    #[test]
    fn tracked_asset_write_removes_file_when_database_insert_fails() {
        use sha2::Digest;

        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER fail_asset_insert
                 BEFORE INSERT ON zhiqi_assets
                 BEGIN
                   SELECT RAISE(FAIL, 'forced asset insert failure');
                 END;",
            )
            .expect("install failure trigger");
        let bytes = b"failed insert asset".to_vec();
        let sha256 = hex::encode(sha2::Sha256::digest(&bytes));
        let asset_path = storage
            .assets_dir
            .join(&sha256[..2])
            .join(format!("{sha256}.txt"));

        let error = storage
            .write_asset_tracked(WriteAssetInput {
                name: "failed.txt".to_string(),
                mime_type: "text/plain".to_string(),
                bytes,
            })
            .expect_err("database insert fails");

        assert_eq!(error.code, "database_error");
        assert!(!asset_path.exists());
        assert_eq!(
            storage
                .connection
                .query_row("SELECT COUNT(*) FROM zhiqi_assets", [], |row| {
                    row.get::<_, i64>(0)
                })
                .expect("count asset rows"),
            0
        );
    }

    #[test]
    fn data_table_assets_are_tracked_as_references() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"image".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.data_tables[0].snapshot["assets"] = json!({
            asset.id.clone(): {
                "id": asset.id,
                "name": "image.png"
            }
        });

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let ref_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_asset_refs
                  WHERE asset_id = ?1 AND owner_kind = 'data_table' AND owner_id = 'database_1'",
                [&asset.id],
                |row| row.get(0),
            )
            .expect("asset ref count");

        assert_eq!(ref_count, 1);
        assert_eq!(storage.cleanup_orphan_assets().expect("cleanup"), 0);
        assert_eq!(storage.read_asset(&asset.id).expect("read asset"), b"image");
    }

    #[test]
    fn page_media_assets_are_tracked_as_references() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "clip.mp4".to_string(),
                mime_type: "video/mp4".to_string(),
                bytes: b"video".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_media",
            "type": "video",
            "assetId": asset.id,
            "name": "clip.mp4",
            "mimeType": "video/mp4",
            "caption": "Demo"
        }));

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let ref_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_asset_refs
                  WHERE asset_id = ?1 AND owner_kind = 'page' AND owner_id = 'page_1'",
                [&asset.id],
                |row| row.get(0),
            )
            .expect("asset ref count");

        assert_eq!(ref_count, 1);
        assert_eq!(storage.cleanup_orphan_assets().expect("cleanup"), 0);
    }

    #[test]
    fn file_block_asset_reference_is_preserved() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let asset = storage
            .write_asset(WriteAssetInput {
                name: "brief.pdf".to_string(),
                mime_type: "application/pdf".to_string(),
                bytes: b"pdf".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_file",
            "type": "file",
            "assetId": asset.id,
            "name": "brief.pdf",
            "mimeType": "application/pdf",
            "caption": ""
        }));

        storage
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        assert_eq!(storage.cleanup_orphan_assets().expect("cleanup"), 0);
    }

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
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
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
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
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
        let manifest = read_exported_page_package_manifest(archive.clone());
        let mut archive = zip::ZipArchive::new(Cursor::new(archive)).expect("read archive");

        assert_eq!(manifest.kind, PAGE_PACKAGE_KIND);
        assert_eq!(manifest.version, PAGE_PACKAGE_VERSION);
        assert_eq!(manifest.root_page_id, "page_1");
        assert_eq!(
            manifest
                .pages
                .iter()
                .map(|page| page.id.as_str())
                .collect::<Vec<_>>(),
            vec!["page_1", "page_child"]
        );
        assert!(manifest
            .pages
            .iter()
            .all(|page| page.id != "page_unrelated"));
        assert_eq!(
            manifest
                .assets
                .iter()
                .map(|asset| asset.id.as_str())
                .collect::<Vec<_>>(),
            vec![asset.id.as_str()]
        );
        archive
            .by_name(&format!("assets/{}", asset.relative_path))
            .expect("asset entry exists");
    }

    #[test]
    fn page_package_export_normalizes_nested_root_parent() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages.push(PageRecord {
            id: "page_nested".to_string(),
            parent_id: Some("page_1".to_string()),
            title: "Nested".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        snapshot.pages.push(PageRecord {
            id: "page_nested_child".to_string(),
            parent_id: Some("page_nested".to_string()),
            title: "Nested Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let archive = source
            .export_page_package("page_nested")
            .expect("export nested package");
        let manifest = read_exported_page_package_manifest(archive);
        let root = manifest
            .pages
            .iter()
            .find(|page| page.id == "page_nested")
            .expect("nested root in manifest");
        let child = manifest
            .pages
            .iter()
            .find(|page| page.id == "page_nested_child")
            .expect("nested child in manifest");

        assert_eq!(root.parent_id, None);
        assert_eq!(child.parent_id.as_deref(), Some("page_nested"));
    }

    #[test]
    fn page_package_fails_when_page_media_asset_is_missing() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_missing_image",
            "type": "image",
            "assetId": "asset_missing",
            "name": "missing.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "missing"
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let error = source
            .export_page_package("page_1")
            .expect_err("missing asset should fail export");

        assert_eq!(error.code, "not_found");
        assert_eq!(error.message, "asset not found: asset_missing");
    }

    #[test]
    fn page_package_fails_when_referenced_resource_is_missing() {
        let cases: Vec<(&str, Box<dyn Fn(&mut WorkspaceSnapshot)>, &str)> = vec![
            (
                "board",
                Box::new(|snapshot| snapshot.boards.clear()),
                "board not found: board_1",
            ),
            (
                "data table",
                Box::new(|snapshot| snapshot.data_tables.clear()),
                "data table not found: database_1",
            ),
            (
                "mindmap",
                Box::new(|snapshot| snapshot.mindmaps.clear()),
                "mindmap not found: mindmap_1",
            ),
        ];

        for (label, remove_resource, expected_message) in cases {
            let source = Storage::open_in_memory_for_tests().expect("source opens");
            let mut snapshot = sample_snapshot();
            remove_resource(&mut snapshot);
            source
                .replace_workspace_backup(snapshot)
                .expect("replace snapshot");

            let error = match source.export_page_package("page_1") {
                Ok(_) => panic!("missing {label} should fail export"),
                Err(error) => error,
            };

            assert_eq!(error.code, "not_found");
            assert_eq!(error.message, expected_message);
        }
    }

    #[test]
    fn page_package_exports_referenced_resources_and_data_table_assets() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "table-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"table image".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_inline_database",
            "type": "data_table_inline",
            "databaseId": "database_inline"
        }));
        snapshot.data_tables[0].snapshot["assets"] = json!({
            asset.id.clone(): {
                "id": asset.id,
                "name": "table-image.png",
                "mimeType": "image/png"
            }
        });
        snapshot.data_tables.push(DataTableRecord {
            id: "database_inline".to_string(),
            title: "Inline Projects".to_string(),
            icon: None,
            cover: None,
            snapshot: json!({
                "version": 1,
                "database": {
                    "id": "database_inline",
                    "name": "Inline Projects",
                    "propertyOrder": [],
                    "activeViewId": "view_inline",
                    "viewOrder": ["view_inline"],
                    "views": {},
                    "createdAt": "2026-07-02T00:00:00.000Z",
                    "updatedAt": "2026-07-02T00:00:00.000Z"
                },
                "properties": {},
                "records": {},
                "recordPages": {},
                "blocks": {},
                "assets": {}
            }),
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let archive = source
            .export_page_package("page_1")
            .expect("export page package");
        let manifest = read_exported_page_package_manifest(archive.clone());
        let mut archive = zip::ZipArchive::new(Cursor::new(archive)).expect("read archive");

        assert_eq!(
            manifest
                .boards
                .iter()
                .map(|board| board.id.as_str())
                .collect::<Vec<_>>(),
            vec!["board_1"]
        );
        assert_eq!(
            manifest
                .data_tables
                .iter()
                .map(|data_table| data_table.id.as_str())
                .collect::<Vec<_>>(),
            vec!["database_1", "database_inline"]
        );
        assert_eq!(
            manifest
                .mindmaps
                .iter()
                .map(|mindmap| mindmap.id.as_str())
                .collect::<Vec<_>>(),
            vec!["mindmap_1"]
        );
        assert_eq!(
            manifest
                .assets
                .iter()
                .map(|asset| asset.id.as_str())
                .collect::<Vec<_>>(),
            vec![asset.id.as_str()]
        );
        archive
            .by_name(&format!("assets/{}", asset.relative_path))
            .expect("data table asset entry exists");
    }

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
        snapshot.pages[0].blocks.push(json!({
            "id": "block_child_page",
            "type": "child_page",
            "pageId": "page_child",
            "title": "Child"
        }));
        snapshot.pages.push(PageRecord {
            id: "page_child".to_string(),
            parent_id: Some("page_1".to_string()),
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");

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
        let child_page_block = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("child_page"))
            .expect("child page block exists");
        let child_page_id = child_page_block
            .get("pageId")
            .and_then(Value::as_str)
            .expect("child page block page id");
        assert_ne!(child_page_id, "page_child");
        assert_eq!(child_page_id, imported_child.id);
        let image_block = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("image"))
            .expect("image block exists");
        assert_ne!(
            image_block.get("id").and_then(Value::as_str),
            Some("block_image")
        );
        assert!(image_block.get("assetId").and_then(Value::as_str).is_some());
    }

    #[test]
    fn import_page_package_rewrites_rich_text_page_relations() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target snapshot");
        let snapshot = WorkspaceSnapshot {
            boards: vec![],
            data_tables: vec![],
            mindmaps: vec![],
            synced_block_groups: vec![],
            page_properties: vec![],
            pages: vec![
                PageRecord {
                    id: "page_root".to_string(),
                    parent_id: None,
                    title: "Root".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![
                        json!({
                            "id": "block_link_child",
                            "type": "paragraph",
                            "text": "Child",
                            "richText": [{ "text": "Child", "pageId": "page_child", "relationKind": "link" }]
                        }),
                        json!({
                            "id": "block_link_external",
                            "type": "paragraph",
                            "text": "Outside",
                            "richText": [{ "text": "Outside", "pageId": "page_external", "relationKind": "link" }]
                        }),
                    ],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
                PageRecord {
                    id: "page_child".to_string(),
                    parent_id: Some("page_root".to_string()),
                    title: "Child".to_string(),
                    icon: None,
                    cover: None,
                    properties: Some(json!({})),
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: vec![],
                    created_at: "2026-07-06T00:00:00.000Z".to_string(),
                    updated_at: "2026-07-06T00:00:00.000Z".to_string(),
                },
            ],
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_root".to_string()),
                ..WorkspaceSettings::default()
            },
        };

        source
            .replace_workspace_backup(snapshot)
            .expect("replace source snapshot");
        let archive = source
            .export_page_package("page_root")
            .expect("export page package");

        let result = target
            .import_page_package(archive)
            .expect("import page package");
        let imported = target
            .export_workspace_backup()
            .expect("export target snapshot");
        let root = imported
            .pages
            .iter()
            .find(|page| page.id == result.root_page_id)
            .expect("imported root page");
        let child = imported
            .pages
            .iter()
            .find(|page| page.parent_id.as_deref() == Some(result.root_page_id.as_str()))
            .expect("imported child page");

        let rich_text = root.blocks[0]
            .get("richText")
            .and_then(Value::as_array)
            .expect("rich text");
        assert_eq!(
            rich_text[0].get("pageId").and_then(Value::as_str),
            Some(child.id.as_str())
        );

        let degraded = root.blocks[1]
            .get("richText")
            .and_then(Value::as_array)
            .expect("degraded rich text");
        assert!(degraded[0].get("pageId").is_none());
        assert!(degraded[0].get("relationKind").is_none());
        assert_eq!(
            degraded[0].get("text").and_then(Value::as_str),
            Some("Outside")
        );
    }

    #[test]
    fn page_package_import_inserts_pages_root_first_even_when_manifest_is_shuffled() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages.push(PageRecord {
            id: "page_child".to_string(),
            parent_id: Some("page_1".to_string()),
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        snapshot.pages.push(PageRecord {
            id: "page_grandchild".to_string(),
            parent_id: Some("page_child".to_string()),
            title: "Grandchild".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.pages.reverse();
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");

        let result = target
            .import_page_package(archive)
            .expect("import shuffled page package");
        let imported = target.export_workspace_backup().expect("export target");
        let imported_child = imported
            .pages
            .iter()
            .find(|page| page.parent_id.as_deref() == Some(result.root_page_id.as_str()))
            .expect("imported child");
        let imported_grandchild = imported
            .pages
            .iter()
            .find(|page| page.parent_id.as_deref() == Some(imported_child.id.as_str()))
            .expect("imported grandchild");

        assert_eq!(imported_child.title, "Child");
        assert_eq!(imported_grandchild.title, "Grandchild");
    }

    #[test]
    fn page_package_import_rejects_workspace_archives() {
        let mut workspace_archive = Cursor::new(Vec::new());
        {
            let mut archive = zip::ZipWriter::new(&mut workspace_archive);
            archive
                .start_file(
                    "workspace.json",
                    zip::write::FileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .expect("start workspace file");
            serde_json::to_writer(&mut archive, &sample_snapshot()).expect("write workspace");
            archive.finish().expect("finish workspace archive");
        }
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(workspace_archive.into_inner())
            .expect_err("workspace archive rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rewrites_resource_and_asset_references() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let page_asset = source
            .write_asset(WriteAssetInput {
                name: "page-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"page image".to_vec(),
            })
            .expect("write page asset");
        let table_asset = source
            .write_asset(WriteAssetInput {
                name: "table-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"table image".to_vec(),
            })
            .expect("write table asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": page_asset.id,
            "name": "page-image.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "image"
        }));
        snapshot.data_tables[0].snapshot["assets"] = json!({
            table_asset.id.clone(): {
                "id": table_asset.id,
                "name": "table-image.png",
                "mimeType": "image/png"
            }
        });
        snapshot.data_tables[0].snapshot["blocks"] = json!({
            "table_block_image": {
                "id": "table_block_image",
                "type": "image",
                "imageAssetId": table_asset.id
            }
        });
        snapshot.data_tables[0].snapshot["recordPages"] = json!({
            "record_1": {
                "recordId": "record_1",
                "blockIds": ["table_block_image"]
            }
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let page_legacy_asset_id = "asset_legacy_page";
        let table_legacy_asset_id = "asset_legacy_table";
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            for asset in &mut manifest.assets {
                if asset.id == page_asset.id {
                    asset.id = page_legacy_asset_id.to_string();
                } else if asset.id == table_asset.id {
                    asset.id = table_legacy_asset_id.to_string();
                }
            }
            for page in &mut manifest.pages {
                for block in &mut page.blocks {
                    if block.get("assetId").and_then(Value::as_str) == Some(page_asset.id.as_str())
                    {
                        block["assetId"] = Value::String(page_legacy_asset_id.to_string());
                    }
                }
            }
            for data_table in &mut manifest.data_tables {
                if let Some(assets) = data_table
                    .snapshot
                    .get_mut("assets")
                    .and_then(Value::as_object_mut)
                {
                    if let Some(mut asset_value) = assets.remove(&table_asset.id) {
                        if let Some(object) = asset_value.as_object_mut() {
                            object.insert(
                                "id".to_string(),
                                Value::String(table_legacy_asset_id.to_string()),
                            );
                        }
                        assets.insert(table_legacy_asset_id.to_string(), asset_value);
                    }
                }
                if let Some(block) = data_table
                    .snapshot
                    .pointer_mut("/blocks/table_block_image")
                    .and_then(Value::as_object_mut)
                {
                    block.insert(
                        "imageAssetId".to_string(),
                        Value::String(table_legacy_asset_id.to_string()),
                    );
                }
            }
        });

        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let result = target
            .import_page_package(archive)
            .expect("import page package");
        let imported = target.export_workspace_backup().expect("export target");
        let imported_root = imported
            .pages
            .iter()
            .find(|page| page.id == result.root_page_id)
            .expect("imported root exists");
        let imported_board_id = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("whiteboard"))
            .and_then(|block| block.get("boardId"))
            .and_then(Value::as_str)
            .expect("imported board id");
        let imported_database_id = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("data_table"))
            .and_then(|block| block.get("databaseId"))
            .and_then(Value::as_str)
            .expect("imported database id");
        let imported_mindmap_id = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("mindmap"))
            .and_then(|block| block.get("mindmapId"))
            .and_then(Value::as_str)
            .expect("imported mindmap id");
        let imported_page_asset_id = imported_root
            .blocks
            .iter()
            .find(|block| block.get("type").and_then(Value::as_str) == Some("image"))
            .and_then(|block| block.get("assetId"))
            .and_then(Value::as_str)
            .expect("imported page asset id");
        let imported_data_table = imported
            .data_tables
            .iter()
            .find(|data_table| data_table.id == imported_database_id)
            .expect("imported data table");
        let imported_table_assets = imported_data_table
            .snapshot
            .get("assets")
            .and_then(Value::as_object)
            .expect("imported table assets");
        let imported_table_asset_id = imported_table_assets
            .keys()
            .next()
            .expect("imported table asset id");
        let imported_table_blocks = imported_data_table
            .snapshot
            .get("blocks")
            .and_then(Value::as_object)
            .expect("imported table blocks");
        let (imported_table_block_id, imported_table_block) = imported_table_blocks
            .iter()
            .next()
            .expect("imported table block");
        let imported_table_block_asset_id = imported_table_block
            .get("imageAssetId")
            .and_then(Value::as_str)
            .expect("imported table block asset id");
        let imported_record_page_block_ids = imported_data_table
            .snapshot
            .pointer("/recordPages/record_1/blockIds")
            .and_then(Value::as_array)
            .expect("imported record page block ids");

        assert_ne!(imported_board_id, "board_1");
        assert_ne!(imported_database_id, "database_1");
        assert_ne!(imported_mindmap_id, "mindmap_1");
        assert_ne!(imported_page_asset_id, page_legacy_asset_id);
        assert_ne!(imported_table_asset_id, table_legacy_asset_id);
        assert_ne!(imported_table_block_id, "table_block_image");
        assert_eq!(
            imported_table_block.get("id").and_then(Value::as_str),
            Some(imported_table_block_id.as_str())
        );
        assert!(!imported_table_blocks.contains_key("table_block_image"));
        assert_eq!(imported_table_block_asset_id, imported_table_asset_id);
        assert_eq!(
            imported_record_page_block_ids
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>(),
            vec![imported_table_block_id.as_str()]
        );
        assert_eq!(
            imported_data_table
                .snapshot
                .pointer("/database/id")
                .and_then(Value::as_str),
            Some(imported_database_id)
        );
        assert_eq!(
            target
                .read_asset(imported_page_asset_id)
                .expect("read imported page asset"),
            b"page image"
        );
        assert_eq!(
            target
                .read_asset(imported_table_asset_id)
                .expect("read imported table asset"),
            b"table image"
        );
    }

    #[test]
    fn page_package_import_rejects_missing_page_refs() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.pages[0].blocks.push(json!({
                "id": "block_child_page",
                "type": "child_page",
                "pageId": "page_missing"
            }));
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("missing page ref rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_root_with_parent() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.pages[0].parent_id = Some("page_missing".to_string());
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("root parent rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_duplicate_page_ids() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages.push(PageRecord {
            id: "page_child".to_string(),
            parent_id: Some("page_1".to_string()),
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            let child = manifest
                .pages
                .iter_mut()
                .find(|page| page.id == "page_child")
                .expect("child page");
            child.id = "page_1".to_string();
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("duplicate page id rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_missing_root_page() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.root_page_id = "page_missing".to_string();
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("missing root page rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_extra_non_root_top_level_page() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.pages.push(PageRecord {
                id: "page_extra_root".to_string(),
                parent_id: None,
                title: "Extra root".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![],
                created_at: "2026-07-02T00:00:00.000Z".to_string(),
                updated_at: "2026-07-02T00:00:00.000Z".to_string(),
            });
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("extra top-level page rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_root_involved_cycle() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let mut snapshot = sample_snapshot();
        snapshot.pages.push(PageRecord {
            id: "page_child".to_string(),
            parent_id: Some("page_1".to_string()),
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: vec![],
            created_at: "2026-07-02T00:00:00.000Z".to_string(),
            updated_at: "2026-07-02T00:00:00.000Z".to_string(),
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            let root = manifest
                .pages
                .iter_mut()
                .find(|page| page.id == "page_1")
                .expect("root page");
            root.parent_id = Some("page_child".to_string());
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("root-involved cycle rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_disconnected_page_cycle() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.pages.push(PageRecord {
                id: "page_cycle_a".to_string(),
                parent_id: Some("page_cycle_b".to_string()),
                title: "Cycle A".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![],
                created_at: "2026-07-02T00:00:00.000Z".to_string(),
                updated_at: "2026-07-02T00:00:00.000Z".to_string(),
            });
            manifest.pages.push(PageRecord {
                id: "page_cycle_b".to_string(),
                parent_id: Some("page_cycle_a".to_string()),
                title: "Cycle B".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
                blocks: vec![],
                created_at: "2026-07-02T00:00:00.000Z".to_string(),
                updated_at: "2026-07-02T00:00:00.000Z".to_string(),
            });
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(archive)
            .expect_err("disconnected page cycle rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_missing_resource_and_asset_refs() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let page_asset = source
            .write_asset(WriteAssetInput {
                name: "page-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"page image".to_vec(),
            })
            .expect("write page asset");
        let table_asset = source
            .write_asset(WriteAssetInput {
                name: "table-image.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"table image".to_vec(),
            })
            .expect("write table asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": page_asset.id,
            "name": "page-image.png",
            "mimeType": "image/png"
        }));
        snapshot.data_tables[0].snapshot["assets"] = json!({
            table_asset.id.clone(): {
                "id": table_asset.id,
                "name": "table-image.png",
                "mimeType": "image/png"
            }
        });
        snapshot.data_tables[0].snapshot["blocks"] = json!({
            "table_block_image": {
                "id": "table_block_image",
                "type": "image",
                "imageAssetId": table_asset.id
            }
        });
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");

        let cases: Vec<Box<dyn Fn(&mut PagePackageManifest)>> = vec![
            Box::new(|manifest| manifest.pages[0].blocks[1]["boardId"] = json!("board_missing")),
            Box::new(|manifest| {
                manifest.pages[0].blocks[2]["databaseId"] = json!("database_missing")
            }),
            Box::new(|manifest| {
                manifest.pages[0].blocks[3]["mindmapId"] = json!("mindmap_missing")
            }),
            Box::new(|manifest| manifest.pages[0].blocks[4]["assetId"] = json!("asset_missing")),
            Box::new(|manifest| {
                let asset_id = manifest.data_tables[0]
                    .snapshot
                    .get("assets")
                    .and_then(Value::as_object)
                    .and_then(|assets| assets.keys().next())
                    .cloned()
                    .expect("table asset id");
                let mut asset_value = manifest.data_tables[0].snapshot["assets"][&asset_id].clone();
                asset_value["id"] = json!("asset_missing");
                manifest.data_tables[0].snapshot["assets"] = json!({
                    "asset_missing": asset_value
                });
            }),
            Box::new(|manifest| {
                manifest.data_tables[0].snapshot["blocks"]["table_block_image"]["imageAssetId"] =
                    json!("asset_missing");
            }),
        ];

        for corrupt in cases {
            let corrupt_archive = rewrite_page_package_manifest(archive.clone(), |manifest| {
                corrupt(manifest);
            });
            let target = Storage::open_in_memory_for_tests().expect("target opens");
            target
                .replace_workspace_backup(sample_snapshot())
                .expect("seed target");
            let before = target.export_workspace_backup().expect("snapshot before");

            let error = target
                .import_page_package(corrupt_archive)
                .expect_err("missing resource or asset ref rejected");

            assert_eq!(error.code, "invalid_payload");
            assert_eq!(
                target.export_workspace_backup().expect("snapshot after"),
                before
            );
        }
    }

    #[test]
    fn page_package_import_removes_new_asset_files_when_late_database_write_fails() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "cleanup.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"cleanup image".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": asset.id,
            "name": "cleanup.png",
            "mimeType": "image/png"
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        target
            .connection
            .execute(
                "CREATE TRIGGER fail_imported_page_insert
                 BEFORE INSERT ON zhiqi_pages
                 WHEN NEW.id LIKE 'page_import_%'
                 BEGIN
                   SELECT RAISE(FAIL, 'forced page import failure');
                 END",
                [],
            )
            .expect("install failure trigger");
        let imported_asset_path = target.assets_dir.join(&asset.relative_path);

        let error = target
            .import_page_package(archive)
            .expect_err("late database failure");

        assert_eq!(error.code, "database_error");
        assert!(!imported_asset_path.exists());
        assert_eq!(
            target
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE sha256 = ?1",
                    [asset.sha256.as_str()],
                    |row| row.get::<_, i64>(0),
                )
                .expect("query asset rows"),
            0
        );
    }

    #[test]
    fn page_package_import_rolls_back_earlier_assets_when_later_asset_stage_fails() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let first = source
            .write_asset(WriteAssetInput {
                name: "first.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"first staged image".to_vec(),
            })
            .expect("write first source asset");
        let second = source
            .write_asset(WriteAssetInput {
                name: "second.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"second staged image".to_vec(),
            })
            .expect("write second source asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.extend([
            json!({
                "id": "block_first_image",
                "type": "image",
                "assetId": first.id,
                "name": first.name,
                "mimeType": first.mime_type
            }),
            json!({
                "id": "block_second_image",
                "type": "image",
                "assetId": second.id,
                "name": second.name,
                "mimeType": second.mime_type
            }),
        ]);
        source
            .replace_workspace_backup(snapshot)
            .expect("replace source snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export page package");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let first_path = target.assets_dir.join(&first.relative_path);
        let second_path = target.assets_dir.join(&second.relative_path);
        std::fs::create_dir_all(second_path.parent().expect("second path has parent"))
            .expect("create second asset parent");
        std::fs::write(&second_path, b"pre-existing second sentinel")
            .expect("write conflicting second final");

        let error = target
            .import_page_package(archive)
            .expect_err("second asset stage fails");

        assert_eq!(error.code, "conflict");
        assert!(!first_path.exists());
        assert_eq!(
            std::fs::read(&second_path).expect("conflicting final remains"),
            b"pre-existing second sentinel"
        );
        assert_eq!(
            target
                .connection
                .query_row(
                    "SELECT COUNT(*) FROM zhiqi_assets WHERE sha256 IN (?1, ?2)",
                    [first.sha256.as_str(), second.sha256.as_str()],
                    |row| row.get::<_, i64>(0),
                )
                .expect("count rolled-back asset rows"),
            0
        );
    }

    #[test]
    fn page_package_import_keeps_existing_asset_file_when_manifest_sha_is_wrong() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "existing.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"existing image".to_vec(),
            })
            .expect("write source asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": asset.id,
            "name": "existing.png",
            "mimeType": "image/png"
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.assets[0].sha256 = "0".repeat(64);
        });
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let existing = target
            .write_asset(WriteAssetInput {
                name: "existing.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"existing image".to_vec(),
            })
            .expect("write existing target asset");
        target
            .connection
            .execute(
                "CREATE TRIGGER fail_imported_page_insert
                 BEFORE INSERT ON zhiqi_pages
                 WHEN NEW.id LIKE 'page_import_%'
                 BEGIN
                   SELECT RAISE(FAIL, 'forced page import failure');
                 END",
                [],
            )
            .expect("install failure trigger");
        let existing_asset_path = target.assets_dir.join(&existing.relative_path);

        let error = target
            .import_page_package(archive)
            .expect_err("late database failure");

        assert_eq!(error.code, "database_error");
        assert!(existing_asset_path.exists());
        assert_eq!(
            target
                .read_asset(&existing.id)
                .expect("read existing asset"),
            b"existing image"
        );
    }

    #[test]
    fn page_package_importing_same_archive_twice_keeps_both_imported_roots() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");

        let first = target
            .import_page_package(archive.clone())
            .expect("first import");
        let second = target.import_page_package(archive).expect("second import");
        let imported = target.export_workspace_backup().expect("export target");

        assert_ne!(first.root_page_id, second.root_page_id);
        assert!(imported
            .pages
            .iter()
            .any(|page| page.id == first.root_page_id));
        assert!(imported
            .pages
            .iter()
            .any(|page| page.id == second.root_page_id));
    }

    #[test]
    fn page_package_import_accepts_legacy_zhixi_manifest_kind() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        source
            .replace_workspace_backup(sample_snapshot())
            .expect("seed source");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let legacy_archive = rewrite_page_package_manifest(archive, |manifest| {
            manifest.kind = "zhixi.page-package".to_string();
        });

        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");

        let result = target
            .import_page_package(legacy_archive)
            .expect("legacy page package imports");
        let imported = target.export_workspace_backup().expect("export target");

        assert!(imported
            .pages
            .iter()
            .any(|page| page.id == result.root_page_id));
    }

    #[test]
    fn page_package_exports_exchange_v2_layout() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");

        let archive = storage
            .export_page_package("page_1")
            .expect("export page package");
        let mut archive = zip::ZipArchive::new(Cursor::new(archive)).expect("read archive");
        let manifest: Value = {
            let mut entry = archive
                .by_name("manifest.json")
                .expect("exchange manifest exists");
            serde_json::from_reader(&mut entry).expect("parse exchange manifest")
        };

        assert_eq!(manifest.get("format").and_then(Value::as_str), Some("zhiqi.exchange"));
        assert_eq!(manifest.get("formatVersion").and_then(Value::as_u64), Some(2));
        assert_eq!(
            manifest.get("kind").and_then(Value::as_str),
            Some("page-package")
        );
        assert!(archive.by_name("payload.json").is_ok());
        assert!(archive.by_name("assets/manifest.json").is_ok());
        assert!(archive.by_name(PAGE_PACKAGE_MANIFEST_ENTRY).is_err());
    }

    #[test]
    fn page_package_import_rejects_invalid_manifest() {
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut archive = zip::ZipWriter::new(&mut bytes);
            archive
                .start_file(
                    PAGE_PACKAGE_MANIFEST_ENTRY,
                    zip::write::FileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .expect("start manifest file");
            serde_json::to_writer(
                &mut archive,
                &PagePackageManifest {
                    kind: "zhiqi.other".to_string(),
                    version: PAGE_PACKAGE_VERSION,
                    root_page_id: "page_1".to_string(),
                    pages: sample_snapshot().pages,
                    boards: Vec::new(),
                    data_tables: Vec::new(),
                    mindmaps: Vec::new(),
                    synced_block_groups: Vec::new(),
                    assets: Vec::new(),
                },
            )
            .expect("write manifest");
            archive.finish().expect("finish archive");
        }
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(bytes.into_inner())
            .expect_err("invalid manifest rejected");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn page_package_import_rejects_missing_asset_entries_without_partial_insert() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "missing-entry.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"image".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": asset.id,
            "name": "missing-entry.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "image"
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive = source
            .export_page_package("page_1")
            .expect("export package");
        let manifest = read_exported_page_package_manifest(archive);
        let mut bytes = Cursor::new(Vec::new());
        {
            let mut broken_archive = zip::ZipWriter::new(&mut bytes);
            broken_archive
                .start_file(
                    PAGE_PACKAGE_MANIFEST_ENTRY,
                    zip::write::FileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .expect("start manifest file");
            serde_json::to_writer(&mut broken_archive, &manifest).expect("write manifest");
            broken_archive.finish().expect("finish archive");
        }
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .replace_workspace_backup(sample_snapshot())
            .expect("seed target");
        let before = target.export_workspace_backup().expect("snapshot before");

        let error = target
            .import_page_package(bytes.into_inner())
            .expect_err("missing asset entry rejected");

        assert_eq!(error.code, "invalid_payload");
        assert!(error
            .message
            .contains("page package asset entry is missing"));
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn asset_reads_reject_paths_outside_asset_dir() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        std::fs::create_dir_all(&storage.assets_dir).expect("create asset dir");
        let outside_path = storage
            .assets_dir
            .parent()
            .expect("asset dir parent")
            .join(format!("outside-{}.txt", std::process::id()));
        std::fs::write(&outside_path, b"leak").expect("write outside file");
        let escape_path = format!(
            "../{}",
            outside_path
                .file_name()
                .expect("outside file name")
                .to_string_lossy()
        );
        storage
            .connection
            .execute(
                "INSERT INTO zhiqi_assets
                  (id, sha256, name, mime_type, byte_size, relative_path, created_at)
                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    "asset_escape",
                    "sha256-escape",
                    "escape.txt",
                    "text/plain",
                    4,
                    escape_path,
                    "2026-06-30T00:00:00.000Z"
                ],
            )
            .expect("insert malicious asset row");

        let error = storage
            .read_asset("asset_escape")
            .expect_err("reject escaped asset path");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            std::fs::read(outside_path).expect("outside file still exists"),
            b"leak"
        );
    }

    #[test]
    fn appends_mcp_blocks_and_audit_record_in_one_transaction() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");

        storage
            .append_mcp_page_blocks(
                "page_1",
                vec![
                    json!({ "id": "block_mcp_audit", "type": "paragraph", "text": "Saved by MCP" }),
                ],
                "2026-07-12T00:00:00.000Z".to_string(),
            )
            .expect("append MCP blocks");

        let page = storage.load_page_record("page_1").expect("load page");
        let audit: String = storage
            .connection
            .query_row(
                "SELECT created_ids_json FROM zhiqi_mcp_audit_log WHERE page_id = ?1",
                ["page_1"],
                |row| row.get(0),
            )
            .expect("audit record");

        assert!(page
            .blocks
            .iter()
            .any(|block| block["id"] == "block_mcp_audit"));
        assert_eq!(audit, r#"["block_mcp_audit"]"#);
    }

    #[test]
    fn workspace_replacement_preserves_audit_for_pages_that_still_exist() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");
        storage
            .append_mcp_page_blocks(
                "page_1",
                vec![json!({
                    "id": "block_mcp_preserved_audit",
                    "type": "paragraph",
                    "text": "Saved by MCP"
                })],
                "2026-07-12T00:00:00.000Z".to_string(),
            )
            .expect("append MCP block");
        let snapshot = storage
            .export_workspace_backup()
            .expect("export workspace backup");

        storage
            .replace_workspace_backup(snapshot.clone())
            .expect("replace same workspace backup");

        let audit: String = storage
            .connection
            .query_row(
                "SELECT created_ids_json FROM zhiqi_mcp_audit_log WHERE page_id = ?1",
                ["page_1"],
                |row| row.get(0),
            )
            .expect("audit survives same-page replacement");
        assert_eq!(audit, r#"["block_mcp_preserved_audit"]"#);

        let mut snapshot_without_page = snapshot;
        snapshot_without_page.pages.clear();
        storage
            .replace_workspace_backup(snapshot_without_page)
            .expect("replace workspace without audited page");

        let audit_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_mcp_audit_log WHERE page_id = ?1",
                ["page_1"],
                |row| row.get(0),
            )
            .expect("count audit rows");
        assert_eq!(audit_count, 0);
    }

    #[test]
    fn keeps_mcp_blocks_when_a_stale_local_page_save_arrives_after_the_append() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .replace_workspace_backup(sample_snapshot())
            .expect("seed workspace");
        let mut stale_local_page = storage.load_page_record("page_1").expect("load local page");

        storage
            .append_mcp_page_blocks(
                "page_1",
                vec![json!({
                    "id": "block_mcp_concurrent",
                    "type": "paragraph",
                    "text": "Saved by MCP"
                })],
                "2026-07-12T00:00:00.000Z".to_string(),
            )
            .expect("append MCP block");

        stale_local_page.blocks.push(json!({
            "id": "block_local_concurrent",
            "type": "paragraph",
            "text": "Saved locally"
        }));
        stale_local_page.updated_at = "2026-07-12T00:00:01.000Z".to_string();
        storage
            .save_page(stale_local_page)
            .expect("save stale local page");

        let page = storage
            .load_page_record("page_1")
            .expect("load merged page");
        assert!(page
            .blocks
            .iter()
            .any(|block| block["id"] == "block_mcp_concurrent"));
        assert!(page
            .blocks
            .iter()
            .any(|block| block["id"] == "block_local_concurrent"));
    }
}
