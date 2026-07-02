use rusqlite::{params, Connection};
use serde_json::Value;

use super::{
    error::StorageResult,
    models::{DataTableRecord, PageRecord, SearchResult},
};

const MAX_SEARCH_LIMIT: usize = 100;
const MAX_SEARCH_QUERY_CHARS: usize = 512;

pub fn replace_page_document(connection: &Connection, page: &PageRecord) -> StorageResult<()> {
    delete_documents_for_owner(connection, "page", &page.id)?;
    let body = page
        .blocks
        .iter()
        .map(block_search_text)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    insert_document(
        connection,
        &SearchDocument {
            document_id: format!("page:{}", page.id),
            kind: "page".to_string(),
            page_id: page.id.clone(),
            board_id: None,
            database_id: None,
            record_id: None,
            title: page.title.clone(),
            icon: page.icon.clone(),
            excerpt: if body.is_empty() {
                page.title.clone()
            } else {
                body.clone()
            },
            body,
        },
    )
}

pub fn replace_board_document(
    connection: &Connection,
    board_id: &str,
    title: &str,
    page_id: Option<String>,
) -> StorageResult<()> {
    delete_documents_for_owner(connection, "board", board_id)?;
    insert_document(
        connection,
        &SearchDocument {
            document_id: format!("board:{board_id}"),
            kind: "whiteboard".to_string(),
            page_id: page_id.unwrap_or_default(),
            board_id: Some(board_id.to_string()),
            database_id: None,
            record_id: None,
            title: title.to_string(),
            icon: Some("□".to_string()),
            excerpt: "白板".to_string(),
            body: title.to_string(),
        },
    )
}

pub fn replace_mindmap_document(
    connection: &Connection,
    mindmap_id: &str,
    title: &str,
    page_id: Option<String>,
) -> StorageResult<()> {
    delete_documents_for_owner(connection, "mindmap", mindmap_id)?;
    insert_document(
        connection,
        &SearchDocument {
            document_id: format!("mindmap:{mindmap_id}"),
            kind: "mindmap".to_string(),
            page_id: page_id.unwrap_or_default(),
            board_id: None,
            database_id: None,
            record_id: None,
            title: title.to_string(),
            icon: Some("◇".to_string()),
            excerpt: "导图".to_string(),
            body: title.to_string(),
        },
    )
}

pub fn replace_data_table_documents(
    connection: &Connection,
    data_table: &DataTableRecord,
    page_id: Option<String>,
) -> StorageResult<()> {
    delete_documents_for_owner(connection, "database", &data_table.id)?;
    let page_id = page_id.unwrap_or_default();
    insert_document(
        connection,
        &SearchDocument {
            document_id: format!("database:{}", data_table.id),
            kind: "data_table".to_string(),
            page_id: page_id.clone(),
            board_id: None,
            database_id: Some(data_table.id.clone()),
            record_id: None,
            title: data_table.title.clone(),
            icon: Some("▦".to_string()),
            excerpt: "数据表格".to_string(),
            body: data_table.title.clone(),
        },
    )?;

    for (record_id, title) in data_table_record_titles(&data_table.snapshot) {
        insert_document(
            connection,
            &SearchDocument {
                document_id: format!("database:{}:record:{record_id}", data_table.id),
                kind: "data_table_record".to_string(),
                page_id: page_id.clone(),
                board_id: None,
                database_id: Some(data_table.id.clone()),
                record_id: Some(record_id),
                title,
                icon: Some("▦".to_string()),
                excerpt: format!("{} · 记录", data_table.title),
                body: data_table.title.clone(),
            },
        )?;
    }

    Ok(())
}

