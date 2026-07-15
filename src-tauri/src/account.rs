use std::sync::Arc;

use keyring::{Entry, Error as KeyringError};
use reqwest::{Client, Method, Url};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::State;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::{
    clipboard_capture::ClipboardCaptureState,
    mcp::McpServerState,
    storage::{StorageError, StorageState},
};

const KEYRING_SERVICE: &str = "com.zhiqi.desktop";
const KEYRING_ACCOUNT: &str = "account-session";
const API_BASE_URL: &str = env!("ZHIQI_API_BASE_URL");

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUser {
    pub id: String,
    pub email: String,
    pub status: String,
    pub email_verified_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountConnectivity {
    Online,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSession {
    pub user: AccountUser,
    pub expires_at: String,
    pub connectivity: AccountConnectivity,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
}

impl AccountError {
    fn new(code: impl Into<String>, message: impl Into<String>, status: Option<u16>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            status,
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new("account_storage_error", message, None)
    }

    fn session_expired() -> Self {
        Self::new("session_expired", "会话无效或已过期", Some(401))
    }
}

impl From<StorageError> for AccountError {
    fn from(error: StorageError) -> Self {
        Self::new(error.code, error.message, None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    token: String,
    user: AccountUser,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
    data: Option<T>,
    error: Option<ApiErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    code: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResponse {
    token: String,
    user: AccountUser,
    expires_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionResponse {
    user: AccountUser,
    expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageResponse {
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
    device_name: &'a str,
}

#[derive(Debug, Serialize)]
struct EmailRequest<'a> {
    email: &'a str,
}

trait SessionStore: Send + Sync {
    fn load(&self) -> Result<Option<StoredSession>, AccountError>;
    fn save(&self, session: &StoredSession) -> Result<(), AccountError>;
    fn clear(&self) -> Result<(), AccountError>;
}

struct KeyringSessionStore;

impl KeyringSessionStore {
    fn entry() -> Result<Entry, AccountError> {
        Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|error| AccountError::internal(format!("无法访问系统凭据存储：{error}")))
    }
}

impl SessionStore for KeyringSessionStore {
    fn load(&self) -> Result<Option<StoredSession>, AccountError> {
        let entry = Self::entry()?;
        let raw = match entry.get_password() {
            Ok(value) => value,
            Err(KeyringError::NoEntry) => return Ok(None),
            Err(error) => {
                return Err(AccountError::internal(format!(
                    "无法读取系统凭据存储：{error}"
                )))
            }
        };
        match serde_json::from_str(&raw) {
            Ok(session) => Ok(Some(session)),
            Err(_) => {
                let _ = entry.delete_credential();
                Ok(None)
            }
        }
    }

    fn save(&self, session: &StoredSession) -> Result<(), AccountError> {
        let raw = serde_json::to_string(session)
            .map_err(|error| AccountError::internal(format!("无法序列化登录凭据：{error}")))?;
        Self::entry()?
            .set_password(&raw)
            .map_err(|error| AccountError::internal(format!("无法保存系统凭据：{error}")))
    }

    fn clear(&self) -> Result<(), AccountError> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AccountError::internal(format!("无法清除系统凭据：{error}"))),
        }
    }
}

#[derive(Clone)]
pub struct AccountState {
    client: Client,
    base_url: Url,
    sessions: Arc<dyn SessionStore>,
}

impl AccountState {
    pub fn new() -> Result<Self, AccountError> {
        let base_url = normalize_api_base_url(API_BASE_URL)?;
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|error| {
                AccountError::new(
                    "account_client_error",
                    format!("无法初始化账号服务：{error}"),
                    None,
                )
            })?;
        Ok(Self {
            client,
            base_url,
            sessions: Arc::new(KeyringSessionStore),
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, AccountError> {
        self.base_url.join(path).map_err(|error| {
            AccountError::new(
                "account_client_error",
                format!("账号服务地址无效：{error}"),
                None,
            )
        })
    }

    async fn request<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        token: Option<&str>,
    ) -> Result<T, AccountError> {
        let mut request = self.client.request(method, self.endpoint(path)?);
        if let Some(body) = body {
            request = request.json(body);
        }
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request
            .send()
            .await
            .map_err(|_| AccountError::new("network_unavailable", "无法连接账号服务", None))?;
        let status = response.status();
        let raw = response.text().await.map_err(|_| {
            AccountError::new(
                "invalid_response",
                "账号服务响应不完整",
                Some(status.as_u16()),
            )
        })?;
        let envelope: ApiEnvelope<T> = serde_json::from_str(&raw).map_err(|_| {
            AccountError::new(
                "invalid_response",
                "账号服务响应格式异常",
                Some(status.as_u16()),
            )
        })?;
        if !status.is_success() || envelope.error.is_some() {
            let error = envelope.error.unwrap_or(ApiErrorBody {
                code: None,
                message: None,
            });
            return Err(AccountError::new(
                error.code.unwrap_or_else(|| "request_failed".to_string()),
                error.message.unwrap_or_else(|| "请求失败".to_string()),
                Some(status.as_u16()),
            ));
        }
        envelope.data.ok_or_else(|| {
            AccountError::new(
                "invalid_response",
                "账号服务没有返回数据",
                Some(status.as_u16()),
            )
        })
    }

    async fn post<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AccountError> {
        self.request(Method::POST, path, Some(body), None).await
    }

    async fn session(&self, token: &str) -> Result<SessionResponse, AccountError> {
        self.request::<SessionResponse, ()>(Method::GET, "/api/v1/auth/session", None, Some(token))
            .await
    }

    async fn restore(&self) -> Result<Option<AccountSession>, AccountError> {
        let Some(mut stored) = self.sessions.load()? else {
            return Ok(None);
        };
        if session_is_expired(&stored.expires_at, OffsetDateTime::now_utc())? {
            self.sessions.clear()?;
            return Ok(None);
        }
        match self.session(&stored.token).await {
            Ok(response) => {
                stored.user = response.user;
                stored.expires_at = response.expires_at;
                self.sessions.save(&stored)?;
                Ok(Some(account_session(&stored, AccountConnectivity::Online)))
            }
            Err(error) if error.code == "session_expired" => {
                self.sessions.clear()?;
                Ok(None)
            }
            Err(error) if error.code == "account_suspended" => {
                self.sessions.clear()?;
                Err(error)
            }
            Err(error) if can_use_offline(&error) => {
                Ok(Some(account_session(&stored, AccountConnectivity::Offline)))
            }
            Err(error) => Err(error),
        }
    }
}

fn normalize_api_base_url(raw: &str) -> Result<Url, AccountError> {
    let mut url = Url::parse(raw)
        .map_err(|_| AccountError::new("account_client_error", "账号服务地址无效", None))?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(AccountError::new(
            "account_client_error",
            "账号服务地址必须是 HTTP(S) origin",
            None,
        ));
    }
    url.set_path("/");
    Ok(url)
}

fn parse_expiry(value: &str) -> Result<OffsetDateTime, AccountError> {
    OffsetDateTime::parse(value, &Rfc3339)
        .map_err(|_| AccountError::new("invalid_response", "会话到期时间格式异常", None))
}

fn session_is_expired(value: &str, now: OffsetDateTime) -> Result<bool, AccountError> {
    Ok(parse_expiry(value)? <= now)
}

fn can_use_offline(error: &AccountError) -> bool {
    error.code == "network_unavailable" || error.status.is_some_and(|status| status >= 500)
}

fn account_session(stored: &StoredSession, connectivity: AccountConnectivity) -> AccountSession {
    AccountSession {
        user: stored.user.clone(),
        expires_at: stored.expires_at.clone(),
        connectivity,
    }
}

fn device_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "Zhiqi macOS",
        "windows" => "Zhiqi Windows",
        "linux" => "Zhiqi Linux",
        _ => "Zhiqi Desktop",
    }
}

