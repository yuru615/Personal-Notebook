mod assets;
pub mod commands;
mod error;
mod models;
mod schema;
mod search;

use std::{
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
use serde::Serialize;
use serde_json::Value;

pub use error::{StorageError, StorageResult};
#[allow(unused_imports)]
pub use models::PagePackageImportResult;
pub use models::{
    AssetMeta, BoardRecord, BootstrapPayload, DataTableRecord, DeleteResult, ImportAssetFileInput,
    LoadedPage, MindmapRecord, PageMeta, PagePackageManifest, PageRecord, SaveResult, SearchResult,
    WorkspaceSettings, WorkspaceSnapshot, WriteAssetInput,
};

const DATABASE_FILE_NAME: &str = "zhixi.db";
const ASSETS_DIR_NAME: &str = "zhixi-assets";
const SETTINGS_ID: &str = "workspace";
#[allow(dead_code)]
pub const PAGE_PACKAGE_KIND: &str = "zhixi.page-package";
#[allow(dead_code)]
pub const PAGE_PACKAGE_VERSION: u32 = 1;
#[allow(dead_code)]
pub const PAGE_PACKAGE_MANIFEST_ENTRY: &str = "page-package.json";
pub const WORKSPACE_ARCHIVE_PROGRESS_EVENT: &str = "zhixi://workspace-archive-progress";
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
}

pub struct Storage {
    connection: Connection,
    assets_dir: PathBuf,
}

impl Storage {
    pub fn open(data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        let data_dir = data_dir.as_ref();
        fs::create_dir_all(data_dir)?;
        let connection = Connection::open(data_dir.join(DATABASE_FILE_NAME))?;
        let storage = Self {
            connection,
            assets_dir: data_dir.join(ASSETS_DIR_NAME),
        };
        schema::initialize_schema(&storage.connection)?;
        Ok(storage)
    }

    #[cfg(test)]
    pub fn open_in_memory_for_tests() -> StorageResult<Self> {
        let connection = Connection::open_in_memory()?;
        let storage = Self {
            connection,
            assets_dir: unique_test_assets_dir(),
        };
        schema::initialize_schema(&storage.connection)?;
        Ok(storage)
    }

