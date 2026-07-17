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
    #[serde(default = "default_auto_backup_settings")]
    pub auto_backup: AutoBackupSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp: Option<McpSettings>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupSettings {
    pub enabled: bool,
    pub interval_minutes: u16,
    pub retention_count: u8,
}

impl Default for AutoBackupSettings {
    fn default() -> Self {
        default_auto_backup_settings()
    }
}

fn default_auto_backup_settings() -> AutoBackupSettings {
    AutoBackupSettings {
        enabled: default_auto_backup_enabled(),
        interval_minutes: default_auto_backup_interval_minutes(),
        retention_count: default_auto_backup_retention_count(),
    }
}

fn default_auto_backup_enabled() -> bool {
    true
}

fn default_auto_backup_interval_minutes() -> u16 {
    15
}

fn default_auto_backup_retention_count() -> u8 {
    14
}

impl<'de> Deserialize<'de> for AutoBackupSettings {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        let Some(auto_backup) = value.as_object() else {
            return Ok(Self::default());
        };
        let enabled = auto_backup
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or_else(default_auto_backup_enabled);
        let interval_minutes = match auto_backup.get("intervalMinutes").and_then(Value::as_u64) {
            Some(value @ (15 | 30 | 60)) => value as u16,
            _ => default_auto_backup_interval_minutes(),
        };
        let retention_count = match auto_backup.get("retentionCount").and_then(Value::as_u64) {
            Some(value @ (7 | 14 | 30)) => value as u8,
            _ => default_auto_backup_retention_count(),
        };