pub fn search(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> StorageResult<Vec<SearchResult>> {
    let trimmed = normalize_query(query);
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let fts_query = format!("\"{}\"", trimmed.replace('"', "\"\""));
    let bounded_limit = limit.clamp(1, MAX_SEARCH_LIMIT) as i64;
    let mut statement = connection.prepare(
        "SELECT kind, page_id, board_id, database_id, record_id, title, icon, excerpt
          FROM zhixi_search_documents_fts
          WHERE zhixi_search_documents_fts MATCH ?1
          ORDER BY rank
          LIMIT ?2",
    )?;
    let rows = statement.query_map(params![fts_query, bounded_limit], |row| {
        Ok(SearchResult {
            kind: row.get(0)?,
            page_id: row.get(1)?,
            board_id: row.get(2)?,
            database_id: row.get(3)?,
            record_id: row.get(4)?,
            title: row.get(5)?,
            icon: row.get(6)?,
            excerpt: row.get(7)?,
        })
    })?;

    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn normalize_query(query: &str) -> String {
    query.trim().chars().take(MAX_SEARCH_QUERY_CHARS).collect()
}

fn insert_document(connection: &Connection, document: &SearchDocument) -> StorageResult<()> {
    connection.execute(
        "INSERT INTO zhixi_search_documents
          (document_id, kind, page_id, board_id, database_id, record_id, title, icon, excerpt, body)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            document.document_id,
            document.kind,
            document.page_id,
            document.board_id,
            document.database_id,
            document.record_id,
            document.title,
            document.icon,
            document.excerpt,
            document.body
        ],
    )?;
    connection.execute(
        "INSERT INTO zhixi_search_documents_fts
          (document_id, kind, page_id, board_id, database_id, record_id, title, icon, excerpt, body)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            document.document_id,
            document.kind,
            document.page_id,
            document.board_id,
            document.database_id,
            document.record_id,
            document.title,
            document.icon,
            document.excerpt,
            document.body
        ],
    )?;
    Ok(())
}

pub fn delete_documents_for_owner(
    connection: &Connection,
    owner_kind: &str,
    owner_id: &str,
) -> StorageResult<()> {
    let pattern = match owner_kind {
        "page" => format!("page:{owner_id}"),
        "board" => format!("board:{owner_id}"),
        "mindmap" => format!("mindmap:{owner_id}"),
        "database" => format!("database:{owner_id}%"),
        _ => return Ok(()),
    };

    let mut statement = connection
        .prepare("SELECT rowid FROM zhixi_search_documents_fts WHERE document_id LIKE ?1")?;
    let row_ids = statement
        .query_map([pattern.as_str()], |row| row.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    for row_id in row_ids {
        connection.execute(
            "DELETE FROM zhixi_search_documents_fts WHERE rowid = ?1",
            [row_id],
        )?;
    }

    connection.execute(
        "DELETE FROM zhixi_search_documents WHERE document_id LIKE ?1",
        [pattern],
    )?;
    Ok(())
}

fn block_search_text(block: &Value) -> String {
    match block.get("type").and_then(Value::as_str) {
        Some("paragraph" | "heading_1" | "heading_2" | "heading_3" | "todo" | "code") => block
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string(),
        Some("bulleted_list" | "numbered_list") => block
            .get("items")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default(),
        Some("table") => block
            .get("rows")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .filter_map(Value::as_array)
                    .flat_map(|cells| cells.iter().filter_map(Value::as_str))
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default(),
        Some("image" | "video" | "audio") => [
            block.get("name").and_then(Value::as_str).unwrap_or(""),
            block.get("caption").and_then(Value::as_str).unwrap_or(""),
            block.get("alt").and_then(Value::as_str).unwrap_or(""),
        ]
        .into_iter()
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" "),
        Some("whiteboard") => "白板".to_string(),
        Some("data_table") | Some("data_table_inline") => "数据表格".to_string(),
        Some("mindmap") => "导图".to_string(),
        _ => String::new(),
    }
}

pub fn data_table_record_titles(snapshot: &Value) -> Vec<(String, String)> {
    snapshot
        .get("records")
        .and_then(Value::as_object)
        .map(|records| {
            records
                .iter()
                .filter_map(|(record_id, record)| {
                    let title = record.get("title")?.as_str()?.trim();
                    if title.is_empty() {
                        return None;
                    }
                    Some((
                        record
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or(record_id)
                            .to_string(),
                        title.to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

struct SearchDocument {
    document_id: String,
    kind: String,
    page_id: String,
    board_id: Option<String>,
    database_id: Option<String>,
    record_id: Option<String>,
    title: String,
    icon: Option<String>,
    excerpt: String,
    body: String,
}
