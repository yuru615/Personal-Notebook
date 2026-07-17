mod auth;
mod content;
mod semantic;

use content::{normalize_content_batch, AppendContentInput};
use semantic::{
    normalize_whiteboard_elements, WhiteboardEdgeInput, WhiteboardInput, WhiteboardNodeInput,
    WhiteboardStrokeInput,
};

use std::{
    collections::HashSet,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::{self, Body},
    extract::{ConnectInfo, State},
    http::{
        header::{AUTHORIZATION, CONTENT_LENGTH},
        Request, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use http_body_util::LengthLimitError;
use rand::{distr::Alphanumeric, RngExt};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ServerHandler,
};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::storage::{
    McpSettings, McpWhiteboardUpdate, McpWriteBatch, PageRecord, StorageError, StorageResult,
    StorageState,
};

type WorkspaceUpdatedSink = Arc<dyn Fn(serde_json::Value) + Send + Sync>;
const MAX_MCP_REQUEST_BYTES: usize = 32 * 1024 * 1024;
static LAST_MCP_TIMESTAMP_MILLIS: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Default)]
pub struct McpServerState {
    active: Arc<Mutex<Option<RunningLocalServer>>>,
    workspace_updated: Option<WorkspaceUpdatedSink>,
}

impl McpServerState {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active: Arc::default(),
            workspace_updated: Some(Arc::new(move |payload| {
                let _ = app_handle.emit("zhiqi://mcp-workspace-updated", payload);
            })),
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
            Some(
                start_local_server(
                    settings.port,
                    &settings.token,
                    storage,
                    self.workspace_updated.clone(),
                )
                .await?,
            )
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
        self.active
            .lock()
            .ok()
            .and_then(|active| active.as_ref().map(RunningLocalServer::address))
    }
}

