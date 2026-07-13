use std::{
    collections::{BTreeMap, HashSet},
    fmt,
    marker::PhantomData,
};

use rmcp::schemars;
use serde::{
    de::{self, DeserializeSeed, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use serde_json::{json, Map, Value};

use crate::storage::{BoardRecord, DataTableRecord, MindmapRecord, StorageError, StorageResult};

const MAX_DATA_TABLE_COLUMNS: usize = 100;
const MAX_DATA_TABLE_RECORDS: usize = 10_000;
const MAX_WHITEBOARD_NODES: usize = 500;
const MAX_WHITEBOARD_EDGES: usize = 1_000;
const MAX_WHITEBOARD_STROKES: usize = 500;
const MAX_WHITEBOARD_STROKE_POINTS: usize = 10_000;
const MAX_WHITEBOARD_STROKE_POINTS_PER_STROKE: usize = 1_000;
const MAX_WHITEBOARD_COORDINATE: f64 = 1_000_000.0;
const MAX_WHITEBOARD_Z: u32 = 1_000_000;
const MAX_MINDMAP_NODES: usize = 1_000;
const MAX_MINDMAP_DEPTH: usize = 32;

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DataTableInput {
    pub(super) title: String,
    #[serde(default)]
    pub(super) columns: Vec<DataTableColumnInput>,
    #[serde(default)]
    pub(super) records: Vec<DataTableRecordInput>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DataTableColumnInput {
    pub(super) key: String,
    pub(super) name: String,
    pub(super) r#type: DataTablePropertyType,
    #[serde(default)]
    pub(super) formula_expression: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum DataTablePropertyType {
    Title,
    Text,
    Number,
    Select,
    MultiSelect,
    Date,
    Checkbox,
    Formula,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DataTableRecordInput {
    pub(super) title: String,
    #[serde(default)]
    #[schemars(with = "BTreeMap<String, Value>")]
    pub(super) values: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardInput {
    pub(super) title: String,
    #[serde(default)]
    pub(super) nodes: Vec<WhiteboardNodeInput>,
    #[serde(default)]
    pub(super) edges: Vec<WhiteboardEdgeInput>,
    #[serde(default, deserialize_with = "deserialize_limited_whiteboard_strokes")]
    pub(super) strokes: Vec<WhiteboardStrokeInput>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardNodeInput {
    pub(super) id: String,
    pub(super) kind: WhiteboardNodeKind,
    pub(super) text: String,
    #[serde(default)]
    pub(super) x: Option<f64>,
    #[serde(default)]
    pub(super) y: Option<f64>,
    #[serde(default)]
    pub(super) w: Option<f64>,
    #[serde(default)]
    pub(super) h: Option<f64>,
    #[serde(default)]
    pub(super) color: Option<String>,
    #[serde(default)]
    pub(super) size: Option<f64>,
    #[serde(default)]
    pub(super) z: Option<u32>,
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum WhiteboardNodeKind {
    Rect,
    Ellipse,
    Diamond,
    Triangle,
    Note,
    Text,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardEdgeInput {
    #[serde(default)]
    pub(super) id: Option<String>,
    pub(super) from: String,
    pub(super) to: String,
    #[serde(default)]
    pub(super) from_side: Option<WhiteboardConnectionSide>,
    #[serde(default)]
    pub(super) to_side: Option<WhiteboardConnectionSide>,
    #[serde(default)]
    pub(super) from_anchor: Option<WhiteboardConnectionAnchorInput>,
    #[serde(default)]
    pub(super) to_anchor: Option<WhiteboardConnectionAnchorInput>,
    #[serde(default)]
    pub(super) mode: Option<WhiteboardLineMode>,
    #[serde(default)]
    pub(super) from_marker: Option<WhiteboardConnectionMarker>,
    #[serde(default)]
    pub(super) to_marker: Option<WhiteboardConnectionMarker>,
    #[serde(default)]
    pub(super) color: Option<String>,
    #[serde(default)]
    pub(super) size: Option<f64>,
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub(super) enum WhiteboardConnectionSide {
    N,
    E,
    S,
    W,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardConnectionAnchorInput {
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum WhiteboardLineMode {
    Straight,
    Curve,
}

#[derive(Debug, Clone, Copy, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(super) enum WhiteboardConnectionMarker {
    None,
    Arrow,
    Bar,
    Dot,
    Circle,
    Diamond,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardStrokeInput {
    #[serde(default)]
    pub(super) id: Option<String>,
    pub(super) color: String,
    pub(super) size: f64,
    #[serde(deserialize_with = "deserialize_limited_whiteboard_stroke_points")]
    pub(super) points: Vec<WhiteboardStrokePointInput>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhiteboardStrokePointInput {
    pub(super) x: f64,
    pub(super) y: f64,
}

pub(super) struct LimitedWhiteboardStrokes(pub(super) Vec<WhiteboardStrokeInput>);

impl<'de> Deserialize<'de> for LimitedWhiteboardStrokes {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserialize_limited_whiteboard_strokes(deserializer).map(Self)
    }
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MindmapInput {
    pub(super) title: String,
    pub(super) root: MindmapNodeInput,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct MindmapNodeInput {
    #[serde(default)]
    pub(super) id: Option<String>,
    pub(super) text: String,
    #[serde(default)]
    pub(super) children: Vec<MindmapNodeInput>,
}

pub(super) struct NormalizedDataTable {
    pub(super) block: Value,
    pub(super) record: DataTableRecord,
}

pub(super) struct NormalizedWhiteboard {
    pub(super) block: Value,
    pub(super) record: BoardRecord,
}

pub(super) struct NormalizedWhiteboardElements {
    pub(super) shapes: Vec<Value>,
    pub(super) notes: Vec<Value>,
    pub(super) texts: Vec<Value>,
    pub(super) connections: Vec<Value>,
    pub(super) strokes: Vec<Value>,
}

pub(super) struct NormalizedMindmap {
    pub(super) block: Value,
    pub(super) record: MindmapRecord,
}

pub(super) fn normalize_data_table(
    input: &DataTableInput,
    batch_id: &str,
    now: &str,
) -> StorageResult<NormalizedDataTable> {
    let title = required_text(&input.title, "data table title")?;
    if input.columns.len().saturating_add(1) > MAX_DATA_TABLE_COLUMNS {
        return Err(StorageError::invalid_payload(format!(
            "data table accepts at most {MAX_DATA_TABLE_COLUMNS} columns including the title"
        )));
    }
    if input.records.len() > MAX_DATA_TABLE_RECORDS {
        return Err(StorageError::invalid_payload(format!(
            "data table accepts at most {MAX_DATA_TABLE_RECORDS} records"
        )));
    }

    let mut seen_keys = HashSet::new();
    let mut columns = Vec::with_capacity(input.columns.len());
    for column in &input.columns {
        let key = required_text(&column.key, "data table column key")?;
        if !seen_keys.insert(key.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate data table column key: {key}"
            )));
        }
        if column.r#type == DataTablePropertyType::Title {
            return Err(StorageError::invalid_payload(
                "data table columns cannot use title; use the record title field",
            ));
        }
        let name = required_text(&column.name, "data table column name")?;
        let formula_expression = match column.r#type {
            DataTablePropertyType::Formula => Some(required_text(
                column.formula_expression.as_deref().unwrap_or_default(),
                "formula expression",
            )?),
            _ if column.formula_expression.is_some() => {
                return Err(StorageError::invalid_payload(
                    "formulaExpression is only valid for formula columns",
                ));
            }
            _ => None,
        };
        columns.push(PreparedColumn {
            key,
            name,
            kind: column.r#type,
            formula_expression,
        });
    }

    let mut select_labels = vec![Vec::<String>::new(); columns.len()];
    let mut normalized_records = Vec::with_capacity(input.records.len());
    for record in &input.records {
        let title = required_text(&record.title, "data table record title")?;
        for key in record.values.keys() {
            if !seen_keys.contains(key) {
                return Err(StorageError::invalid_payload(format!(
                    "data table record references unknown column: {key}"
                )));
            }
        }

        let mut values = Vec::with_capacity(columns.len());
        for (index, column) in columns.iter().enumerate() {
            let value = match record.values.get(&column.key) {
                Some(value) => normalize_data_table_value(value, column)?,
                None => Value::Null,
            };
            if matches!(column.kind, DataTablePropertyType::Select) {
                if let Some(label) = value.as_str().filter(|value| !value.is_empty()) {
                    push_unique(&mut select_labels[index], label);
                }
            }
            if matches!(column.kind, DataTablePropertyType::MultiSelect) {
                for label in value
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                {
                    push_unique(&mut select_labels[index], label);
                }
            }
            values.push(value);
        }
        normalized_records.push((title, values));
    }

    let table_id = format!("database_mcp_{batch_id}");
    let title_property_id = format!("property_mcp_{batch_id}_title");
    let view_id = format!("view_mcp_{batch_id}_table");
    let mut properties = Map::new();
    properties.insert(
        title_property_id.clone(),
        json!({
            "id": title_property_id,
            "key": "name",
            "name": "名称",
            "type": "title",
            "config": {},
            "createdAt": now,
            "updatedAt": now,
        }),
    );

    let mut property_order = vec![title_property_id.clone()];
    let mut property_ids = Vec::with_capacity(columns.len());
    for (index, column) in columns.iter().enumerate() {
        let property_id = format!("property_mcp_{batch_id}_{index}");
        let config = match column.kind {
            DataTablePropertyType::Select | DataTablePropertyType::MultiSelect => json!({
                "options": select_labels[index]
                    .iter()
                    .enumerate()
                    .map(|(option_index, label)| json!({
                        "id": format!("option_mcp_{batch_id}_{index}_{option_index}"),
                        "label": label,
                        "color": option_color(option_index),
                    }))
                    .collect::<Vec<_>>(),
            }),
            DataTablePropertyType::Formula => json!({
                "formulaExpression": column.formula_expression.as_deref().expect("formula is validated"),
            }),
            _ => json!({}),
        };
        properties.insert(
            property_id.clone(),
            json!({
                "id": property_id,
                "key": column.key,
                "name": column.name,
                "type": property_type_name(column.kind),
                "config": config,
                "createdAt": now,
                "updatedAt": now,
            }),
        );
        property_order.push(property_id.clone());
        property_ids.push(property_id);
    }

    let mut records = Map::new();
    let mut record_pages = Map::new();
    for (index, (record_title, values)) in normalized_records.into_iter().enumerate() {
        let record_id = format!("record_mcp_{batch_id}_{index}");
        let mut value_map = Map::new();
        value_map.insert(
            title_property_id.clone(),
            Value::String(record_title.clone()),
        );
        for (property_id, value) in property_ids.iter().zip(values) {
            value_map.insert(property_id.clone(), value);
        }
        records.insert(
            record_id.clone(),
            json!({
                "id": record_id,
                "title": record_title,
                "values": value_map,
                "createdAt": now,
                "updatedAt": now,
            }),
        );
        record_pages.insert(
            record_id.clone(),
            json!({ "recordId": record_id, "blockIds": [], "updatedAt": now }),
        );
    }

    let view = default_table_view(&view_id, now);
    let snapshot = json!({
        "version": 1,
        "database": {
            "id": table_id,
            "name": title,
            "propertyOrder": property_order,
            "activeViewId": view_id,
            "viewOrder": [view_id],
            "views": { view_id: view },
            "createdAt": now,
            "updatedAt": now,
        },
        "properties": properties,
        "records": records,
        "recordPages": record_pages,
        "blocks": {},
        "assets": {},
    });

    Ok(NormalizedDataTable {
        block: json!({ "type": "data_table", "databaseId": table_id }),
        record: DataTableRecord {
            id: table_id,
            title,
            icon: None,
            cover: None,
            snapshot,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        },
    })
}

pub(super) fn normalize_whiteboard(
    input: &WhiteboardInput,
    batch_id: &str,
    now: &str,
) -> StorageResult<NormalizedWhiteboard> {
    let title = required_text(&input.title, "whiteboard title")?;
    let elements = normalize_whiteboard_elements(input, &HashSet::new(), batch_id)?;
    let board_id = format!("board_mcp_{batch_id}");
    let snapshot = json!({
        "camera": { "x": 0, "y": 0, "scale": 1 },
        "color": "#17202a",
        "strokeSize": 6,
        "textFontFamily": "Inter, Segoe UI, sans-serif",
        "textFontSize": 24,
        "lineMode": "curve",
        "lineStartMarker": "none",
        "lineEndMarker": "none",
        "shapeType": "rect",
        "shapes": elements.shapes,
        "strokes": elements.strokes,
        "connections": elements.connections,
        "notes": elements.notes,
        "texts": elements.texts,
        "images": [],
    });

    Ok(NormalizedWhiteboard {
        block: json!({ "type": "whiteboard", "boardId": board_id }),
        record: BoardRecord {
            id: board_id,
            title,
            snapshot,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        },
    })
}

pub(super) fn normalize_whiteboard_elements(
    input: &WhiteboardInput,
    existing_node_ids: &HashSet<String>,
    batch_id: &str,
) -> StorageResult<NormalizedWhiteboardElements> {
    if input.nodes.len() > MAX_WHITEBOARD_NODES {
        return Err(StorageError::invalid_payload(format!(
            "whiteboard accepts at most {MAX_WHITEBOARD_NODES} nodes"
        )));
    }
    if input.edges.len() > MAX_WHITEBOARD_EDGES {
        return Err(StorageError::invalid_payload(format!(
            "whiteboard accepts at most {MAX_WHITEBOARD_EDGES} edges"
        )));
    }
    if input.strokes.len() > MAX_WHITEBOARD_STROKES {
        return Err(StorageError::invalid_payload(format!(
            "whiteboard accepts at most {MAX_WHITEBOARD_STROKES} strokes"
        )));
    }

    let mut node_ids = existing_node_ids.clone();
    let mut shapes = Vec::new();
    let mut notes = Vec::new();
    let mut texts = Vec::new();
    for (index, node) in input.nodes.iter().enumerate() {
        let node_id = required_text(&node.id, "whiteboard node id")?;
        if !node_ids.insert(node_id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate whiteboard node id: {node_id}"
            )));
        }
        let x = finite_coordinate(node.x.unwrap_or(40.0 + (index % 3) as f64 * 260.0), "x")?;
        let y = finite_coordinate(node.y.unwrap_or(80.0 + (index / 3) as f64 * 160.0), "y")?;
        let z = node.z.unwrap_or((index + 1) as u32);
        if z > MAX_WHITEBOARD_Z {
            return Err(StorageError::invalid_payload(format!(
                "whiteboard z must be at most {MAX_WHITEBOARD_Z}"
            )));
        }
        match node.kind {
            WhiteboardNodeKind::Rect
            | WhiteboardNodeKind::Ellipse
            | WhiteboardNodeKind::Diamond
            | WhiteboardNodeKind::Triangle => shapes.push(json!({
                "id": node_id,
                "type": whiteboard_shape_name(node.kind),
                "x": x,
                "y": y,
                "w": whiteboard_dimension(node.w, 180.0, "width", 8.0, 2400.0)?,
                "h": whiteboard_dimension(node.h, 96.0, "height", 8.0, 2400.0)?,
                "color": whiteboard_color(node.color.as_deref(), "#0f766e", "node color")?,
                "size": whiteboard_size(node.size, 3.0, "shape size", 1.0, 40.0)?,
                "text": node.text,
                "z": z,
            })),
            WhiteboardNodeKind::Note => {
                if node.size.is_some() {
                    return Err(StorageError::invalid_payload(
                        "whiteboard note does not support size",
                    ));
                }
                notes.push(json!({
                    "id": node_id,
                    "x": x,
                    "y": y,
                    "w": whiteboard_dimension(node.w, 180.0, "width", 150.0, 1200.0)?,
                    "h": whiteboard_dimension(node.h, 96.0, "height", 112.0, 2400.0)?,
                    "text": node.text,
                    "color": whiteboard_color(node.color.as_deref(), "#fef3c7", "node color")?,
                    "z": z,
                }));
            }
            WhiteboardNodeKind::Text => texts.push(json!({
                "id": node_id,
                "x": x,
                "y": y,
                "w": whiteboard_dimension(node.w, 180.0, "width", 60.0, 1600.0)?,
                "h": whiteboard_dimension(node.h, 48.0, "height", 30.0, 1200.0)?,
                "text": node.text,
                "color": whiteboard_color(node.color.as_deref(), "#17202a", "node color")?,
                "fontFamily": "Inter, Segoe UI, sans-serif",
                "fontSize": whiteboard_size(node.size, 24.0, "text size", 10.0, 120.0)?,
                "fontWeight": "400",
                "fontStyle": "normal",
                "autoSize": false,
                "z": z,
            })),
        }
    }

    let mut edge_ids = HashSet::new();
    let mut connections = Vec::with_capacity(input.edges.len());
    for (index, edge) in input.edges.iter().enumerate() {
        let from = required_text(&edge.from, "whiteboard edge from")?;
        let to = required_text(&edge.to, "whiteboard edge to")?;
        if from == to {
            return Err(StorageError::invalid_payload(
                "whiteboard edge cannot connect a node to itself",
            ));
        }
        if !node_ids.contains(&from) || !node_ids.contains(&to) {
            return Err(StorageError::invalid_payload(format!(
                "whiteboard edge references a missing node: {from} -> {to}"
            )));
        }
        let edge_id = edge
            .id
            .as_deref()
            .map(|value| required_text(value, "whiteboard edge id"))
            .transpose()?
            .unwrap_or_else(|| format!("connection_mcp_{batch_id}_{index}"));
        if !edge_ids.insert(edge_id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate whiteboard edge id: {edge_id}"
            )));
        }
        let from_anchor = edge
            .from_anchor
            .as_ref()
            .map(normalize_whiteboard_anchor)
            .transpose()?;
        let to_anchor = edge
            .to_anchor
            .as_ref()
            .map(normalize_whiteboard_anchor)
            .transpose()?;
        let from_side = from_anchor
            .is_none()
            .then(|| whiteboard_side(edge.from_side.unwrap_or(WhiteboardConnectionSide::E)));
        let to_side = to_anchor
            .is_none()
            .then(|| whiteboard_side(edge.to_side.unwrap_or(WhiteboardConnectionSide::W)));
        connections.push(json!({
            "id": edge_id,
            "from": from,
            "to": to,
            "fromSide": from_side,
            "toSide": to_side,
            "fromAnchor": from_anchor,
            "toAnchor": to_anchor,
            "fromMarker": whiteboard_marker(edge.from_marker.unwrap_or(WhiteboardConnectionMarker::None)),
            "toMarker": whiteboard_marker(edge.to_marker.unwrap_or(WhiteboardConnectionMarker::Arrow)),
            "mode": whiteboard_line_mode(edge.mode.unwrap_or(WhiteboardLineMode::Straight)),
            "color": whiteboard_color(edge.color.as_deref(), "#0f766e", "edge color")?,
            "size": whiteboard_size(edge.size, 3.0, "edge size", 1.0, 24.0)?,
        }));
    }

    let mut stroke_ids = HashSet::new();
    let mut stroke_point_count = 0usize;
    let mut strokes = Vec::with_capacity(input.strokes.len());
    for (index, stroke) in input.strokes.iter().enumerate() {
        if stroke.points.is_empty() {
            return Err(StorageError::invalid_payload(
                "whiteboard stroke requires at least one point",
            ));
        }
        stroke_point_count = stroke_point_count.saturating_add(stroke.points.len());
        if stroke_point_count > MAX_WHITEBOARD_STROKE_POINTS {
            return Err(StorageError::invalid_payload(format!(
                "whiteboard accepts at most {MAX_WHITEBOARD_STROKE_POINTS} stroke points"
            )));
        }
        let stroke_id = stroke
            .id
            .as_deref()
            .map(|value| required_text(value, "whiteboard stroke id"))
            .transpose()?
            .unwrap_or_else(|| format!("stroke_mcp_{batch_id}_{index}"));
        if !stroke_ids.insert(stroke_id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate whiteboard stroke id: {stroke_id}"
            )));
        }
        let points = stroke
            .points
            .iter()
            .map(|point| {
                Ok(json!({
                    "x": finite_coordinate(point.x, "stroke x")?,
                    "y": finite_coordinate(point.y, "stroke y")?,
                }))
            })
            .collect::<StorageResult<Vec<_>>>()?;
        strokes.push(json!({
            "id": stroke_id,
            "color": whiteboard_color(Some(&stroke.color), "#17202a", "stroke color")?,
            "size": whiteboard_size(Some(stroke.size), 6.0, "stroke size", 1.0, 80.0)?,
            "points": points,
        }));
    }

    ensure_unique_whiteboard_element_ids(&[&shapes, &notes, &texts, &connections, &strokes])?;

    Ok(NormalizedWhiteboardElements {
        shapes,
        notes,
        texts,
        connections,
        strokes,
    })
}

