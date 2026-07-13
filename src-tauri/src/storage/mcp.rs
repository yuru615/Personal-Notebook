use std::collections::HashSet;

use serde_json::Value;

use super::{
    BoardRecord, DataTableRecord, MindmapRecord, Storage, StorageError, StorageResult,
};

pub struct McpWriteBatch {
    pub page_id: String,
    pub blocks: Vec<Value>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    pub updated_at: String,
    pub client_name: String,
    pub tool_name: String,
}

pub struct McpWriteResult {
    pub page_id: String,
    pub created_block_ids: Vec<String>,
    pub created_object_ids: Vec<String>,
}

impl Storage {
    pub fn append_mcp_content(&self, batch: McpWriteBatch) -> StorageResult<McpWriteResult> {
        if batch.blocks.is_empty() {
            return Err(StorageError::invalid_payload(
                "MCP content batch requires at least one block",
            ));
        }
        let created_block_ids = collect_block_ids(&batch.blocks)?;
        let created_object_ids = collect_resource_ids(&batch)?;
        let audit_id = format!(
            "mcp_audit_{}",
            created_block_ids
                .first()
                .expect("validated MCP batch has a block id")
        );
        let McpWriteBatch {
            page_id,
            blocks,
            boards,
            data_tables,
            mindmaps,
            updated_at,
            client_name,
            tool_name,
        } = batch;

        self.with_transaction(|| {
            let mut page = self.load_page_record(&page_id)?;
            self.ensure_new_resources(&boards, &data_tables, &mindmaps)?;

            let mut board_position = self.next_position("zhiqi_boards");
            for board in &boards {
                self.insert_board(board, board_position)?;
                board_position += 1;
            }
            let mut data_table_position = self.next_position("zhiqi_data_tables");
            for data_table in &data_tables {
                self.insert_data_table(data_table, data_table_position)?;
                data_table_position += 1;
            }
            let mut mindmap_position = self.next_position("zhiqi_mindmaps");
            for mindmap in &mindmaps {
                self.insert_mindmap(mindmap, mindmap_position)?;
                mindmap_position += 1;
            }

            page.blocks.extend(blocks);
            page.updated_at = updated_at.clone();
            let page_position = self
                .page_position(&page.id)?
                .ok_or_else(|| StorageError::not_found("page not found"))?;
            self.insert_page(&page, page_position)?;
            self.rebuild_resource_search_documents()?;

            let mut audit_ids = created_block_ids.clone();
            audit_ids.extend(created_object_ids.iter().cloned());
            self.connection.execute(
                "INSERT INTO zhiqi_mcp_audit_log (id, created_at, client_name, tool_name, page_id, created_ids_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    audit_id,
                    updated_at,
                    client_name,
                    tool_name,
                    page_id,
                    serde_json::to_string(&audit_ids)?,
                ],
            )?;

            Ok(McpWriteResult {
                page_id: page.id,
                created_block_ids,
                created_object_ids,
            })
        })
    }

    fn ensure_new_resources(
        &self,
        boards: &[BoardRecord],
        data_tables: &[DataTableRecord],
        mindmaps: &[MindmapRecord],
    ) -> StorageResult<()> {
        for board in boards {
            if self.board_position(&board.id)?.is_some() {
                return Err(StorageError::new(
                    "conflict",
                    format!("MCP board id already exists: {}", board.id),
                ));
            }
        }
        for data_table in data_tables {
            if self.data_table_position(&data_table.id)?.is_some() {
                return Err(StorageError::new(
                    "conflict",
                    format!("MCP data table id already exists: {}", data_table.id),
                ));
            }
        }
        for mindmap in mindmaps {
            if self.mindmap_position(&mindmap.id)?.is_some() {
                return Err(StorageError::new(
                    "conflict",
                    format!("MCP mindmap id already exists: {}", mindmap.id),
                ));
            }
        }
        Ok(())
    }
}

fn collect_block_ids(blocks: &[Value]) -> StorageResult<Vec<String>> {
    let mut ids = HashSet::new();
    let mut collected = Vec::with_capacity(blocks.len());
    for block in blocks {
        let id = block
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| StorageError::invalid_payload("MCP block is missing a non-empty id"))?
            .to_string();
        if !ids.insert(id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate MCP block id: {id}"
            )));
        }
        collected.push(id);
    }
    Ok(collected)
}

