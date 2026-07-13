use std::{fmt, fs, marker::PhantomData, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine};
use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use rand::{distr::Alphanumeric, RngExt};
use rmcp::schemars;
use serde::{
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{json, Map, Value};

use crate::storage::{StorageError, StorageResult};

use super::semantic::{
    normalize_data_table, normalize_mindmap, normalize_whiteboard, DataTableColumnInput,
    DataTableInput, DataTableRecordInput, MindmapInput, MindmapNodeInput, WhiteboardEdgeInput,
    WhiteboardInput, WhiteboardNodeInput,
};

const MAX_CONTENT_ITEMS: usize = 100;
const MAX_TABLE_CELLS: usize = 10_000;
const MAX_TEXT_BYTES: usize = 5 * 1024 * 1024;
const MAX_NORMALIZED_BLOCKS: usize = 10_000;
const MAX_ASSET_BYTES: usize = 20 * 1024 * 1024;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AppendContentInput {
    pub(super) page_id: String,
    #[serde(default, deserialize_with = "deserialize_content")]
    #[schemars(with = "Vec<ContentItem>")]
    pub(super) content: Vec<ContentItem>,
    #[serde(default)]
    pub(super) text: Option<String>,
    #[serde(default, deserialize_with = "deserialize_optional_table_rows")]
    #[schemars(with = "Option<Vec<Vec<String>>>")]
    pub(super) table: Option<Vec<Vec<String>>>,
}

#[derive(Debug, schemars::JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(super) enum ContentItem {
    Markdown {
        markdown: String,
    },
    Table {
        #[schemars(with = "Vec<Vec<String>>")]
        rows: Vec<Vec<String>>,
        #[serde(default)]
        has_header_row: bool,
    },
    /// 数据表的记录标题使用每条 record 的 title；自定义 columns 不允许 type: title。
    DataTable {
        title: String,
        columns: Vec<DataTableColumnInput>,
        records: Vec<DataTableRecordInput>,
    },
    Whiteboard {
        title: String,
        nodes: Vec<WhiteboardNodeInput>,
        edges: Vec<WhiteboardEdgeInput>,
    },
    Mindmap {
        title: String,
        root: MindmapNodeInput,
    },
    /// 受管理的图片、视频、音频或附件。只能提供 dataBase64 或 localPath 之一。
    Asset {
        name: Option<String>,
        mime_type: String,
        data_base64: Option<String>,
        local_path: Option<String>,
        caption: Option<String>,
        alt: Option<String>,
    },
}

impl<'de> Deserialize<'de> for ContentItem {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(ContentItemVisitor)
    }
}

struct ContentItemVisitor;

impl<'de> Visitor<'de> for ContentItemVisitor {
    type Value = ContentItem;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a markdown or table content item")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        const FIELDS: &[&str] = &[
            "type",
            "markdown",
            "rows",
            "hasHeaderRow",
            "title",
            "columns",
            "records",
            "nodes",
            "edges",
            "root",
            "name",
            "mimeType",
            "dataBase64",
            "localPath",
            "caption",
            "alt",
        ];
        let mut item_type = None;
        let mut markdown = None;
        let mut rows = None;
        let mut has_header_row = None;
        let mut title = None;
        let mut columns = None;
        let mut records = None;
        let mut nodes = None;
        let mut edges = None;
        let mut root = None;
        let mut name = None;
        let mut mime_type = None;
        let mut data_base64 = None;
        let mut local_path = None;
        let mut caption = None;
        let mut alt = None;

        while let Some(field) = map.next_key::<String>()? {
            match field.as_str() {
                "type" => {
                    if item_type.is_some() {
                        return Err(de::Error::duplicate_field("type"));
                    }
                    item_type = Some(map.next_value::<String>()?);
                }
                "markdown" => {
                    if markdown.is_some() {
                        return Err(de::Error::duplicate_field("markdown"));
                    }
                    markdown = Some(map.next_value::<String>()?);
                }
                "rows" => {
                    if rows.is_some() {
                        return Err(de::Error::duplicate_field("rows"));
                    }
                    rows = Some(map.next_value::<LimitedTableRows>()?.0);
                }
                "hasHeaderRow" => {
                    if has_header_row.is_some() {
                        return Err(de::Error::duplicate_field("hasHeaderRow"));
                    }
                    has_header_row = Some(map.next_value::<bool>()?);
                }
                "title" => {
                    if title.is_some() {
                        return Err(de::Error::duplicate_field("title"));
                    }
                    title = Some(map.next_value::<String>()?);
                }
                "columns" => {
                    if columns.is_some() {
                        return Err(de::Error::duplicate_field("columns"));
                    }
                    columns = Some(map.next_value::<Vec<DataTableColumnInput>>()?);
                }
                "records" => {
                    if records.is_some() {
                        return Err(de::Error::duplicate_field("records"));
                    }
                    records = Some(map.next_value::<Vec<DataTableRecordInput>>()?);
                }
                "nodes" => {
                    if nodes.is_some() {
                        return Err(de::Error::duplicate_field("nodes"));
                    }
                    nodes = Some(map.next_value::<Vec<WhiteboardNodeInput>>()?);
                }
                "edges" => {
                    if edges.is_some() {
                        return Err(de::Error::duplicate_field("edges"));
                    }
                    edges = Some(map.next_value::<Vec<WhiteboardEdgeInput>>()?);
                }
                "root" => {
                    if root.is_some() {
                        return Err(de::Error::duplicate_field("root"));
                    }
                    root = Some(map.next_value::<MindmapNodeInput>()?);
                }
                "name" => {
                    if name.is_some() {
                        return Err(de::Error::duplicate_field("name"));
                    }
                    name = Some(map.next_value::<String>()?);
                }
                "mimeType" => {
                    if mime_type.is_some() {
                        return Err(de::Error::duplicate_field("mimeType"));
                    }
                    mime_type = Some(map.next_value::<String>()?);
                }
                "dataBase64" => {
                    if data_base64.is_some() {
                        return Err(de::Error::duplicate_field("dataBase64"));
                    }
                    data_base64 = Some(map.next_value::<String>()?);
                }
                "localPath" => {
                    if local_path.is_some() {
                        return Err(de::Error::duplicate_field("localPath"));
                    }
                    local_path = Some(map.next_value::<String>()?);
                }
                "caption" => {
                    if caption.is_some() {
                        return Err(de::Error::duplicate_field("caption"));
                    }
                    caption = Some(map.next_value::<String>()?);
                }
                "alt" => {
                    if alt.is_some() {
                        return Err(de::Error::duplicate_field("alt"));
                    }
                    alt = Some(map.next_value::<String>()?);
                }
                _ => return Err(de::Error::unknown_field(&field, FIELDS)),
            }
        }

        match item_type
            .ok_or_else(|| de::Error::missing_field("type"))?
            .as_str()
        {
            "markdown" => {
                if rows.is_some() {
                    return Err(de::Error::unknown_field("rows", &["type", "markdown"]));
                }
                if has_header_row.is_some() {
                    return Err(de::Error::unknown_field(
                        "hasHeaderRow",
                        &["type", "markdown"],
                    ));
                }
                Ok(ContentItem::Markdown {
                    markdown: markdown.ok_or_else(|| de::Error::missing_field("markdown"))?,
                })
            }
            "table" => {
                if markdown.is_some() {
                    return Err(de::Error::unknown_field(
                        "markdown",
                        &["type", "rows", "hasHeaderRow"],
                    ));
                }
                Ok(ContentItem::Table {
                    rows: rows.ok_or_else(|| de::Error::missing_field("rows"))?,
                    has_header_row: has_header_row.unwrap_or(false),
                })
            }
            "dataTable" => {
                if markdown.is_some()
                    || rows.is_some()
                    || has_header_row.is_some()
                    || nodes.is_some()
                    || edges.is_some()
                    || root.is_some()
                {
                    return Err(de::Error::custom(
                        "dataTable content item contains fields for another content type",
                    ));
                }
                Ok(ContentItem::DataTable {
                    title: title.ok_or_else(|| de::Error::missing_field("title"))?,
                    columns: columns.unwrap_or_default(),
                    records: records.unwrap_or_default(),
                })
            }
            "whiteboard" => {
                if markdown.is_some()
                    || rows.is_some()
                    || has_header_row.is_some()
                    || columns.is_some()
                    || records.is_some()
                    || root.is_some()
                {
                    return Err(de::Error::custom(
                        "whiteboard content item contains fields for another content type",
                    ));
                }
                Ok(ContentItem::Whiteboard {
                    title: title.ok_or_else(|| de::Error::missing_field("title"))?,
                    nodes: nodes.unwrap_or_default(),
                    edges: edges.unwrap_or_default(),
                })
            }
            "mindmap" => {
                if markdown.is_some()
                    || rows.is_some()
                    || has_header_row.is_some()
                    || columns.is_some()
                    || records.is_some()
                    || nodes.is_some()
                    || edges.is_some()
                {
                    return Err(de::Error::custom(
                        "mindmap content item contains fields for another content type",
                    ));
                }
                Ok(ContentItem::Mindmap {
                    title: title.ok_or_else(|| de::Error::missing_field("title"))?,
                    root: root.ok_or_else(|| de::Error::missing_field("root"))?,
                })
            }
            "asset" => {
                if markdown.is_some()
                    || rows.is_some()
                    || has_header_row.is_some()
                    || title.is_some()
                    || columns.is_some()
                    || records.is_some()
                    || nodes.is_some()
                    || edges.is_some()
                    || root.is_some()
                {
                    return Err(de::Error::custom(
                        "asset content item contains fields for another content type",
                    ));
                }
                Ok(ContentItem::Asset {
                    name,
                    mime_type: mime_type.ok_or_else(|| de::Error::missing_field("mimeType"))?,
                    data_base64,
                    local_path,
                    caption,
                    alt,
                })
            }
            value => Err(de::Error::unknown_variant(
                value,
                &[
                    "markdown",
                    "table",
                    "dataTable",
                    "whiteboard",
                    "mindmap",
                    "asset",
                ],
            )),
        }
    }
}