fn ensure_unique_whiteboard_element_ids(collections: &[&Vec<Value>]) -> StorageResult<()> {
    let mut ids = HashSet::new();
    for value in collections.iter().flat_map(|values| values.iter()) {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .expect("normalized whiteboard element has id");
        if !ids.insert(id) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate whiteboard element id: {id}"
            )));
        }
    }
    Ok(())
}

pub(super) fn normalize_mindmap(
    input: &MindmapInput,
    batch_id: &str,
    now: &str,
) -> StorageResult<NormalizedMindmap> {
    let title = required_text(&input.title, "mindmap title")?;
    let mut state = MindmapBuildState {
        batch_id,
        used_ids: HashSet::new(),
        generated_id: 0,
        node_count: 0,
        nodes: Map::new(),
    };
    let root_id = state.insert_node(&input.root, None, 1)?;
    let mindmap_id = format!("mindmap_mcp_{batch_id}");
    let snapshot = json!({
        "id": "doc-root",
        "title": title,
        "structure": "mindmap",
        "themeId": "classic",
        "nodeShape": "rounded",
        "autoBalanceLayout": false,
        "rootId": root_id,
        "viewport": { "x": 0, "y": 0, "scale": 1 },
        "updatedAt": now,
        "nodes": state.nodes,
    });

    Ok(NormalizedMindmap {
        block: json!({ "type": "mindmap", "mindmapId": mindmap_id }),
        record: MindmapRecord {
            id: mindmap_id,
            title,
            snapshot,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        },
    })
}