#[derive(Clone)]
struct LocalMcpServer {
    storage: StorageState,
    workspace_updated: Option<WorkspaceUpdatedSink>,
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct SearchPagesInput {
    query: String,
    limit: Option<usize>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CreatePageInput {
    parent_id: Option<String>,
    title: String,
    icon: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct GetPageInput {
    page_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct GetWhiteboardInput {
    board_id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateWhiteboardInput {
    board_id: String,
    #[serde(default)]
    nodes: Option<Vec<WhiteboardNodeInput>>,
    #[serde(default)]
    edges: Option<Vec<WhiteboardEdgeInput>>,
    #[serde(default)]
    strokes: Option<Vec<WhiteboardStrokeInput>>,
    #[serde(default)]
    erase_ids: Option<Vec<String>>,
}

impl LocalMcpServer {
    fn new(storage: StorageState, workspace_updated: Option<WorkspaceUpdatedSink>) -> Self {
        Self {
            storage,
            workspace_updated,
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
    ) -> CallToolResult {
        match self
            .storage
            .with_storage(|storage| storage.search_workspace(&query, limit.unwrap_or(30)))
        {
            Ok(results) => tool_success(serde_json::json!(results
                .into_iter()
                .filter(|result| result.kind == "page")
                .collect::<Vec<_>>())),
            Err(error) => tool_error(error),
        }
    }

    #[tool(
        description = "在知栖中创建页面。parent_id 为空时创建顶级页面，否则创建到指定父页面下。"
    )]
    fn create_page(
        &self,
        Parameters(CreatePageInput {
            parent_id,
            title,
            icon,
        }): Parameters<CreatePageInput>,
    ) -> CallToolResult {
        let title = title.trim();
        if title.is_empty() {
            return tool_error(StorageError::invalid_payload("page title cannot be empty"));
        }

        let now = now_timestamp();
        let parent_block_id = parent_id
            .as_ref()
            .map(|_| format!("block_mcp_{}", random_suffix()));
        let page = PageRecord {
            id: format!("page_mcp_{}", random_suffix()),
            parent_id: parent_id.clone(),
            deleted_at: None,
            deleted_root_id: None,
            title: title.to_string(),
            icon,
            cover: None,
            properties: None,
            is_full_width: None,
            is_small_text: None,
            font_family: None,
            show_outline: None,
            show_properties: None,
            blocks: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        match self.storage.with_storage(|storage| {
            storage.create_mcp_page(page.clone(), parent_block_id.clone())?;
            Ok(page)
        }) {
            Ok(page) => {
                if let Some(notify) = &self.workspace_updated {
                    notify(serde_json::json!({
                        "operation": "create_page",
                        "pageId": page.id,
                        "parentId": page.parent_id,
                        "createdPageIds": [page.id],
                    }));
                }
                let mut receipt = serde_json::json!(page);
                if let Some(parent_block_id) = parent_block_id {
                    receipt["parentBlockId"] = serde_json::json!(parent_block_id);
                }
                tool_success(receipt)
            }
            Err(error) => tool_error(error),
        }
    }

    #[tool(description = "读取指定知栖页面的元数据和内容块。")]
    fn get_page(
        &self,
        Parameters(GetPageInput { page_id }): Parameters<GetPageInput>,
    ) -> CallToolResult {
        match self
            .storage
            .with_storage(|storage| storage.load_page(&page_id))
        {
            Ok(page) => tool_success(serde_json::json!(page)),
            Err(error) => tool_error(error),
        }
    }

    #[tool(
        description = "读取指定白板的标题和完整快照；后续增量修改前应先读取并依据其中的元素 ID 操作。"
    )]
    fn get_whiteboard(
        &self,
        Parameters(GetWhiteboardInput { board_id }): Parameters<GetWhiteboardInput>,
    ) -> CallToolResult {
        match self
            .storage
            .with_storage(|storage| storage.load_active_mcp_whiteboard(&board_id))
        {
            Ok(board) => tool_success(serde_json::json!(board)),
            Err(error) => tool_error(error),
        }
    }

    #[tool(
        description = "向已有白板增量追加节点、连线或笔画，或按 eraseIds 擦除节点、便签、文本、笔画和连线。不会整板覆盖或清空；擦除节点会自动删除引用该节点的连线。"
    )]
    fn update_whiteboard(
        &self,
        Parameters(input): Parameters<UpdateWhiteboardInput>,
    ) -> CallToolResult {
        let board_id = input.board_id.clone();
        let batch_id = random_suffix();
        let now = now_timestamp();
        let nodes = input.nodes.unwrap_or_default();
        let edges = input.edges.unwrap_or_default();
        let strokes = input.strokes.unwrap_or_default();
        let erase_ids = input.erase_ids.unwrap_or_default();
        if nodes.is_empty() && edges.is_empty() && strokes.is_empty() && erase_ids.is_empty() {
            return tool_error(StorageError::invalid_payload(
                "whiteboard update requires additions or erase ids",
            ));
        }
        let erase_set = match validated_whiteboard_erase_ids(&erase_ids) {
            Ok(ids) => ids,
            Err(error) => return tool_error(error),
        };
        if nodes.iter().any(|node| erase_set.contains(node.id.trim()))
            || edges.iter().any(|edge| {
                erase_set.contains(edge.from.trim()) || erase_set.contains(edge.to.trim())
            })
            || strokes.iter().any(|stroke| {
                stroke
                    .id
                    .as_deref()
                    .is_some_and(|id| erase_set.contains(id.trim()))
            })
        {
            return tool_error(StorageError::invalid_payload(
                "whiteboard update cannot add or connect an erased id",
            ));
        }

        match self.storage.with_storage(|storage| {
            let board = storage.load_mcp_whiteboard(&board_id)?;
            let existing_node_ids = whiteboard_node_ids(&board.snapshot)?;
            let elements = normalize_whiteboard_elements(
                &WhiteboardInput {
                    title: String::new(),
                    nodes,
                    edges,
                    strokes,
                },
                &existing_node_ids,
                &batch_id,
            )?;
            storage.update_mcp_whiteboard(McpWhiteboardUpdate {
                board_id: board_id.clone(),
                shapes: elements.shapes,
                notes: elements.notes,
                texts: elements.texts,
                connections: elements.connections,
                strokes: elements.strokes,
                erase_ids,
                updated_at: now,
                audit_id: format!("mcp_audit_whiteboard_{batch_id}"),
            })
        }) {
            Ok(result) => {
                if let Some(notify) = &self.workspace_updated {
                    notify(serde_json::json!({
                        "operation": "update_whiteboard",
                        "boardId": result.board_id,
                        "addedNodeIds": result.added_node_ids,
                        "addedEdgeIds": result.added_edge_ids,
                        "addedStrokeIds": result.added_stroke_ids,
                        "erasedIds": result.erased_ids,
                    }));
                }
                tool_success(serde_json::json!({
                    "boardId": result.board_id,
                    "addedNodeIds": result.added_node_ids,
                    "addedEdgeIds": result.added_edge_ids,
                    "addedStrokeIds": result.added_stroke_ids,
                    "erasedIds": result.erased_ids,
                }))
            }
            Err(error) => tool_error(error),
        }
    }

    #[tool(
        description = "向指定知栖页面原子追加 Markdown、普通表格、asset（图片、视频、音频或附件）、数据表、白板或思维导图。优先使用 content；仍兼容旧 text/table 参数，但 content 非空时不得混用。dataTable 的标题必须写在每条 record 的 record title 字段，columns 不能使用 title 类型。成功后必须将原请求的每个 content 项与返回的 createdContent（index、type、blockIds、objectId）逐项核对；只有类型和数量都匹配时才能报告完整成功。若返回错误，修正提示所指 content[index] 后，重新发送完整原子批次。"
    )]
    fn append_content(&self, Parameters(input): Parameters<AppendContentInput>) -> CallToolResult {
        let page_id = input.page_id.clone();
        let batch_id = random_suffix();
        let now = now_timestamp();
        let mut normalized = match normalize_content_batch(&input, &batch_id, &now) {
            Ok(normalized) => normalized,
            Err(error) => return tool_error(error),
        };
        match self.storage.with_storage(|storage| {
            let mut tracked_assets = Vec::new();
            for asset in std::mem::take(&mut normalized.assets) {
                let written = match storage.write_asset_tracked(asset.input) {
                    Ok(written) => written,
                    Err(error) => {
                        return Err(storage.rollback_tracked_assets(&tracked_assets, error))
                    }
                };
                normalized.blocks[asset.block_index]["assetId"] =
                    serde_json::Value::String(written.meta.id.clone());
                normalized.created_content[asset.content_index].object_id =
                    Some(written.meta.id.clone());
                tracked_assets.push(written);
            }
            let created_content = normalized
                .created_content
                .iter()
                .map(|item| {
                    let mut value = serde_json::json!({
                        "index": item.index,
                        "type": item.content_type,
                        "blockIds": item
                            .block_indices
                            .iter()
                            .map(|index| normalized.blocks[*index]["id"].clone())
                            .collect::<Vec<_>>(),
                    });
                    if let Some(object_id) = &item.object_id {
                        value["objectId"] = serde_json::Value::String(object_id.clone());
                    }
                    value
                })
                .collect::<Vec<_>>();
            match storage.append_mcp_content(McpWriteBatch {
                page_id: page_id.clone(),
                blocks: normalized.blocks,
                boards: normalized.boards,
                data_tables: normalized.data_tables,
                mindmaps: normalized.mindmaps,
                updated_at: now,
                client_name: "local-mcp".to_string(),
                tool_name: "append_content".to_string(),
            }) {
                Ok(result) => Ok((result, created_content)),
                Err(error) => Err(storage.rollback_tracked_assets(&tracked_assets, error)),
            }
        }) {
            Ok((result, created_content)) => {
                if let Some(notify) = &self.workspace_updated {
                    notify(serde_json::json!({
                        "operation": "append_content",
                        "pageId": page_id,
                        "createdBlockIds": result.created_block_ids,
                        "createdObjectIds": result.created_object_ids,
                    }));
                }
                tool_success(serde_json::json!({
                    "pageId": result.page_id,
                    "createdBlockIds": result.created_block_ids,
                    "createdObjectIds": result.created_object_ids,
                    "createdContent": created_content,
                }))
            }
            Err(error) => tool_error(error),
        }
    }
}