#[tauri::command]
pub async fn account_register(
    state: State<'_, AccountState>,
    email: String,
    password: String,
) -> Result<MessageResponse, AccountError> {
    state
        .post(
            "/api/v1/auth/register",
            &CredentialsRequest {
                email: &email,
                password: &password,
            },
        )
        .await
}

#[tauri::command]
pub async fn account_resend_verification(
    state: State<'_, AccountState>,
    email: String,
) -> Result<MessageResponse, AccountError> {
    state
        .post(
            "/api/v1/auth/resend-verification",
            &EmailRequest { email: &email },
        )
        .await
}

#[tauri::command]
pub async fn account_forgot_password(
    state: State<'_, AccountState>,
    email: String,
) -> Result<MessageResponse, AccountError> {
    state
        .post(
            "/api/v1/auth/forgot-password",
            &EmailRequest { email: &email },
        )
        .await
}

#[tauri::command]
pub async fn account_login(
    state: State<'_, AccountState>,
    email: String,
    password: String,
) -> Result<AccountSession, AccountError> {
    let response: LoginResponse = state
        .post(
            "/api/v1/auth/login",
            &LoginRequest {
                email: &email,
                password: &password,
                device_name: device_name(),
            },
        )
        .await?;
    let stored = StoredSession {
        token: response.token,
        user: response.user,
        expires_at: response.expires_at,
    };
    if session_is_expired(&stored.expires_at, OffsetDateTime::now_utc())? {
        return Err(AccountError::session_expired());
    }
    state.sessions.save(&stored)?;
    Ok(account_session(&stored, AccountConnectivity::Online))
}