struct PreparedColumn {
    key: String,
    name: String,
    kind: DataTablePropertyType,
    formula_expression: Option<String>,
}

struct MindmapBuildState<'a> {
    batch_id: &'a str,
    used_ids: HashSet<String>,
    generated_id: usize,
    node_count: usize,
    nodes: Map<String, Value>,
}

impl MindmapBuildState<'_> {
    fn insert_node(
        &mut self,
        input: &MindmapNodeInput,
        parent_id: Option<&str>,
        depth: usize,
    ) -> StorageResult<String> {
        if depth > MAX_MINDMAP_DEPTH {
            return Err(StorageError::invalid_payload(format!(
                "mindmap depth exceeds {MAX_MINDMAP_DEPTH}"
            )));
        }
        if self.node_count >= MAX_MINDMAP_NODES {
            return Err(StorageError::invalid_payload(format!(
                "mindmap accepts at most {MAX_MINDMAP_NODES} nodes"
            )));
        }
        self.node_count += 1;
        let id = match input.id.as_deref() {
            Some(id) => required_text(id, "mindmap node id")?,
            None => self.next_id(),
        };
        if !self.used_ids.insert(id.clone()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate mindmap node id: {id}"
            )));
        }
        let text = required_text(&input.text, "mindmap node text")?;
        let mut child_ids = Vec::with_capacity(input.children.len());
        for child in &input.children {
            child_ids.push(self.insert_node(child, Some(&id), depth + 1)?);
        }
        let mut node = json!({
            "id": id,
            "parentId": parent_id,
            "childIds": child_ids,
            "text": text,
            "collapsed": false,
            "style": { "branchColor": "#0f766e" },
        });
        if parent_id.is_none() {
            node["style"]["nodeColor"] = Value::String("#ffffff".to_string());
        }
        self.nodes.insert(id.clone(), node);
        Ok(id)
    }

    fn next_id(&mut self) -> String {
        loop {
            let id = format!("mindmap_mcp_{}_node_{}", self.batch_id, self.generated_id);
            self.generated_id += 1;
            if !self.used_ids.contains(&id) {
                return id;
            }
        }
    }
}

