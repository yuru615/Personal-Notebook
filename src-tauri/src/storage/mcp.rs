use std::collections::HashSet;

use serde_json::{json, Value};

use super::{
    BoardRecord, DataTableRecord, MindmapRecord, PageRecord, Storage, StorageError, StorageResult,
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

pub(crate) struct McpWriteResult {
    pub page_id: String,
    pub created_block_ids: Vec<String>,
    pub created_object_ids: Vec<String>,
}

pub struct McpWhiteboardUpdate {
    pub board_id: String,
    pub shapes: Vec<Value>,
    pub notes: Vec<Value>,
    pub texts: Vec<Value>,
    pub connections: Vec<Value>,
    pub strokes: Vec<Value>,
    pub erase_ids: Vec<String>,
    pub updated_at: String,
    pub audit_id: String,
}

#[derive(Debug)]
pub struct McpWhiteboardUpdateResult {
    pub board_id: String,
    pub added_node_ids: Vec<String>,
    pub added_edge_ids: Vec<String>,
    pub added_stroke_ids: Vec<String>,
    pub erased_ids: Vec<String>,
}

impl Storage {
    pub fn load_mcp_whiteboard(&self, board_id: &str) -> StorageResult<BoardRecord> {
        self.load_boards()?
            .into_iter()
            .find(|board| board.id == board_id)
            .ok_or_else(|| StorageError::not_found(format!("board not found: {board_id}")))
    }

    pub fn load_active_mcp_whiteboard(&self, board_id: &str) -> StorageResult<BoardRecord> {
        let board = self.load_mcp_whiteboard(board_id)?;
        self.page_id_for_ref("board", board_id)?.ok_or_else(|| {
            StorageError::not_found(format!("whiteboard is not attached to an active page: {board_id}"))
        })?;
        Ok(board)
    }

    pub fn create_mcp_page(
        &self,
        page: PageRecord,
        parent_block_id: Option<String>,
    ) -> StorageResult<()> {
        let Some(parent_id) = page.parent_id.clone() else {
            if parent_block_id.is_some() {
                return Err(StorageError::invalid_payload(
                    "top-level MCP page cannot include a parent block id",
                ));
            }
            return self.with_transaction(|| {
                let position = self
                    .page_position(&page.id)?
                    .unwrap_or_else(|| self.next_position("zhiqi_pages"));
                self.insert_page(&page, position)?;
                self.rebuild_resource_search_documents()?;
                self.advance_mcp_revision()
            });
        };
        let parent_block_id = parent_block_id
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| {
                StorageError::invalid_payload("MCP child page requires a parent block id")
            })?;

        self.with_transaction(|| {
            let mut parent = self.load_active_page_record(&parent_id)?;
            if self.page_position(&page.id)?.is_some() {
                return Err(StorageError::new(
                    "conflict",
                    format!("MCP page id already exists: {}", page.id),
                ));
            }

            let child_position = self.next_position("zhiqi_pages");
            let parent_position = self
                .page_position(&parent.id)?
                .ok_or_else(|| StorageError::not_found("parent page not found"))?;
            parent.blocks.push(json!({
                "id": parent_block_id,
                "type": "child_page",
                "pageId": page.id,
            }));
            parent.updated_at = page.updated_at.clone();

            self.insert_page(&page, child_position)?;
            self.insert_page(&parent, parent_position)?;
            self.rebuild_resource_search_documents()?;
            self.advance_mcp_revision()
        })
    }

    pub(crate) fn append_mcp_content(&self, batch: McpWriteBatch) -> StorageResult<McpWriteResult> {
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
            let mut page = self.load_active_page_record(&page_id)?;
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

            self.advance_mcp_revision()?;

            Ok(McpWriteResult {
                page_id: page.id,
                created_block_ids,
                created_object_ids,
            })
        })
    }

    pub fn update_mcp_whiteboard(
        &self,
        update: McpWhiteboardUpdate,
    ) -> StorageResult<McpWhiteboardUpdateResult> {
        let McpWhiteboardUpdate {
            board_id,
            shapes,
            notes,
            texts,
            connections: new_connections,
            strokes,
            erase_ids,
            updated_at,
            audit_id,
        } = update;
        let added_node_ids = collect_value_ids(
            shapes.iter().chain(notes.iter()).chain(texts.iter()),
            "whiteboard node",
        )?;
        let added_edge_ids = collect_value_ids(new_connections.iter(), "whiteboard edge")?;
        let added_stroke_ids = collect_value_ids(strokes.iter(), "whiteboard stroke")?;
        let erase_ids = collect_string_ids(erase_ids, "whiteboard erase")?;

        if added_node_ids.is_empty()
            && added_edge_ids.is_empty()
            && added_stroke_ids.is_empty()
            && erase_ids.is_empty()
        {
            return Err(StorageError::invalid_payload(
                "whiteboard update requires additions or erase ids",
            ));
        }

        let erase_set = erase_ids.iter().cloned().collect::<HashSet<_>>();
        if added_node_ids
            .iter()
            .chain(added_edge_ids.iter())
            .chain(added_stroke_ids.iter())
            .any(|id| erase_set.contains(id))
        {
            return Err(StorageError::invalid_payload(
                "whiteboard update cannot add and erase the same id",
            ));
        }

        self.with_transaction(|| {
            let mut board = self.load_mcp_whiteboard(&board_id)?;
            let page_id = self
                .page_id_for_ref("board", &board.id)?
                .ok_or_else(|| StorageError::not_found("whiteboard is not attached to a page"))?;
            let snapshot = board.snapshot.as_object_mut().ok_or_else(|| {
                StorageError::invalid_payload("whiteboard snapshot must be an object")
            })?;
            let erasable_ids = whiteboard_element_ids(
                snapshot,
                &["shapes", "notes", "texts", "connections", "strokes"],
            )?;
            if let Some(id) = erase_ids.iter().find(|id| !erasable_ids.contains(*id)) {
                return Err(StorageError::invalid_payload(format!(
                    "whiteboard erase id was not found: {id}"
                )));
            }
            let mut erased_ids = Vec::new();
            let mut removed_node_ids = HashSet::new();

            for key in ["shapes", "notes", "texts"] {
                let values = whiteboard_collection_mut(snapshot, key)?;
                remove_whiteboard_elements(values, &erase_set, &mut erased_ids, Some(&mut removed_node_ids));
            }
            remove_whiteboard_elements(
                whiteboard_collection_mut(snapshot, "strokes")?,
                &erase_set,
                &mut erased_ids,
                None,
            );
            {
                let connections = whiteboard_collection_mut(snapshot, "connections")?;
                connections.retain(|connection| {
                    let id = connection.get("id").and_then(Value::as_str);
                    let from = connection.get("from").and_then(Value::as_str);
                    let to = connection.get("to").and_then(Value::as_str);
                    let removed = id.is_some_and(|id| erase_set.contains(id))
                        || from.is_some_and(|id| removed_node_ids.contains(id))
                        || to.is_some_and(|id| removed_node_ids.contains(id));
                    if removed {
                        if let Some(id) = id {
                            erased_ids.push(id.to_string());
                        }
                    }
                    !removed
                });
            }

            let added_ids = collect_string_ids(
                added_node_ids
                    .iter()
                    .chain(added_edge_ids.iter())
                    .chain(added_stroke_ids.iter())
                    .cloned()
                    .collect(),
                "whiteboard element",
            )?;
            let remaining_ids = whiteboard_element_ids(
                snapshot,
                &["shapes", "notes", "texts", "images", "connections", "strokes"],
            )?;
            if let Some(id) = added_ids.iter().find(|id| remaining_ids.contains(*id)) {
                return Err(StorageError::new(
                    "conflict",
                    format!("whiteboard element id already exists: {id}"),
                ));
            }

            whiteboard_collection_mut(snapshot, "shapes")?.extend(shapes);
            whiteboard_collection_mut(snapshot, "notes")?.extend(notes);
            whiteboard_collection_mut(snapshot, "texts")?.extend(texts);
            whiteboard_collection_mut(snapshot, "connections")?.extend(new_connections);
            whiteboard_collection_mut(snapshot, "strokes")?.extend(strokes);

            board.updated_at = updated_at.clone();
            let position = self
                .board_position(&board.id)?
                .ok_or_else(|| StorageError::not_found("board not found"))?;
            self.insert_board(&board, position)?;
            self.rebuild_resource_search_documents()?;

            let mut audit_ids = vec![board.id.clone()];
            audit_ids.extend(added_node_ids.iter().cloned());
            audit_ids.extend(added_edge_ids.iter().cloned());
            audit_ids.extend(added_stroke_ids.iter().cloned());
            audit_ids.extend(erased_ids.iter().cloned());
            self.connection.execute(
                "INSERT INTO zhiqi_mcp_audit_log (id, created_at, client_name, tool_name, page_id, created_ids_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    audit_id,
                    updated_at,
                    "local-mcp",
                    "update_whiteboard",
                    page_id,
                    serde_json::to_string(&audit_ids)?,
                ],
            )?;

            self.advance_mcp_revision()?;

            Ok(McpWhiteboardUpdateResult {
                board_id,
                added_node_ids,
                added_edge_ids,
                added_stroke_ids,
                erased_ids,
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

fn collect_value_ids<'a>(
    values: impl Iterator<Item = &'a Value>,
    label: &str,
) -> StorageResult<Vec<String>> {
    let mut ids = HashSet::new();
    let mut collected = Vec::new();
    for value in values {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| {
                StorageError::invalid_payload(format!("{label} is missing a non-empty id"))
            })?
            .to_string();
        if !ids.insert(id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate {label} id: {id}"
            )));
        }
        collected.push(id);
    }
    Ok(collected)
}

