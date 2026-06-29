use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_WINDOW_ID: &str = "show-window";
const TRAY_HIDE_WINDOW_ID: &str = "hide-window";
const TRAY_QUIT_APP_ID: &str = "quit-app";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayMenuAction {
    ShowWindow,
    HideWindow,
    QuitApp,
}

impl TrayMenuAction {
    fn from_menu_id(id: &str) -> Option<Self> {
        match id {
            TRAY_SHOW_WINDOW_ID => Some(Self::ShowWindow),
            TRAY_HIDE_WINDOW_ID => Some(Self::HideWindow),
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
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
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

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show_window = MenuItem::with_id(app, TRAY_SHOW_WINDOW_ID, "显示窗口", true, None::<&str>)?;
    let hide_window =
        MenuItem::with_id(app, TRAY_HIDE_WINDOW_ID, "隐藏到托盘", true, None::<&str>)?;
    let quit_app = MenuItem::with_id(app, TRAY_QUIT_APP_ID, "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show_window, &hide_window, &separator, &quit_app])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Personal Notebook")
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
        TrayMenuAction::HideWindow => hide_main_window(app),
        TrayMenuAction::QuitApp => app.exit(0),
    }
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

fn hide_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::tray::MouseButtonState;

    #[test]
    fn maps_tray_menu_ids_to_actions() {
        assert_eq!(
            TrayMenuAction::from_menu_id("show-window"),
            Some(TrayMenuAction::ShowWindow)
        );
        assert_eq!(
            TrayMenuAction::from_menu_id("hide-window"),
            Some(TrayMenuAction::HideWindow)
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