fn deserialize_content<'de, D>(deserializer: D) -> Result<Vec<ContentItem>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_seq(LimitedVecVisitor::new(
        MAX_CONTENT_ITEMS,
        "content accepts at most 100 items",
    ))
}

fn deserialize_optional_table_rows<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<Vec<String>>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<LimitedTableRows>::deserialize(deserializer).map(|rows| rows.map(|rows| rows.0))
}

struct LimitedVecVisitor<T> {
    max: usize,
    error: &'static str,
    marker: PhantomData<fn() -> T>,
}

impl<T> LimitedVecVisitor<T> {
    fn new(max: usize, error: &'static str) -> Self {
        Self {
            max,
            error,
            marker: PhantomData,
        }
    }
}

impl<'de, T> Visitor<'de> for LimitedVecVisitor<T>
where
    T: Deserialize<'de>,
{
    type Value = Vec<T>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a size-limited array")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        if sequence.size_hint().is_some_and(|size| size > self.max) {
            return Err(de::Error::custom(self.error));
        }

        let mut values = Vec::with_capacity(sequence.size_hint().unwrap_or(0).min(self.max));
        while values.len() < self.max {
            match sequence.next_element()? {
                Some(value) => values.push(value),
                None => return Ok(values),
            }
        }

        match sequence.next_element_seed(RejectExtraElementSeed(self.error))? {
            None => Ok(values),
            Some(()) => unreachable!("extra-element seed always rejects"),
        }
    }
}

struct RejectExtraElementSeed(&'static str);

impl<'de> DeserializeSeed<'de> for RejectExtraElementSeed {
    type Value = ();

    fn deserialize<D>(self, _deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        Err(de::Error::custom(self.0))
    }
}

struct LimitedTableRows(Vec<Vec<String>>);

impl<'de> Deserialize<'de> for LimitedTableRows {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(TableRowsVisitor)
    }
}

struct TableRowsVisitor;

impl<'de> Visitor<'de> for TableRowsVisitor {
    type Value = LimitedTableRows;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a table with at most 10,000 cells")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        if sequence
            .size_hint()
            .is_some_and(|size| size > MAX_TABLE_CELLS)
        {
            return Err(de::Error::custom("table accepts at most 10,000 cells"));
        }

        let mut rows = Vec::with_capacity(sequence.size_hint().unwrap_or(0).min(MAX_TABLE_CELLS));
        let mut cell_count = 0usize;
        loop {
            if rows.len() >= MAX_TABLE_CELLS || cell_count >= MAX_TABLE_CELLS {
                match sequence.next_element_seed(RejectExtraElementSeed(
                    "table accepts at most 10,000 cells",
                ))? {
                    None => return Ok(LimitedTableRows(rows)),
                    Some(()) => unreachable!("extra-element seed always rejects"),
                }
            }

            let Some(row) = sequence.next_element_seed(TableRowSeed {
                remaining: MAX_TABLE_CELLS - cell_count,
            })?
            else {
                return Ok(LimitedTableRows(rows));
            };
            cell_count += row.len();
            rows.push(row);
        }
    }
}

struct TableRowSeed {
    remaining: usize,
}

impl<'de> DeserializeSeed<'de> for TableRowSeed {
    type Value = Vec<String>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_seq(LimitedVecVisitor::new(
            self.remaining,
            "table accepts at most 10,000 cells",
        ))
    }
}

pub(super) fn normalize_content(input: &AppendContentInput) -> StorageResult<Vec<Value>> {
    validate_input(input)?;

    let mut blocks = Vec::new();
    for item in &input.content {
        match item {
            ContentItem::Markdown { markdown } => {
                extend_blocks(&mut blocks, normalize_markdown(markdown)?)?;
            }
            ContentItem::Table {
                rows,
                has_header_row,
            } => push_block(&mut blocks, table_block(rows.clone(), *has_header_row))?,
            ContentItem::DataTable { .. }
            | ContentItem::Whiteboard { .. }
            | ContentItem::Mindmap { .. }
            | ContentItem::Asset { .. } => {
                return Err(StorageError::invalid_payload(
                    "semantic content requires batch normalization",
                ));
            }
        }
    }

    if let Some(text) = &input.text {
        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
            push_block(&mut blocks, text_block("paragraph", line))?;
        }
    }

    if let Some(rows) = &input.table {
        push_block(&mut blocks, table_block(rows.clone(), false))?;
    }

    assign_block_ids(&mut blocks, &random_suffix());

    Ok(blocks)
}

fn assign_block_ids(blocks: &mut [Value], batch_suffix: &str) {
    for (index, block) in blocks.iter_mut().enumerate() {
        block
            .as_object_mut()
            .expect("normalized blocks are JSON objects")
            .insert(
                "id".to_string(),
                Value::String(format!("block_mcp_{batch_suffix}_{index}")),
            );
    }
}

pub(super) struct NormalizedContentBatch {
    pub(super) blocks: Vec<Value>,
    pub(super) boards: Vec<crate::storage::BoardRecord>,
    pub(super) data_tables: Vec<crate::storage::DataTableRecord>,
    pub(super) mindmaps: Vec<crate::storage::MindmapRecord>,
    pub(super) assets: Vec<PendingAsset>,
    pub(super) created_content: Vec<NormalizedContentItem>,
}

