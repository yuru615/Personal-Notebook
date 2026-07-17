use serde::{Deserialize, Serialize};
use tauri::State;

use crate::account::{AccountError, AccountState};

const ANNOUNCEMENT_PAGE_SIZE: u32 = 20;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementSummary {
    pub id: String,
    pub title: String,
    pub published_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementDetail {
    pub id: String,
    pub title: String,
    pub content_html: String,
    pub published_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementPage {
    pub items: Vec<AnnouncementSummary>,
    pub total: u32,
    pub page: u32,
    pub page_size: u32,
}

fn normalize_page(page: Option<u32>) -> u32 {
    page.unwrap_or(1).max(1)
}

fn valid_announcement_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-')
}

#[tauri::command]
pub async fn list_announcements(
    state: State<'_, AccountState>,
    page: Option<u32>,
) -> Result<AnnouncementPage, AccountError> {
    let page = normalize_page(page);
    state
        .authenticated_get(&format!(
            "/api/v1/announcements?page={page}&page_size={ANNOUNCEMENT_PAGE_SIZE}"
        ))
        .await
}

#[tauri::command]
pub async fn get_announcement(
    state: State<'_, AccountState>,
    id: String,
) -> Result<AnnouncementDetail, AccountError> {
    if !valid_announcement_id(&id) {
        return Err(AccountError::new("invalid_request", "公告标识不正确", None));
    }
    state
        .authenticated_get(&format!("/api/v1/announcements/{id}"))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_page_and_rejects_unsafe_ids() {
        assert_eq!(normalize_page(None), 1);
        assert_eq!(normalize_page(Some(0)), 1);
        assert_eq!(normalize_page(Some(3)), 3);
        assert!(valid_announcement_id(
            "13f2d591-a1b2-4c3d-8e9f-0123456789ab"
        ));
        assert!(!valid_announcement_id("../auth/session"));
        assert!(!valid_announcement_id("公告"));
    }

    #[test]
    fn serializes_public_contract_in_camel_case() {
        let detail = AnnouncementDetail {
            id: "announcement-id".to_string(),
            title: "版本更新".to_string(),
            content_html: "<p>更新内容</p>".to_string(),
            published_at: "2026-07-15T10:00:00Z".to_string(),
            updated_at: "2026-07-15T10:00:00Z".to_string(),
        };
        let value = serde_json::to_value(detail).expect("serialize announcement");

        assert_eq!(value["contentHtml"], "<p>更新内容</p>");
        assert_eq!(value["publishedAt"], "2026-07-15T10:00:00Z");
        assert!(value.get("content_html").is_none());
    }
}