#[tauri::command]
pub async fn account_restore(
    state: State<'_, AccountState>,
) -> Result<Option<AccountSession>, AccountError> {
    state.restore().await
}

#[tauri::command]
pub async fn account_validate(
    state: State<'_, AccountState>,
) -> Result<AccountSession, AccountError> {
    state
        .restore()
        .await?
        .ok_or_else(AccountError::session_expired)
}

#[tauri::command]
pub async fn account_activate_services(
    account: State<'_, AccountState>,
    storage: State<'_, StorageState>,
    mcp: State<'_, McpServerState>,
) -> Result<(), AccountError> {
    let Some(stored) = account.sessions.load()? else {
        return Err(AccountError::session_expired());
    };
    if session_is_expired(&stored.expires_at, OffsetDateTime::now_utc())? {
        account.sessions.clear()?;
        return Err(AccountError::session_expired());
    }
    let settings = storage
        .with_storage(|value| value.load_app_settings())?
        .and_then(|value| value.mcp);
    mcp.apply(settings.as_ref(), storage.inner().clone())
        .await?;
    Ok(())
}

async fn deactivate_services(
    storage: &StorageState,
    mcp: &McpServerState,
    clipboard: &ClipboardCaptureState,
) -> Result<(), AccountError> {
    clipboard.set_enabled(false);
    mcp.apply(None, storage.clone()).await?;
    Ok(())
}

#[tauri::command]
pub async fn account_logout(
    account: State<'_, AccountState>,
    storage: State<'_, StorageState>,
    mcp: State<'_, McpServerState>,
    clipboard: State<'_, ClipboardCaptureState>,
) -> Result<(), AccountError> {
    let stored = account.sessions.load()?;
    account.sessions.clear()?;
    deactivate_services(storage.inner(), mcp.inner(), clipboard.inner()).await?;
    if let Some(stored) = stored {
        let client = account.inner().clone();
        tauri::async_runtime::spawn(async move {
            let _ = client
                .request::<MessageResponse, ()>(
                    Method::POST,
                    "/api/v1/auth/logout",
                    None,
                    Some(&stored.token),
                )
                .await;
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn account_clear_session(
    account: State<'_, AccountState>,
    storage: State<'_, StorageState>,
    mcp: State<'_, McpServerState>,
    clipboard: State<'_, ClipboardCaptureState>,
) -> Result<(), AccountError> {
    account.sessions.clear()?;
    deactivate_services(storage.inner(), mcp.inner(), clipboard.inner()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_api_origin() {
        assert_eq!(
            normalize_api_base_url("https://accounts.example.com")
                .expect("valid origin")
                .as_str(),
            "https://accounts.example.com/"
        );
        assert!(normalize_api_base_url("https://user@example.com/path").is_err());
        assert!(normalize_api_base_url("file:///tmp/account").is_err());
    }

    #[test]
    fn checks_session_expiry() {
        let now = OffsetDateTime::parse("2026-07-15T10:00:00Z", &Rfc3339).expect("valid time");
        assert!(!session_is_expired("2026-07-15T10:00:01Z", now).expect("valid expiry"));
        assert!(session_is_expired("2026-07-15T10:00:00Z", now).expect("valid expiry"));
        assert!(session_is_expired("not-a-time", now).is_err());
    }

    #[test]
    fn only_network_and_server_errors_allow_offline_access() {
        assert!(can_use_offline(&AccountError::new(
            "network_unavailable",
            "offline",
            None
        )));
        assert!(can_use_offline(&AccountError::new(
            "internal_error",
            "unavailable",
            Some(503)
        )));
        assert!(!can_use_offline(&AccountError::session_expired()));
        assert!(!can_use_offline(&AccountError::new(
            "invalid_response",
            "bad response",
            Some(200)
        )));
    }

    #[test]
    fn account_session_never_serializes_token() {
        let stored = StoredSession {
            token: "secret-token".to_string(),
            user: AccountUser {
                id: "user-id".to_string(),
                email: "123456@qq.com".to_string(),
                status: "active".to_string(),
                email_verified_at: Some("2026-07-15T09:00:00Z".to_string()),
            },
            expires_at: "2026-07-16T09:00:00Z".to_string(),
        };
        let serialized =
            serde_json::to_string(&account_session(&stored, AccountConnectivity::Online))
                .expect("serialize session");
        assert!(!serialized.contains("secret-token"));
        assert!(serialized.contains("123456@qq.com"));
    }
}