pub(super) struct PendingAsset {
    pub(super) block_index: usize,
    pub(super) content_index: usize,
    pub(super) input: crate::storage::WriteAssetInput,
}

pub(super) struct NormalizedContentItem {
    pub(super) index: usize,
    pub(super) content_type: &'static str,
    pub(super) block_indices: Vec<usize>,
    pub(super) object_id: Option<String>,
}

pub(super) fn normalize_content_batch(
    input: &AppendContentInput,
    batch_id: &str,
    now: &str,
) -> StorageResult<NormalizedContentBatch> {
    validate_input(input)?;

    let mut blocks = Vec::new();
    let mut boards = Vec::new();
    let mut data_tables = Vec::new();
    let mut mindmaps = Vec::new();
    let mut assets = Vec::new();
    let mut created_content = Vec::new();
    for (index, item) in input.content.iter().enumerate() {
        let item_batch_id = format!("{batch_id}_{index}");
        let block_start = blocks.len();
        let object_id = (|| -> StorageResult<Option<String>> {
            match item {
                ContentItem::Markdown { markdown } => {
                    extend_blocks(&mut blocks, normalize_markdown(markdown)?)?;
                    Ok(None)
                }
                ContentItem::Table {
                    rows,
                    has_header_row,
                } => {
                    push_block(&mut blocks, table_block(rows.clone(), *has_header_row))?;
                    Ok(None)
                }
                ContentItem::DataTable {
                    title,
                    columns,
                    records,
                } => {
                    let normalized = normalize_data_table(
                        &DataTableInput {
                            title: title.clone(),
                            columns: columns.clone(),
                            records: records.clone(),
                        },
                        &item_batch_id,
                        now,
                    )?;
                    push_block(&mut blocks, normalized.block)?;
                    let object_id = normalized.record.id.clone();
                    data_tables.push(normalized.record);
                    Ok(Some(object_id))
                }
                ContentItem::Whiteboard {
                    title,
                    nodes,
                    edges,
                } => {
                    let normalized = normalize_whiteboard(
                        &WhiteboardInput {
                            title: title.clone(),
                            nodes: nodes.clone(),
                            edges: edges.clone(),
                        },
                        &item_batch_id,
                        now,
                    )?;
                    push_block(&mut blocks, normalized.block)?;
                    let object_id = normalized.record.id.clone();
                    boards.push(normalized.record);
                    Ok(Some(object_id))
                }
                ContentItem::Mindmap { title, root } => {
                    let normalized = normalize_mindmap(
                        &MindmapInput {
                            title: title.clone(),
                            root: root.clone(),
                        },
                        &item_batch_id,
                        now,
                    )?;
                    push_block(&mut blocks, normalized.block)?;
                    let object_id = normalized.record.id.clone();
                    mindmaps.push(normalized.record);
                    Ok(Some(object_id))
                }
                ContentItem::Asset {
                    name,
                    mime_type,
                    data_base64,
                    local_path,
                    caption,
                    alt,
                } => {
                    let input = normalize_asset_input(name, mime_type, data_base64, local_path)?;
                    let block_index = blocks.len();
                    push_block(
                        &mut blocks,
                        asset_block(&input, caption.as_deref(), alt.as_deref()),
                    )?;
                    assets.push(PendingAsset {
                        block_index,
                        content_index: index,
                        input,
                    });
                    Ok(None)
                }
            }
        })()
        .map_err(|error| item_error(index, item.content_type(), error))?;
        created_content.push(NormalizedContentItem {
            index,
            content_type: item.content_type(),
            block_indices: (block_start..blocks.len()).collect(),
            object_id,
        });
    }

    if let Some(text) = &input.text {
        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
            push_block(&mut blocks, text_block("paragraph", line))?;
        }
    }
    if let Some(rows) = &input.table {
        push_block(&mut blocks, table_block(rows.clone(), false))?;
    }
    assign_block_ids(&mut blocks, batch_id);

    Ok(NormalizedContentBatch {
        blocks,
        boards,
        data_tables,
        mindmaps,
        assets,
        created_content,
    })
}

impl ContentItem {
    fn content_type(&self) -> &'static str {
        match self {
            Self::Markdown { .. } => "markdown",
            Self::Table { .. } => "table",
            Self::DataTable { .. } => "dataTable",
            Self::Whiteboard { .. } => "whiteboard",
            Self::Mindmap { .. } => "mindmap",
            Self::Asset { .. } => "asset",
        }
    }
}

fn item_error(index: usize, item_type: &str, error: StorageError) -> StorageError {
    StorageError::new(
        error.code,
        format!("content[{index}] ({item_type}): {}", error.message),
    )
}

fn validate_input(input: &AppendContentInput) -> StorageResult<()> {
    if !input.content.is_empty() && (input.text.is_some() || input.table.is_some()) {
        return Err(StorageError::invalid_payload(
            "content cannot be combined with legacy text or table inputs",
        ));
    }

    let legacy_items = usize::from(input.text.is_some()) + usize::from(input.table.is_some());
    if input.content.len().saturating_add(legacy_items) > MAX_CONTENT_ITEMS {
        return Err(StorageError::invalid_payload(format!(
            "append_content accepts at most {MAX_CONTENT_ITEMS} content items"
        )));
    }

    let mut text_bytes = 0usize;
    for item in &input.content {
        match item {
            ContentItem::Markdown { markdown } => add_text_bytes(&mut text_bytes, markdown.len())?,
            ContentItem::Table { rows, .. } => {
                validate_table(rows)?;
                add_table_text_bytes(&mut text_bytes, rows)?;
            }
            ContentItem::DataTable {
                title,
                columns,
                records,
            } => {
                add_text_bytes(&mut text_bytes, title.len())?;
                for column in columns {
                    add_text_bytes(&mut text_bytes, column.key.len())?;
                    add_text_bytes(&mut text_bytes, column.name.len())?;
                    if let Some(expression) = &column.formula_expression {
                        add_text_bytes(&mut text_bytes, expression.len())?;
                    }
                }
                for record in records {
                    add_text_bytes(&mut text_bytes, record.title.len())?;
                    add_text_bytes(&mut text_bytes, serde_json::to_vec(&record.values)?.len())?;
                }
            }
            ContentItem::Whiteboard {
                title,
                nodes,
                edges,
            } => {
                add_text_bytes(&mut text_bytes, title.len())?;
                for node in nodes {
                    add_text_bytes(&mut text_bytes, node.id.len())?;
                    add_text_bytes(&mut text_bytes, node.text.len())?;
                }
                for edge in edges {
                    add_text_bytes(&mut text_bytes, edge.from.len())?;
                    add_text_bytes(&mut text_bytes, edge.to.len())?;
                    if let Some(id) = &edge.id {
                        add_text_bytes(&mut text_bytes, id.len())?;
                    }
                }
            }
            ContentItem::Mindmap { title, root } => {
                add_text_bytes(&mut text_bytes, title.len())?;
                add_mindmap_text_bytes(&mut text_bytes, root)?;
            }
            ContentItem::Asset { .. } => {}
        }
    }

    if let Some(text) = &input.text {
        add_text_bytes(&mut text_bytes, text.len())?;
    }

    if let Some(rows) = &input.table {
        validate_table(rows)?;
        add_table_text_bytes(&mut text_bytes, rows)?;
    }

    Ok(())
}

