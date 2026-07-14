use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub boards: Vec<BoardRecord>,
    #[serde(default)]
    pub data_tables: Vec<DataTableRecord>,
    #[serde(default)]
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
    pub pages: Vec<PageRecord>,
    #[serde(default)]
    pub page_properties: Vec<PagePropertyDefinition>,
    pub settings: WorkspaceSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePropertyDefinition {
    pub id: String,
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub property_type: String,
    pub config: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    pub last_opened_page_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_revision: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inbox_page_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub welcome_page_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub welcome_guide_version: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_layout: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_width: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub pinned_sidebar_items: Vec<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clipboard_capture_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_selection_start_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_open_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_defaults: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_preferences: Option<Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close_action: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_theme: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp: Option<McpSettings>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct PagePackageImportResult {
    pub root_page_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeArchiveManifest {
    pub format: String,
    pub format_version: u32,
    pub kind: String,
    pub created_with: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackagePayload {
    pub root_page_id: String,
    pub pages: Vec<PageRecord>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArchivePayload {
    pub workspace: WorkspaceSnapshot,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PagePackageManifest {
    pub kind: String,
    pub version: u32,
    pub root_page_id: String,
    pub pages: Vec<PageRecord>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
    pub assets: Vec<AssetMeta>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedBlockGroupRecord {
    pub id: String,
    pub blocks: Vec<Value>,
    pub primary_instance_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRecord {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_full_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_small_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_outline: Option<bool>,
    pub blocks: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub cover: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_full_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_small_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_outline: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPage {
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_full_width: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_small_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_outline: Option<bool>,
    pub blocks: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<PageRecord> for LoadedPage {
    fn from(page: PageRecord) -> Self {
        Self {
            id: page.id,
            parent_id: page.parent_id,
            title: page.title,
            icon: page.icon,
            cover: page.cover,
            properties: page.properties,
            is_full_width: page.is_full_width,
            is_small_text: page.is_small_text,
            font_family: page.font_family,
            show_outline: page.show_outline,
            blocks: page.blocks,
            created_at: page.created_at,
            updated_at: page.updated_at,
        }
    }
}

impl From<&PageRecord> for PageMeta {
    fn from(page: &PageRecord) -> Self {
        Self {
            id: page.id.clone(),
            parent_id: page.parent_id.clone(),
            title: page.title.clone(),
            icon: page.icon.clone(),
            cover: page.cover.clone(),
            is_full_width: page.is_full_width,
            is_small_text: page.is_small_text,
            font_family: page.font_family.clone(),
            show_outline: page.show_outline,
            created_at: page.created_at.clone(),
            updated_at: page.updated_at.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardRecord {
    pub id: String,
    pub title: String,
    pub snapshot: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTableRecord {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub cover: Option<String>,
    pub snapshot: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MindmapRecord {
    pub id: String,
    pub title: String,
    pub snapshot: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub pages: Vec<PageMeta>,
    pub boards: Vec<BoardRecord>,
    pub data_tables: Vec<DataTableRecord>,
    pub mindmaps: Vec<MindmapRecord>,
    #[serde(default)]
    pub synced_block_groups: Vec<SyncedBlockGroupRecord>,
    pub settings: Option<WorkspaceSettings>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub deleted_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: String,
    pub page_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub block_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_id: Option<String>,
    pub title: String,
    pub icon: Option<String>,
    pub excerpt: String,
    pub match_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_key: Option<String>,
    pub source_label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteAssetInput {
    pub name: String,
    pub mime_type: String,
    #[serde(with = "serde_bytes_vec")]
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAssetFileInput {
    pub path: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMeta {
    pub id: String,
    pub sha256: String,
    pub name: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub relative_path: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrackedAssetWrite {
    pub meta: AssetMeta,
    pub created: bool,
}

mod serde_bytes_vec {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        bytes.serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<u8>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Vec::<u8>::deserialize(deserializer)
    }
}