fn tool_success(value: serde_json::Value) -> CallToolResult {
    CallToolResult::structured(value)
}

fn tool_error(error: StorageError) -> CallToolResult {
    CallToolResult::structured_error(serde_json::json!({
        "code": error.code,
        "message": error.message,
    }))
}

fn validated_whiteboard_erase_ids(ids: &[String]) -> StorageResult<HashSet<String>> {
    let mut unique = HashSet::new();
    for value in ids {
        let id = value.trim();
        if id.is_empty() {
            return Err(StorageError::invalid_payload(
                "whiteboard erase id cannot be empty",
            ));
        }
        if !unique.insert(id.to_string()) {
            return Err(StorageError::invalid_payload(format!(
                "duplicate whiteboard erase id: {id}"
            )));
        }
    }
    Ok(unique)
}

fn whiteboard_node_ids(snapshot: &serde_json::Value) -> StorageResult<HashSet<String>> {
    let snapshot = snapshot
        .as_object()
        .ok_or_else(|| StorageError::invalid_payload("whiteboard snapshot must be an object"))?;
    let mut ids = HashSet::new();
    for key in ["shapes", "notes", "texts", "images"] {
        let Some(value) = snapshot.get(key) else {
            continue;
        };
        let values = value.as_array().ok_or_else(|| {
            StorageError::invalid_payload(format!("whiteboard snapshot {key} must be an array"))
        })?;
        for value in values {
            let id = value
                .get("id")
                .and_then(serde_json::Value::as_str)
                .filter(|id| !id.trim().is_empty())
                .ok_or_else(|| {
                    StorageError::invalid_payload(format!(
                        "whiteboard snapshot {key} has an invalid id"
                    ))
                })?;
            if !ids.insert(id.to_string()) {
                return Err(StorageError::invalid_payload(format!(
                    "duplicate whiteboard node id: {id}"
                )));
            }
        }
    }
    Ok(ids)
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
    format!(
        "unix-ms:{}",
        next_monotonic_millis(&LAST_MCP_TIMESTAMP_MILLIS, millis as u64)
    )
}