fn add_mindmap_text_bytes(total: &mut usize, node: &MindmapNodeInput) -> StorageResult<()> {
    add_text_bytes(total, node.text.len())?;
    if let Some(id) = &node.id {
        add_text_bytes(total, id.len())?;
    }
    for child in &node.children {
        add_mindmap_text_bytes(total, child)?;
    }
    Ok(())
}

fn normalize_asset_input(
    name: &Option<String>,
    mime_type: &str,
    data_base64: &Option<String>,
    local_path: &Option<String>,
) -> StorageResult<crate::storage::WriteAssetInput> {
    if data_base64.is_some() == local_path.is_some() {
        return Err(StorageError::invalid_payload(
            "asset requires exactly one of dataBase64 or localPath",
        ));
    }
    if !is_valid_mime_type(mime_type) {
        return Err(StorageError::invalid_payload("asset mimeType is invalid"));
    }

    let (bytes, inferred_name) = match (data_base64, local_path) {
        (Some(data_base64), None) => {
            if data_base64.len() > MAX_ASSET_BYTES.saturating_mul(4) / 3 + 4 {
                return Err(StorageError::invalid_payload("asset exceeds 20 MiB"));
            }
            let bytes = STANDARD
                .decode(data_base64)
                .map_err(|_| StorageError::invalid_payload("asset dataBase64 is invalid"))?;
            (bytes, None)
        }
        (None, Some(local_path)) => {
            let path = Path::new(local_path);
            let metadata = fs::metadata(path).map_err(|error| {
                StorageError::invalid_payload(format!("asset localPath cannot be read: {error}"))
            })?;
            if !metadata.is_file() || metadata.len() > MAX_ASSET_BYTES as u64 {
                return Err(StorageError::invalid_payload(
                    "asset exceeds 20 MiB or is not a file",
                ));
            }
            let bytes = fs::read(path).map_err(|error| {
                StorageError::invalid_payload(format!("asset localPath cannot be read: {error}"))
            })?;
            let inferred_name = path
                .file_name()
                .and_then(|file_name| file_name.to_str())
                .map(str::to_string);
            (bytes, inferred_name)
        }
        _ => unreachable!("source exclusivity is checked above"),
    };
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(StorageError::invalid_payload("asset exceeds 20 MiB"));
    }
    let name = name
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .map(str::to_string)
        .or(inferred_name)
        .ok_or_else(|| StorageError::invalid_payload("asset name is required for dataBase64"))?;

    Ok(crate::storage::WriteAssetInput {
        name,
        mime_type: mime_type.to_string(),
        bytes,
    })
}

fn is_valid_mime_type(value: &str) -> bool {
    let Some((kind, subtype)) = value.split_once('/') else {
        return false;
    };
    !kind.is_empty()
        && !subtype.is_empty()
        && !subtype.contains('/')
        && value.bytes().all(|byte| {
            byte.is_ascii_alphanumeric()
                || matches!(
                    byte,
                    b'/' | b'!' | b'#' | b'$' | b'&' | b'^' | b'_' | b'.' | b'+' | b'-'
                )
        })
}

fn asset_block(
    asset: &crate::storage::WriteAssetInput,
    caption: Option<&str>,
    alt: Option<&str>,
) -> Value {
    let block_type = if asset.mime_type.starts_with("image/") {
        "image"
    } else if asset.mime_type.starts_with("video/") {
        "video"
    } else if asset.mime_type.starts_with("audio/") {
        "audio"
    } else {
        "file"
    };
    let mut block = json!({
        "type": block_type,
        "assetId": Value::Null,
        "name": asset.name,
        "mimeType": asset.mime_type,
        "caption": caption.unwrap_or_default(),
    });
    if block_type == "image" {
        block["alt"] = Value::String(alt.unwrap_or(&asset.name).to_string());
    }
    block
}

fn add_table_text_bytes(total: &mut usize, rows: &[Vec<String>]) -> StorageResult<()> {
    for cell in rows.iter().flatten() {
        add_text_bytes(total, cell.len())?;
    }
    Ok(())
}

fn add_text_bytes(total: &mut usize, bytes: usize) -> StorageResult<()> {
    *total = total.saturating_add(bytes);
    if *total > MAX_TEXT_BYTES {
        return Err(StorageError::invalid_payload(format!(
            "append_content accepts at most {MAX_TEXT_BYTES} bytes of text"
        )));
    }
    Ok(())
}

fn push_block(blocks: &mut Vec<Value>, block: Value) -> StorageResult<()> {
    if blocks.len() >= MAX_NORMALIZED_BLOCKS {
        return Err(too_many_blocks());
    }
    blocks.push(block);
    Ok(())
}

fn extend_blocks(blocks: &mut Vec<Value>, next: Vec<Value>) -> StorageResult<()> {
    if blocks.len().saturating_add(next.len()) > MAX_NORMALIZED_BLOCKS {
        return Err(too_many_blocks());
    }
    blocks.extend(next);
    Ok(())
}

fn too_many_blocks() -> StorageError {
    StorageError::invalid_payload(format!(
        "append_content accepts at most {MAX_NORMALIZED_BLOCKS} normalized blocks"
    ))
}

fn validate_table(rows: &[Vec<String>]) -> StorageResult<()> {
    let Some(column_count) = rows.first().map(Vec::len).filter(|count| *count > 0) else {
        return Err(StorageError::invalid_payload(
            "table rows and columns must be non-empty",
        ));
    };

    if rows.iter().any(|row| row.len() != column_count) {
        return Err(StorageError::invalid_payload(
            "every table row must have the same number of columns",
        ));
    }

    if rows.len().saturating_mul(column_count) > MAX_TABLE_CELLS {
        return Err(StorageError::invalid_payload(format!(
            "table accepts at most {MAX_TABLE_CELLS} cells"
        )));
    }

    Ok(())
}

fn normalize_markdown(markdown: &str) -> StorageResult<Vec<Value>> {
    let options = Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS;
    let mut state = MarkdownState::default();

    for event in Parser::new_ext(markdown, options) {
        match event {
            Event::Start(tag) => state.start(tag),
            Event::End(tag) => state.end(tag)?,
            Event::Text(text) | Event::Code(text) | Event::Html(text) | Event::InlineHtml(text) => {
                state.push_text(&text)
            }
            Event::SoftBreak | Event::HardBreak => state.push_text("\n"),
            Event::TaskListMarker(checked) => {
                if let Some(item) = state.items.last_mut() {
                    item.checked = Some(checked);
                }
            }
            Event::FootnoteReference(reference) => state.push_text(&reference),
            Event::InlineMath(value) | Event::DisplayMath(value) => state.push_text(&value),
            Event::Rule => {}
        }
    }

    Ok(state.blocks)
}

#[derive(Default)]
struct MarkdownState {
    blocks: Vec<Value>,
    block_count: usize,
    text_kind: Option<TextKind>,
    text: String,
    lists: Vec<bool>,
    items: Vec<ListItem>,
    code: Option<CodeCapture>,
    table_rows: Option<Vec<Vec<String>>>,
    table_row: Option<Vec<String>>,
    table_cell: Option<String>,
}

