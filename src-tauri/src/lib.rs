use std::process::Command;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

mod clipboard_capture;
mod mcp;
mod storage;

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_WINDOW_ID: &str = "show-window";
const TRAY_NEW_NOTE_ID: &str = "new-note";
const TRAY_OPEN_INBOX_ID: &str = "open-inbox";
const TRAY_QUIT_APP_ID: &str = "quit-app";
const FRONTEND_QUIT_REQUESTED_EVENT: &str = "zhiqi://quit-requested";
const FRONTEND_TRAY_NEW_NOTE_EVENT: &str = "zhiqi://tray-new-note";
const FRONTEND_TRAY_OPEN_INBOX_EVENT: &str = "zhiqi://tray-open-inbox";
const ALLOWED_EXTERNAL_URL_SCHEMES: [&str; 3] = ["http://", "https://", "mailto:"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayMenuAction {
    ShowWindow,
    NewNote,
    OpenInbox,
    QuitApp,
}

impl TrayMenuAction {
    fn from_menu_id(id: &str) -> Option<Self> {
        match id {
            TRAY_SHOW_WINDOW_ID => Some(Self::ShowWindow),
            TRAY_NEW_NOTE_ID => Some(Self::NewNote),
            TRAY_OPEN_INBOX_ID => Some(Self::OpenInbox),
            TRAY_QUIT_APP_ID => Some(Self::QuitApp),
            _ => None,
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            open_asset_file,
            clipboard_capture::read_clipboard_candidate,
            clipboard_capture::set_clipboard_capture_enabled,
            clipboard_capture::take_confirmed_clipboard_capture,
            clipboard_capture::show_clipboard_capture_notification,
            clipboard_capture::show_clipboard_capture_failure_notification,
            clipboard_capture::suppress_clipboard_capture,
            storage::commands::bootstrap_workspace,
            storage::commands::export_workspace_backup,
            storage::commands::replace_workspace_backup,
            storage::commands::export_workspace_archive,
            storage::commands::import_workspace_archive,
            storage::commands::load_app_settings,
            storage::commands::save_app_settings,
            storage::commands::enable_local_mcp,
            storage::commands::disable_local_mcp,
            storage::commands::regenerate_local_mcp_token,
            storage::commands::export_page_package,
            storage::commands::export_page_package_to_path,
            storage::commands::import_page_package,
            storage::commands::import_page_package_from_path,
            storage::commands::load_page,
            storage::commands::save_page,
            storage::commands::delete_page_branch,
            storage::commands::save_board,
            storage::commands::load_board_snapshot,
            storage::commands::save_mindmap,
            storage::commands::load_mindmap_snapshot,
            storage::commands::load_data_table,
            storage::commands::save_data_table_metadata,
            storage::commands::save_data_table_record,
            storage::commands::delete_data_table_record,
            storage::commands::write_asset,
            storage::commands::import_asset_file,
            storage::commands::read_asset,
            storage::commands::get_asset_file_path,
            storage::commands::cleanup_orphan_assets,
            storage::commands::search_workspace,
            quit_app_after_pending_saves,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(storage::StorageState::open(app_data_dir)?);
            let mcp_state = mcp::McpServerState::new(app.handle().clone());
            let mcp_settings = app
                .state::<storage::StorageState>()
                .with_storage(|storage| storage.load_app_settings())?
                .and_then(|settings| settings.mcp);
            let storage = app.state::<storage::StorageState>().inner().clone();
            app.manage(mcp_state.clone());
            tauri::async_runtime::spawn(async move {
                if let Err(error) = mcp_state.apply(mcp_settings.as_ref(), storage).await {
                    eprintln!("failed to restore local MCP server: {error}");
                }
            });
            let clipboard_capture_state = clipboard_capture::ClipboardCaptureState::default();
            app.manage(clipboard_capture_state.clone());
            clipboard_capture::start_clipboard_capture_monitor(app.handle().clone(), clipboard_capture_state);
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("unsupported external URL scheme".to_string());
    }

    open_external_url_with_system(&url)
}

#[tauri::command]
fn open_asset_file(
    state: tauri::State<'_, storage::StorageState>,
    asset_id: String,
) -> Result<(), String> {
    let path = state
        .with_storage(|storage| storage.get_asset_file_path(&asset_id))
        .map_err(|error| error.to_string())?;

    open_external_url_with_system(&path)
}

#[tauri::command]
fn quit_app_after_pending_saves(app: tauri::AppHandle) {
    app.exit(0);
}

fn is_allowed_external_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    ALLOWED_EXTERNAL_URL_SCHEMES
        .iter()
        .any(|scheme| normalized.starts_with(scheme))
}

fn open_external_url_with_system(url: &str) -> Result<(), String> {
    let mut command = system_open_command(url);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open with system: {error}"))
}

#[cfg(target_os = "windows")]
fn system_open_command(url: &str) -> Command {
    let mut command = Command::new("explorer.exe");
    command.arg(url);
    command
}

#[cfg(target_os = "macos")]
fn system_open_command(url: &str) -> Command {
    let mut command = Command::new("open");
    command.arg(url);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn system_open_command(url: &str) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(url);
    command
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_window = MenuItem::with_id(app, TRAY_SHOW_WINDOW_ID, "打开知栖", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, TRAY_NEW_NOTE_ID, "新建笔记", true, None::<&str>)?;
    let open_inbox = MenuItem::with_id(app, TRAY_OPEN_INBOX_ID, "打开收件箱", true, None::<&str>)?;
    let quit_app = MenuItem::with_id(app, TRAY_QUIT_APP_ID, "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu =
        Menu::with_items(app, &[&show_window, &new_note, &open_inbox, &separator, &quit_app])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("知栖")
        .on_menu_event(|app, event| {
            if let Some(action) = TrayMenuAction::from_menu_id(event.id().as_ref()) {
                handle_tray_menu_action(app, action);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if tray_event_should_show_window(&event) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    Ok(())
}

fn handle_tray_menu_action<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: TrayMenuAction) {
    match action {
        TrayMenuAction::ShowWindow => show_main_window(app),
        TrayMenuAction::NewNote => show_window_and_emit(app, FRONTEND_TRAY_NEW_NOTE_EVENT),
        TrayMenuAction::OpenInbox => show_window_and_emit(app, FRONTEND_TRAY_OPEN_INBOX_EVENT),
        TrayMenuAction::QuitApp => request_app_quit_after_frontend_flush(app),
    }
}

fn show_window_and_emit<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event_name: &str) {
    show_main_window(app);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.emit(event_name, ());
    }
}

fn request_app_quit_after_frontend_flush<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if window.emit(FRONTEND_QUIT_REQUESTED_EVENT, ()).is_ok() {
            return;
        }
    }

    app.exit(0);
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    let _ = app.show();

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn tray_event_should_show_window(event: &TrayIconEvent) -> bool {
    matches!(
        event,
        TrayIconEvent::Click {
            button: MouseButton::Left,
            ..
        } | TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        }
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::tray::MouseButtonState;

    #[test]
    fn allows_common_external_url_schemes() {
        assert!(is_allowed_external_url("https://example.com"));
        assert!(is_allowed_external_url("http://example.com"));
        assert!(is_allowed_external_url("mailto:hello@example.com"));
    }

    #[test]
    fn rejects_non_external_or_unsafe_url_schemes() {
        assert!(!is_allowed_external_url("/pages/page-1"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("file:///C:/secret.txt"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn opens_external_urls_with_windows_explorer() {
        let command = system_open_command("https://example.com");

        assert_eq!(command.get_program(), "explorer.exe");
        assert_eq!(
            command
                .get_args()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>(),
            vec!["https://example.com"],
        );
    }

    #[test]
    fn maps_tray_menu_ids_to_actions() {
        assert_eq!(
            TrayMenuAction::from_menu_id("show-window"),
            Some(TrayMenuAction::ShowWindow)
        );
        assert_eq!(
            TrayMenuAction::from_menu_id("new-note"),
            Some(TrayMenuAction::NewNote)
        );
        assert_eq!(
            TrayMenuAction::from_menu_id("open-inbox"),
            Some(TrayMenuAction::OpenInbox)
        );
        assert_eq!(
            TrayMenuAction::from_menu_id("quit-app"),
            Some(TrayMenuAction::QuitApp)
        );
    }

    #[test]
    fn ignores_unknown_tray_menu_ids() {
        assert_eq!(TrayMenuAction::from_menu_id("unknown"), None);
    }

    #[test]
    fn restores_window_from_left_tray_click_down_or_up() {
        assert!(tray_event_should_show_window(&click_event(
            MouseButton::Left,
            MouseButtonState::Down,
        )));
        assert!(tray_event_should_show_window(&click_event(
            MouseButton::Left,
            MouseButtonState::Up,
        )));
    }

    #[test]
    fn restores_window_from_left_tray_double_click() {
        assert!(tray_event_should_show_window(&double_click_event(
            MouseButton::Left,
        )));
    }

    #[test]
    fn ignores_non_left_tray_clicks_for_window_restore() {
        assert!(!tray_event_should_show_window(&click_event(
            MouseButton::Right,
            MouseButtonState::Up,
        )));
        assert!(!tray_event_should_show_window(&double_click_event(
            MouseButton::Right,
        )));
    }

    fn click_event(button: MouseButton, button_state: MouseButtonState) -> TrayIconEvent {
        TrayIconEvent::Click {
            id: "main-tray".into(),
            position: tauri::PhysicalPosition { x: 0.0, y: 0.0 },
            rect: tray_rect(),
            button,
            button_state,
        }
    }

    fn double_click_event(button: MouseButton) -> TrayIconEvent {
        TrayIconEvent::DoubleClick {
            id: "main-tray".into(),
            position: tauri::PhysicalPosition { x: 0.0, y: 0.0 },
            rect: tray_rect(),
            button,
        }
    }

    fn tray_rect() -> tauri::Rect {
        tauri::Rect::default()
    }
}
