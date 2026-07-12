mod auth;

use std::{
    net::{SocketAddr, SocketAddrV4, Ipv4Addr},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{ConnectInfo, State},
    http::{Request, StatusCode, header::AUTHORIZATION},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use rmcp::{
    ServerHandler, schemars, tool, tool_handler, tool_router,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use rand::{RngExt, distr::Alphanumeric};
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Emitter};

use crate::storage::{McpSettings, PageRecord, StorageError, StorageResult, StorageState};

#[derive(Clone, Default)]
pub struct McpServerState {
    active: Arc<Mutex<Option<RunningLocalServer>>>,
    app_handle: Option<AppHandle>,
}

impl McpServerState {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active: Arc::default(),
            app_handle: Some(app_handle),
        }
    }

    pub async fn apply(
        &self,
        settings: Option<&McpSettings>,
        storage: StorageState,
    ) -> StorageResult<()> {
        let should_start = settings.is_some_and(|value| value.enabled);
        let next = if should_start {
            let settings = settings.expect("enabled MCP settings exist");
            Some(start_local_server(settings.port, &settings.token, storage, self.app_handle.clone()).await?)
        } else {
            None
        };
        let mut active = self
            .active
            .lock()
            .map_err(|_| StorageError::new("conflict", "MCP server state lock poisoned"))?;

        if let Some(previous) = active.take() {
            previous.stop();
        }
        *active = next;
        Ok(())
    }

    pub fn address(&self) -> Option<SocketAddr> {
        self.active.lock().ok().and_then(|active| active.as_ref().map(RunningLocalServer::address))
    }
}