fn next_monotonic_millis(last: &AtomicU64, millis: u64) -> u64 {
    let mut current = last.load(Ordering::Relaxed);
    loop {
        let next = millis.max(current.saturating_add(1));
        match last.compare_exchange_weak(current, next, Ordering::SeqCst, Ordering::Relaxed) {
            Ok(_) => return next,
            Err(observed) => current = observed,
        }
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LocalMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "知栖本机 MCP 服务支持搜索和创建页面，以及向指定页面原子追加 Markdown、普通表格、图片/视频/音频/附件、数据表、白板和思维导图。追加成功后必须根据 createdContent 核验每个请求项，不能以模型自身推断代替实际回执。",
        )
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
    workspace_updated: Option<WorkspaceUpdatedSink>,
) -> StorageResult<RunningLocalServer> {
    let listener = tokio::net::TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(StorageError::io)?;
    let address = listener.local_addr().map_err(StorageError::io)?;
    let cancellation = CancellationToken::new();
    let config = StreamableHttpServerConfig::default()
        .with_cancellation_token(cancellation.child_token())
        .with_allowed_hosts([
            format!("127.0.0.1:{}", address.port()),
            "localhost".to_string(),
        ]);
    let service: StreamableHttpService<LocalMcpServer, LocalSessionManager> =
        StreamableHttpService::new(
            move || {
                Ok(LocalMcpServer::new(
                    storage.clone(),
                    workspace_updated.clone(),
                ))
            },
            Default::default(),
            config,
        );
    let app = Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn(limit_request_body))
        .layer(middleware::from_fn_with_state(
            token.to_string(),
            authorize_request,
        ));
    let shutdown = cancellation.child_token();

    tokio::spawn(async move {
        let _ = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move { shutdown.cancelled().await })
        .await;
    });

    Ok(RunningLocalServer {
        address,
        cancellation,
    })
}

async fn buffer_limited_request(request: Request<Body>) -> Result<Request<Body>, StatusCode> {
    if request
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > MAX_MCP_REQUEST_BYTES as u64)
    {
        return Err(StatusCode::PAYLOAD_TOO_LARGE);
    }

    let (parts, body) = request.into_parts();
    let bytes = body::to_bytes(body, MAX_MCP_REQUEST_BYTES)
        .await
        .map_err(|error| {
            let mut current: Option<&(dyn std::error::Error + 'static)> = Some(&error);
            while let Some(error) = current {
                if error.is::<LengthLimitError>() {
                    return StatusCode::PAYLOAD_TOO_LARGE;
                }
                current = error.source();
            }
            StatusCode::BAD_REQUEST
        })?;
    Ok(Request::from_parts(parts, Body::from(bytes)))
}

async fn limit_request_body(request: Request<Body>, next: Next) -> Response {
    match buffer_limited_request(request).await {
        Ok(request) => next.run(request).await,
        Err(status) => status.into_response(),
    }
}