fn collect_string_ids(values: Vec<String>, label: &str) -> StorageResult<Vec<String>> {
    let mut ids = HashSet::new();
    let mut collected = Vec::new();
    for value in values {
        let id = value.trim();
        if id.is_empty() {
            return Err(StorageError::invalid_payload(format!(
                "{label} id cannot be empty"
            )));
        }
        if !ids.insert(id.to_string()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate {label} id: {id}"
            )));
        }
        collected.push(id.to_string());
    }
    Ok(collected)
}

fn whiteboard_collection_mut<'a>(
    snapshot: &'a mut serde_json::Map<String, Value>,
    key: &str,
) -> StorageResult<&'a mut Vec<Value>> {
    let value = snapshot.entry(key.to_string()).or_insert_with(|| json!([]));
    value.as_array_mut().ok_or_else(|| {
        StorageError::invalid_payload(format!("whiteboard snapshot {key} must be an array"))
    })
}

fn remove_whiteboard_elements(
    values: &mut Vec<Value>,
    erase_ids: &HashSet<String>,
    erased_ids: &mut Vec<String>,
    removed_node_ids: Option<&mut HashSet<String>>,
) {
    let mut removed_node_ids = removed_node_ids;
    values.retain(|value| {
        let id = value.get("id").and_then(Value::as_str);
        let removed = id.is_some_and(|id| erase_ids.contains(id));
        if removed {
            if let Some(id) = id {
                erased_ids.push(id.to_string());
                if let Some(node_ids) = removed_node_ids.as_deref_mut() {
                    node_ids.insert(id.to_string());
                }
            }
        }
        !removed
    });
}