    #[cfg(test)]
    pub fn schema_version(&self) -> StorageResult<i64> {
        self.connection
            .query_row(
                "SELECT value FROM zhixi_meta WHERE key = 'schema_version'",
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
            "SELECT COUNT(*) FROM zhixi_settings WHERE id = ?1",
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
            pages: self.load_pages()?,
            settings,
        })
    }

    pub fn load_workspace_backup(&self) -> StorageResult<Option<WorkspaceSnapshot>> {
        if !self.has_workspace()? {
            return Ok(None);
        }

        self.export_workspace_backup().map(Some)
    }

    pub fn replace_workspace_backup(&self, snapshot: WorkspaceSnapshot) -> StorageResult<()> {
        self.with_transaction(|| {
            self.clear_workspace()?;

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
            self.save_settings(&snapshot.settings)?;
            self.rebuild_resource_search_documents()?;

            Ok(())
        })
    }

    pub fn load_page(&self, page_id: &str) -> StorageResult<LoadedPage> {
        self.load_page_record(page_id).map(Into::into)
    }

    pub fn save_page(&self, page: PageRecord) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = self
                .page_position(&page.id)?
                .unwrap_or_else(|| self.next_position("zhixi_pages"));
            self.insert_page(&page, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: page.id })
        })
    }

    pub fn delete_page_branch(&self, page_id: &str) -> StorageResult<DeleteResult> {
        self.with_transaction(|| {
            let deleted_ids = self.descendant_page_ids(page_id)?;
            self.connection
                .execute("DELETE FROM zhixi_pages WHERE id = ?1", [page_id])?;
            for deleted_id in &deleted_ids {
                search::delete_documents_for_owner(&self.connection, "page", deleted_id)?;
            }
            self.rebuild_resource_search_documents()?;
            Ok(DeleteResult { deleted_ids })
        })
    }

    pub fn save_board(&self, board: BoardRecord) -> StorageResult<SaveResult> {
        self.with_transaction(|| {
            let position = self
                .board_position(&board.id)?
                .unwrap_or_else(|| self.next_position("zhixi_boards"));
            self.insert_board(&board, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: board.id })
        })
    }

    pub fn load_board_snapshot(&self, board_id: &str) -> StorageResult<Value> {
        self.connection
            .query_row(
                "SELECT snapshot_json FROM zhixi_board_snapshots WHERE board_id = ?1",
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
                .unwrap_or_else(|| self.next_position("zhixi_mindmaps"));
            self.insert_mindmap(&mindmap, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: mindmap.id })
        })
    }

    pub fn load_mindmap_snapshot(&self, mindmap_id: &str) -> StorageResult<Value> {
        self.connection
            .query_row(
                "SELECT snapshot_json FROM zhixi_mindmap_snapshots WHERE mindmap_id = ?1",
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
                .unwrap_or_else(|| self.next_position("zhixi_data_tables"));
            self.insert_data_table(&data_table, position)?;
            self.rebuild_resource_search_documents()?;
            Ok(SaveResult { id: data_table.id })
        })
    }

    pub fn write_asset(&self, input: WriteAssetInput) -> StorageResult<AssetMeta> {
        assets::write_asset(&self.connection, &self.assets_dir, input)
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

    pub fn export_workspace_archive(&self) -> StorageResult<Vec<u8>> {
        let mut ignore_progress = |_| {};
        self.write_workspace_archive(Cursor::new(Vec::new()), None, &mut ignore_progress)
            .map(|cursor| cursor.into_inner())
    }

    pub fn export_workspace_archive_to_path(&self, path: impl AsRef<Path>) -> StorageResult<()> {
        let mut ignore_progress = |_| {};
        self.export_workspace_archive_to_path_with_progress(path, None, &mut ignore_progress)
    }

    pub fn export_workspace_archive_to_path_with_progress<F>(
        &self,
        path: impl AsRef<Path>,
        task_id: Option<&str>,
        progress: &mut F,
    ) -> StorageResult<()>
    where
        F: FnMut(WorkspaceArchiveProgress),
    {
        let file = fs::File::create(path)?;
        let writer = BufWriter::new(file);
        let mut writer = self.write_workspace_archive(writer, task_id, progress)?;
        writer.flush()?;
        Ok(())
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
        let assets = assets::load_referenced_assets(&self.connection)?;
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
            .start_file("workspace.json", metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &snapshot)?;

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
            .start_file("assets/manifest.json", metadata_options)
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
        let assets = manifest.assets.clone();
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
            .start_file(PAGE_PACKAGE_MANIFEST_ENTRY, metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &manifest)?;

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
            .start_file("assets/manifest.json", metadata_options)
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

    pub fn import_workspace_archive(&self, bytes: Vec<u8>) -> StorageResult<()> {
        let mut ignore_progress = |_| {};
        let cursor = Cursor::new(bytes);
        self.import_workspace_archive_reader(cursor, None, &mut ignore_progress)
    }

    pub fn import_workspace_archive_from_path(&self, path: impl AsRef<Path>) -> StorageResult<()> {
        let mut ignore_progress = |_| {};
        self.import_workspace_archive_from_path_with_progress(path, None, &mut ignore_progress)
    }

    pub fn import_workspace_archive_from_path_with_progress<F>(
        &self,
        path: impl AsRef<Path>,
        task_id: Option<&str>,
        progress: &mut F,
    ) -> StorageResult<()>
    where
        F: FnMut(WorkspaceArchiveProgress),
    {
        let file = fs::File::open(path)?;
        self.import_workspace_archive_reader(BufReader::new(file), task_id, progress)
    }

    fn import_workspace_archive_reader<R, F>(
        &self,
        reader: R,
        task_id: Option<&str>,
        progress: &mut F,
    ) -> StorageResult<()>
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
        let snapshot: WorkspaceSnapshot = {
            let mut workspace_file = archive.by_name("workspace.json").map_err(zip_error)?;
            serde_json::from_reader(&mut workspace_file)?
        };
        let archive_assets: Vec<AssetMeta> = {
            match archive.by_name("assets/manifest.json") {
                Ok(mut manifest_file) => serde_json::from_reader(&mut manifest_file)?,
                Err(zip::result::ZipError::FileNotFound) => Vec::new(),
                Err(error) => return Err(zip_error(error)),
            }
        };
        let total_assets = archive_assets.len() as u64;
        let bytes_total = total_asset_bytes(&archive_assets);
        let mut bytes_processed = 0;

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

        for (index, asset) in archive_assets.into_iter().enumerate() {
            let archive_path = format!("assets/{}", asset.relative_path);
            let mut asset_file = match archive.by_name(&archive_path) {
                Ok(file) => file,
                Err(zip::result::ZipError::FileNotFound) => continue,
                Err(error) => return Err(zip_error(error)),
            };
            let current = index as u64 + 1;
            let item_name = asset.name.clone();

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

            let mut copied_for_asset = 0;
            assets::write_asset_from_reader(
                &self.connection,
                &self.assets_dir,
                asset.name,
                asset.mime_type,
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
        }

        report_archive_progress(
            task_id,
            progress,
            WorkspaceArchiveOperation::Import,
            WorkspaceArchiveProgressPhase::Finalizing,
            total_assets,
            total_assets,
            bytes_processed,
            bytes_total,
            None,
        );

        self.replace_workspace_backup(snapshot)?;

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

        Ok(())
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
        let manifest: PagePackageManifest = {
            let mut manifest_entry = archive
                .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
                .map_err(|_| StorageError::invalid_payload("not a zhixi page package"))?;
            serde_json::from_reader(&mut manifest_entry)?
        };
        if manifest.kind != PAGE_PACKAGE_KIND || manifest.version != PAGE_PACKAGE_VERSION {
            return Err(StorageError::invalid_payload("unsupported page package"));
        }
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
                return Err(zip_error(error));
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
        for page in &manifest.pages {
            page_id_map.insert(
                page.id.clone(),
                self.import_record_id("page", "zhixi_pages", &mut page_reserved_ids)?,
            );
        }
        for board in &manifest.boards {
            board_id_map.insert(
                board.id.clone(),
                self.import_record_id("board", "zhixi_boards", &mut board_reserved_ids)?,
            );
        }
        for data_table in &manifest.data_tables {
            data_table_id_map.insert(
                data_table.id.clone(),
                self.import_record_id(
                    "database",
                    "zhixi_data_tables",
                    &mut data_table_reserved_ids,
                )?,
            );
        }
        for mindmap in &manifest.mindmaps {
            mindmap_id_map.insert(
                mindmap.id.clone(),
                self.import_record_id("mindmap", "zhixi_mindmaps", &mut mindmap_reserved_ids)?,
            );
        }

        let root_page_id = page_id_map
            .get(&manifest.root_page_id)
            .cloned()
            .ok_or_else(|| StorageError::invalid_payload("page package root is missing"))?;
        let mut asset_id_map = std::collections::HashMap::new();
        let mut bytes_processed = 0;

        self.with_transaction(|| {
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
                asset_id_map.insert(asset.id.clone(), imported.id);
            }

            let mut board_position = self.next_position("zhixi_boards");
            for board in &manifest.boards {
                let mut next_board = board.clone();
                next_board.id = board_id_map[&board.id].clone();
                self.insert_board(&next_board, board_position)?;
                board_position += 1;
            }

            let mut data_table_position = self.next_position("zhixi_data_tables");
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

            let mut mindmap_position = self.next_position("zhixi_mindmaps");
            for mindmap in &manifest.mindmaps {
                let mut next_mindmap = mindmap.clone();
                next_mindmap.id = mindmap_id_map[&mindmap.id].clone();
                self.insert_mindmap(&next_mindmap, mindmap_position)?;
                mindmap_position += 1;
            }

            let mut page_position = self.next_position("zhixi_pages");
            for page in &manifest.pages {
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

    pub fn search_workspace(&self, query: &str, limit: usize) -> StorageResult<Vec<SearchResult>> {
        search::search(&self.connection, query, limit)
    }

    #[cfg(test)]
    pub fn block_ref_count(&self) -> StorageResult<i64> {
        self.connection
            .query_row("SELECT COUNT(*) FROM zhixi_block_refs", [], |row| {
                row.get(0)
            })
            .map_err(Into::into)
    }

    fn with_transaction<T>(&self, task: impl FnOnce() -> StorageResult<T>) -> StorageResult<T> {
        self.connection.execute("BEGIN IMMEDIATE", [])?;
        match task() {
            Ok(value) => {
                self.connection.execute("COMMIT", [])?;
                Ok(value)
            }
            Err(error) => {
                let _ = self.connection.execute("ROLLBACK", []);
                Err(error)
            }
        }
    }

    fn clear_workspace(&self) -> StorageResult<()> {
        for table in [
            "zhixi_search_documents_fts",
            "zhixi_search_documents",
            "zhixi_asset_refs",
            "zhixi_data_table_blocks",
            "zhixi_data_table_record_pages",
            "zhixi_data_table_records",
            "zhixi_data_table_views",
            "zhixi_data_table_properties",
            "zhixi_data_tables",
            "zhixi_mindmap_snapshots",
            "zhixi_mindmaps",
            "zhixi_board_snapshots",
            "zhixi_boards",
            "zhixi_block_refs",
            "zhixi_page_contents",
            "zhixi_pages",
            "zhixi_settings",
        ] {
            self.connection
                .execute(&format!("DELETE FROM {table}"), [])?;
        }
        Ok(())
    }

    fn save_settings(&self, settings: &WorkspaceSettings) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhixi_settings (id, record_json) VALUES (?1, ?2)
              ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json",
            params![SETTINGS_ID, serde_json::to_string(settings)?],
        )?;
        Ok(())
    }

    fn load_settings(&self) -> StorageResult<Option<WorkspaceSettings>> {
        self.connection
            .query_row(
                "SELECT record_json FROM zhixi_settings WHERE id = ?1",
                [SETTINGS_ID],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .map(|json| serde_json::from_str(&json).map_err(Into::into))
            .transpose()
    }

    fn insert_page(&self, page: &PageRecord, position: usize) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhixi_pages
              (id, parent_id, title, icon, cover, is_full_width, is_small_text, font_family,
                show_outline, position, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
              ON CONFLICT(id) DO UPDATE SET
                parent_id = excluded.parent_id,
                title = excluded.title,
                icon = excluded.icon,
                cover = excluded.cover,
                is_full_width = excluded.is_full_width,
                is_small_text = excluded.is_small_text,
                font_family = excluded.font_family,
                show_outline = excluded.show_outline,
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
                position as i64,
                page.created_at,
                page.updated_at
            ],
        )?;
        self.connection.execute(
            "INSERT INTO zhixi_page_contents (page_id, blocks_json) VALUES (?1, ?2)
              ON CONFLICT(page_id) DO UPDATE SET blocks_json = excluded.blocks_json",
            params![page.id, serde_json::to_string(&page.blocks)?],
        )?;
        self.replace_block_refs(page)?;
        search::replace_page_document(&self.connection, page)?;
        Ok(())
    }

    fn replace_block_refs(&self, page: &PageRecord) -> StorageResult<()> {
        self.connection.execute(
            "DELETE FROM zhixi_block_refs WHERE page_id = ?1",
            [&page.id],
        )?;
        self.connection.execute(
            "DELETE FROM zhixi_asset_refs WHERE owner_kind = 'page' AND owner_id = ?1",
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
                    "INSERT OR IGNORE INTO zhixi_block_refs (page_id, block_id, ref_kind, ref_id)
                      VALUES (?1, ?2, ?3, ?4)",
                    params![page.id, block_id, ref_kind, ref_id],
                )?;
            }

            if matches!(block_type, "image" | "video" | "audio") {
                if let Some(asset_id) = block.get("assetId").and_then(Value::as_str) {
                    self.connection.execute(
                        "INSERT OR IGNORE INTO zhixi_asset_refs (asset_id, owner_kind, owner_id)
                          SELECT ?1, 'page', ?2
                          WHERE EXISTS (SELECT 1 FROM zhixi_assets WHERE id = ?1)",
                        params![asset_id, &page.id],
                    )?;
                }
            }
        }

        Ok(())
    }

    fn insert_board(&self, board: &BoardRecord, position: usize) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhixi_boards (id, title, position, created_at, updated_at)
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
            "INSERT INTO zhixi_board_snapshots (board_id, snapshot_json) VALUES (?1, ?2)
              ON CONFLICT(board_id) DO UPDATE SET snapshot_json = excluded.snapshot_json",
            params![board.id, serde_json::to_string(&board.snapshot)?],
        )?;
        Ok(())
    }

    fn insert_mindmap(&self, mindmap: &MindmapRecord, position: usize) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhixi_mindmaps (id, title, position, created_at, updated_at)
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
            "INSERT INTO zhixi_mindmap_snapshots (mindmap_id, snapshot_json) VALUES (?1, ?2)
              ON CONFLICT(mindmap_id) DO UPDATE SET snapshot_json = excluded.snapshot_json",
            params![mindmap.id, serde_json::to_string(&mindmap.snapshot)?],
        )?;
        Ok(())
    }

    fn insert_data_table(
        &self,
        data_table: &DataTableRecord,
        position: usize,
    ) -> StorageResult<()> {
        self.connection.execute(
            "INSERT INTO zhixi_data_tables
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
            "zhixi_data_table_blocks",
            "zhixi_data_table_record_pages",
            "zhixi_data_table_records",
            "zhixi_data_table_views",
            "zhixi_data_table_properties",
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
            "zhixi_data_table_properties",
            &data_table.id,
            snapshot.pointer("/database/propertyOrder"),
            snapshot.get("properties"),
        )?;
        insert_ordered_object_rows(
            &self.connection,
            "zhixi_data_table_views",
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
                    "INSERT INTO zhixi_data_table_records
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
                    "INSERT INTO zhixi_data_table_record_pages (data_table_id, record_id, record_json)
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
                    "INSERT INTO zhixi_data_table_blocks
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
            "DELETE FROM zhixi_asset_refs WHERE owner_kind = 'data_table' AND owner_id = ?1",
            [&data_table.id],
        )?;

        let Some(assets) = data_table.snapshot.get("assets").and_then(Value::as_object) else {
            return Ok(());
        };

        for asset_id in assets.keys() {
            self.connection.execute(
                "INSERT OR IGNORE INTO zhixi_asset_refs (asset_id, owner_kind, owner_id)
                  SELECT ?1, 'data_table', ?2
                  WHERE EXISTS (SELECT 1 FROM zhixi_assets WHERE id = ?1)",
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

    fn page_id_for_ref(&self, ref_kind: &str, ref_id: &str) -> StorageResult<Option<String>> {
        self.connection
            .query_row(
                "SELECT page_id FROM zhixi_block_refs WHERE ref_kind = ?1 AND ref_id = ?2
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
              p.is_small_text, p.font_family, p.show_outline, c.blocks_json,
              p.created_at, p.updated_at
              FROM zhixi_pages p
              JOIN zhixi_page_contents c ON c.page_id = p.id
              ORDER BY p.position ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let blocks_json: String = row.get(9)?;
            Ok(PageRecord {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                title: row.get(2)?,
                icon: row.get(3)?,
                cover: row.get(4)?,
                is_full_width: option_i64_to_bool(row.get(5)?),
                is_small_text: option_i64_to_bool(row.get(6)?),
                font_family: row.get(7)?,
                show_outline: option_i64_to_bool(row.get(8)?),
                blocks: serde_json::from_str(&blocks_json).unwrap_or_default(),
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
              FROM zhixi_boards b
              JOIN zhixi_board_snapshots s ON s.board_id = b.id
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
              FROM zhixi_data_tables
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
              FROM zhixi_mindmaps m
              JOIN zhixi_mindmap_snapshots s ON s.mindmap_id = m.id
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

    fn descendant_page_ids(&self, page_id: &str) -> StorageResult<Vec<String>> {
        let mut statement = self.connection.prepare(
            "WITH RECURSIVE branch(id) AS (
              SELECT id FROM zhixi_pages WHERE id = ?1
              UNION ALL
              SELECT zhixi_pages.id FROM zhixi_pages JOIN branch ON zhixi_pages.parent_id = branch.id
            )
            SELECT id FROM branch",
        )?;
        let rows = statement.query_map([page_id], |row| row.get(0))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    fn page_position(&self, page_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhixi_pages", page_id)
    }

    fn board_position(&self, board_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhixi_boards", board_id)
    }

    fn data_table_position(&self, data_table_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhixi_data_tables", data_table_id)
    }

    fn mindmap_position(&self, mindmap_id: &str) -> StorageResult<Option<usize>> {
        self.position_for_id("zhixi_mindmaps", mindmap_id)
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
            validate_json_ref(block, "assetId", &asset_ids, "asset")?;
        }
    }
    validate_page_package_tree_connected(manifest)?;

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

#[allow(dead_code)]
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

fn option_bool_to_i64(value: Option<bool>) -> Option<i64> {
    value.map(|flag| if flag { 1 } else { 0 })
}

fn option_i64_to_bool(value: Option<i64>) -> Option<bool> {
    value.map(|flag| flag != 0)
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
    std::env::temp_dir().join(format!("zhixi-storage-test-{}-{nanos}", std::process::id()))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn uses_zhixi_storage_file_and_asset_names() {
        assert_eq!(DATABASE_FILE_NAME, "zhixi.db");
        assert_eq!(ASSETS_DIR_NAME, "zhixi-assets");
    }

    #[test]
    fn uses_zhixi_prefix_for_sqlite_schema_names() {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        let table_names = sqlite_object_names(&storage, "table");
        let custom_index_names = sqlite_object_names(&storage, "index")
            .into_iter()
            .filter(|name| !name.starts_with("sqlite_"))
            .collect::<Vec<_>>();

        assert!(table_names.iter().all(|name| name.starts_with("zhixi_")));
        assert!(custom_index_names
            .iter()
            .all(|name| name.starts_with("idx_zhixi_")));
        assert!(table_names.contains(&"zhixi_pages".to_string()));
        assert!(table_names.contains(&"zhixi_assets".to_string()));
        assert!(table_names.contains(&"zhixi_search_documents_fts".to_string()));
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
            pages: vec![PageRecord {
                id: "page_1".to_string(),
                parent_id: None,
                title: "Home".to_string(),
                icon: Some("N".to_string()),
                cover: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: vec![
                    json!({ "id": "block_1", "type": "paragraph", "text": "Hello storage engine" }),
                    json!({ "id": "block_2", "type": "whiteboard", "boardId": "board_1" }),
                    json!({ "id": "block_3", "type": "data_table", "databaseId": "database_1" }),
                    json!({ "id": "block_4", "type": "mindmap", "mindmapId": "mindmap_1" }),
                ],
                created_at: "2026-06-30T00:00:00.000Z".to_string(),
                updated_at: "2026-06-30T00:00:00.000Z".to_string(),
            }],
            settings: WorkspaceSettings {
                last_opened_page_id: Some("page_1".to_string()),
            },
        }
    }

    fn rewrite_page_package_manifest(
        archive: Vec<u8>,
        rewrite: impl FnOnce(&mut PagePackageManifest),
    ) -> Vec<u8> {
        let mut source_archive =
            zip::ZipArchive::new(Cursor::new(archive)).expect("read source archive");
        let mut manifest: PagePackageManifest = {
            let mut manifest_entry = source_archive
                .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
                .expect("page package manifest");
            serde_json::from_reader(&mut manifest_entry).expect("parse manifest")
        };
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

        assert_eq!(storage.schema_version().expect("schema version"), 1);
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
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
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
                "SELECT COUNT(*) FROM zhixi_asset_refs
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
                "SELECT COUNT(*) FROM zhixi_asset_refs
                  WHERE asset_id = ?1 AND owner_kind = 'page' AND owner_id = 'page_1'",
                [&asset.id],
                |row| row.get(0),
            )
            .expect("asset ref count");

        assert_eq!(ref_count, 1);
        assert_eq!(storage.cleanup_orphan_assets().expect("cleanup"), 0);
    }

    #[test]
    fn workspace_archive_round_trips_assets_and_snapshot() {
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
        source
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");

        let archive = source
            .export_workspace_archive()
            .expect("export workspace archive");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .import_workspace_archive(archive)
            .expect("import workspace archive");

        assert_eq!(
            target.export_workspace_backup().expect("export imported"),
            snapshot
        );
        assert_eq!(
            target.read_asset(&asset.id).expect("read imported"),
            b"image"
        );
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
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
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
            .export_page_package("page_nested")
            .expect("export nested package");
        let mut archive = zip::ZipArchive::new(Cursor::new(archive)).expect("read archive");
        let manifest: PagePackageManifest = {
            let mut manifest_entry = archive
                .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
                .expect("page package manifest");
            serde_json::from_reader(&mut manifest_entry).expect("parse manifest")
        };
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
        let cursor = Cursor::new(archive);
        let mut archive = zip::ZipArchive::new(cursor).expect("read archive");
        let manifest: PagePackageManifest = {
            let mut manifest_entry = archive
                .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
                .expect("page package manifest");
            serde_json::from_reader(&mut manifest_entry).expect("parse manifest")
        };

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
        let imported_table_block_asset_id = imported_data_table
            .snapshot
            .pointer("/blocks/table_block_image/imageAssetId")
            .and_then(Value::as_str)
            .expect("imported table block asset id");

        assert_ne!(imported_board_id, "board_1");
        assert_ne!(imported_database_id, "database_1");
        assert_ne!(imported_mindmap_id, "mindmap_1");
        assert_ne!(imported_page_asset_id, page_legacy_asset_id);
        assert_ne!(imported_table_asset_id, table_legacy_asset_id);
        assert_eq!(imported_table_block_asset_id, imported_table_asset_id);
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
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
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
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
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
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
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
                    kind: "zhixi.other".to_string(),
                    version: PAGE_PACKAGE_VERSION,
                    root_page_id: "page_1".to_string(),
                    pages: sample_snapshot().pages,
                    boards: Vec::new(),
                    data_tables: Vec::new(),
                    mindmaps: Vec::new(),
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
        let mut archive = zip::ZipArchive::new(Cursor::new(archive)).expect("read archive");
        let manifest: PagePackageManifest = {
            let mut manifest_entry = archive
                .by_name(PAGE_PACKAGE_MANIFEST_ENTRY)
                .expect("page package manifest");
            serde_json::from_reader(&mut manifest_entry).expect("parse manifest")
        };
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

        assert_eq!(error.code, "not_found");
        assert_eq!(
            target.export_workspace_backup().expect("snapshot after"),
            before
        );
    }

    #[test]
    fn workspace_archive_skips_replaced_media_assets_without_refs() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let old_asset = source
            .write_asset(WriteAssetInput {
                name: "old.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"old image".to_vec(),
            })
            .expect("write old asset");
        let new_asset = source
            .write_asset(WriteAssetInput {
                name: "new.png".to_string(),
                mime_type: "image/png".to_string(),
                bytes: b"new image".to_vec(),
            })
            .expect("write new asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": old_asset.id,
            "name": "old.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "old"
        }));
        source
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");
        snapshot.pages[0].blocks.pop();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_image",
            "type": "image",
            "assetId": new_asset.id,
            "name": "new.png",
            "mimeType": "image/png",
            "caption": "",
            "alt": "new"
        }));
        source
            .save_page(snapshot.pages[0].clone())
            .expect("save page after media replacement");

        let archive = source
            .export_workspace_archive()
            .expect("export workspace archive");
        let cursor = Cursor::new(archive);
        let mut archive = zip::ZipArchive::new(cursor).expect("read archive");
        let manifest: Vec<AssetMeta> = {
            let mut manifest_entry = archive
                .by_name("assets/manifest.json")
                .expect("asset manifest entry");
            serde_json::from_reader(&mut manifest_entry).expect("parse asset manifest")
        };
        let manifest_ids = manifest
            .iter()
            .map(|asset| asset.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(manifest_ids, vec![new_asset.id.as_str()]);
        assert!(archive
            .by_name(&format!("assets/{}", old_asset.relative_path))
            .is_err());
        let mut new_entry = archive
            .by_name(&format!("assets/{}", new_asset.relative_path))
            .expect("new asset entry");
        let mut new_bytes = Vec::new();
        new_entry
            .read_to_end(&mut new_bytes)
            .expect("read new asset entry");
        assert_eq!(new_bytes, b"new image");
    }

    #[test]
    fn workspace_archive_exports_directly_to_file_path() {
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
        source
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");
        let archive_path = unique_test_assets_dir().with_extension("zip");

        source
            .export_workspace_archive_to_path(&archive_path)
            .expect("export workspace archive to path");

        let target = Storage::open_in_memory_for_tests().expect("target opens");
        target
            .import_workspace_archive(std::fs::read(&archive_path).expect("read archive file"))
            .expect("import workspace archive");

        assert_eq!(
            target.export_workspace_backup().expect("export imported"),
            snapshot
        );
        assert_eq!(
            target.read_asset(&asset.id).expect("read imported"),
            b"image"
        );

        let _ = std::fs::remove_file(archive_path);
    }

    #[test]
    fn workspace_archive_reports_progress_when_exporting_to_file_path() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "voice.m4a".to_string(),
                mime_type: "audio/mp4".to_string(),
                bytes: b"audio bytes".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_audio",
            "type": "audio",
            "assetId": asset.id,
            "name": "voice.m4a",
            "mimeType": "audio/mp4",
            "caption": ""
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");
        let archive_path = unique_test_assets_dir().with_extension("zip");
        let mut progress_events = Vec::new();

        source
            .export_workspace_archive_to_path_with_progress(
                &archive_path,
                Some("task_export"),
                &mut |event| progress_events.push(event),
            )
            .expect("export workspace archive to path");

        assert!(progress_events.iter().any(|event| {
            event.task_id == "task_export"
                && event.operation == WorkspaceArchiveOperation::Export
                && event.phase == WorkspaceArchiveProgressPhase::ProcessingAsset
                && event.item_name.as_deref() == Some("voice.m4a")
                && event.bytes_total == b"audio bytes".len() as u64
        }));
        assert!(progress_events.iter().any(|event| {
            event.phase == WorkspaceArchiveProgressPhase::Complete
                && event.bytes_processed == event.bytes_total
        }));

        let _ = std::fs::remove_file(archive_path);
    }

    #[test]
    fn workspace_archive_imports_from_file_path_with_progress() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "recording.wav".to_string(),
                mime_type: "audio/wav".to_string(),
                bytes: b"wave bytes".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_audio",
            "type": "audio",
            "assetId": asset.id,
            "name": "recording.wav",
            "mimeType": "audio/wav",
            "caption": ""
        }));
        source
            .replace_workspace_backup(snapshot.clone())
            .expect("replace snapshot");
        let archive_path = unique_test_assets_dir().with_extension("zip");
        source
            .export_workspace_archive_to_path(&archive_path)
            .expect("export workspace archive to path");
        let target = Storage::open_in_memory_for_tests().expect("target opens");
        let mut progress_events = Vec::new();

        target
            .import_workspace_archive_from_path_with_progress(
                &archive_path,
                Some("task_import"),
                &mut |event| progress_events.push(event),
            )
            .expect("import workspace archive from path");

        assert_eq!(
            target.export_workspace_backup().expect("export imported"),
            snapshot
        );
        assert_eq!(
            target.read_asset(&asset.id).expect("read imported"),
            b"wave bytes"
        );
        assert!(progress_events.iter().any(|event| {
            event.task_id == "task_import"
                && event.operation == WorkspaceArchiveOperation::Import
                && event.phase == WorkspaceArchiveProgressPhase::ProcessingAsset
                && event.item_name.as_deref() == Some("recording.wav")
                && event.bytes_total == b"wave bytes".len() as u64
        }));
        assert!(progress_events.iter().any(|event| {
            event.phase == WorkspaceArchiveProgressPhase::Complete
                && event.bytes_processed == event.bytes_total
        }));

        let _ = std::fs::remove_file(archive_path);
    }

    #[test]
    fn workspace_archive_stores_media_assets_without_recompressing_them() {
        let source = Storage::open_in_memory_for_tests().expect("source opens");
        let asset = source
            .write_asset(WriteAssetInput {
                name: "voice.m4a".to_string(),
                mime_type: "audio/mp4".to_string(),
                bytes: b"audio bytes".to_vec(),
            })
            .expect("write asset");
        let mut snapshot = sample_snapshot();
        snapshot.pages[0].blocks.push(json!({
            "id": "block_audio",
            "type": "audio",
            "assetId": asset.id,
            "name": "voice.m4a",
            "mimeType": "audio/mp4",
            "caption": ""
        }));
        source
            .replace_workspace_backup(snapshot)
            .expect("replace snapshot");

        let archive = source
            .export_workspace_archive()
            .expect("export workspace archive");
        let cursor = Cursor::new(archive);
        let mut archive = zip::ZipArchive::new(cursor).expect("read archive");
        let asset_entry = archive
            .by_name(&format!("assets/{}", asset.relative_path))
            .expect("asset entry");

        assert_eq!(asset_entry.compression(), zip::CompressionMethod::Stored);
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
                "INSERT INTO zhixi_assets
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
}