        Ok(Self {
            enabled,
            interval_minutes,
            retention_count,
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::AppSettings;

    #[test]
    fn legacy_app_settings_receive_default_auto_backup_settings() {
        let settings: AppSettings = serde_json::from_value(json!({
            "closeAction": "hide_to_tray"
        }))
        .expect("legacy app settings deserialize");
        let serialized = serde_json::to_value(settings).expect("app settings serialize");

        assert_eq!(
            serialized.pointer("/autoBackup"),
            Some(&json!({
                "enabled": true,
                "intervalMinutes": 15,
                "retentionCount": 14,
            }))
        );
        assert_eq!(
            serialized.pointer("/closeAction").and_then(Value::as_str),
            Some("hide_to_tray")
        );
    }

    #[test]
    fn invalid_auto_backup_intervals_and_retention_counts_fall_back_to_defaults() {
        let settings: AppSettings = serde_json::from_value(json!({
            "autoBackup": {
                "enabled": false,
                "intervalMinutes": 20,
                "retentionCount": 10,
            }
        }))
        .expect("app settings deserialize");
        let serialized = serde_json::to_value(settings).expect("app settings serialize");

        assert_eq!(
            serialized.pointer("/autoBackup"),
            Some(&json!({
                "enabled": false,
                "intervalMinutes": 15,
                "retentionCount": 14,
            }))
        );
    }

    #[test]
    fn malformed_auto_backup_values_do_not_discard_other_app_settings() {
        let settings: AppSettings = serde_json::from_value(json!({
            "closeAction": "quit",
            "accentTheme": "violet",
            "autoBackup": {
                "enabled": false,
                "intervalMinutes": "15",
                "retentionCount": null,
            },
            "mcp": {
                "enabled": true,
                "port": 38472,
                "token": "test-token",
            }
        }))
        .expect("malformed auto backup settings should deserialize");
        let serialized = serde_json::to_value(settings).expect("app settings serialize");

        assert_eq!(
            serialized.pointer("/autoBackup"),
            Some(&json!({
                "enabled": false,
                "intervalMinutes": 15,
                "retentionCount": 14,
            }))
        );
        assert_eq!(
            serialized.pointer("/closeAction").and_then(Value::as_str),
            Some("quit")
        );
        assert_eq!(
            serialized.pointer("/accentTheme").and_then(Value::as_str),
            Some("violet")
        );
        assert_eq!(
            serialized.pointer("/mcp"),
            Some(&json!({
                "enabled": true,
                "port": 38472,
                "token": "test-token",
            }))
        );
    }

    #[test]
    fn null_or_non_object_auto_backup_values_use_complete_defaults() {
        for auto_backup in [Value::Null, json!([]), json!("bad")] {
            let settings: AppSettings = serde_json::from_value(json!({
                "autoBackup": auto_backup,
            }))
            .expect("non-object auto backup settings should deserialize");
            let serialized = serde_json::to_value(settings).expect("app settings serialize");

            assert_eq!(
                serialized.pointer("/autoBackup"),
                Some(&json!({
                    "enabled": true,
                    "intervalMinutes": 15,
                    "retentionCount": 14,
                }))
            );
        }
    }

    #[test]
    fn out_of_range_auto_backup_numbers_fall_back_without_rejecting_settings() {
        for (auto_backup, expected) in [
            (
                json!({ "enabled": false, "intervalMinutes": -1, "retentionCount": 14 }),
                json!({ "enabled": false, "intervalMinutes": 15, "retentionCount": 14 }),
            ),
            (
                json!({ "enabled": false, "intervalMinutes": 15, "retentionCount": 999 }),
                json!({ "enabled": false, "intervalMinutes": 15, "retentionCount": 14 }),
            ),
            (
                json!({ "enabled": false, "intervalMinutes": 65_536, "retentionCount": 256 }),
                json!({ "enabled": false, "intervalMinutes": 15, "retentionCount": 14 }),
            ),
        ] {
            let settings: AppSettings = serde_json::from_value(json!({
                "autoBackup": auto_backup,
            }))
            .expect("out-of-range auto backup settings should deserialize");
            let serialized = serde_json::to_value(settings).expect("app settings serialize");

            assert_eq!(serialized.pointer("/autoBackup"), Some(&expected));
        }
    }

    #[test]
    fn valid_auto_backup_interval_and_retention_combinations_are_preserved() {
        for (interval_minutes, retention_count) in [(15, 7), (30, 14), (60, 30)] {
            let settings: AppSettings = serde_json::from_value(json!({
                "autoBackup": {
                    "enabled": false,
                    "intervalMinutes": interval_minutes,
                    "retentionCount": retention_count,
                },
            }))
            .expect("valid auto backup settings should deserialize");
            let serialized = serde_json::to_value(settings).expect("app settings serialize");

            assert_eq!(
                serialized.pointer("/autoBackup"),
                Some(&json!({
                    "enabled": false,
                    "intervalMinutes": interval_minutes,
                    "retentionCount": retention_count,
                }))
            );
        }
    }

    #[test]
    fn invalid_auto_backup_enabled_values_fall_back_to_true() {
        for enabled in [Value::Null, json!("false")] {
            let settings: AppSettings = serde_json::from_value(json!({
                "autoBackup": {
                    "enabled": enabled,
                    "intervalMinutes": 30,
                    "retentionCount": 7,
                },
            }))
            .expect("invalid enabled value should deserialize");
            let serialized = serde_json::to_value(settings).expect("app settings serialize");

            assert_eq!(
                serialized.pointer("/autoBackup"),
                Some(&json!({
                    "enabled": true,
                    "intervalMinutes": 30,
                    "retentionCount": 7,
                }))
            );
        }
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_root_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_properties: Option<bool>,
    pub blocks: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMeta {
    pub id: String,
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_root_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_properties: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedPage {
    pub id: String,
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_root_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_properties: Option<bool>,
    pub blocks: Vec<Value>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<PageRecord> for LoadedPage {
    fn from(page: PageRecord) -> Self {
        Self {
            id: page.id,
            parent_id: page.parent_id,
            deleted_at: page.deleted_at,
            deleted_root_id: page.deleted_root_id,
            title: page.title,
            icon: page.icon,
            cover: page.cover,
            properties: page.properties,
            is_full_width: page.is_full_width,
            is_small_text: page.is_small_text,
            font_family: page.font_family,
            show_outline: page.show_outline,
            show_properties: page.show_properties,
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
            deleted_at: page.deleted_at.clone(),
            deleted_root_id: page.deleted_root_id.clone(),
            title: page.title.clone(),
            icon: page.icon.clone(),
            cover: page.cover.clone(),
            is_full_width: page.is_full_width,
            is_small_text: page.is_small_text,
            font_family: page.font_family.clone(),
            show_outline: page.show_outline,
            show_properties: page.show_properties,
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
