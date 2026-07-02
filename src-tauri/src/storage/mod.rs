mod assets;
pub mod commands;
mod error;
mod models;
mod schema;
mod search;

use std::{
    fs,
    io::{self, BufWriter, Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

#[cfg(test)]
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

pub use error::{StorageError, StorageResult};
pub use models::{
    AssetMeta, BoardRecord, BootstrapPayload, DataTableRecord, DeleteResult, ImportAssetFileInput,
    LoadedPage, MindmapRecord, PageMeta, PageRecord, SaveResult, SearchResult, WorkspaceSettings,
    WorkspaceSnapshot, WriteAssetInput,
};

const DATABASE_FILE_NAME: &str = "zhixi.db";
const ASSETS_DIR_NAME: &str = "zhixi-assets";
const SETTINGS_ID: &str = "workspace";

pub struct StorageState {
    storage: Mutex<Storage>,
}

impl StorageState {
    pub fn open(data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        Ok(Self {
            storage: Mutex::new(Storage::open(data_dir)?),
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
        self.write_workspace_archive(Cursor::new(Vec::new()))
            .map(|cursor| cursor.into_inner())
    }

    pub fn export_workspace_archive_to_path(&self, path: impl AsRef<Path>) -> StorageResult<()> {
        let file = fs::File::create(path)?;
        let writer = BufWriter::new(file);
        let mut writer = self.write_workspace_archive(writer)?;
        writer.flush()?;
        Ok(())
    }

    fn write_workspace_archive<W: Write + Seek>(&self, writer: W) -> StorageResult<W> {
        let snapshot = self.export_workspace_backup()?;
        let assets = assets::load_assets(&self.connection)?;
        let mut archive = zip::ZipWriter::new(writer);
        let metadata_options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        archive
            .start_file("workspace.json", metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &snapshot)?;

        archive
            .start_file("assets/manifest.json", metadata_options)
            .map_err(zip_error)?;
        serde_json::to_writer_pretty(&mut archive, &assets)?;

        for asset in assets {
            let path = assets::asset_file_path(&self.connection, &self.assets_dir, &asset.id)?;
            let mut asset_file = fs::File::open(path)?;
            archive
                .start_file(
                    format!("assets/{}", asset.relative_path),
                    archive_options_for_asset(&asset),
                )
                .map_err(zip_error)?;
            io::copy(&mut asset_file, &mut archive)?;
        }

        archive.finish().map_err(zip_error)
    }

    pub fn import_workspace_archive(&self, bytes: Vec<u8>) -> StorageResult<()> {
        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(zip_error)?;
        let workspace_json = {
            let mut workspace_file = archive.by_name("workspace.json").map_err(zip_error)?;
            let mut json = String::new();
            workspace_file.read_to_string(&mut json)?;
            json
        };
        let snapshot: WorkspaceSnapshot = serde_json::from_str(&workspace_json)?;
        let assets_json = {
            match archive.by_name("assets/manifest.json") {
                Ok(mut manifest_file) => {
                    let mut json = String::new();
                    manifest_file.read_to_string(&mut json)?;
                    json
                }
                Err(zip::result::ZipError::FileNotFound) => "[]".to_string(),
                Err(error) => return Err(zip_error(error)),
            }
        };
        let archive_assets: Vec<AssetMeta> = serde_json::from_str(&assets_json)?;

        for asset in archive_assets {
            let archive_path = format!("assets/{}", asset.relative_path);
            let mut asset_file = match archive.by_name(&archive_path) {
                Ok(file) => file,
                Err(zip::result::ZipError::FileNotFound) => continue,
                Err(error) => return Err(zip_error(error)),
            };
            let mut asset_bytes = Vec::new();
            asset_file.read_to_end(&mut asset_bytes)?;
            self.write_asset(WriteAssetInput {
                name: asset.name,
                mime_type: asset.mime_type,
                bytes: asset_bytes,
            })?;
        }

        self.replace_workspace_backup(snapshot)
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