async fn authorize_request(
    State(token): State<String>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request<Body>,
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
        net::{IpAddr, Shutdown, TcpStream},
        sync::{Arc, Mutex},
        time::Duration,
    };

    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rmcp::{handler::server::wrapper::Parameters, model::CallToolResult};

    use super::{
        buffer_limited_request, next_monotonic_millis, start_local_server, whiteboard_node_ids,
        AppendContentInput, CreatePageInput, GetPageInput, GetWhiteboardInput, LocalMcpServer,
        McpServerState, UpdateWhiteboardInput, MAX_MCP_REQUEST_BYTES,
    };
    use crate::storage::{BoardRecord, McpSettings, PageRecord, StorageState};

    fn successful_value(result: CallToolResult) -> serde_json::Value {
        assert_eq!(result.is_error, Some(false));
        result.structured_content.expect("structured tool result")
    }

    #[test]
    fn allocates_strictly_monotonic_timestamps_within_one_millisecond() {
        let last = std::sync::atomic::AtomicU64::new(0);
        assert_eq!(next_monotonic_millis(&last, 42), 42);
        assert_eq!(next_monotonic_millis(&last, 42), 43);
    }

    #[test]
    fn treats_legacy_images_as_existing_whiteboard_connection_targets() {
        let ids = whiteboard_node_ids(&serde_json::json!({
            "images": [{ "id": "architecture-image" }],
        }))
        .expect("image ids");

        assert!(ids.contains("architecture-image"));
    }

    #[test]
    fn accepts_camel_case_tool_arguments() {
        let create: CreatePageInput =
            serde_json::from_str(r#"{"parentId":"page_parent","title":"AI 草稿"}"#)
                .expect("create page input");
        let append: AppendContentInput =
            serde_json::from_str(r#"{"pageId":"page_target","text":"一段内容"}"#)
                .expect("append input");

        assert_eq!(create.parent_id.as_deref(), Some("page_parent"));
        assert_eq!(append.page_id, "page_target");
    }

    #[tokio::test]
    async fn starts_on_loopback_and_stops_cleanly() {
        let server = start_local_server(
            0,
            "test-token",
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        )
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
        let server = start_local_server(
            0,
            "test-token",
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        )
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
    async fn rejects_request_bodies_over_32_mib() {
        let server = start_local_server(
            0,
            "test-token",
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        )
        .await
        .expect("server starts");
        let address = server.address();
        let content_length = MAX_MCP_REQUEST_BYTES + 1;

        let response = tokio::task::spawn_blocking(move || {
            let mut stream = TcpStream::connect(address).expect("connects");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            write!(
                stream,
                "POST /mcp HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer test-token\r\nAccept: application/json, text/event-stream\r\nContent-Type: application/json\r\nContent-Length: {content_length}\r\nConnection: close\r\n\r\n"
            )
            .expect("writes request headers");
            stream
                .shutdown(Shutdown::Write)
                .expect("finishes request");
            let mut response = String::new();
            stream
                .read_to_string(&mut response)
                .expect("reads response");
            response
        })
        .await
        .expect("request task completes");

        assert!(response.starts_with("HTTP/1.1 413"), "{response}");
        server.stop();
    }

    #[tokio::test]
    async fn rejects_truncated_request_bodies_as_bad_request() {
        let server = start_local_server(
            0,
            "test-token",
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        )
        .await
        .expect("server starts");
        let address = server.address();

        let response = tokio::task::spawn_blocking(move || {
            let mut stream = TcpStream::connect(address).expect("connects");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            write!(
                stream,
                "POST /mcp HTTP/1.1\r\nHost: {address}\r\nAuthorization: Bearer test-token\r\nAccept: application/json, text/event-stream\r\nContent-Type: application/json\r\nContent-Length: 10\r\nConnection: close\r\n\r\n{{}}"
            )
            .expect("writes truncated request");
            stream.shutdown(Shutdown::Write).expect("finishes request");
            let mut response = String::new();
            stream
                .read_to_string(&mut response)
                .expect("reads response");
            response
        })
        .await
        .expect("request task completes");

        assert!(response.starts_with("HTTP/1.1 400"), "{response}");
        server.stop();
    }

    #[tokio::test]
    async fn rejects_an_actual_body_over_32_mib() {
        let request = Request::new(Body::from(vec![b'x'; MAX_MCP_REQUEST_BYTES + 1]));

        assert!(matches!(
            buffer_limited_request(request).await,
            Err(status) if status == StatusCode::PAYLOAD_TOO_LARGE
        ));
    }

    #[tokio::test]
    async fn replaces_the_running_server_when_configuration_changes() {
        let state = McpServerState::default();
        state
            .apply(
                Some(&McpSettings {
                    enabled: true,
                    port: 0,
                    token: "first-token".to_string(),
                }),
                StorageState::open_in_memory_for_tests().expect("storage"),
            )
            .await
            .expect("first server starts");

        let first_address = state.address().expect("first address");
        state
            .apply(
                Some(&McpSettings {
                    enabled: true,
                    port: 0,
                    token: "second-token".to_string(),
                }),
                StorageState::open_in_memory_for_tests().expect("storage"),
            )
            .await
            .expect("replacement server starts");

        assert_ne!(state.address(), Some(first_address));
        state
            .apply(
                None,
                StorageState::open_in_memory_for_tests().expect("storage"),
            )
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
        let page: PageRecord =
            serde_json::from_value(successful_value(response)).expect("created page response");
        let loaded = storage
            .with_storage(|storage| storage.load_page(&page.id))
            .expect("loads created page");

        assert_eq!(loaded.title, "AI 草稿");
        assert_eq!(loaded.icon.as_deref(), Some("✨"));
        assert!(loaded.blocks.is_empty());
    }

    #[test]
    fn creates_child_page_with_a_parent_block_receipt() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_for_sink = events.clone();
        let server = LocalMcpServer::new(
            storage.clone(),
            Some(Arc::new(move |payload| {
                events_for_sink.lock().expect("event lock").push(payload);
            })),
        );
        let parent: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "Parent".to_string(),
                icon: None,
            }),
        )))
        .expect("parent page response");

        let response = server.create_page(Parameters(CreatePageInput {
            parent_id: Some(parent.id.clone()),
            title: "Child".to_string(),
            icon: None,
        }));
        let value = successful_value(response);
        let child: PageRecord = serde_json::from_value(value.clone()).expect("child page response");
        let parent_block_id = value["parentBlockId"]
            .as_str()
            .expect("parent block id response");
        let persisted_parent = storage
            .with_storage(|storage| storage.load_page(&parent.id))
            .expect("load parent page");

        assert_eq!(
            persisted_parent.blocks,
            vec![serde_json::json!({
                "id": parent_block_id,
                "type": "child_page",
                "pageId": child.id,
            })]
        );
        assert_eq!(
            events
                .lock()
                .expect("event lock")
                .last()
                .and_then(|event| event["parentId"].as_str()),
            Some(parent.id.as_str())
        );
    }

    #[test]
    fn reads_a_page_through_the_existing_storage_path() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "MCP 读取".to_string(),
                icon: None,
            }),
        )))
        .expect("created page response");

        let response = server.get_page(Parameters(GetPageInput {
            page_id: created.id.clone(),
        }));
        let page: PageRecord =
            serde_json::from_value(successful_value(response)).expect("page response");

        assert_eq!(page.id, created.id);
        assert_eq!(page.title, "MCP 读取");
    }

    #[test]
    fn reads_and_incrementally_edits_a_whiteboard_without_replacing_its_snapshot() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_for_sink = events.clone();
        let server = LocalMcpServer::new(
            storage.clone(),
            Some(Arc::new(move |payload| {
                events_for_sink.lock().expect("event lock").push(payload);
            })),
        );
        let page: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "Whiteboard edits".to_string(),
                icon: None,
            }),
        )))
        .expect("page response");
        let append: AppendContentInput = serde_json::from_value(serde_json::json!({
            "pageId": page.id,
            "content": [{
                "type": "whiteboard",
                "title": "Architecture",
                "nodes": [{ "id": "entry", "kind": "ellipse", "text": "Entry" }],
                "edges": []
            }]
        }))
        .expect("whiteboard input");
        let append_result = successful_value(server.append_content(Parameters(append)));
        let board_id = append_result["createdObjectIds"][0]
            .as_str()
            .expect("board id")
            .to_string();

        let before: BoardRecord = serde_json::from_value(successful_value(server.get_whiteboard(
            Parameters(GetWhiteboardInput {
                board_id: board_id.clone(),
            }),
        )))
        .expect("whiteboard response");
        assert_eq!(before.title, "Architecture");
        assert_eq!(before.snapshot["shapes"].as_array().unwrap().len(), 1);

        let update: UpdateWhiteboardInput = serde_json::from_value(serde_json::json!({
            "boardId": board_id,
            "nodes": [
                { "id": "service", "kind": "rect", "text": "Service", "color": "#2563eb" },
                { "id": "note", "kind": "note", "text": "Owned by platform" },
                { "id": "label", "kind": "text", "text": "Production" }
            ],
            "edges": [{ "id": "entry-service", "from": "entry", "to": "service", "mode": "curve" }],
            "strokes": [{
                "id": "annotation",
                "color": "#dc2626",
                "size": 6,
                "points": [{ "x": 8, "y": 12 }, { "x": 32, "y": 48 }]
            }]
        }))
        .expect("incremental update input");
        successful_value(server.update_whiteboard(Parameters(update)));

        let erase: UpdateWhiteboardInput = serde_json::from_value(serde_json::json!({
            "boardId": board_id,
            "eraseIds": ["entry", "note", "label", "annotation"]
        }))
        .expect("erase update input");
        let erased = successful_value(server.update_whiteboard(Parameters(erase)));
        assert!(erased["erasedIds"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("entry-service")));

        let after: BoardRecord = serde_json::from_value(successful_value(
            server.get_whiteboard(Parameters(GetWhiteboardInput { board_id })),
        ))
        .expect("updated whiteboard response");
        assert_eq!(after.snapshot["shapes"].as_array().unwrap().len(), 1);
        assert_eq!(after.snapshot["shapes"][0]["id"], "service");
        assert!(after.snapshot["notes"].as_array().unwrap().is_empty());
        assert!(after.snapshot["texts"].as_array().unwrap().is_empty());
        assert!(after.snapshot["connections"].as_array().unwrap().is_empty());
        assert!(after.snapshot["strokes"].as_array().unwrap().is_empty());
        assert_eq!(
            events
                .lock()
                .expect("event lock")
                .last()
                .and_then(|event| event["operation"].as_str()),
            Some("update_whiteboard")
        );
    }

    #[test]
    fn appends_text_and_a_table_through_the_existing_storage_path() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "AI 草稿".to_string(),
                icon: None,
            }),
        )))
        .expect("created page response");

        let response = server.append_content(Parameters(AppendContentInput {
            page_id: created.id.clone(),
            content: Vec::new(),
            text: Some("第一段\n第二段".to_string()),
            table: Some(vec![
                vec!["名称".to_string(), "金额".to_string()],
                vec!["机票".to_string(), "2000".to_string()],
            ]),
        }));
        assert_eq!(successful_value(response)["pageId"], created.id);

        let loaded = storage
            .with_storage(|storage| storage.load_page(&created.id))
            .expect("loads updated page");
        assert_eq!(loaded.blocks.len(), 3);
        assert_eq!(loaded.blocks[0]["text"], "第一段");
        assert_eq!(loaded.blocks[2]["rows"][1][1], "2000");
    }

    #[test]
    fn appends_native_data_table_whiteboard_and_mindmap_through_one_mcp_batch() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "AI 结构化草稿".to_string(),
                icon: None,
            }),
        )))
        .expect("created page response");
        let input: AppendContentInput = serde_json::from_value(serde_json::json!({
            "pageId": created.id,
            "content": [
                {
                    "type": "dataTable",
                    "title": "项目",
                    "columns": [{ "key": "status", "name": "状态", "type": "select" }],
                    "records": [{ "title": "MCP", "values": { "status": "进行中" } }]
                },
                {
                    "type": "whiteboard",
                    "title": "流程",
                    "nodes": [{ "id": "start", "kind": "ellipse", "text": "开始" }],
                    "edges": []
                },
                {
                    "type": "mindmap",
                    "title": "导图",
                    "root": { "text": "中心", "children": [{ "text": "分支" }] }
                }
            ]
        }))
        .expect("semantic input");

        let response = server.append_content(Parameters(input));
        let result = successful_value(response);
        assert_eq!(result["createdBlockIds"].as_array().unwrap().len(), 3);
        assert_eq!(result["createdObjectIds"].as_array().unwrap().len(), 3);
        storage
            .with_storage(|storage| {
                let page = storage.load_page(&created.id)?;
                let snapshot = storage.bootstrap_workspace()?;
                assert_eq!(page.blocks.len(), 3);
                assert_eq!(snapshot.boards.len(), 1);
                assert_eq!(snapshot.data_tables.len(), 1);
                assert_eq!(snapshot.mindmaps.len(), 1);
                Ok(())
            })
            .expect("semantic records persist together");
    }

    #[test]
    fn append_content_reports_each_persisted_content_item() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "完整 MCP 验收".to_string(),
                icon: None,
            }),
        )))
        .expect("created page response");
        let input: AppendContentInput = serde_json::from_value(serde_json::json!({
            "pageId": created.id,
            "content": [
                { "type": "markdown", "markdown": "# 验收正文" },
                { "type": "table", "rows": [["类型", "状态"], ["普通表格", "完成"]], "hasHeaderRow": true },
                { "type": "asset", "name": "diagram.png", "mimeType": "image/png", "dataBase64": "aGVsbG8=" },
                {
                    "type": "dataTable",
                    "title": "任务",
                    "columns": [{ "key": "status", "name": "状态", "type": "select" }],
                    "records": [{ "title": "MCP", "values": { "status": "完成" } }]
                },
                {
                    "type": "whiteboard",
                    "title": "流程",
                    "nodes": [{ "id": "start", "kind": "ellipse", "text": "开始" }],
                    "edges": []
                },
                {
                    "type": "mindmap",
                    "title": "导图",
                    "root": { "text": "中心", "children": [{ "text": "分支" }] }
                }
            ]
        }))
        .expect("full content input");

        let result = successful_value(server.append_content(Parameters(input)));

        assert_eq!(
            result["createdContent"]
                .as_array()
                .expect("created content manifest")
                .iter()
                .map(|item| item["type"].as_str().expect("content type"))
                .collect::<Vec<_>>(),
            [
                "markdown",
                "table",
                "asset",
                "dataTable",
                "whiteboard",
                "mindmap"
            ]
        );
    }

    #[test]
    fn append_content_description_guides_external_clients() {
        let server = LocalMcpServer::new(
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        );
        let description = server
            .tool_router
            .list_all()
            .into_iter()
            .find(|tool| tool.name == "append_content")
            .and_then(|tool| tool.description)
            .expect("append_content description");

        assert!(description.contains("asset"));
        assert!(description.contains("record title"));
        assert!(description.contains("createdContent"));
    }

    #[test]
    fn appends_a_base64_image_as_a_managed_asset() {
        let storage = StorageState::open_in_memory_for_tests().expect("storage");
        let server = LocalMcpServer::new(storage.clone(), None);
        let created: PageRecord = serde_json::from_value(successful_value(server.create_page(
            Parameters(CreatePageInput {
                parent_id: None,
                title: "MCP 媒体".to_string(),
                icon: None,
            }),
        )))
        .expect("created page response");
        let input: AppendContentInput = serde_json::from_value(serde_json::json!({
            "pageId": created.id,
            "content": [{
                "type": "asset",
                "name": "diagram.png",
                "mimeType": "image/png",
                "dataBase64": "aGVsbG8="
            }]
        }))
        .expect("asset input");

        let response = server.append_content(Parameters(input));
        let result = successful_value(response);
        let asset_id = storage
            .with_storage(|storage| {
                let page = storage.load_page(&created.id)?;
                assert_eq!(page.blocks.len(), 1);
                assert_eq!(page.blocks[0]["type"], "image");
                Ok(page.blocks[0]["assetId"]
                    .as_str()
                    .expect("image asset id")
                    .to_string())
            })
            .expect("loads asset block");

        assert_eq!(result["createdBlockIds"].as_array().unwrap().len(), 1);
        assert_eq!(
            storage
                .with_storage(|storage| storage.read_asset(&asset_id))
                .expect("reads managed asset"),
            b"hello"
        );
    }

    #[test]
    fn returns_a_structured_tool_error_when_the_target_page_is_missing() {
        let server = LocalMcpServer::new(
            StorageState::open_in_memory_for_tests().expect("storage"),
            None,
        );

        let result = server.append_content(Parameters(AppendContentInput {
            page_id: "page_missing".to_string(),
            content: Vec::new(),
            text: Some("do not persist".to_string()),
            table: None,
        }));

        assert_eq!(result.is_error, Some(true));
        assert_eq!(
            result.structured_content.as_ref().unwrap()["code"],
            "not_found"
        );
    }
}