impl MarkdownState {
    fn start(&mut self, tag: Tag<'_>) {
        match tag {
            Tag::Paragraph if self.items.is_empty() => {
                self.text_kind = Some(TextKind::Paragraph);
                self.text.clear();
            }
            Tag::Paragraph => {
                if let Some(item) = self.items.last_mut() {
                    if !item.text.is_empty() {
                        item.text.push_str("\n\n");
                    }
                }
            }
            Tag::Heading { level, .. } => {
                self.text_kind = Some(TextKind::Heading(level));
                self.text.clear();
            }
            Tag::List(start) => self.lists.push(start.is_some()),
            Tag::Item => self.items.push(ListItem {
                ordered: self.lists.last().copied().unwrap_or(false),
                ..ListItem::default()
            }),
            Tag::CodeBlock(kind) => {
                let language = match kind {
                    CodeBlockKind::Fenced(info) => info
                        .split_whitespace()
                        .next()
                        .filter(|value| !value.is_empty())
                        .unwrap_or("text")
                        .to_string(),
                    CodeBlockKind::Indented => "text".to_string(),
                };
                self.code = Some(CodeCapture {
                    language,
                    text: String::new(),
                });
            }
            Tag::Table(_) => self.table_rows = Some(Vec::new()),
            Tag::TableHead | Tag::TableRow => self.table_row = Some(Vec::new()),
            Tag::TableCell => self.table_cell = Some(String::new()),
            _ => {}
        }
    }