#[derive(Clone)]
struct LocalMcpServer {
    storage: StorageState,
    app_handle: Option<AppHandle>,
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct SearchPagesInput {
    query: String,
    limit: Option<usize>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct CreatePageInput {
    parent_id: Option<String>,
    title: String,
    icon: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct GetPageInput {
    page_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct AppendContentInput {
    page_id: String,
    text: Option<String>,
    table: Option<Vec<Vec<String>>>,
}

impl LocalMcpServer {
    fn new(storage: StorageState, app_handle: Option<AppHandle>) -> Self {
        Self {
            storage,
            app_handle,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl LocalMcpServer {
    #[tool(description = "搜索知栖页面，返回可用于后续写入的页面 ID。")]
    fn search_pages(
        &self,
        Parameters(SearchPagesInput { query, limit }): Parameters<SearchPagesInput>,
    ) -> String {
        match self.storage.with_storage(|storage| storage.search_workspace(&query, limit.unwrap_or(30))) {
            Ok(results) => serde_json::to_string(
                &results.into_iter().filter(|result| result.kind == "page").collect::<Vec<_>>(),
            )
            .unwrap_or_else(|error| format!("搜索结果序列化失败：{error}")),
            Err(error) => format!("搜索失败：{error}"),
        }
    }

    #[tool(description = "在知栖中创建页面。parent_id 为空时创建顶级页面，否则创建到指定父页面下。")]
    fn create_page(
        &self,
        Parameters(CreatePageInput { parent_id, title, icon }): Parameters<CreatePageInput>,
    ) -> String {
        let title = title.trim();
        if title.is_empty() {
            return "创建失败：页面标题不能为空。".to_string();
        }

        let now = now_timestamp();
        let page = PageRecord {
            id: format!("page_mcp_{}", random_suffix()),
            parent_id: parent_id.clone(),
            title: title.to_string(),
            icon,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            blocks: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        match self.storage.with_storage(|storage| {
            if let Some(parent_id) = &parent_id {
                storage.load_page(parent_id)?;
            }
            storage.save_page(page.clone())?;
            Ok(page)
        }) {
            Ok(page) => serde_json::to_string(&page)
                .unwrap_or_else(|error| format!("页面创建成功，但结果序列化失败：{error}")),
            Err(error) => format!("创建失败：{error}"),
        }
    }

    #[tool(description = "读取指定知栖页面的元数据和内容块。")]
    fn get_page(&self, Parameters(GetPageInput { page_id }): Parameters<GetPageInput>) -> String {
        match self.storage.with_storage(|storage| storage.load_page(&page_id)) {
            Ok(page) => serde_json::to_string(&page)
                .unwrap_or_else(|error| format!("页面读取成功，但结果序列化失败：{error}")),
            Err(error) => format!("读取失败：{error}"),
        }
    }

    #[tool(description = "向指定知栖页面追加纯文本段落和可选普通表格。")]
    fn append_content(
        &self,
        Parameters(AppendContentInput { page_id, text, table }): Parameters<AppendContentInput>,
    ) -> String {
        let mut blocks = text
            .unwrap_or_default()
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(|text| serde_json::json!({
                "id": format!("block_mcp_{}", random_suffix()),
                "type": "paragraph",
                "text": text,
            }))
            .collect::<Vec<_>>();

        if let Some(rows) = table {
            if rows.is_empty() || rows[0].is_empty() || rows.iter().any(|row| row.len() != rows[0].len()) {
                return "追加失败：表格必须非空且每行列数一致。".to_string();
            }
            blocks.push(serde_json::json!({
                "id": format!("block_mcp_{}", random_suffix()),
                "type": "table",
                "rows": rows,
            }));
        }

        let created_block_ids = blocks
            .iter()
            .filter_map(|block| block.get("id").and_then(serde_json::Value::as_str))
            .map(str::to_string)
            .collect::<Vec<_>>();
        match self.storage.with_storage(|storage| {
            storage.append_mcp_page_blocks(&page_id, blocks, now_timestamp())
        }) {
            Ok(_) => {
                if let Some(app) = &self.app_handle {
                    let _ = app.emit("zhixi://mcp-workspace-updated", serde_json::json!({
                        "pageId": page_id,
                        "createdBlockIds": created_block_ids,
                    }));
                }
                serde_json::json!({ "pageId": page_id, "createdBlockIds": created_block_ids }).to_string()
            },
            Err(error) => format!("追加失败：{error}"),
        }
    }
}

fn random_suffix() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(16)
        .map(char::from)
        .collect()
}

fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LocalMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions("知栖本机 MCP 服务支持搜索页面、创建页面，以及向指定页面追加文本和普通表格。")
    }
}

pub struct RunningLocalServer {
    address: SocketAddr,
    cancellation: CancellationToken,
}

impl RunningLocalServer {
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    pub fn stop(&self) {
        self.cancellation.cancel()
    }
}

pub async fn start_local_server(
    port: u16,
    token: &str,
    storage: StorageState,
    app_handle: Option<AppHandle>,
) -> StorageResult<RunningLocalServer> {
    let listener = tokio::net::TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(StorageError::io)?;
    let address = listener.local_addr().map_err(StorageError::io)?;
    let cancellation = CancellationToken::new();
    let config = StreamableHttpServerConfig::default()
        .with_cancellation_token(cancellation.child_token())
        .with_allowed_hosts([format!("127.0.0.1:{}", address.port()), "localhost".to_string()]);
    let service: StreamableHttpService<LocalMcpServer, LocalSessionManager> =
        StreamableHttpService::new(move || Ok(LocalMcpServer::new(storage.clone(), app_handle.clone())), Default::default(), config);
    let app = Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(token.to_string(), authorize_request));
    let shutdown = cancellation.child_token();

    tokio::spawn(async move {
        let _ = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
            .with_graceful_shutdown(async move { shutdown.cancelled().await })
            .await;
    });

    Ok(RunningLocalServer {
        address,
        cancellation,
    })
}

async fn authorize_request(
    State(token): State<String>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let authorization = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    if auth::authorize(Some(peer), authorization, &token).is_err() {
        return StatusCode::UNAUTHORIZED.into_response();
    }

    next.run(request).await
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::{IpAddr, TcpStream},
        time::Duration,
    };

    use rmcp::handler::server::wrapper::Parameters;

    use super::{AppendContentInput, CreatePageInput, GetPageInput, LocalMcpServer, McpServerState, start_local_server};
    use crate::storage::{McpSettings, PageRecord, StorageState};

    #[tokio::test]
    async fn starts_on_loopback_and_stops_cleanly() {
        let server = start_local_server(0, "test-token", StorageState::open_in_memory_for_tests().expect("storage"), None)
            .await
            .expect("server starts");

        assert!(matches!(server.address().ip(), IpAddr::V4(address) if address.is_loopback()));
        tokio::net::TcpStream::connect(server.address())
            .await
            .expect("listener accepts a local connection");

        server.stop();
    }

    #[tokio::test]
    async fn rejects_requests_without_a_bearer_token() {
        let server = start_local_server(0, "test-token", StorageState::open_in_memory_for_tests().expect("storage"), None)
            .await
            .expect("server starts");
        let address = server.address();

        let response = tokio::task::spawn_blocking(move || {
            let mut stream = TcpStream::connect(address).expect("connects");
            stream.set_read_timeout(Some(Duration::from_secs(2))).expect("read timeout");
            write!(
                stream,
                "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
            )
            .expect("writes request");
            let mut response = String::new();
            stream.read_to_string(&mut response).expect("reads response");
            response
        })
        .await
        .expect("request task completes");

        assert!(response.starts_with("HTTP/1.1 401"));
        server.stop();
    }

    #[tokio::test]
    async fn replaces_the_running_server_when_configuration_changes() {
        let state = McpServerState::default();
        state
            .apply(Some(&McpSettings {
                enabled: true,
                port: 0,
                token: "first-token".to_string(),
            }), StorageState::open_in_memory_for_tests().expect("storage"))
            .await
            .expect("first server starts");

        let first_address = state.address().expect("first address");
        state
            .apply(Some(&McpSettings {
                enabled: true,
                port: 0,
                token: "second-token".to_string(),
            }), StorageState::open_in_memory_for_tests().expect("storage"))
            .await
            .expect("replacement server starts");

        assert_ne!(state.address(), Some(first_address));
        state
            .apply(None, StorageState::open_in_memory_for_tests().expect("storage"))
            .await
            .expect("server stops");
        assert_eq!(state.address(), None);
    }

    #[test]
    fn creates_a_page_through_the_existing_storage_path() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);

        let response = server.create_page(Parameters(CreatePageInput {
            parent_id: None,
            title: "AI 草稿".to_string(),
            icon: Some("✨".to_string()),
        }));
        let page: PageRecord = serde_json::from_str(&response).expect("created page response");
        let loaded = storage
            .with_storage(|storage| storage.load_page(&page.id))
            .expect("loads created page");

        assert_eq!(loaded.title, "AI 草稿");
        assert_eq!(loaded.icon.as_deref(), Some("✨"));
        assert!(loaded.blocks.is_empty());
    }

    #[test]
    fn reads_a_page_through_the_existing_storage_path() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_str(&server.create_page(Parameters(CreatePageInput {
            parent_id: None,
            title: "MCP 读取".to_string(),
            icon: None,
        })))
        .expect("created page response");

        let response = server.get_page(Parameters(GetPageInput { page_id: created.id.clone() }));
        let page: PageRecord = serde_json::from_str(&response).expect("page response");

        assert_eq!(page.id, created.id);
        assert_eq!(page.title, "MCP 读取");
    }

    #[test]
    fn appends_text_and_a_table_through_the_existing_storage_path() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_str(&server.create_page(Parameters(CreatePageInput {
            parent_id: None,
            title: "AI 草稿".to_string(),
            icon: None,
        })))
        .expect("created page response");

        let response = server.append_content(Parameters(AppendContentInput {
            page_id: created.id.clone(),
            text: Some("第一段\n第二段".to_string()),
            table: Some(vec![vec!["名称".to_string(), "金额".to_string()], vec!["机票".to_string(), "2000".to_string()]]),
        }));
        assert!(response.contains(&created.id));

        let loaded = storage
            .with_storage(|storage| storage.load_page(&created.id))
            .expect("loads updated page");
        assert_eq!(loaded.blocks.len(), 3);
        assert_eq!(loaded.blocks[0]["text"], "第一段");
        assert_eq!(loaded.blocks[2]["rows"][1][1], "2000");
    }
}
