use rusqlite::Connection;

use super::error::StorageResult;

pub const SCHEMA_VERSION: i64 = 1;

pub fn initialize_schema(connection: &Connection) -> StorageResult<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "busy_timeout", 5_000)?;
    let journal_mode: String =
        connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;

    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS zhixi_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_settings (
          id TEXT PRIMARY KEY NOT NULL,
          record_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_pages (
          id TEXT PRIMARY KEY NOT NULL,
          parent_id TEXT REFERENCES zhixi_pages(id) ON DELETE CASCADE,
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

        CREATE INDEX IF NOT EXISTS idx_zhixi_pages_parent_position
          ON zhixi_pages(parent_id, position);

        CREATE TABLE IF NOT EXISTS zhixi_page_contents (
          page_id TEXT PRIMARY KEY NOT NULL REFERENCES zhixi_pages(id) ON DELETE CASCADE,
          blocks_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_block_refs (
          page_id TEXT NOT NULL REFERENCES zhixi_pages(id) ON DELETE CASCADE,
          block_id TEXT NOT NULL,
          ref_kind TEXT NOT NULL,
          ref_id TEXT NOT NULL,
          PRIMARY KEY (page_id, block_id, ref_kind, ref_id)
        );

        CREATE INDEX IF NOT EXISTS idx_zhixi_block_refs_ref
          ON zhixi_block_refs(ref_kind, ref_id);

        CREATE TABLE IF NOT EXISTS zhixi_boards (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_board_snapshots (
          board_id TEXT PRIMARY KEY NOT NULL REFERENCES zhixi_boards(id) ON DELETE CASCADE,
          snapshot_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_mindmaps (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_mindmap_snapshots (
          mindmap_id TEXT PRIMARY KEY NOT NULL REFERENCES zhixi_mindmaps(id) ON DELETE CASCADE,
          snapshot_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_tables (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          icon TEXT,
          cover TEXT,
          position INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_table_properties (
          data_table_id TEXT NOT NULL REFERENCES zhixi_data_tables(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          record_json TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (data_table_id, id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_table_views (
          data_table_id TEXT NOT NULL REFERENCES zhixi_data_tables(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          record_json TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (data_table_id, id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_table_records (
          data_table_id TEXT NOT NULL REFERENCES zhixi_data_tables(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          title TEXT NOT NULL,
          record_json TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_at TEXT,
          updated_at TEXT,
          PRIMARY KEY (data_table_id, id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_table_record_pages (
          data_table_id TEXT NOT NULL REFERENCES zhixi_data_tables(id) ON DELETE CASCADE,
          record_id TEXT NOT NULL,
          record_json TEXT NOT NULL,
          PRIMARY KEY (data_table_id, record_id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_data_table_blocks (
          data_table_id TEXT NOT NULL REFERENCES zhixi_data_tables(id) ON DELETE CASCADE,
          id TEXT NOT NULL,
          record_id TEXT,
          record_json TEXT NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (data_table_id, id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_assets (
          id TEXT PRIMARY KEY NOT NULL,
          sha256 TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS zhixi_asset_refs (
          asset_id TEXT NOT NULL REFERENCES zhixi_assets(id) ON DELETE CASCADE,
          owner_kind TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          PRIMARY KEY (asset_id, owner_kind, owner_id)
        );

        CREATE TABLE IF NOT EXISTS zhixi_search_documents (
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

        CREATE VIRTUAL TABLE IF NOT EXISTS zhixi_search_documents_fts USING fts5(
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
    )?;

    connection.execute(
        "INSERT INTO zhixi_meta (key, value) VALUES ('schema_version', ?1)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [SCHEMA_VERSION.to_string()],
    )?;

    if journal_mode != "wal" && journal_mode != "memory" {
        connection.pragma_update(None, "journal_mode", journal_mode)?;
    }

    Ok(())
}