    fn end(&mut self, tag: TagEnd) -> StorageResult<()> {
        match tag {
            TagEnd::Paragraph if self.items.is_empty() => self.finish_text()?,
            TagEnd::Heading(_) => self.finish_text()?,
            TagEnd::Item => self.finish_item()?,
            TagEnd::List(_) => {
                self.lists.pop();
            }
            TagEnd::CodeBlock => {
                if let Some(code) = self.code.take() {
                    let text = code.text.strip_suffix('\n').unwrap_or(&code.text);
                    self.push_block(json!({
                        "type": "code",
                        "language": code.language,
                        "text": text,
                    }))?;
                }
            }
            TagEnd::TableCell => {
                if let (Some(row), Some(cell)) = (&mut self.table_row, self.table_cell.take()) {
                    row.push(cell.trim().to_string());
                }
            }
            TagEnd::TableHead | TagEnd::TableRow => {
                if let (Some(rows), Some(row)) = (&mut self.table_rows, self.table_row.take()) {
                    rows.push(row);
                }
            }
            TagEnd::Table => {
                if let Some(rows) = self.table_rows.take() {
                    validate_table(&rows)?;
                    self.push_block(table_block(rows, true))?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    fn push_text(&mut self, value: &str) {
        if let Some(cell) = &mut self.table_cell {
            cell.push_str(value);
        } else if let Some(code) = &mut self.code {
            code.text.push_str(value);
        } else if self.text_kind.is_some() {
            self.text.push_str(value);
        } else if let Some(item) = self.items.last_mut() {
            item.text.push_str(value);
        }
    }

    fn finish_text(&mut self) -> StorageResult<()> {
        let Some(kind) = self.text_kind.take() else {
            return Ok(());
        };
        let text = self.text.trim().to_string();
        self.text.clear();
        if text.is_empty() {
            return Ok(());
        }

        let block_type = match kind {
            TextKind::Paragraph => "paragraph",
            TextKind::Heading(HeadingLevel::H1) => "heading_1",
            TextKind::Heading(HeadingLevel::H2) => "heading_2",
            TextKind::Heading(HeadingLevel::H3) => "heading_3",
            TextKind::Heading(_) => "paragraph",
        };
        self.push_block(text_block(block_type, &text))
    }

    fn finish_item(&mut self) -> StorageResult<()> {
        self.flush_item_text()?;
        let Some(item) = self.items.pop() else {
            return Ok(());
        };
        let flattened = item.descendants;

        if self.items.is_empty() {
            self.blocks.extend(flattened);
        } else {
            self.flush_item_text()?;
            self.items
                .last_mut()
                .expect("parent list item exists")
                .descendants
                .extend(flattened);
        }
        Ok(())
    }

    fn push_block(&mut self, block: Value) -> StorageResult<()> {
        self.flush_item_text()?;
        self.reserve_block()?;
        if let Some(item) = self.items.last_mut() {
            item.descendants.push(block);
        } else {
            self.blocks.push(block);
        }
        Ok(())
    }

    fn flush_item_text(&mut self) -> StorageResult<()> {
        let Some(item) = self.items.last_mut() else {
            return Ok(());
        };
        let text = item.text.trim().to_string();
        item.text.clear();
        if text.is_empty() {
            return Ok(());
        }

        let block = if item.primary_emitted {
            text_block("paragraph", &text)
        } else {
            item.primary_emitted = true;
            if let Some(checked) = item.checked {
                json!({
                    "type": "todo",
                    "text": text,
                    "checked": checked,
                })
            } else {
                let block_type = if item.ordered {
                    "numbered_list"
                } else {
                    "bulleted_list"
                };
                json!({
                    "type": block_type,
                    "items": [text],
                })
            }
        };

        self.reserve_block()?;
        self.items
            .last_mut()
            .expect("list item exists")
            .descendants
            .push(block);
        Ok(())
    }

    fn reserve_block(&mut self) -> StorageResult<()> {
        if self.block_count >= MAX_NORMALIZED_BLOCKS {
            return Err(too_many_blocks());
        }
        self.block_count += 1;
        Ok(())
    }
}

enum TextKind {
    Paragraph,
    Heading(HeadingLevel),
}

#[derive(Default)]
struct ListItem {
    text: String,
    checked: Option<bool>,
    ordered: bool,
    primary_emitted: bool,
    descendants: Vec<Value>,
}

struct CodeCapture {
    language: String,
    text: String,
}

fn text_block(block_type: &str, text: &str) -> Value {
    json!({ "type": block_type, "text": text })
}

fn table_block(rows: Vec<Vec<String>>, has_header_row: bool) -> Value {
    let mut block = Map::from_iter([
        ("type".to_string(), Value::String("table".to_string())),
        ("rows".to_string(), json!(rows)),
    ]);
    if has_header_row {
        block.insert("hasHeaderRow".to_string(), Value::Bool(true));
    }
    Value::Object(block)
}

fn random_suffix() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(16)
        .map(char::from)
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashSet,
        io::{self, Read},
    };

    use rmcp::schemars;
    use serde::Deserialize;
    use serde_json::json;

    use super::{
        normalize_content, normalize_content_batch, AppendContentInput, ContentItem,
        MAX_CONTENT_ITEMS, MAX_TABLE_CELLS,
    };

    struct CountingReader<R> {
        inner: R,
        bytes_read: usize,
    }

    impl<R> CountingReader<R> {
        fn new(inner: R) -> Self {
            Self {
                inner,
                bytes_read: 0,
            }
        }
    }

    impl<R: Read> Read for CountingReader<R> {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            let read = self.inner.read(buffer)?;
            self.bytes_read += read;
            Ok(read)
        }
    }

    fn assert_limit_error_stops_near_overflow_start(
        payload: &str,
        overflow_start: usize,
        expected_limit: &str,
    ) {
        let mut reader = CountingReader::new(payload.as_bytes());
        let error = {
            let mut deserializer = serde_json::Deserializer::from_reader(&mut reader);
            AppendContentInput::deserialize(&mut deserializer)
                .expect_err("overflowing input must fail during deserialization")
        };

        assert!(error.to_string().contains(expected_limit), "{error}");
        assert!(
            reader.bytes_read <= overflow_start + 64,
            "limit rejection read {} bytes, but the overflowing value starts at byte {overflow_start}",
            reader.bytes_read
        );
    }

    #[test]
    fn deserializes_camel_case_content_and_legacy_inputs() {
        let preferred: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [
                { "type": "markdown", "markdown": "# 标题" },
                {
                    "type": "table",
                    "rows": [["名称", "金额"], ["机票", "2000"]],
                    "hasHeaderRow": true
                }
            ]
        }))
        .expect("preferred content input");

        assert_eq!(preferred.page_id, "page_target");
        assert!(matches!(
            preferred.content.as_slice(),
            [
                ContentItem::Markdown { markdown },
                ContentItem::Table {
                    rows,
                    has_header_row: true
                }
            ] if markdown == "# 标题" && rows[1][1] == "2000"
        ));

        let legacy: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_legacy",
            "text": "第一段\n第二段",
            "table": [["名称", "金额"], ["机票", "2000"]]
        }))
        .expect("legacy content input");

        assert_eq!(legacy.page_id, "page_legacy");
        assert_eq!(legacy.text.as_deref(), Some("第一段\n第二段"));
        assert_eq!(legacy.table.as_ref().expect("legacy table")[1][1], "2000");
    }

    #[test]
    fn rejects_unknown_append_content_fields() {
        let error = serde_json::from_value::<AppendContentInput>(json!({
            "pageId": "page_target",
            "content": [],
            "unexpected": true
        }))
        .expect_err("unknown top-level field must be rejected");

        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn rejects_unknown_content_item_fields() {
        let error = serde_json::from_value::<AppendContentInput>(json!({
            "pageId": "page_target",
            "content": [{
                "type": "table",
                "rows": [["名称"]],
                "hasHeaderRow": true,
                "unexpected": true
            }]
        }))
        .expect_err("unknown content item field must be rejected");

        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn preserves_array_shapes_in_the_generated_schema() {
        let schema = serde_json::to_value(schemars::schema_for!(AppendContentInput))
            .expect("append content schema");
        assert_eq!(
            schema.pointer("/properties/content/type"),
            Some(&json!("array"))
        );
        assert_eq!(
            schema.pointer("/properties/table/items/type"),
            Some(&json!("array"))
        );
        assert_eq!(
            schema.pointer("/properties/table/items/items/type"),
            Some(&json!("string"))
        );

        let table_variant = schema["$defs"]["ContentItem"]["oneOf"]
            .as_array()
            .expect("content variants")
            .iter()
            .find(|variant| variant["properties"]["type"]["const"] == "table")
            .expect("table content variant");
        assert_eq!(table_variant["properties"]["rows"]["type"], "array");
        assert_eq!(
            table_variant["properties"]["rows"]["items"]["type"],
            "array"
        );
        assert_eq!(
            table_variant["properties"]["rows"]["items"]["items"]["type"],
            "string"
        );
    }

    #[test]
    fn normalizes_supported_markdown_to_existing_block_shapes() {
        let markdown = [
            "# 一级标题",
            "",
            "## 二级标题",
            "",
            "### 三级标题",
            "",
            "正文包含 **重点**。",
            "",
            "- [x] 已完成",
            "- [ ] 待完成",
            "",
            "- 第一项",
            "- 第二项",
            "",
            "1. 步骤一",
            "2. 步骤二",
            "",
            "```ts",
            "const answer = 42",
            "```",
            "",
            "| 名称 | 状态 |",
            "| --- | --- |",
            "| 知栖 | 进行中 |",
        ]
        .join("\n");
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": markdown
            }]
        }))
        .expect("markdown input");

        let blocks = normalize_content(&input).expect("valid markdown");
        let block_types = blocks
            .iter()
            .map(|block| block["type"].as_str().expect("block type"))
            .collect::<Vec<_>>();

        assert_eq!(
            block_types,
            vec![
                "heading_1",
                "heading_2",
                "heading_3",
                "paragraph",
                "todo",
                "todo",
                "bulleted_list",
                "bulleted_list",
                "numbered_list",
                "numbered_list",
                "code",
                "table",
            ]
        );
        assert_eq!(blocks[0]["text"], "一级标题");
        assert_eq!(blocks[3]["text"], "正文包含 重点。");
        assert_eq!(blocks[4]["checked"], true);
        assert_eq!(blocks[5]["checked"], false);
        assert_eq!(blocks[6]["items"], json!(["第一项"]));
        assert_eq!(blocks[8]["items"], json!(["步骤一"]));
        assert_eq!(blocks[10]["language"], "ts");
        assert_eq!(blocks[10]["text"], "const answer = 42");
        assert_eq!(
            blocks[11]["rows"],
            json!([["名称", "状态"], ["知栖", "进行中"]])
        );
        assert_eq!(blocks[11]["hasHeaderRow"], true);
    }

    #[test]
    fn keeps_legacy_text_and_table_normalization_compatible() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "text": " 第一段 \n\n 第二段 ",
            "table": [["名称", "金额"], ["机票", "2000"]]
        }))
        .expect("legacy input");

        let blocks = normalize_content(&input).expect("valid legacy input");

        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0]["type"], "paragraph");
        assert_eq!(blocks[0]["text"], "第一段");
        assert_eq!(blocks[1]["text"], "第二段");
        assert_eq!(blocks[2]["type"], "table");
        assert_eq!(blocks[2]["rows"][1][1], "2000");
    }

    #[test]
    fn rejects_content_mixed_with_legacy_text() {
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown {
                markdown: "正文".to_string(),
            }],
            text: Some("旧正文".to_string()),
            table: None,
        };

        let error = normalize_content(&input).expect_err("content and text must not be mixed");

        assert_eq!(error.code, "invalid_payload");
    }

    #[test]
    fn rejects_content_mixed_with_legacy_table() {
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown {
                markdown: "正文".to_string(),
            }],
            text: None,
            table: Some(vec![vec!["旧表格".to_string()]]),
        };

        let error = normalize_content(&input).expect_err("content and table must not be mixed");

        assert_eq!(error.code, "invalid_payload");
    }

    #[test]
    fn validates_explicit_tables_before_returning_any_blocks() {
        for rows in [json!([]), json!([[]]), json!([["A", "B"], ["C"]])] {
            let input: AppendContentInput = serde_json::from_value(json!({
                "pageId": "page_target",
                "content": [
                    { "type": "markdown", "markdown": "先解析但不应部分返回" },
                    { "type": "table", "rows": rows }
                ]
            }))
            .expect("structurally valid input");

            assert!(normalize_content(&input).is_err());
        }

        let within_limit: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{ "type": "table", "rows": vec![vec!["值"; 100]; 100] }]
        }))
        .expect("10,000-cell table input");
        assert!(normalize_content(&within_limit).is_ok());

        let error = serde_json::from_value::<AppendContentInput>(json!({
            "pageId": "page_target",
            "content": [{ "type": "table", "rows": vec![vec!["值"; 101]; 100] }]
        }))
        .expect_err("10,100-cell table must fail during deserialization");
        assert!(error.to_string().contains("10,000"), "{error}");
    }

    #[test]
    fn rejects_oversized_tables_during_deserialization() {
        const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;
        let cells = format!("[\"\"{}]", ",\"\"".repeat(999_999));
        let payloads = [
            format!(
                "{{\"pageId\":\"page_target\",\"content\":[{{\"type\":\"table\",\"rows\":[{cells}]}}]}}"
            ),
            format!("{{\"pageId\":\"page_target\",\"table\":[{cells}]}}"),
        ];

        for payload in payloads {
            assert!(payload.len() < MAX_REQUEST_BYTES);
            let error = serde_json::from_str::<AppendContentInput>(&payload)
                .expect_err("one million cells must fail during deserialization");
            assert!(error.to_string().contains("10,000"), "{error}");
        }
    }

    #[test]
    fn rejects_extra_content_item_before_reading_its_large_body() {
        let allowed_items = (0..MAX_CONTENT_ITEMS)
            .map(|_| r#"{"type":"markdown","markdown":""}"#)
            .collect::<Vec<_>>()
            .join(",");
        let mut payload = String::from("{\"pageId\":\"page_target\",\"content\":[");
        payload.push_str(&allowed_items);
        payload.push(',');
        let overflow_start = payload.len();
        payload.push_str("{\"type\":\"markdown\",\"markdown\":\"");
        payload.push_str(&"x".repeat(1024 * 1024));
        payload.push_str("\"}]}");

        assert_limit_error_stops_near_overflow_start(&payload, overflow_start, "100");
    }

    #[test]
    fn rejects_extra_preferred_table_cell_before_reading_its_large_body() {
        let allowed_cells = (0..MAX_TABLE_CELLS)
            .map(|_| "\"\"")
            .collect::<Vec<_>>()
            .join(",");
        let large_body = "x".repeat(1024 * 1024);

        let mut preferred = String::from(
            "{\"pageId\":\"page_target\",\"content\":[{\"type\":\"table\",\"rows\":[[",
        );
        preferred.push_str(&allowed_cells);
        preferred.push(',');
        let preferred_overflow_start = preferred.len();
        preferred.push('"');
        preferred.push_str(&large_body);
        preferred.push('"');
        preferred.push_str("]]}]}");
        assert_limit_error_stops_near_overflow_start(
            &preferred,
            preferred_overflow_start,
            "10,000",
        );
    }

    #[test]
    fn rejects_extra_legacy_table_cell_before_reading_its_large_body() {
        let allowed_cells = (0..MAX_TABLE_CELLS)
            .map(|_| "\"\"")
            .collect::<Vec<_>>()
            .join(",");
        let large_body = "x".repeat(1024 * 1024);
        let mut legacy = String::from("{\"pageId\":\"page_target\",\"table\":[[");
        legacy.push_str(&allowed_cells);
        legacy.push_str("],");
        let legacy_overflow_start = legacy.len();
        legacy.push_str("[\"");
        legacy.push_str(&large_body);
        legacy.push('"');
        legacy.push_str("]]}");
        assert_limit_error_stops_near_overflow_start(&legacy, legacy_overflow_start, "10,000");
    }

    #[test]
    fn limits_content_items_and_assigns_unique_mcp_block_ids() {
        let allowed_items = (0..100)
            .map(|index| json!({ "type": "markdown", "markdown": format!("段落 {index}") }))
            .collect::<Vec<_>>();
        let allowed: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": allowed_items
        }))
        .expect("100 content items");
        let blocks = normalize_content(&allowed).expect("100 items are allowed");
        let ids = blocks
            .iter()
            .map(|block| block["id"].as_str().expect("block id"))
            .collect::<HashSet<_>>();

        assert_eq!(blocks.len(), 100);
        assert_eq!(ids.len(), blocks.len());
        assert!(ids.iter().all(|id| id.starts_with("block_mcp_")));

        let rejected_items = (0..101)
            .map(|_| json!({ "type": "markdown", "markdown": "段落" }))
            .collect::<Vec<_>>();
        let rejected_payload = serde_json::to_string(&json!({
            "pageId": "page_target",
            "content": rejected_items
        }))
        .expect("101 content items payload");
        let error = serde_json::from_str::<AppendContentInput>(&rejected_payload)
            .expect_err("101 content items must fail during deserialization");

        assert!(error.to_string().contains("100"), "{error}");
    }

    #[test]
    fn empty_markdown_produces_no_blocks() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{ "type": "markdown", "markdown": "  \n\n" }]
        }))
        .expect("empty markdown input");

        assert!(normalize_content(&input)
            .expect("empty markdown is valid")
            .is_empty());
    }

    #[test]
    fn flattens_parent_and_child_list_items_without_losing_content() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": "- 父项\n  - 子项\n- 第二项"
            }]
        }))
        .expect("nested list input");

        let blocks = normalize_content(&input).expect("nested list is valid");

        assert_eq!(
            blocks
                .iter()
                .map(|block| (&block["type"], &block["items"]))
                .collect::<Vec<_>>(),
            vec![
                (&json!("bulleted_list"), &json!(["父项"])),
                (&json!("bulleted_list"), &json!(["子项"])),
                (&json!("bulleted_list"), &json!(["第二项"])),
            ]
        );
    }

    #[test]
    fn separates_multiple_paragraphs_within_a_list_item() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": "- 第一段\n\n  第二段"
            }]
        }))
        .expect("multi-paragraph list input");

        let blocks = normalize_content(&input).expect("multi-paragraph list is valid");

        assert_eq!(blocks[0]["items"], json!(["第一段\n\n第二段"]));
    }

    #[test]
    fn keeps_list_continuation_after_a_heading_in_source_order() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": "- 第一段\n\n  ## 子标题\n\n  第二段"
            }]
        }))
        .expect("list continuation input");

        let blocks = normalize_content(&input).expect("list continuation is valid");

        assert_eq!(
            blocks
                .iter()
                .map(|block| block["type"].as_str().expect("block type"))
                .collect::<Vec<_>>(),
            vec!["bulleted_list", "heading_2", "paragraph"]
        );
        assert_eq!(blocks[0]["items"], json!(["第一段"]));
        assert_eq!(blocks[1]["text"], "子标题");
        assert_eq!(blocks[2]["text"], "第二段");
    }

    #[test]
    fn keeps_list_continuations_after_code_and_table_in_source_order() {
        let markdown = [
            "- 第一段",
            "",
            "  ```rust",
            "  let answer = 42;",
            "  ```",
            "",
            "  代码后",
            "",
            "  | 名称 | 值 |",
            "  | --- | --- |",
            "  | 答案 | 42 |",
            "",
            "  表格后",
        ]
        .join("\n");
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": markdown
            }]
        }))
        .expect("list child blocks and continuations input");

        let blocks =
            normalize_content(&input).expect("list child blocks and continuations are valid");

        assert_eq!(
            blocks
                .iter()
                .map(|block| block["type"].as_str().expect("block type"))
                .collect::<Vec<_>>(),
            vec!["bulleted_list", "code", "paragraph", "table", "paragraph"]
        );
        assert_eq!(blocks[0]["items"], json!(["第一段"]));
        assert_eq!(blocks[1]["text"], "let answer = 42;");
        assert_eq!(blocks[2]["text"], "代码后");
        assert_eq!(blocks[3]["rows"][1], json!(["答案", "42"]));
        assert_eq!(blocks[4]["text"], "表格后");
    }

    #[test]
    fn flattens_list_child_blocks_after_the_parent_in_document_order() {
        let markdown = [
            "- 父项",
            "",
            "  ## 子标题",
            "",
            "  ```rust",
            "  let answer = 42;",
            "  ```",
            "",
            "  | 名称 | 值 |",
            "  | --- | --- |",
            "  | 答案 | 42 |",
        ]
        .join("\n");
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": markdown
            }]
        }))
        .expect("list child block input");

        let blocks = normalize_content(&input).expect("list child blocks are valid");

        assert_eq!(
            blocks
                .iter()
                .map(|block| block["type"].as_str().expect("block type"))
                .collect::<Vec<_>>(),
            vec!["bulleted_list", "heading_2", "code", "table"]
        );
        assert_eq!(blocks[0]["items"], json!(["父项"]));
        assert_eq!(blocks[1]["text"], "子标题");
        assert_eq!(blocks[2]["text"], "let answer = 42;");
        assert_eq!(blocks[3]["rows"][1], json!(["答案", "42"]));
    }

    #[test]
    fn keeps_nested_list_child_blocks_in_document_order() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": "- 外层\n  - 内层\n\n    ## 内层标题"
            }]
        }))
        .expect("nested list child block input");

        let blocks = normalize_content(&input).expect("nested child blocks are valid");

        assert_eq!(
            blocks
                .iter()
                .map(|block| block["type"].as_str().expect("block type"))
                .collect::<Vec<_>>(),
            vec!["bulleted_list", "bulleted_list", "heading_2"]
        );
        assert_eq!(blocks[0]["items"], json!(["外层"]));
        assert_eq!(blocks[1]["items"], json!(["内层"]));
        assert_eq!(blocks[2]["text"], "内层标题");
    }

    #[test]
    fn flattens_mixed_ordered_and_unordered_nesting_in_document_order() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [{
                "type": "markdown",
                "markdown": "1. 外层一\n   - 内层 A\n     1. 深层 1\n2. 外层二"
            }]
        }))
        .expect("mixed nested list input");

        let blocks = normalize_content(&input).expect("mixed nested list is valid");
        let flattened = blocks
            .iter()
            .map(|block| {
                (
                    block["type"].as_str().expect("list block type"),
                    block["items"][0].as_str().expect("list item"),
                )
            })
            .collect::<Vec<_>>();

        assert_eq!(
            flattened,
            vec![
                ("numbered_list", "外层一"),
                ("bulleted_list", "内层 A"),
                ("numbered_list", "深层 1"),
                ("numbered_list", "外层二"),
            ]
        );
    }

    #[test]
    fn rejects_oversized_markdown_and_table_text_payloads() {
        const FIVE_MIB: usize = 5 * 1024 * 1024;

        let oversized_markdown = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown {
                markdown: "文".repeat(FIVE_MIB / "文".len() + 1),
            }],
            text: None,
            table: None,
        };
        assert!(normalize_content(&oversized_markdown).is_err());

        let oversized_cell = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Table {
                rows: vec![vec!["x".repeat(FIVE_MIB + 1)]],
                has_header_row: false,
            }],
            text: None,
            table: None,
        };
        assert!(normalize_content(&oversized_cell).is_err());
    }

    #[test]
    fn rejects_text_bytes_over_the_aggregate_limit() {
        const FIVE_MIB: usize = 5 * 1024 * 1024;
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![
                ContentItem::Markdown {
                    markdown: "m".repeat(FIVE_MIB / 2),
                },
                ContentItem::Table {
                    rows: vec![vec!["x".repeat(FIVE_MIB / 2 + 1)]],
                    has_header_row: false,
                },
            ],
            text: None,
            table: None,
        };

        assert!(normalize_content(&input).is_err());
    }

    #[test]
    fn accepts_text_payloads_at_the_five_mib_limit() {
        const FIVE_MIB: usize = 5 * 1024 * 1024;

        {
            let input = AppendContentInput {
                page_id: "page_target".to_string(),
                content: vec![ContentItem::Markdown {
                    markdown: "m".repeat(FIVE_MIB),
                }],
                text: None,
                table: None,
            };
            assert!(normalize_content(&input).is_ok());
        }

        {
            let input = AppendContentInput {
                page_id: "page_target".to_string(),
                content: vec![ContentItem::Table {
                    rows: vec![vec!["x".repeat(FIVE_MIB)]],
                    has_header_row: false,
                }],
                text: None,
                table: None,
            };
            assert!(normalize_content(&input).is_ok());
        }

        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![
                ContentItem::Markdown {
                    markdown: "m".repeat(FIVE_MIB / 2),
                },
                ContentItem::Table {
                    rows: vec![vec!["l".repeat(FIVE_MIB / 2)]],
                    has_header_row: false,
                },
            ],
            text: None,
            table: None,
        };
        assert!(normalize_content(&input).is_ok());
    }

    #[test]
    fn removes_only_the_parser_newline_from_code_blocks() {
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown {
                markdown: "```text\n第一行\n\n```".to_string(),
            }],
            text: None,
            table: None,
        };

        let blocks = normalize_content(&input).expect("code block is valid");

        assert_eq!(blocks[0]["text"], "第一行\n");
    }

    #[test]
    fn accepts_exactly_ten_thousand_normalized_blocks() {
        let markdown = (0..10_000)
            .map(|index| format!("段落 {index}"))
            .collect::<Vec<_>>()
            .join("\n\n");
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown { markdown }],
            text: None,
            table: None,
        };

        assert_eq!(
            normalize_content(&input)
                .expect("10,000 normalized blocks are allowed")
                .len(),
            10_000
        );
    }

    #[test]
    fn rejects_markdown_that_expands_past_the_block_limit() {
        let markdown = (0..10_001)
            .map(|index| format!("段落 {index}"))
            .collect::<Vec<_>>()
            .join("\n\n");
        let input = AppendContentInput {
            page_id: "page_target".to_string(),
            content: vec![ContentItem::Markdown { markdown }],
            text: None,
            table: None,
        };

        assert!(normalize_content(&input).is_err());
    }

    #[test]
    fn normalizes_base64_and_local_assets_without_retaining_the_source_path() {
        let local_path =
            std::env::temp_dir().join(format!("zhixi-mcp-asset-{}-clip.mp4", std::process::id()));
        std::fs::write(&local_path, b"local-video").expect("writes local asset");
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [
                { "type": "asset", "name": "image.png", "mimeType": "image/png", "dataBase64": "aGVsbG8=" },
                { "type": "asset", "name": "sound.mp3", "mimeType": "audio/mpeg", "dataBase64": "aGVsbG8=" },
                { "type": "asset", "name": "notes.pdf", "mimeType": "application/pdf", "dataBase64": "aGVsbG8=" },
                { "type": "asset", "mimeType": "video/mp4", "localPath": local_path }
            ]
        }))
        .expect("asset input");

        let batch = normalize_content_batch(&input, "batch", "now").expect("normalizes assets");
        std::fs::remove_file(&local_path).expect("removes local asset");

        assert_eq!(
            batch
                .blocks
                .iter()
                .map(|block| block["type"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["image", "audio", "file", "video"]
        );
        assert_eq!(batch.assets.len(), 4);
        assert_eq!(batch.assets[3].input.bytes, b"local-video");
        assert!(!serde_json::to_string(&batch.blocks)
            .expect("serializes blocks")
            .contains(&local_path.to_string_lossy().to_string()));
    }

    #[test]
    fn identifies_the_invalid_content_item_in_a_batch() {
        let input: AppendContentInput = serde_json::from_value(json!({
            "pageId": "page_target",
            "content": [
                { "type": "markdown", "markdown": "正文" },
                {
                    "type": "dataTable",
                    "title": "任务",
                    "columns": [{ "key": "name", "name": "名称", "type": "title" }],
                    "records": []
                }
            ]
        }))
        .expect("valid input shape");

        let error = match normalize_content_batch(&input, "batch", "now") {
            Ok(_) => panic!("title columns must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "invalid_payload");
        assert!(error.message.contains("content[1] (dataTable)"));
        assert!(error.message.contains("record title field"));
    }

    #[test]
    fn rejects_assets_with_zero_or_multiple_sources() {
        for asset in [
            json!({ "type": "asset", "name": "empty.bin", "mimeType": "application/octet-stream" }),
            json!({ "type": "asset", "name": "both.bin", "mimeType": "application/octet-stream", "dataBase64": "aGVsbG8=", "localPath": "C:/ignored.bin" }),
        ] {
            let input: AppendContentInput = serde_json::from_value(json!({
                "pageId": "page_target",
                "content": [asset]
            }))
            .expect("asset input parses");
            assert!(normalize_content_batch(&input, "batch", "now").is_err());
        }
    }
}
