use std::time::Duration;

use reqwest::Url;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

const API_BASE_URL: &str = env!("ZHIQI_API_BASE_URL");

#[derive(Default)]
pub struct ClientUpdateState {
    pending: Mutex<Option<PendingUpdate>>,
}

struct PendingUpdate {
    update: Update,
    bytes: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientUpdateInfo {
    current_version: String,
    version: String,
    notes: String,
    pub_date: Option<String>,
    mandatory: bool,
    minimum_version: Option<String>,
    file_size: Option<u64>,
    sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "event",
    content = "data",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ClientUpdateEvent {
    Started { content_length: Option<u64> },
    Progress { chunk_length: usize, downloaded: u64 },
    Finished,
}

#[tauri::command]
pub async fn check_client_update(
    app: AppHandle,
    state: State<'_, ClientUpdateState>,
) -> Result<Option<ClientUpdateInfo>, String> {
    let endpoint = updater_endpoint()?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| error.to_string())?
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?;
    let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
        state.pending.lock().await.take();
        return Ok(None);
    };

    let raw = &update.raw_json;
    let info = ClientUpdateInfo {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        pub_date: update.date.and_then(|value| {
            value
                .format(&time::format_description::well_known::Rfc3339)
                .ok()
        }),
        mandatory: raw
            .get("mandatory")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        minimum_version: raw
            .get("minimumVersion")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
        file_size: raw.get("fileSize").and_then(serde_json::Value::as_u64),
        sha256: raw
            .get("sha256")
            .and_then(serde_json::Value::as_str)
            .map(str::to_string),
    };
    *state.pending.lock().await = Some(PendingUpdate {
        update,
        bytes: None,
    });
    Ok(Some(info))
}

#[tauri::command]
pub async fn download_client_update(
    state: State<'_, ClientUpdateState>,
    on_event: Channel<ClientUpdateEvent>,
) -> Result<(), String> {
    let update = state
        .pending
        .lock()
        .await
        .as_ref()
        .map(|pending| pending.update.clone())
        .ok_or_else(|| "没有可下载的客户端更新".to_string())?;
    let mut downloaded = 0_u64;
    let started_channel = on_event.clone();
    let progress_channel = on_event.clone();
    let finished_channel = on_event.clone();
    let mut started = false;
    let bytes = update
        .download(
            move |chunk_length, content_length| {
                if !started {
                    let _ = started_channel.send(ClientUpdateEvent::Started { content_length });
                    started = true;
                }
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let _ = progress_channel.send(ClientUpdateEvent::Progress {
                    chunk_length,
                    downloaded,
                });
            },
            move || {
                let _ = finished_channel.send(ClientUpdateEvent::Finished);
            },
        )
        .await
        .map_err(|error| error.to_string())?;

    let mut pending = state.pending.lock().await;
    let current = pending
        .as_mut()
        .ok_or_else(|| "客户端更新已失效，请重新检查".to_string())?;
    if current.update.version != update.version {
        return Err("客户端更新已变化，请重新检查".to_string());
    }
    current.bytes = Some(bytes);
    Ok(())
}

#[tauri::command]
pub async fn install_client_update(
    state: State<'_, ClientUpdateState>,
) -> Result<(), String> {
    let mut pending = state
        .pending
        .lock()
        .await
        .take()
        .ok_or_else(|| "没有可安装的客户端更新".to_string())?;
    let bytes = pending
        .bytes
        .take()
        .ok_or_else(|| "客户端更新尚未下载完成".to_string())?;
    if let Err(error) = pending.update.install(&bytes) {
        pending.bytes = Some(bytes);
        *state.pending.lock().await = Some(pending);
        return Err(error.to_string());
    }
    Ok(())
}

fn updater_endpoint() -> Result<Url, String> {
    let base = API_BASE_URL.trim_end_matches('/');
    format!(
        "{base}/api/v1/client-updates/{{{{target}}}}/{{{{arch}}}}/{{{{bundle_type}}}}/{{{{current_version}}}}"
    )
    .parse()
    .map_err(|error| format!("更新服务地址不正确：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updater_endpoint_keeps_tauri_placeholders() {
        let endpoint = updater_endpoint().unwrap().to_string();
        assert!(endpoint.contains("%7B%7Btarget%7D%7D"));
        assert!(endpoint.contains("%7B%7Bcurrent_version%7D%7D"));
    }
}