fn collect_resource_ids(batch: &McpWriteBatch) -> StorageResult<Vec<String>> {
    let mut ids = HashSet::new();
    let mut collected = Vec::new();
    for id in batch
        .boards
        .iter()
        .map(|record| &record.id)
        .chain(batch.data_tables.iter().map(|record| &record.id))
        .chain(batch.mindmaps.iter().map(|record| &record.id))
    {
        if id.trim().is_empty() {
            return Err(StorageError::invalid_payload(
                "MCP resource is missing a non-empty id",
            ));
        }
        if !ids.insert(id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate MCP resource id: {id}"
            )));
        }
        collected.push(id.clone());
    }
    Ok(collected)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::McpWriteBatch;
    use crate::storage::{BoardRecord, DataTableRecord, MindmapRecord, PageRecord, Storage};

    const NOW: &str = "2026-07-12T00:00:00.000Z";

    fn seed_storage() -> Storage {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .save_page(PageRecord {
                id: "page_mcp_target".to_string(),
                parent_id: None,
                title: "Target".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                blocks: Vec::new(),
                created_at: NOW.to_string(),
                updated_at: NOW.to_string(),
            })
            .expect("seed page");
        storage
    }

    fn complete_batch() -> McpWriteBatch {
        McpWriteBatch {
            page_id: "page_mcp_target".to_string(),
            blocks: vec![
                json!({ "id": "block_mcp_text", "type": "paragraph", "text": "MCP" }),
                json!({ "id": "block_mcp_board", "type": "whiteboard", "boardId": "board_mcp" }),
                json!({ "id": "block_mcp_table", "type": "data_table", "databaseId": "table_mcp" }),
                json!({ "id": "block_mcp_map", "type": "mindmap", "mindmapId": "map_mcp" }),
            ],
            boards: vec![BoardRecord {
                id: "board_mcp".to_string(),
                title: "Board".to_string(),
                snapshot: json!({ "shapes": [], "connections": [] }),
                created_at: NOW.to_string(),
                updated_at: NOW.to_string(),
            }],
            data_tables: vec![DataTableRecord {
                id: "table_mcp".to_string(),
                title: "Table".to_string(),
                icon: None,
                cover: None,
                snapshot: json!({
                    "version": 1,
                    "database": { "propertyOrder": [], "viewOrder": [], "views": {} },
                    "properties": {}, "records": {}, "recordPages": {}, "blocks": {}, "assets": {}
                }),
                created_at: NOW.to_string(),
                updated_at: NOW.to_string(),
            }],
            mindmaps: vec![MindmapRecord {
                id: "map_mcp".to_string(),
                title: "Map".to_string(),
                snapshot: json!({ "id": "doc-root", "rootId": "root", "nodes": {} }),
                created_at: NOW.to_string(),
                updated_at: NOW.to_string(),
            }],
            updated_at: NOW.to_string(),
            client_name: "test-client".to_string(),
            tool_name: "append_content".to_string(),
        }
    }

    #[test]
    fn appends_blocks_resources_search_refs_and_audit_in_one_transaction() {
        let storage = seed_storage();

        let result = storage.append_mcp_content(complete_batch()).expect("append batch");

        assert_eq!(result.page_id, "page_mcp_target");
        assert_eq!(result.created_block_ids.len(), 4);
        assert_eq!(result.created_object_ids, vec!["board_mcp", "table_mcp", "map_mcp"]);
        let page = storage.load_page_record("page_mcp_target").expect("load page");
        assert_eq!(page.blocks.len(), 4);
        assert_eq!(storage.block_ref_count().expect("refs"), 3);
        assert_eq!(storage.load_boards().expect("boards").len(), 1);
        assert_eq!(storage.load_data_tables().expect("tables").len(), 1);
        assert_eq!(storage.load_mindmaps().expect("mindmaps").len(), 1);
        let audit: String = storage
            .connection
            .query_row(
                "SELECT created_ids_json FROM zhiqi_mcp_audit_log WHERE page_id = ?1",
                ["page_mcp_target"],
                |row| row.get(0),
            )
            .expect("audit");
        assert_eq!(
            audit,
            r#"["block_mcp_text","block_mcp_board","block_mcp_table","block_mcp_map","board_mcp","table_mcp","map_mcp"]"#
        );
    }

    #[test]
    fn rolls_back_every_mutation_when_a_late_resource_insert_fails() {
        let storage = seed_storage();
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER fail_mcp_mindmap_insert
                   BEFORE INSERT ON zhiqi_mindmaps
                   BEGIN SELECT RAISE(FAIL, 'forced mindmap failure'); END;",
            )
            .expect("install trigger");

        assert!(storage.append_mcp_content(complete_batch()).is_err());

        assert!(storage.load_page_record("page_mcp_target").expect("page").blocks.is_empty());
        assert!(storage.load_boards().expect("boards").is_empty());
        assert!(storage.load_data_tables().expect("tables").is_empty());
        assert!(storage.load_mindmaps().expect("mindmaps").is_empty());
        let audit_count: i64 = storage
            .connection
            .query_row("SELECT COUNT(*) FROM zhiqi_mcp_audit_log", [], |row| row.get(0))
            .expect("audit count");
        assert_eq!(audit_count, 0);
    }
}