fn required_text(value: &str, label: &str) -> StorageResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(StorageError::invalid_payload(format!(
            "{label} cannot be empty"
        )));
    }
    Ok(value.to_string())
}

fn normalize_data_table_value(value: &Value, column: &PreparedColumn) -> StorageResult<Value> {
    if value.is_null() {
        return Ok(Value::Null);
    }
    let valid = match column.kind {
        DataTablePropertyType::Text | DataTablePropertyType::Date => value.is_string(),
        DataTablePropertyType::Number => value.as_f64().is_some_and(f64::is_finite),
        DataTablePropertyType::Select => value.is_string(),
        DataTablePropertyType::MultiSelect => value
            .as_array()
            .is_some_and(|values| values.iter().all(Value::is_string)),
        DataTablePropertyType::Checkbox => value.is_boolean(),
        DataTablePropertyType::Formula => false,
        DataTablePropertyType::Title => false,
    };
    if !valid {
        return Err(StorageError::invalid_payload(format!(
            "data table value for {} does not match {}",
            column.key,
            property_type_name(column.kind)
        )));
    }
    if column.kind == DataTablePropertyType::MultiSelect {
        let mut labels = Vec::new();
        for label in value.as_array().expect("multi select is validated") {
            let label = label.as_str().expect("multi select entries are validated");
            if !labels.iter().any(|existing: &String| existing == label) {
                labels.push(label.to_string());
            }
        }
        return Ok(json!(labels));
    }
    Ok(value.clone())
}