fn whiteboard_element_ids(
    snapshot: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> StorageResult<HashSet<String>> {
    let mut ids = HashSet::new();
    for key in keys {
        let Some(value) = snapshot.get(*key) else {
            continue;
        };
        let values = value.as_array().ok_or_else(|| {
            StorageError::invalid_payload(format!("whiteboard snapshot {key} must be an array"))
        })?;
        for value in values {
            let id = value
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| {
                    StorageError::invalid_payload(format!(
                        "whiteboard snapshot {key} has an invalid id"
                    ))
                })?;
            if !ids.insert(id.to_string()) {
                return Err(StorageError::invalid_payload(format!(
                    "duplicate whiteboard element id: {id}"
                )));
            }
        }
    }
    Ok(ids)
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

    use super::{McpWhiteboardUpdate, McpWriteBatch};
    use crate::storage::{BoardRecord, DataTableRecord, MindmapRecord, PageRecord, Storage};

    const NOW: &str = "2026-07-12T00:00:00.000Z";

    fn seed_storage() -> Storage {
        let storage = Storage::open_in_memory_for_tests().expect("storage opens");
        storage
            .save_page(PageRecord {
                id: "page_mcp_target".to_string(),
                parent_id: None,
                deleted_at: None,
                deleted_root_id: None,
                title: "Target".to_string(),
                icon: None,
                cover: None,
                properties: None,
                is_full_width: None,
                is_small_text: None,
                font_family: None,
                show_outline: None,
                show_properties: None,
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
                snapshot: json!({
                    "shapes": [{ "id": "entry", "type": "ellipse" }],
                    "notes": [], "texts": [], "strokes": [],
                    "connections": [{ "id": "entry-service", "from": "entry", "to": "service" }]
                }),
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

        let result = storage
            .append_mcp_content(complete_batch())
            .expect("append batch");

        assert_eq!(result.page_id, "page_mcp_target");
        assert_eq!(result.created_block_ids.len(), 4);
        assert_eq!(
            result.created_object_ids,
            vec!["board_mcp", "table_mcp", "map_mcp"]
        );
        let page = storage
            .load_page_record("page_mcp_target")
            .expect("load page");
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
    fn rejects_mcp_reads_writes_and_whiteboards_for_recycled_pages() {
        let storage = seed_storage();
        storage
            .append_mcp_content(complete_batch())
            .expect("seed resources");

        let mut page = storage
            .load_page_record("page_mcp_target")
            .expect("load target page");
        page.deleted_at = Some("2026-07-16T00:00:00.000Z".to_string());
        page.deleted_root_id = Some("page_mcp_target".to_string());
        storage.save_page(page).expect("move page to recycle bin");

        assert!(storage.load_page("page_mcp_target").is_err());
        assert!(storage.load_active_mcp_whiteboard("board_mcp").is_err());
        assert!(storage
            .append_mcp_content(McpWriteBatch {
                page_id: "page_mcp_target".to_string(),
                blocks: vec![json!({ "id": "block_hidden_write", "type": "paragraph", "text": "Hidden" })],
                boards: Vec::new(),
                data_tables: Vec::new(),
                mindmaps: Vec::new(),
                updated_at: NOW.to_string(),
                client_name: "test-client".to_string(),
                tool_name: "append_content".to_string(),
            })
            .is_err());
        assert_eq!(
            storage
                .load_page_record("page_mcp_target")
                .expect("recycled page remains stored")
                .blocks
                .len(),
            4
        );
    }

    #[test]
    fn rejects_mcp_child_pages_for_recycled_parents() {
        let storage = seed_storage();
        let mut parent = storage
            .load_page_record("page_mcp_target")
            .expect("load parent page");
        parent.deleted_at = Some("2026-07-16T00:00:00.000Z".to_string());
        parent.deleted_root_id = Some("page_mcp_target".to_string());
        storage.save_page(parent).expect("move parent to recycle bin");

        assert!(storage
            .create_mcp_page(
                PageRecord {
                    id: "page_mcp_hidden_child".to_string(),
                    parent_id: Some("page_mcp_target".to_string()),
                    deleted_at: None,
                    deleted_root_id: None,
                    title: "Hidden child".to_string(),
                    icon: None,
                    cover: None,
                    properties: None,
                    is_full_width: None,
                    is_small_text: None,
                    font_family: None,
                    show_outline: None,
                    show_properties: None,
                    blocks: Vec::new(),
                    created_at: NOW.to_string(),
                    updated_at: NOW.to_string(),
                },
                Some("block_hidden_child".to_string()),
            )
            .is_err());
        assert!(storage.load_page_record("page_mcp_hidden_child").is_err());
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

        assert!(storage
            .load_page_record("page_mcp_target")
            .expect("page")
            .blocks
            .is_empty());
        assert!(storage.load_boards().expect("boards").is_empty());
        assert!(storage.load_data_tables().expect("tables").is_empty());
        assert!(storage.load_mindmaps().expect("mindmaps").is_empty());
        let audit_count: i64 = storage
            .connection
            .query_row("SELECT COUNT(*) FROM zhiqi_mcp_audit_log", [], |row| {
                row.get(0)
            })
            .expect("audit count");
        assert_eq!(audit_count, 0);
    }

    #[test]
    fn appends_whiteboard_elements_cascades_connections_and_audits_the_change() {
        let storage = seed_storage();
        storage
            .append_mcp_content(complete_batch())
            .expect("seed whiteboard");

        let result = storage
            .update_mcp_whiteboard(McpWhiteboardUpdate {
                board_id: "board_mcp".to_string(),
                shapes: vec![json!({ "id": "service", "type": "rect" })],
                notes: Vec::new(),
                texts: Vec::new(),
                connections: Vec::new(),
                strokes: vec![json!({ "id": "annotation", "points": [] })],
                erase_ids: vec!["entry".to_string()],
                updated_at: NOW.to_string(),
                audit_id: "mcp_audit_whiteboard_test".to_string(),
            })
            .expect("update whiteboard");

        assert_eq!(result.added_node_ids, vec!["service"]);
        assert_eq!(result.erased_ids, vec!["entry", "entry-service"]);
        let board = storage
            .load_mcp_whiteboard("board_mcp")
            .expect("load updated board");
        assert_eq!(board.snapshot["shapes"][0]["id"], "service");
        assert!(board.snapshot["connections"].as_array().unwrap().is_empty());
        assert_eq!(board.snapshot["strokes"][0]["id"], "annotation");
        let audit: String = storage
            .connection
            .query_row(
                "SELECT created_ids_json FROM zhiqi_mcp_audit_log WHERE id = ?1",
                ["mcp_audit_whiteboard_test"],
                |row| row.get(0),
            )
            .expect("whiteboard audit");
        assert!(audit.contains("entry-service"));
        assert!(audit.contains("service"));
    }

    #[test]
    fn rolls_back_whiteboard_elements_and_audit_together_when_snapshot_write_fails() {
        let storage = seed_storage();
        storage
            .append_mcp_content(complete_batch())
            .expect("seed whiteboard");
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER fail_mcp_whiteboard_snapshot
                   BEFORE UPDATE ON zhiqi_board_snapshots
                   WHEN OLD.board_id = 'board_mcp'
                   BEGIN SELECT RAISE(FAIL, 'forced whiteboard snapshot failure'); END;",
            )
            .expect("install trigger");

        assert!(storage
            .update_mcp_whiteboard(McpWhiteboardUpdate {
                board_id: "board_mcp".to_string(),
                shapes: vec![json!({ "id": "service", "type": "rect" })],
                notes: Vec::new(),
                texts: Vec::new(),
                connections: Vec::new(),
                strokes: Vec::new(),
                erase_ids: vec!["entry".to_string()],
                updated_at: NOW.to_string(),
                audit_id: "mcp_audit_whiteboard_rollback".to_string(),
            })
            .is_err());

        let board = storage
            .load_mcp_whiteboard("board_mcp")
            .expect("load rolled back board");
        assert_eq!(board.snapshot["shapes"][0]["id"], "entry");
        let audit_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_mcp_audit_log WHERE id = ?1",
                ["mcp_audit_whiteboard_rollback"],
                |row| row.get(0),
            )
            .expect("audit count");
        assert_eq!(audit_count, 0);
    }

    #[test]
    fn rejects_unknown_erase_ids_without_changing_the_board_or_audit() {
        let storage = seed_storage();
        storage
            .append_mcp_content(complete_batch())
            .expect("seed board");
        let before = storage
            .load_mcp_whiteboard("board_mcp")
            .expect("board before");

        let error = storage
            .update_mcp_whiteboard(McpWhiteboardUpdate {
                board_id: "board_mcp".to_string(),
                shapes: Vec::new(),
                notes: Vec::new(),
                texts: Vec::new(),
                connections: Vec::new(),
                strokes: Vec::new(),
                erase_ids: vec!["missing".to_string()],
                updated_at: "later".to_string(),
                audit_id: "missing_erase".to_string(),
            })
            .expect_err("unknown erase fails");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            storage
                .load_mcp_whiteboard("board_mcp")
                .expect("board after"),
            before
        );
        let audit_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_mcp_audit_log WHERE id = 'missing_erase'",
                [],
                |row| row.get(0),
            )
            .expect("audit count");
        assert_eq!(audit_count, 0);
    }

    #[test]
    fn rejects_an_image_erase_id_without_changing_the_board_or_audit() {
        let storage = seed_storage();
        let mut batch = complete_batch();
        batch.boards[0].snapshot["images"] = json!([{ "id": "legacy-image" }]);
        storage.append_mcp_content(batch).expect("seed board");
        let before = storage
            .load_mcp_whiteboard("board_mcp")
            .expect("board before");

        let error = storage
            .update_mcp_whiteboard(McpWhiteboardUpdate {
                board_id: "board_mcp".to_string(),
                shapes: Vec::new(),
                notes: Vec::new(),
                texts: Vec::new(),
                connections: Vec::new(),
                strokes: Vec::new(),
                erase_ids: vec!["legacy-image".to_string()],
                updated_at: "later".to_string(),
                audit_id: "image_erase".to_string(),
            })
            .expect_err("image erase fails");

        assert_eq!(error.code, "invalid_payload");
        assert_eq!(
            storage
                .load_mcp_whiteboard("board_mcp")
                .expect("board after"),
            before
        );
        let audit_count: i64 = storage
            .connection
            .query_row(
                "SELECT COUNT(*) FROM zhiqi_mcp_audit_log WHERE id = 'image_erase'",
                [],
                |row| row.get(0),
            )
            .expect("audit count");
        assert_eq!(audit_count, 0);
    }

    #[test]
    fn creates_child_page_and_parent_block_atomically() {
        let storage = seed_storage();
        let child_page = PageRecord {
            id: "page_mcp_child".to_string(),
            parent_id: Some("page_mcp_target".to_string()),
            deleted_at: None,
            deleted_root_id: None,
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: Vec::new(),
            created_at: NOW.to_string(),
            updated_at: NOW.to_string(),
        };

        storage
            .create_mcp_page(child_page.clone(), Some("block_mcp_child".to_string()))
            .expect("create child page");

        let parent = storage
            .load_page_record("page_mcp_target")
            .expect("load parent page");
        assert_eq!(
            parent.blocks,
            vec![json!({
                "id": "block_mcp_child",
                "type": "child_page",
                "pageId": "page_mcp_child",
            })]
        );
        assert_eq!(
            storage
                .load_page_record("page_mcp_child")
                .expect("load child page")
                .parent_id
                .as_deref(),
            Some("page_mcp_target")
        );

        let missing_parent_child = PageRecord {
            id: "page_mcp_orphan".to_string(),
            parent_id: Some("page_missing".to_string()),
            ..child_page
        };
        assert!(storage
            .create_mcp_page(missing_parent_child, Some("block_mcp_orphan".to_string()))
            .is_err());
        assert!(storage.load_page_record("page_mcp_orphan").is_err());
    }

    #[test]
    fn rolls_back_child_page_when_parent_block_write_fails() {
        let storage = seed_storage();
        storage
            .connection
            .execute_batch(
                "CREATE TRIGGER fail_mcp_parent_block_write
                   BEFORE UPDATE ON zhiqi_page_contents
                   WHEN OLD.page_id = 'page_mcp_target'
                   BEGIN SELECT RAISE(FAIL, 'forced parent block failure'); END;",
            )
            .expect("install trigger");
        let child_page = PageRecord {
            id: "page_mcp_child_rollback".to_string(),
            parent_id: Some("page_mcp_target".to_string()),
            deleted_at: None,
            deleted_root_id: None,
            title: "Child".to_string(),
            icon: None,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: Vec::new(),
            created_at: NOW.to_string(),
            updated_at: NOW.to_string(),
        };

        assert!(storage
            .create_mcp_page(child_page, Some("block_mcp_child_rollback".to_string()))
            .is_err());

        assert!(storage
            .load_page_record("page_mcp_target")
            .expect("load parent page")
            .blocks
            .is_empty());
        assert!(storage.load_page_record("page_mcp_child_rollback").is_err());
    }
}
