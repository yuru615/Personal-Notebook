use rusqlite::{params, Connection};
use serde_json::Value;

use super::{
    error::StorageResult,
    models::{DataTableRecord, PagePropertyDefinition, PageRecord, SearchResult},
};

const MAX_SEARCH_LIMIT: usize = 100;
const MAX_SEARCH_QUERY_CHARS: usize = 512;

pub fn replace_page_document(
    connection: &Connection,
    page: &PageRecord,
    page_property_definitions: &[PagePropertyDefinition],
) -> StorageResult<()> {
    delete_documents_for_owner(connection, "page", &page.id)?;

    let mut documents = vec![SearchDocument {
        document_id: format!("page:{}:title", page.id),
        kind: "page".to_string(),
        page_id: page.id.clone(),
        block_id: None,
        board_id: None,
        database_id: None,
        record_id: None,
        title: page.title.clone(),
        icon: page.icon.clone(),
        excerpt: page.title.clone(),
        body: page.title.clone(),
        match_source: "title".to_string(),
        match_key: None,
        source_label: "标题".to_string(),
    }];

    documents.extend(property_documents(page, page_property_definitions));
    documents.extend(block_documents(page));

    for document in documents {
        insert_document(connection, &document)?;
    }

    Ok(())
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
            block_id: None,
            board_id: Some(board_id.to_string()),
            database_id: None,
            record_id: None,
            title: title.to_string(),
            icon: Some("🧩".to_string()),
            excerpt: "白板".to_string(),
            body: title.to_string(),
            match_source: "whiteboard".to_string(),
            match_key: None,
            source_label: "白板".to_string(),
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
            block_id: None,
            board_id: None,
            database_id: None,
            record_id: None,
            title: title.to_string(),
            icon: Some("🗺".to_string()),
            excerpt: "导图".to_string(),
            body: title.to_string(),
            match_source: "body".to_string(),
            match_key: None,
            source_label: "导图".to_string(),
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
            block_id: None,
            board_id: None,
            database_id: Some(data_table.id.clone()),
            record_id: None,
            title: data_table.title.clone(),
            icon: Some("🗃".to_string()),
            excerpt: "数据表格".to_string(),
            body: data_table.title.clone(),
            match_source: "data_table".to_string(),
            match_key: None,
            source_label: "数据表格".to_string(),
        },
    )?;

    for (record_id, title) in data_table_record_titles(&data_table.snapshot) {
        insert_document(
            connection,
            &SearchDocument {
                document_id: format!("database:{}:record:{record_id}", data_table.id),
                kind: "data_table_record".to_string(),
                page_id: page_id.clone(),
                block_id: None,
                board_id: None,
                database_id: Some(data_table.id.clone()),
                record_id: Some(record_id),
                title,
                icon: Some("🗃".to_string()),
                excerpt: format!("{} · 记录", data_table.title),
                body: data_table.title.clone(),
                match_source: "data_table_record".to_string(),
                match_key: None,
                source_label: "记录".to_string(),
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
        "SELECT d.kind, d.page_id, d.block_id, d.board_id, d.database_id, d.record_id, d.title, d.icon,
          d.excerpt, d.match_source, d.match_key, d.source_label
          FROM zhixi_search_documents_fts f
          JOIN zhixi_search_documents d ON d.document_id = f.document_id
          WHERE zhixi_search_documents_fts MATCH ?1
          ORDER BY rank
          LIMIT ?2",
    )?;
    let rows = statement.query_map(params![fts_query, bounded_limit], |row| {
        Ok(SearchResult {
            kind: row.get(0)?,
            page_id: row.get(1)?,
            block_id: row.get(2)?,
            board_id: row.get(3)?,
            database_id: row.get(4)?,
            record_id: row.get(5)?,
            title: row.get(6)?,
            icon: row.get(7)?,
            excerpt: row.get(8)?,
            match_source: row.get(9)?,
            match_key: row.get(10)?,
            source_label: row.get(11)?,
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
          (document_id, kind, page_id, block_id, board_id, database_id, record_id, title, icon, excerpt, body,
            match_source, match_key, source_label)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            document.document_id,
            document.kind,
            document.page_id,
            document.block_id,
            document.board_id,
            document.database_id,
            document.record_id,
            document.title,
            document.icon,
            document.excerpt,
            document.body,
            document.match_source,
            document.match_key,
            document.source_label
        ],
    )?;
    connection.execute(
        "INSERT INTO zhixi_search_documents_fts
          (document_id, kind, page_id, block_id, board_id, database_id, record_id, title, icon, excerpt, body)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            document.document_id,
            document.kind,
            document.page_id,
            document.block_id,
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
        "page" => format!("page:{owner_id}:%"),
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

fn property_documents(
    page: &PageRecord,
    page_property_definitions: &[PagePropertyDefinition],
) -> Vec<SearchDocument> {
    page_property_definitions
        .iter()
        .filter_map(|definition| {
            let raw_value = page.properties.as_ref()?.get(&definition.id)?;
            let excerpt = match raw_value {
                Value::Array(items) => items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
                    .join(" / "),
                Value::String(value) => value.trim().to_string(),
                _ => String::new(),
            };

            if excerpt.is_empty() {
                return None;
            }

            Some(SearchDocument {
                document_id: format!("page:{}:property:{}", page.id, definition.id),
                kind: "page".to_string(),
                page_id: page.id.clone(),
                block_id: None,
                board_id: None,
                database_id: None,
                record_id: None,
                title: page.title.clone(),
                icon: page.icon.clone(),
                excerpt: excerpt.clone(),
                body: excerpt,
                match_source: "property".to_string(),
                match_key: Some(definition.key.clone()),
                source_label: definition.name.clone(),
            })
        })
        .collect()
}

fn block_documents(page: &PageRecord) -> Vec<SearchDocument> {
    page.blocks
        .iter()
        .enumerate()
        .flat_map(|(index, block)| {
            let block_id = block
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| format!("index_{index}"));
            block_search_entries(block).into_iter().map(move |entry| SearchDocument {
                document_id: format!("page:{}:block:{}:{}", page.id, block_id, entry.document_suffix),
                kind: "page".to_string(),
                page_id: page.id.clone(),
                block_id: Some(block_id.clone()),
                board_id: None,
                database_id: None,
                record_id: None,
                title: page.title.clone(),
                icon: page.icon.clone(),
                excerpt: entry.excerpt,
                body: entry.search_text,
                match_source: entry.match_source,
                match_key: None,
                source_label: entry.source_label,
            })
        })
        .collect()
}

fn block_search_entries(block: &Value) -> Vec<SearchEntry> {
    let mut entries = rich_text_relation_entries(block);

    if let Some(entry) = match block.get("type").and_then(Value::as_str) {
        Some("paragraph" | "heading_1" | "heading_2" | "heading_3" | "todo" | "code") => {
            create_body_entry(block.get("text").and_then(Value::as_str).unwrap_or(""))
        }
        Some("bulleted_list" | "numbered_list") => create_body_entry(
            &block
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
        ),
        Some("table") => create_body_entry(
            &block
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
        ),
        Some("image" | "video" | "audio") => create_media_entry([
            block.get("name").and_then(Value::as_str).unwrap_or(""),
            block.get("caption").and_then(Value::as_str).unwrap_or(""),
            block.get("alt").and_then(Value::as_str).unwrap_or(""),
        ]),
        _ => None,
    } {
        entries.push(entry);
    }

    entries
}

fn rich_text_relation_entries(block: &Value) -> Vec<SearchEntry> {
    let Some("paragraph" | "heading_1" | "heading_2" | "heading_3" | "todo") =
        block.get("type").and_then(Value::as_str)
    else {
        return Vec::new();
    };

    let excerpt = block
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if excerpt.is_empty() {
        return Vec::new();
    }

    block.get("richText")
        .and_then(Value::as_array)
        .map(|segments| {
            segments
                .iter()
                .enumerate()
                .filter_map(|(index, segment)| {
                    let text = segment.get("text").and_then(Value::as_str)?.trim().to_string();
                    let relation_kind = segment
                        .get("relationKind")
                        .and_then(Value::as_str)
                        .filter(|kind| *kind == "link" || *kind == "mention")?;
                    let _page_id = segment.get("pageId").and_then(Value::as_str)?;

                    if text.is_empty() {
                        return None;
                    }

                    Some(SearchEntry {
                        document_suffix: format!("relation:{relation_kind}:{index}"),
                        excerpt: excerpt.clone(),
                        search_text: text,
                        match_source: if relation_kind == "mention" {
                            "page_mention".to_string()
                        } else {
                            "page_link".to_string()
                        },
                        source_label: if relation_kind == "mention" {
                            "页面提及".to_string()
                        } else {
                            "页面链接".to_string()
                        },
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn create_body_entry(text: &str) -> Option<SearchEntry> {
    let excerpt = text.trim();

    if excerpt.is_empty() {
        return None;
    }

    Some(SearchEntry {
        document_suffix: "body".to_string(),
        excerpt: excerpt.to_string(),
        search_text: excerpt.to_string(),
        match_source: "body".to_string(),
        source_label: "正文".to_string(),
    })
}

fn create_media_entry(parts: [&str; 3]) -> Option<SearchEntry> {
    let trimmed_parts = parts
        .into_iter()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    let excerpt = trimmed_parts.first()?.to_string();

    Some(SearchEntry {
        document_suffix: "media".to_string(),
        excerpt,
        search_text: build_search_text(trimmed_parts),
        match_source: "media".to_string(),
        source_label: "媒体".to_string(),
    })
}

fn build_search_text(parts: Vec<String>) -> String {
    let mut entries = Vec::new();

    for part in parts {
        if part.is_empty() {
            continue;
        }

        push_unique(&mut entries, part.clone());
        for alias in build_file_name_search_aliases(&part) {
            push_unique(&mut entries, alias);
        }
    }

    entries.join(" ")
}

fn build_file_name_search_aliases(value: &str) -> Vec<String> {
    let normalized_value = value.trim();

    if normalized_value.is_empty() {
        return Vec::new();
    }

    let stem = normalized_value
        .rsplit_once('.')
        .map(|(name, _)| name.trim())
        .unwrap_or(normalized_value);
    let punctuation_normalized = normalized_value
        .replace(['.', '_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let stem_normalized = stem
        .replace(['.', '_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let mut aliases = Vec::new();
    for alias in [punctuation_normalized, stem.to_string(), stem_normalized] {
        if !alias.is_empty() && alias != normalized_value {
            push_unique(&mut aliases, alias);
        }
    }
    aliases
}

fn push_unique(entries: &mut Vec<String>, value: String) {
    if !entries.iter().any(|existing| existing == &value) {
        entries.push(value);
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
    block_id: Option<String>,
    board_id: Option<String>,
    database_id: Option<String>,
    record_id: Option<String>,
    title: String,
    icon: Option<String>,
    excerpt: String,
    body: String,
    match_source: String,
    match_key: Option<String>,
    source_label: String,
}

struct SearchEntry {
    document_suffix: String,
    excerpt: String,
    search_text: String,
    match_source: String,
    source_label: String,
}