fn default_table_view(view_id: &str, now: &str) -> Value {
    json!({
        "id": view_id,
        "name": "表格视图",
        "layout": "table",
        "sort": null,
        "filters": [],
        "tableGroupPropertyId": null,
        "tableGroupOrder": [],
        "tableHiddenGroupIds": [],
        "tableCollapsedGroupIds": [],
        "tableHideEmptyGroups": false,
        "boardGroupPropertyId": null,
        "boardColumnOrder": [],
        "boardHiddenColumnIds": [],
        "boardRecordOrder": [],
        "boardCardSortMode": "manual",
        "boardShowPropertyNames": true,
        "ganttStartPropertyId": null,
        "ganttEndPropertyId": null,
        "ganttTimelineScale": "day",
        "calendarDatePropertyId": null,
        "openMode": "sidePeek",
        "tableWidthMode": "fitPage",
        "tablePageSize": 10,
        "wrapCells": false,
        "freezeFirstColumn": false,
        "hiddenPropertyIds": [],
        "columnWidths": {},
        "createdAt": now,
        "updatedAt": now,
    })
}

fn property_type_name(kind: DataTablePropertyType) -> &'static str {
    match kind {
        DataTablePropertyType::Title => "title",
        DataTablePropertyType::Text => "text",
        DataTablePropertyType::Number => "number",
        DataTablePropertyType::Select => "select",
        DataTablePropertyType::MultiSelect => "multiSelect",
        DataTablePropertyType::Date => "date",
        DataTablePropertyType::Checkbox => "checkbox",
        DataTablePropertyType::Formula => "formula",
    }
}

fn option_color(index: usize) -> &'static str {
    const COLORS: [&str; 9] = [
        "#7c3aed", "#2563eb", "#0f766e", "#16a34a", "#ca8a04", "#ea580c", "#db2777", "#dc2626",
        "#475569",
    ];
    COLORS[index % COLORS.len()]
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    if !values.iter().any(|existing| existing == value) {
        values.push(value.to_string());
    }
}

fn finite_coordinate(value: f64, axis: &str) -> StorageResult<f64> {
    if value.is_finite() && value.abs() <= MAX_WHITEBOARD_COORDINATE {
        Ok(value)
    } else {
        Err(StorageError::invalid_payload(format!(
            "whiteboard {axis} coordinate must be finite and no greater than {MAX_WHITEBOARD_COORDINATE} in magnitude"
        )))
    }
}

fn deserialize_limited_whiteboard_strokes<'de, D>(
    deserializer: D,
) -> Result<Vec<WhiteboardStrokeInput>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_seq(LimitedWhiteboardVecVisitor::new(
        MAX_WHITEBOARD_STROKES,
        "whiteboard accepts at most 500 strokes",
    ))
}

fn deserialize_limited_whiteboard_stroke_points<'de, D>(
    deserializer: D,
) -> Result<Vec<WhiteboardStrokePointInput>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_seq(LimitedWhiteboardVecVisitor::new(
        MAX_WHITEBOARD_STROKE_POINTS_PER_STROKE,
        "whiteboard stroke accepts at most 1,000 points",
    ))
}

struct LimitedWhiteboardVecVisitor<T> {
    max: usize,
    error: &'static str,
    marker: PhantomData<fn() -> T>,
}

impl<T> LimitedWhiteboardVecVisitor<T> {
    fn new(max: usize, error: &'static str) -> Self {
        Self {
            max,
            error,
            marker: PhantomData,
        }
    }
}

impl<'de, T> Visitor<'de> for LimitedWhiteboardVecVisitor<T>
where
    T: Deserialize<'de>,
{
    type Value = Vec<T>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a size-limited whiteboard array")
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
        match sequence.next_element_seed(RejectExtraWhiteboardElementSeed(self.error))? {
            None => Ok(values),
            Some(()) => unreachable!("extra-element seed always rejects"),
        }
    }
}

struct RejectExtraWhiteboardElementSeed(&'static str);

impl<'de> DeserializeSeed<'de> for RejectExtraWhiteboardElementSeed {
    type Value = ();

    fn deserialize<D>(self, _deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        Err(de::Error::custom(self.0))
    }
}

fn whiteboard_dimension(
    value: Option<f64>,
    default: f64,
    label: &str,
    min: f64,
    max: f64,
) -> StorageResult<f64> {
    let Some(value) = value else {
        return Ok(default);
    };
    if !value.is_finite() || value < min || value > max {
        return Err(StorageError::invalid_payload(format!(
            "whiteboard {label} must be finite and between {min} and {max}"
        )));
    }
    Ok(value)
}

fn whiteboard_size(
    value: Option<f64>,
    default: f64,
    label: &str,
    min: f64,
    max: f64,
) -> StorageResult<f64> {
    let value = value.unwrap_or(default);
    if !value.is_finite() || value < min || value > max {
        return Err(StorageError::invalid_payload(format!(
            "whiteboard {label} must be finite and between {min} and {max}"
        )));
    }
    Ok(value)
}

fn whiteboard_color(value: Option<&str>, default: &str, label: &str) -> StorageResult<String> {
    let value = value.unwrap_or(default).trim();
    let hex = value.strip_prefix('#').unwrap_or(value);
    let normalized = match hex.len() {
        3 if hex.bytes().all(|character| character.is_ascii_hexdigit()) => hex
            .bytes()
            .flat_map(|character| [character, character])
            .map(char::from)
            .collect::<String>(),
        6 if hex.bytes().all(|character| character.is_ascii_hexdigit()) => hex.to_string(),
        _ => {
            return Err(StorageError::invalid_payload(format!(
                "whiteboard {label} must be a 3 or 6 digit hexadecimal color"
            )));
        }
    };
    Ok(format!("#{}", normalized.to_ascii_lowercase()))
}

fn normalize_whiteboard_anchor(anchor: &WhiteboardConnectionAnchorInput) -> StorageResult<Value> {
    let x = finite_coordinate(anchor.x, "anchor x")?;
    let y = finite_coordinate(anchor.y, "anchor y")?;
    if !(0.0..=1.0).contains(&x) || !(0.0..=1.0).contains(&y) {
        return Err(StorageError::invalid_payload(
            "whiteboard anchor coordinates must be between 0 and 1",
        ));
    }
    Ok(json!({ "x": x, "y": y }))
}

fn whiteboard_side(side: WhiteboardConnectionSide) -> &'static str {
    match side {
        WhiteboardConnectionSide::N => "n",
        WhiteboardConnectionSide::E => "e",
        WhiteboardConnectionSide::S => "s",
        WhiteboardConnectionSide::W => "w",
    }
}

fn whiteboard_line_mode(mode: WhiteboardLineMode) -> &'static str {
    match mode {
        WhiteboardLineMode::Straight => "straight",
        WhiteboardLineMode::Curve => "curve",
    }
}

fn whiteboard_marker(marker: WhiteboardConnectionMarker) -> &'static str {
    match marker {
        WhiteboardConnectionMarker::None => "none",
        WhiteboardConnectionMarker::Arrow => "arrow",
        WhiteboardConnectionMarker::Bar => "bar",
        WhiteboardConnectionMarker::Dot => "dot",
        WhiteboardConnectionMarker::Circle => "circle",
        WhiteboardConnectionMarker::Diamond => "diamond",
    }
}

fn whiteboard_shape_name(kind: WhiteboardNodeKind) -> &'static str {
    match kind {
        WhiteboardNodeKind::Rect => "rect",
        WhiteboardNodeKind::Ellipse => "ellipse",
        WhiteboardNodeKind::Diamond => "diamond",
        WhiteboardNodeKind::Triangle => "triangle",
        WhiteboardNodeKind::Note | WhiteboardNodeKind::Text => {
            unreachable!("only shape kinds are passed to whiteboard_shape_name")
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        normalize_data_table, normalize_mindmap, normalize_whiteboard, DataTableInput,
        MindmapInput, WhiteboardInput,
    };

    const NOW: &str = "2026-07-12T00:00:00.000Z";
    const BATCH: &str = "semantic_test";

    #[test]
    fn creates_a_native_data_table_snapshot_with_inferred_select_options() {
        let input: DataTableInput = serde_json::from_value(json!({
            "title": "项目",
            "columns": [
                { "key": "status", "name": "状态", "type": "select" },
                { "key": "tags", "name": "标签", "type": "multiSelect" },
                { "key": "budget", "name": "预算", "type": "number" },
                { "key": "done", "name": "完成", "type": "checkbox" }
            ],
            "records": [
                { "title": "MCP", "values": { "status": "进行中", "tags": ["平台", "安全", "平台"], "budget": 2000, "done": false } },
                { "title": "验收", "values": { "status": "待开始", "tags": ["安全"], "budget": 0, "done": true } }
            ]
        }))
        .expect("valid table input");

        let normalized = normalize_data_table(&input, BATCH, NOW).expect("normalizes table");

        assert_eq!(normalized.block["type"], "data_table");
        assert_eq!(normalized.record.snapshot["version"], 1);
        assert_eq!(normalized.record.snapshot["database"]["name"], "项目");
        assert_eq!(
            normalized.record.snapshot["database"]["views"]
                .as_object()
                .unwrap()
                .len(),
            1
        );
        let properties = normalized.record.snapshot["properties"]
            .as_object()
            .expect("properties");
        assert_eq!(
            properties.len(),
            5,
            "one title property plus four input columns"
        );
        let status = properties
            .values()
            .find(|property| property["key"] == "status")
            .expect("status property");
        assert_eq!(status["config"]["options"].as_array().unwrap().len(), 2);
        let tags = properties
            .values()
            .find(|property| property["key"] == "tags")
            .expect("tags property");
        assert_eq!(tags["config"]["options"].as_array().unwrap().len(), 2);
        assert_eq!(
            normalized.record.snapshot["records"]
                .as_object()
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn rejects_data_table_type_and_reference_errors_before_creating_a_snapshot() {
        let invalid_value: DataTableInput = serde_json::from_value(json!({
            "title": "项目",
            "columns": [{ "key": "budget", "name": "预算", "type": "number" }],
            "records": [{ "title": "错误", "values": { "budget": "很多" } }]
        }))
        .expect("structurally valid input");
        assert!(normalize_data_table(&invalid_value, BATCH, NOW).is_err());

        let unknown_column: DataTableInput = serde_json::from_value(json!({
            "title": "项目",
            "columns": [{ "key": "status", "name": "状态", "type": "select" }],
            "records": [{ "title": "错误", "values": { "missing": "值" } }]
        }))
        .expect("structurally valid input");
        assert!(normalize_data_table(&unknown_column, BATCH, NOW).is_err());
    }

    #[test]
    fn creates_a_legacy_whiteboard_snapshot_with_deterministic_grid_and_connections() {
        let input: WhiteboardInput = serde_json::from_value(json!({
            "title": "发布流程",
            "nodes": [
                { "id": "start", "kind": "ellipse", "text": "开始" },
                { "id": "check", "kind": "diamond", "text": "检查" },
                { "id": "release", "kind": "rect", "text": "发布", "x": 600, "y": 80 }
            ],
            "edges": [{ "from": "start", "to": "check" }, { "from": "check", "to": "release" }]
        }))
        .expect("valid whiteboard input");

        let normalized = normalize_whiteboard(&input, BATCH, NOW).expect("normalizes whiteboard");

        assert_eq!(normalized.block["type"], "whiteboard");
        assert_eq!(
            normalized.record.snapshot["shapes"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            normalized.record.snapshot["connections"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(normalized.record.snapshot["shapes"][0]["x"], 40.0);
        assert_eq!(normalized.record.snapshot["shapes"][2]["x"], 600.0);
        assert_eq!(
            normalized.record.snapshot["connections"][0]["toMarker"],
            "arrow"
        );
    }

    #[test]
    fn creates_a_fully_styled_whiteboard_with_anchors_and_strokes() {
        let input: WhiteboardInput = serde_json::from_value(json!({
            "title": "部署架构",
            "nodes": [
                {
                    "id": "client",
                    "kind": "rect",
                    "text": "客户端",
                    "x": 24,
                    "y": 36,
                    "w": 220,
                    "h": 108,
                    "color": "#2563eb",
                    "size": 4,
                    "z": 7
                },
                {
                    "id": "gateway",
                    "kind": "note",
                    "text": "网关",
                    "w": 196,
                    "h": 112,
                    "color": "#fef3c7",
                    "z": 8
                },
                {
                    "id": "label",
                    "kind": "text",
                    "text": "生产环境",
                    "size": 28,
                    "color": "#17202a",
                    "z": 9
                }
            ],
            "edges": [{
                "id": "client-gateway",
                "from": "client",
                "to": "gateway",
                "fromSide": "s",
                "toSide": "n",
                "fromAnchor": { "x": 0.5, "y": 1.0 },
                "toAnchor": { "x": 0.5, "y": 0.0 },
                "mode": "curve",
                "fromMarker": "dot",
                "toMarker": "diamond",
                "color": "#7c3aed",
                "size": 5
            }],
            "strokes": [{
                "id": "annotation",
                "color": "#dc2626",
                "size": 6,
                "points": [{ "x": 8, "y": 12 }, { "x": 32, "y": 48 }]
            }]
        }))
        .expect("fully styled whiteboard input");

        let normalized = normalize_whiteboard(&input, BATCH, NOW).expect("normalizes whiteboard");
        let snapshot = &normalized.record.snapshot;

        assert_eq!(snapshot["shapes"][0]["w"], 220.0);
        assert_eq!(snapshot["shapes"][0]["h"], 108.0);
        assert_eq!(snapshot["shapes"][0]["color"], "#2563eb");
        assert_eq!(snapshot["shapes"][0]["size"], 4.0);
        assert_eq!(snapshot["shapes"][0]["z"], 7);
        assert_eq!(snapshot["notes"][0]["w"], 196.0);
        assert_eq!(snapshot["texts"][0]["fontSize"], 28.0);
        assert!(snapshot["connections"][0]["fromSide"].is_null());
        assert!(snapshot["connections"][0]["toSide"].is_null());
        assert_eq!(snapshot["connections"][0]["fromAnchor"]["y"], 1.0);
        assert_eq!(snapshot["connections"][0]["mode"], "curve");
        assert_eq!(snapshot["connections"][0]["fromMarker"], "dot");
        assert_eq!(snapshot["connections"][0]["toMarker"], "diamond");
        assert_eq!(snapshot["connections"][0]["color"], "#7c3aed");
        assert_eq!(snapshot["connections"][0]["size"], 5.0);
        assert_eq!(snapshot["strokes"][0]["id"], "annotation");
        assert_eq!(snapshot["strokes"][0]["points"][1]["y"], 48.0);
    }

    #[test]
    fn rejects_whiteboard_ids_reused_across_nodes_edges_and_strokes() {
        let input: WhiteboardInput = serde_json::from_value(json!({
            "title": "duplicate ids",
            "nodes": [{ "id": "same", "kind": "rect", "text": "A" }, { "id": "other", "kind": "rect", "text": "B" }],
            "edges": [{ "id": "same", "from": "same", "to": "other" }],
            "strokes": [{ "id": "other", "color": "#000000", "size": 3, "points": [{ "x": 0, "y": 0 }] }]
        })).expect("input");

        assert!(normalize_whiteboard(&input, BATCH, NOW).is_err());
    }

    #[test]
    fn anchors_take_precedence_over_default_connection_sides() {
        let input: WhiteboardInput = serde_json::from_value(json!({
            "title": "锚点",
            "nodes": [
                { "id": "from", "kind": "rect", "text": "起点", "x": 0, "y": 0 },
                { "id": "to", "kind": "rect", "text": "终点", "x": 400, "y": 200 }
            ],
            "edges": [{
                "from": "from",
                "to": "to",
                "fromAnchor": { "x": 0.25, "y": 1.0 },
                "toAnchor": { "x": 0.75, "y": 0.0 }
            }]
        }))
        .expect("valid anchored whiteboard");

        let normalized = normalize_whiteboard(&input, BATCH, NOW).expect("normalizes anchors");
        assert!(normalized.record.snapshot["connections"][0]["fromSide"].is_null());
        assert!(normalized.record.snapshot["connections"][0]["toSide"].is_null());
    }

    #[test]
    fn rejects_whiteboard_coordinates_and_z_past_safe_bounds() {
        let coordinate: WhiteboardInput = serde_json::from_value(json!({
            "title": "边界",
            "nodes": [{ "id": "node", "kind": "rect", "text": "节点", "x": 1_000_001 }]
        }))
        .expect("structurally valid coordinate input");
        assert!(normalize_whiteboard(&coordinate, BATCH, NOW).is_err());

        let stroke_point: WhiteboardInput = serde_json::from_value(json!({
            "title": "边界",
            "strokes": [{
                "color": "#000000",
                "size": 3,
                "points": [{ "x": 1_000_001, "y": 0 }]
            }]
        }))
        .expect("structurally valid stroke input");
        assert!(normalize_whiteboard(&stroke_point, BATCH, NOW).is_err());

        let z: WhiteboardInput = serde_json::from_value(json!({
            "title": "边界",
            "nodes": [{ "id": "node", "kind": "rect", "text": "节点", "z": 1_000_001 }]
        }))
        .expect("structurally valid z input");
        assert!(normalize_whiteboard(&z, BATCH, NOW).is_err());
    }

    #[test]
    fn enforces_the_total_stroke_point_limit_across_multiple_strokes() {
        let strokes = (0..10)
            .map(|stroke| {
                json!({
                    "id": format!("stroke_{stroke}"),
                    "color": "#000000",
                    "size": 3,
                    "points": (0..1_000).map(|point| json!({ "x": point, "y": stroke })).collect::<Vec<_>>(),
                })
            })
            .collect::<Vec<_>>();
        let at_limit: WhiteboardInput = serde_json::from_value(json!({
            "title": "总点数", "strokes": strokes
        }))
        .expect("10,000 stroke points are structurally valid");
        assert!(normalize_whiteboard(&at_limit, BATCH, NOW).is_ok());

        let mut too_many = at_limit.strokes;
        too_many.push(super::WhiteboardStrokeInput {
            id: Some("one_too_many".to_string()),
            color: "#000000".to_string(),
            size: 3.0,
            points: vec![super::WhiteboardStrokePointInput { x: 0.0, y: 0.0 }],
        });
        let over_limit = WhiteboardInput {
            title: "总点数".to_string(),
            nodes: Vec::new(),
            edges: Vec::new(),
            strokes: too_many,
        };
        assert!(normalize_whiteboard(&over_limit, BATCH, NOW).is_err());
    }

    #[test]
    fn rejects_invalid_whiteboard_ids_edges_coordinates_and_limits() {
        let duplicate: WhiteboardInput = serde_json::from_value(json!({
            "title": "流程", "nodes": [
                { "id": "a", "kind": "rect", "text": "A" },
                { "id": "a", "kind": "rect", "text": "B" }
            ]
        }))
        .expect("structurally valid duplicate input");
        assert!(normalize_whiteboard(&duplicate, BATCH, NOW).is_err());

        let dangling: WhiteboardInput = serde_json::from_value(json!({
            "title": "流程", "nodes": [{ "id": "a", "kind": "rect", "text": "A" }],
            "edges": [{ "from": "a", "to": "missing" }]
        }))
        .expect("structurally valid dangling edge input");
        assert!(normalize_whiteboard(&dangling, BATCH, NOW).is_err());

        let non_finite = WhiteboardInput {
            title: "流程".to_string(),
            nodes: vec![super::WhiteboardNodeInput {
                id: "a".to_string(),
                kind: super::WhiteboardNodeKind::Rect,
                text: "A".to_string(),
                x: Some(f64::NAN),
                y: None,
                w: None,
                h: None,
                color: None,
                size: None,
                z: None,
            }],
            edges: Vec::new(),
            strokes: Vec::new(),
        };
        assert!(normalize_whiteboard(&non_finite, BATCH, NOW).is_err());

        for value in [
            json!({
                "title": "颜色", "nodes": [{ "id": "node", "kind": "rect", "text": "节点", "color": "blue" }]
            }),
            json!({
                "title": "尺寸", "nodes": [{ "id": "node", "kind": "rect", "text": "节点", "size": 0 }]
            }),
            json!({
                "title": "锚点", "nodes": [
                    { "id": "from", "kind": "rect", "text": "起点" },
                    { "id": "to", "kind": "rect", "text": "终点" }
                ], "edges": [{ "from": "from", "to": "to", "fromAnchor": { "x": 1.1, "y": 0 } }]
            }),
            json!({
                "title": "空笔画", "strokes": [{ "color": "#000000", "size": 3, "points": [] }]
            }),
            json!({
                "title": "重复笔画", "strokes": [
                    { "id": "stroke", "color": "#000000", "size": 3, "points": [{ "x": 0, "y": 0 }] },
                    { "id": "stroke", "color": "#000000", "size": 3, "points": [{ "x": 1, "y": 1 }] }
                ]
            }),
        ] {
            let input: WhiteboardInput =
                serde_json::from_value(value).expect("structurally valid input");
            assert!(normalize_whiteboard(&input, BATCH, NOW).is_err());
        }
    }

    #[test]
    fn creates_an_editable_recursive_mindmap_snapshot_and_enforces_depth() {
        let input: MindmapInput = serde_json::from_value(json!({
            "title": "MCP 计划",
            "root": {
                "id": "root",
                "text": "中心主题",
                "children": [{ "id": "delivery", "text": "交付", "children": [{ "text": "验收" }] }]
            }
        }))
        .expect("valid mindmap input");

        let normalized = normalize_mindmap(&input, BATCH, NOW).expect("normalizes mindmap");

        assert_eq!(normalized.block["type"], "mindmap");
        assert_eq!(normalized.record.snapshot["structure"], "mindmap");
        assert_eq!(normalized.record.snapshot["rootId"], "root");
        assert_eq!(
            normalized.record.snapshot["nodes"]["root"]["childIds"],
            json!(["delivery"])
        );
        assert_eq!(
            normalized.record.snapshot["nodes"]["delivery"]["parentId"],
            "root"
        );

        let mut deep = json!({ "text": "leaf" });
        for _ in 0..32 {
            deep = json!({ "text": "parent", "children": [deep] });
        }
        let too_deep: MindmapInput =
            serde_json::from_value(json!({ "title": "深度", "root": deep }))
                .expect("structurally valid deep input");
        assert!(normalize_mindmap(&too_deep, BATCH, NOW).is_err());

        let duplicate: MindmapInput = serde_json::from_value(json!({
            "title": "重复", "root": { "id": "same", "text": "根", "children": [{ "id": "same", "text": "子" }] }
        }))
        .expect("structurally valid duplicate input");
        assert!(normalize_mindmap(&duplicate, BATCH, NOW).is_err());
    }

    #[test]
    fn rejects_semantic_object_count_limits() {
        let at_column_limit = (0..99)
            .map(
                |index| json!({ "key": format!("column_{index}"), "name": "字段", "type": "text" }),
            )
            .collect::<Vec<_>>();
        let at_limit: DataTableInput = serde_json::from_value(json!({
            "title": "限制", "columns": at_column_limit
        }))
        .expect("structurally valid columns at the limit");
        assert!(normalize_data_table(&at_limit, BATCH, NOW).is_ok());

        let too_many_columns = (0..100)
            .map(
                |index| json!({ "key": format!("column_{index}"), "name": "字段", "type": "text" }),
            )
            .collect::<Vec<_>>();
        let columns: DataTableInput = serde_json::from_value(json!({
            "title": "限制", "columns": too_many_columns
        }))
        .expect("structurally valid columns");
        assert!(normalize_data_table(&columns, BATCH, NOW).is_err());

        let too_many_records = (0..10_001)
            .map(|index| json!({ "title": format!("记录 {index}") }))
            .collect::<Vec<_>>();
        let records: DataTableInput = serde_json::from_value(json!({
            "title": "限制", "records": too_many_records
        }))
        .expect("structurally valid records");
        assert!(normalize_data_table(&records, BATCH, NOW).is_err());

        let too_many_nodes = (0..501)
            .map(|index| json!({ "id": format!("node_{index}"), "kind": "rect", "text": "节点" }))
            .collect::<Vec<_>>();
        let nodes: WhiteboardInput = serde_json::from_value(json!({
            "title": "限制", "nodes": too_many_nodes
        }))
        .expect("structurally valid nodes");
        assert!(normalize_whiteboard(&nodes, BATCH, NOW).is_err());

        let too_many_edges = (0..1_001)
            .map(|index| json!({ "id": format!("edge_{index}"), "from": "node", "to": "node" }))
            .collect::<Vec<_>>();
        let edges: WhiteboardInput = serde_json::from_value(json!({
            "title": "限制",
            "nodes": [{ "id": "node", "kind": "rect", "text": "节点" }],
            "edges": too_many_edges
        }))
        .expect("structurally valid edges");
        assert!(normalize_whiteboard(&edges, BATCH, NOW).is_err());

        let too_many_children = (0..1_000)
            .map(|index| json!({ "id": format!("child_{index}"), "text": "分支" }))
            .collect::<Vec<_>>();
        let nodes: MindmapInput = serde_json::from_value(json!({
            "title": "限制", "root": { "text": "根", "children": too_many_children }
        }))
        .expect("structurally valid mindmap");
        assert!(normalize_mindmap(&nodes, BATCH, NOW).is_err());
    }
}
