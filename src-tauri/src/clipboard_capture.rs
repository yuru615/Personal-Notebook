use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const WINDOWS_POWERSHELL_PATH: &str = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const CLIPBOARD_CAPTURE_CONFIRM_EVENT: &str = "zhixi://clipboard-capture-confirm";
#[cfg(target_os = "windows")]
const CLIPBOARD_CAPTURE_MONITOR_INTERVAL: Duration = Duration::from_millis(250);
const CLIPBOARD_CAPTURE_NOTIFICATION_TITLE: &str =
    "\u{5DF2}\u{6355}\u{83B7}\u{526A}\u{8D34}\u{677F}\u{5185}\u{5BB9}";
const CLIPBOARD_CAPTURE_NOTIFICATION_CONFIRM_LABEL: &str =
    "\u{70B9}\u{51FB}\u{6536}\u{8FDB}\u{6536}\u{4EF6}\u{7BB1}";
const CLIPBOARD_CAPTURE_RICH_TEXT_SUMMARY: &str =
    "\u{5BCC}\u{6587}\u{672C}\u{526A}\u{8D34}\u{677F}\u{5185}\u{5BB9}";
const CLIPBOARD_CAPTURE_IMAGE_SUMMARY: &str =
    "\u{526A}\u{8D34}\u{677F}\u{56FE}\u{7247}";
#[cfg(target_os = "windows")]
const WINDOWS_CF_UNICODETEXT: u32 = 13;
#[cfg(target_os = "windows")]
const WINDOWS_CF_HDROP: u32 = 15;

#[cfg(target_os = "windows")]
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Instant,
};
#[cfg(target_os = "windows")]
use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::{HGLOBAL, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        System::{
            DataExchange::{
                CloseClipboard, GetClipboardData, GetClipboardSequenceNumber,
                IsClipboardFormatAvailable, OpenClipboard,
            },
            LibraryLoader::GetModuleHandleW,
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
        UI::{
            Shell::{
                DragQueryFileW, HDROP, Shell_NotifyIconW, NIF_ICON, NIF_INFO, NIF_MESSAGE,
                NIF_REALTIME, NIF_TIP, NIIF_INFO, NIIF_NOSOUND, NIM_ADD, NIM_DELETE, NIM_MODIFY,
                NIM_SETVERSION, NIN_BALLOONUSERCLICK, NOTIFYICONDATAW, NOTIFYICON_VERSION_4,
            },
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
                GetWindowLongPtrW, LoadIconW, PeekMessageW, RegisterClassW, SetWindowLongPtrW,
                TranslateMessage, GWLP_USERDATA, HICON, HWND_MESSAGE, IDI_INFORMATION, MSG,
                PM_REMOVE, WM_NCDESTROY, WNDCLASSW, WINDOW_EX_STYLE, WINDOW_STYLE,
            },
        },
    },
};

#[cfg(target_os = "windows")]
const WINDOWS_NOTIFICATION_CALLBACK_MESSAGE: u32 = 0x8000 + 81;
#[cfg(target_os = "windows")]
const WINDOWS_NOTIFICATION_ID: u32 = 1;
#[cfg(target_os = "windows")]
const WINDOWS_NOTIFICATION_TIP: &str = "知栖";
#[cfg(target_os = "windows")]
const WINDOWS_CONFIRM_NOTIFICATION_DURATION: Duration = Duration::from_secs(8);
#[cfg(target_os = "windows")]
const WINDOWS_FAILURE_NOTIFICATION_DURATION: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClipboardCandidate {
    Text {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        html: Option<String>,
    },
    ImageBytes {
        bytes: Vec<u8>,
    },
    ImageFile {
        path: String,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ClipboardCaptureNotificationPayload {
    pub title: String,
    pub body: String,
    pub confirm_label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ClipboardCaptureFailureNotificationPayload {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ClipboardCandidateWire {
    Text {
        text: String,
        html: Option<String>,
    },
    TextHex {
        text_hex: String,
        html_hex: Option<String>,
    },
    ImageBytes {
        bytes: Vec<u8>,
    },
    ImageFile {
        path: String,
    },
}

#[derive(Clone, Default)]
pub struct ClipboardCaptureState {
    inner: Arc<Mutex<ClipboardCaptureStateInner>>,
}

#[derive(Debug, Default)]
struct ClipboardCaptureStateInner {
    enabled: bool,
    suppress_until_ms: u64,
    last_clipboard_sequence_number: u32,
    last_seen_signature: Option<String>,
    pending_capture: Option<PendingClipboardCapture>,
}

#[derive(Debug, Clone)]
struct PendingClipboardCapture {
    candidate: ClipboardCandidate,
    captured_at: String,
    confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmedClipboardCapture {
    pub candidate: ClipboardCandidate,
    pub captured_at: String,
}

impl ClipboardCaptureState {
    fn is_enabled(&self) -> bool {
        self.inner
            .lock()
            .map(|state| state.enabled)
            .unwrap_or(false)
    }

    fn should_suppress(&self, now_ms: u64) -> bool {
        self.inner
            .lock()
            .map(|state| state.suppress_until_ms > now_ms)
            .unwrap_or(false)
    }

    fn set_enabled(&self, enabled: bool) {
        if let Ok(mut state) = self.inner.lock() {
            state.enabled = enabled;
            if !enabled {
                state.suppress_until_ms = 0;
                state.last_clipboard_sequence_number = 0;
                state.last_seen_signature = None;
                state.pending_capture = None;
            }
        }
    }

    fn suppress_for(&self, duration_ms: u64) {
        if let Ok(mut state) = self.inner.lock() {
            state.suppress_until_ms = now_timestamp_ms().saturating_add(duration_ms);
        }
    }

    fn store_detected_candidate(&self, candidate: ClipboardCandidate, captured_at: String) -> bool {
        let signature = clipboard_candidate_signature(&candidate);

        if let Ok(mut state) = self.inner.lock() {
            if state.last_seen_signature.as_deref() == Some(signature.as_str()) {
                return false;
            }

            state.last_seen_signature = Some(signature);
            state.pending_capture = Some(PendingClipboardCapture {
                candidate,
                captured_at,
                confirmed: false,
            });
            return true;
        }

        false
    }

    fn clear_last_seen_signature(&self) {
        if let Ok(mut state) = self.inner.lock() {
            state.last_seen_signature = None;
        }
    }

    fn remember_clipboard_sequence_number(&self, sequence_number: u32) {
        if sequence_number == 0 {
            return;
        }

        if let Ok(mut state) = self.inner.lock() {
            state.last_clipboard_sequence_number = sequence_number;
        }
    }

    fn mark_clipboard_sequence_if_changed(&self, sequence_number: u32) -> bool {
        if sequence_number == 0 {
            return true;
        }

        if let Ok(mut state) = self.inner.lock() {
            if state.last_clipboard_sequence_number == sequence_number {
                return false;
            }

            state.last_clipboard_sequence_number = sequence_number;
            return true;
        }

        true
    }

    fn confirm_pending_capture(&self) -> bool {
        if let Ok(mut state) = self.inner.lock() {
            if let Some(pending_capture) = state.pending_capture.as_mut() {
                pending_capture.confirmed = true;
                return true;
            }
        }

        false
    }

    fn take_confirmed_capture(&self) -> Option<ConfirmedClipboardCapture> {
        let mut state = self.inner.lock().ok()?;
        let pending_capture = state.pending_capture.as_ref()?;
        if !pending_capture.confirmed {
            return None;
        }

        let pending_capture = state.pending_capture.take()?;
        Some(ConfirmedClipboardCapture {
            candidate: pending_capture.candidate,
            captured_at: pending_capture.captured_at,
        })
    }
}

#[tauri::command]
pub fn read_clipboard_candidate() -> Result<Option<ClipboardCandidate>, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(candidate) = read_windows_native_clipboard_candidate()? {
            return Ok(Some(candidate));
        }

        let output = run_windows_powershell_script(WINDOWS_CLIPBOARD_READ_SCRIPT)?;
        return parse_clipboard_candidate_json(&output);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
pub fn set_clipboard_capture_enabled(
    state: State<'_, ClipboardCaptureState>,
    enabled: bool,
) -> Result<(), String> {
    state.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn suppress_clipboard_capture(
    state: State<'_, ClipboardCaptureState>,
    duration_ms: u64,
) -> Result<(), String> {
    state.suppress_for(duration_ms);
    Ok(())
}

#[tauri::command]
pub fn take_confirmed_clipboard_capture(
    state: State<'_, ClipboardCaptureState>,
) -> Result<Option<ConfirmedClipboardCapture>, String> {
    Ok(state.take_confirmed_capture())
}

#[cfg(target_os = "windows")]
pub fn start_clipboard_capture_monitor(app: AppHandle, state: ClipboardCaptureState) {
    std::thread::spawn(move || loop {
        process_clipboard_capture_tick(&app, &state);
        std::thread::sleep(CLIPBOARD_CAPTURE_MONITOR_INTERVAL);
    });
}

#[cfg(not(target_os = "windows"))]
pub fn start_clipboard_capture_monitor(_app: AppHandle, _state: ClipboardCaptureState) {}

#[tauri::command]
pub fn show_clipboard_capture_notification(
    app: AppHandle,
    payload: ClipboardCaptureNotificationPayload,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let body = format!("{}\n{}", payload.body, payload.confirm_label);
        spawn_windows_native_notification(app, payload.title, body, true)?;
    }

    Ok(())
}

#[tauri::command]
pub fn show_clipboard_capture_failure_notification(
    app: AppHandle,
    payload: ClipboardCaptureFailureNotificationPayload,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        spawn_windows_native_notification(app, payload.title, payload.body, false)?;
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn process_clipboard_capture_tick(app: &AppHandle, state: &ClipboardCaptureState) {
    let now_ms = now_timestamp_ms();
    if !state.is_enabled() {
        return;
    }

    let clipboard_sequence_number = current_windows_clipboard_sequence_number();
    if state.should_suppress(now_ms) {
        if let Some(sequence_number) = clipboard_sequence_number {
            state.remember_clipboard_sequence_number(sequence_number);
        }
        return;
    }

    if let Some(sequence_number) = clipboard_sequence_number {
        if !state.mark_clipboard_sequence_if_changed(sequence_number) {
            return;
        }
    }

    match read_windows_native_clipboard_candidate() {
        Ok(Some(candidate)) => {
            let should_notify = state.store_detected_candidate(candidate.clone(), iso_timestamp_now());
            if should_notify {
                let _ = show_clipboard_capture_notification(
                    app.clone(),
                    ClipboardCaptureNotificationPayload {
                        title: CLIPBOARD_CAPTURE_NOTIFICATION_TITLE.to_string(),
                        body: summarize_clipboard_candidate(&candidate),
                        confirm_label: CLIPBOARD_CAPTURE_NOTIFICATION_CONFIRM_LABEL.to_string(),
                    },
                );
            }
        }
        Ok(None) => state.clear_last_seen_signature(),
        Err(_) => {}
    }
}

fn clipboard_text_candidate(text: &str, html: Option<&str>) -> Option<ClipboardCandidate> {
    let normalized_html = normalize_optional_string(html);
    if text.trim().is_empty() && normalized_html.is_none() {
        return None;
    }

    Some(ClipboardCandidate::Text {
        text: text.to_string(),
        html: normalized_html,
    })
}

#[cfg(target_os = "windows")]
fn current_windows_clipboard_sequence_number() -> Option<u32> {
    let sequence_number = unsafe { GetClipboardSequenceNumber() };
    if sequence_number == 0 {
        None
    } else {
        Some(sequence_number)
    }
}

fn clipboard_candidate_signature(candidate: &ClipboardCandidate) -> String {
    match candidate {
        ClipboardCandidate::Text { text, html } => {
            format!("text:{}", html.as_deref().unwrap_or(text).trim())
        }
        ClipboardCandidate::ImageFile { path } => format!("image_file:{}", path.to_ascii_lowercase()),
        ClipboardCandidate::ImageBytes { bytes } => format!(
            "image_bytes:{}:{}",
            bytes.len(),
            bytes
                .iter()
                .take(32)
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
                .join(",")
        ),
    }
}

fn summarize_clipboard_candidate(candidate: &ClipboardCandidate) -> String {
    match candidate {
        ClipboardCandidate::Text { text, html } => {
            let summary_source = if text.trim().is_empty() {
                html.as_deref().unwrap_or_default()
            } else {
                text.as_str()
            };
            let collapsed = summary_source
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if collapsed.is_empty() {
                CLIPBOARD_CAPTURE_RICH_TEXT_SUMMARY.to_string()
            } else {
                collapsed.chars().take(80).collect()
            }
        }
        ClipboardCandidate::ImageFile { path } => Path::new(path)
            .file_name()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| path.clone()),
        ClipboardCandidate::ImageBytes { .. } => CLIPBOARD_CAPTURE_IMAGE_SUMMARY.to_string(),
    }
}

fn clipboard_image_file_candidate(path: &str) -> Option<ClipboardCandidate> {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;

    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
    ) {
        return None;
    }

    Some(ClipboardCandidate::ImageFile {
        path: path.to_string(),
    })
}

fn parse_clipboard_candidate_json(json: &str) -> Result<Option<ClipboardCandidate>, String> {
    let trimmed = json.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let candidate = serde_json::from_str::<ClipboardCandidateWire>(trimmed)
        .map_err(|error| format!("failed to parse clipboard candidate JSON: {error}"))?;

    Ok(match candidate {
        ClipboardCandidateWire::Text { text, html } => {
            clipboard_text_candidate(&text, html.as_deref())
        }
        ClipboardCandidateWire::TextHex { text_hex, html_hex } => {
            let text = decode_hex_utf8(&text_hex)?;
            let html = decode_optional_hex_utf8(html_hex.as_deref())?;
            clipboard_text_candidate(&text, html.as_deref())
        }
        ClipboardCandidateWire::ImageBytes { bytes } => {
            if bytes.is_empty() {
                None
            } else {
                Some(ClipboardCandidate::ImageBytes { bytes })
            }
        }
        ClipboardCandidateWire::ImageFile { path } => clipboard_image_file_candidate(&path),
    })
}

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    value.and_then(|candidate| {
        if candidate.trim().is_empty() {
            None
        } else {
            Some(candidate.to_string())
        }
    })
}

fn now_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn iso_timestamp_now() -> String {
    chrono_like_iso8601(now_timestamp_ms())
}

fn chrono_like_iso8601(timestamp_ms: u64) -> String {
    let seconds = (timestamp_ms / 1000) as i64;
    let milliseconds = (timestamp_ms % 1000) as u32;
    let datetime = time_from_unix_seconds(seconds);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        datetime.year,
        datetime.month,
        datetime.day,
        datetime.hour,
        datetime.minute,
        datetime.second,
        milliseconds
    )
}

#[derive(Debug, Clone, Copy)]
struct SimpleDateTime {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
}

fn time_from_unix_seconds(seconds: i64) -> SimpleDateTime {
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400) as u32;
    let (year, month, day) = civil_from_days(days);

    SimpleDateTime {
        year,
        month,
        day,
        hour: seconds_of_day / 3_600,
        minute: (seconds_of_day % 3_600) / 60,
        second: seconds_of_day % 60,
    }
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096).div_euclid(365);
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2).div_euclid(153);
    let d = doy - (153 * mp + 2).div_euclid(5) + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };

    (year as i32, m as u32, d as u32)
}

fn decode_hex_utf8(value: &str) -> Result<String, String> {
    let bytes = hex::decode(value).map_err(|error| format!("failed to decode clipboard text hex: {error}"))?;
    String::from_utf8(bytes).map_err(|error| format!("failed to decode clipboard text utf-8: {error}"))
}

fn decode_optional_hex_utf8(value: Option<&str>) -> Result<Option<String>, String> {
    match value {
        Some(candidate) if !candidate.trim().is_empty() => decode_hex_utf8(candidate).map(Some),
        _ => Ok(None),
    }
}

#[cfg(target_os = "windows")]
struct WindowsClipboardGuard;

#[cfg(target_os = "windows")]
impl Drop for WindowsClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

#[cfg(target_os = "windows")]
fn read_windows_native_clipboard_candidate() -> Result<Option<ClipboardCandidate>, String> {
    let clipboard = open_windows_clipboard()?;

    let image_file_candidate = read_windows_native_image_file_candidate()?;
    let text_candidate = if image_file_candidate.is_none() {
        read_windows_native_unicode_text()?
    } else {
        None
    };

    if let Some(candidate) = image_file_candidate {
        return Ok(Some(candidate));
    }

    if let Some(text) = text_candidate {
        return Ok(clipboard_text_candidate(&text, None));
    }

    drop(clipboard);

    if should_probe_windows_powershell_fallback(
        image_file_candidate.is_some(),
        text_candidate.is_some(),
    ) {
        let output = run_windows_powershell_script(WINDOWS_CLIPBOARD_READ_SCRIPT)?;
        return parse_clipboard_candidate_json(&output);
    }

    Ok(None)
}

fn should_probe_windows_powershell_fallback(
    has_native_image_file: bool,
    has_native_text: bool,
) -> bool {
    !has_native_image_file && !has_native_text
}

#[cfg(target_os = "windows")]
fn open_windows_clipboard() -> Result<WindowsClipboardGuard, String> {
    for _ in 0..5 {
        if unsafe { OpenClipboard(None) }.is_ok() {
            return Ok(WindowsClipboardGuard);
        }

        std::thread::sleep(Duration::from_millis(10));
    }

    Err("failed to open the Windows clipboard".to_string())
}

#[cfg(target_os = "windows")]
fn read_windows_native_image_file_candidate() -> Result<Option<ClipboardCandidate>, String> {
    if unsafe { IsClipboardFormatAvailable(WINDOWS_CF_HDROP) }.is_err() {
        return Ok(None);
    }

    let handle = unsafe { GetClipboardData(WINDOWS_CF_HDROP) }
        .map_err(|error| format!("failed to read Windows clipboard files: {error}"))?;
    let drop_handle = HDROP(handle.0.cast());
    let file_count = unsafe { DragQueryFileW(drop_handle, u32::MAX, None) };

    for file_index in 0..file_count {
        let wide_length = unsafe { DragQueryFileW(drop_handle, file_index, None) };
        if wide_length == 0 {
            continue;
        }

        let mut buffer = vec![0u16; wide_length as usize + 1];
        let copied = unsafe { DragQueryFileW(drop_handle, file_index, Some(buffer.as_mut_slice())) };
        if copied == 0 {
            continue;
        }

        let path = read_null_terminated_utf16(&buffer[..copied as usize]);
        if let Some(candidate) = clipboard_image_file_candidate(&path) {
            return Ok(Some(candidate));
        }
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn read_windows_native_unicode_text() -> Result<Option<String>, String> {
    if unsafe { IsClipboardFormatAvailable(WINDOWS_CF_UNICODETEXT) }.is_err() {
        return Ok(None);
    }

    let handle = unsafe { GetClipboardData(WINDOWS_CF_UNICODETEXT) }
        .map_err(|error| format!("failed to read Windows clipboard text: {error}"))?;
    let global = HGLOBAL(handle.0);
    let pointer = unsafe { GlobalLock(global) } as *const u16;
    if pointer.is_null() {
        return Err("failed to lock the Windows clipboard text buffer".to_string());
    }

    let unit_count = unsafe { GlobalSize(global) } / std::mem::size_of::<u16>();
    let slice = unsafe { std::slice::from_raw_parts(pointer, unit_count) };
    let text = read_null_terminated_utf16(slice);
    let _ = unsafe { GlobalUnlock(global) };

    Ok(if text.is_empty() { None } else { Some(text) })
}

fn read_null_terminated_utf16(units: &[u16]) -> String {
    let end = units.iter().position(|value| *value == 0).unwrap_or(units.len());
    String::from_utf16_lossy(&units[..end])
}

#[cfg(target_os = "windows")]
struct WindowsNotificationContext {
    app: AppHandle,
    emit_confirm_on_click: bool,
    clicked: AtomicBool,
}

#[cfg(target_os = "windows")]
fn spawn_windows_native_notification(
    app: AppHandle,
    title: String,
    body: String,
    emit_confirm_on_click: bool,
) -> Result<(), String> {
    std::thread::spawn(move || {
        let _ = show_windows_native_notification(app, title, body, emit_confirm_on_click);
    });

    Ok(())
}

#[cfg(target_os = "windows")]
fn show_windows_native_notification(
    app: AppHandle,
    title: String,
    body: String,
    emit_confirm_on_click: bool,
) -> Result<(), String> {
    let hwnd = create_windows_notification_window(app, emit_confirm_on_click)?;
    let mut notify_icon = build_windows_notify_icon(hwnd);

    if !unsafe { Shell_NotifyIconW(NIM_ADD, &notify_icon) }.as_bool() {
        cleanup_windows_notification(hwnd, &notify_icon);
        return Err("failed to register Windows notification icon".to_string());
    }

    notify_icon.Anonymous.uVersion = NOTIFYICON_VERSION_4;
    let _ = unsafe { Shell_NotifyIconW(NIM_SETVERSION, &notify_icon) };

    notify_icon.uFlags = NIF_INFO | NIF_REALTIME;
    notify_icon.dwInfoFlags = NIIF_INFO | NIIF_NOSOUND;
    copy_utf16_into_buffer(&title, &mut notify_icon.szInfoTitle);
    copy_utf16_into_buffer(&body, &mut notify_icon.szInfo);
    notify_icon.Anonymous.uTimeout = 5_000;

    if !unsafe { Shell_NotifyIconW(NIM_MODIFY, &notify_icon) }.as_bool() {
        cleanup_windows_notification(hwnd, &notify_icon);
        return Err("failed to show the Windows clipboard notification".to_string());
    }

    let timeout = if emit_confirm_on_click {
        WINDOWS_CONFIRM_NOTIFICATION_DURATION
    } else {
        WINDOWS_FAILURE_NOTIFICATION_DURATION
    };
    pump_windows_notification_messages(hwnd, timeout);
    cleanup_windows_notification(hwnd, &notify_icon);
    Ok(())
}

#[cfg(target_os = "windows")]
fn create_windows_notification_window(
    app: AppHandle,
    emit_confirm_on_click: bool,
) -> Result<HWND, String> {
    let module = unsafe { GetModuleHandleW(None) }
        .map_err(|error| format!("failed to resolve the notification window module: {error}"))?;
    let instance = HINSTANCE(module.0);
    let class_name = w!("ZhixiClipboardCaptureNotificationWindow");
    let window_class = WNDCLASSW {
        lpfnWndProc: Some(windows_notification_wndproc),
        hInstance: instance,
        lpszClassName: class_name,
        ..Default::default()
    };

    let _ = unsafe { RegisterClassW(&window_class) };

    let hwnd = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            PCWSTR::null(),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance),
            None,
        )
    }
    .map_err(|error| format!("failed to create the Windows notification window: {error}"))?;

    let context = Box::new(WindowsNotificationContext {
        app,
        emit_confirm_on_click,
        clicked: AtomicBool::new(false),
    });
    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(context) as isize);
    }

    Ok(hwnd)
}

#[cfg(target_os = "windows")]
fn build_windows_notify_icon(hwnd: HWND) -> NOTIFYICONDATAW {
    let mut notify_icon = NOTIFYICONDATAW::default();
    notify_icon.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    notify_icon.hWnd = hwnd;
    notify_icon.uID = WINDOWS_NOTIFICATION_ID;
    notify_icon.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    notify_icon.uCallbackMessage = WINDOWS_NOTIFICATION_CALLBACK_MESSAGE;
    notify_icon.hIcon = load_windows_notification_icon();
    copy_utf16_into_buffer(WINDOWS_NOTIFICATION_TIP, &mut notify_icon.szTip);
    notify_icon
}

#[cfg(target_os = "windows")]
fn load_windows_notification_icon() -> HICON {
    unsafe { LoadIconW(None, IDI_INFORMATION) }.unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn pump_windows_notification_messages(hwnd: HWND, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, None, 0, 0, PM_REMOVE) }.as_bool() {
            unsafe {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }

        if notification_clicked(hwnd) {
            break;
        }

        std::thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(target_os = "windows")]
fn notification_clicked(hwnd: HWND) -> bool {
    unsafe { notification_context(hwnd) }
        .map(|context| context.clicked.load(Ordering::Relaxed))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn cleanup_windows_notification(hwnd: HWND, notify_icon: &NOTIFYICONDATAW) {
    let _ = unsafe { Shell_NotifyIconW(NIM_DELETE, notify_icon) };
    let _ = unsafe { DestroyWindow(hwnd) };
}

#[cfg(target_os = "windows")]
unsafe fn notification_context(hwnd: HWND) -> Option<&'static WindowsNotificationContext> {
    let pointer = unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *const WindowsNotificationContext;
    if pointer.is_null() {
        None
    } else {
        Some(unsafe { &*pointer })
    }
}

#[cfg(target_os = "windows")]
unsafe fn take_notification_context(hwnd: HWND) -> Option<Box<WindowsNotificationContext>> {
    let pointer = unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *mut WindowsNotificationContext;
    if pointer.is_null() {
        return None;
    }

    unsafe {
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
        Some(Box::from_raw(pointer))
    }
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn windows_notification_wndproc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WINDOWS_NOTIFICATION_CALLBACK_MESSAGE
        && windows_notification_event_code(lparam) == NIN_BALLOONUSERCLICK
    {
        if let Some(context) = unsafe { notification_context(hwnd) } {
            if context.emit_confirm_on_click
                && !context.clicked.swap(true, Ordering::Relaxed)
            {
                let capture_state = context.app.state::<ClipboardCaptureState>();
                let _ = capture_state.confirm_pending_capture();
                let _ = context.app.emit(CLIPBOARD_CAPTURE_CONFIRM_EVENT, ());
            }
        }
        return LRESULT(0);
    }

    if message == WM_NCDESTROY {
        let _ = unsafe { take_notification_context(hwnd) };
    }

    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

fn copy_utf16_into_buffer<const N: usize>(value: &str, buffer: &mut [u16; N]) {
    buffer.fill(0);
    let max_units = buffer.len().saturating_sub(1);
    for (slot, code_unit) in buffer.iter_mut().take(max_units).zip(value.encode_utf16()) {
        *slot = code_unit;
    }
}

#[cfg(target_os = "windows")]
fn windows_notification_event_code(lparam: LPARAM) -> u32 {
    (lparam.0 as u32) & 0xFFFF
}

#[cfg(target_os = "windows")]
fn run_windows_powershell_script(script: &str) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new(WINDOWS_POWERSHELL_PATH)
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", script])
        .output()
        .map_err(|error| format!("failed to launch PowerShell clipboard reader: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!(
                "PowerShell clipboard reader exited with status {}",
                output.status
            )
        } else {
            format!("PowerShell clipboard reader failed: {stderr}")
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(target_os = "windows")]
const WINDOWS_CLIPBOARD_READ_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$clipboard = [System.Windows.Forms.Clipboard]

if ($clipboard::ContainsFileDropList()) {
  foreach ($path in $clipboard::GetFileDropList()) {
    $extension = [System.IO.Path]::GetExtension($path)
    if ($null -eq $extension) {
      continue
    }

    $normalizedExtension = $extension.TrimStart('.').ToLowerInvariant()
    if (@('png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg') -contains $normalizedExtension) {
      @{ kind = 'image_file'; path = $path } | ConvertTo-Json -Compress
      exit 0
    }
  }
}

$text = ''
if ($clipboard::ContainsText([System.Windows.Forms.TextDataFormat]::UnicodeText)) {
  $text = $clipboard::GetText([System.Windows.Forms.TextDataFormat]::UnicodeText)
} elseif ($clipboard::ContainsText()) {
  $text = $clipboard::GetText()
}

$html = $null
if ($clipboard::ContainsText([System.Windows.Forms.TextDataFormat]::Html)) {
  $html = $clipboard::GetText([System.Windows.Forms.TextDataFormat]::Html)
}

function Convert-StringToHex([string] $value) {
  if ($null -eq $value) {
    return $null
  }

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
  return [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

if (-not [string]::IsNullOrWhiteSpace($text) -or -not [string]::IsNullOrWhiteSpace($html)) {
  @{
    kind = 'text_hex'
    text_hex = Convert-StringToHex($text)
    html_hex = if ($null -eq $html) { $null } else { Convert-StringToHex($html) }
  } | ConvertTo-Json -Compress -Depth 3
  exit 0
}

if ($clipboard::ContainsImage()) {
  $image = $clipboard::GetImage()
  if ($null -ne $image) {
    $stream = New-Object System.IO.MemoryStream
    try {
      $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      @{ kind = 'image_bytes'; bytes = $stream.ToArray() } | ConvertTo-Json -Compress -Depth 3
      exit 0
    }
    finally {
      $stream.Dispose()
      $image.Dispose()
    }
  }
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confirms_and_consumes_pending_captures() {
        let state = ClipboardCaptureState::default();
        let candidate = ClipboardCandidate::Text {
            text: "pending".to_string(),
            html: None,
        };

        assert!(state.store_detected_candidate(candidate.clone(), "2026-07-09T00:00:00.000Z".to_string()));
        assert_eq!(state.take_confirmed_capture(), None);

        assert!(state.confirm_pending_capture());
        assert_eq!(
            state.take_confirmed_capture(),
            Some(ConfirmedClipboardCapture {
                candidate,
                captured_at: "2026-07-09T00:00:00.000Z".to_string(),
            })
        );
        assert_eq!(state.take_confirmed_capture(), None);
    }

    #[test]
    fn ignores_duplicate_signatures_until_the_clipboard_changes() {
        let state = ClipboardCaptureState::default();
        let candidate = ClipboardCandidate::Text {
            text: "same".to_string(),
            html: None,
        };

        assert!(state.store_detected_candidate(candidate.clone(), "2026-07-09T00:00:00.000Z".to_string()));
        assert!(!state.store_detected_candidate(candidate.clone(), "2026-07-09T00:00:01.000Z".to_string()));

        state.clear_last_seen_signature();

        assert!(state.store_detected_candidate(candidate, "2026-07-09T00:00:02.000Z".to_string()));
    }

    #[test]
    fn probes_the_powershell_fallback_when_no_native_file_or_text_match_exists() {
        assert!(should_probe_windows_powershell_fallback(false, false));
    }

    #[test]
    fn skips_the_powershell_fallback_when_native_text_or_files_already_matched() {
        assert!(!should_probe_windows_powershell_fallback(true, false));
        assert!(!should_probe_windows_powershell_fallback(false, true));
    }

    #[test]
    fn keeps_plain_text_and_optional_html_payloads() {
        let candidate = clipboard_text_candidate("plain text", Some("<p>plain text</p>"));

        assert_eq!(
            candidate,
            Some(ClipboardCandidate::Text {
                text: "plain text".to_string(),
                html: Some("<p>plain text</p>".to_string()),
            })
        );
    }

    #[test]
    fn keeps_html_only_clipboard_candidates() {
        let candidate = clipboard_text_candidate("", Some("<p>plain text</p>"));

        assert_eq!(
            candidate,
            Some(ClipboardCandidate::Text {
                text: String::new(),
                html: Some("<p>plain text</p>".to_string()),
            })
        );
    }

    #[test]
    fn ignores_unsupported_image_files() {
        assert_eq!(clipboard_image_file_candidate("C:/tmp/example.txt"), None);
        assert_eq!(
            clipboard_image_file_candidate("C:/tmp/example.png"),
            Some(ClipboardCandidate::ImageFile {
                path: "C:/tmp/example.png".to_string(),
            })
        );
    }

    #[test]
    fn parses_image_bytes_json_payloads() {
        let candidate =
            parse_clipboard_candidate_json(r#"{"kind":"image_bytes","bytes":[137,80,78,71]}"#)
                .expect("candidate should parse");

        assert_eq!(
            candidate,
            Some(ClipboardCandidate::ImageBytes {
                bytes: vec![137, 80, 78, 71],
            })
        );
    }

    #[test]
    fn ignores_empty_clipboard_payloads() {
        assert_eq!(parse_clipboard_candidate_json("   ").unwrap(), None);
        assert_eq!(
            parse_clipboard_candidate_json(r#"{"kind":"image_bytes","bytes":[]}"#).unwrap(),
            None
        );
    }

    #[test]
    fn decodes_hex_encoded_text_payloads() {
        let candidate = parse_clipboard_candidate_json(
            r#"{"kind":"text_hex","text_hex":"e4bda0e5a5bd","html_hex":"3c703ee4bda0e5a5bd3c2f703e"}"#,
        )
        .expect("candidate should parse");

        assert_eq!(
            candidate,
            Some(ClipboardCandidate::Text {
                text: "你好".to_string(),
                html: Some("<p>你好</p>".to_string()),
            })
        );
    }

    #[test]
    fn copies_unicode_into_wide_buffers() {
        let mut buffer = [0u16; 8];

        copy_utf16_into_buffer("知栖", &mut buffer);

        assert_eq!(String::from_utf16_lossy(&buffer[..2]), "知栖");
        assert_eq!(buffer[2], 0);
    }

    #[test]
    fn truncates_wide_buffers_without_losing_the_null_terminator() {
        let mut buffer = [0u16; 4];

        copy_utf16_into_buffer("剪贴板捕获", &mut buffer);

        assert_eq!(String::from_utf16_lossy(&buffer[..3]), "剪贴板");
        assert_eq!(buffer[3], 0);
    }

    #[test]
    fn reads_null_terminated_utf16_slices() {
        let units = ['知' as u16, '栖' as u16, 0, '错' as u16];

        assert_eq!(read_null_terminated_utf16(&units), "知栖");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn extracts_the_notification_event_code_from_the_low_word() {
        let packed_lparam =
            LPARAM(((WINDOWS_NOTIFICATION_ID << 16) | NIN_BALLOONUSERCLICK) as isize);

        assert_eq!(
            windows_notification_event_code(packed_lparam),
            NIN_BALLOONUSERCLICK
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn prefers_unicode_text_format_in_the_windows_clipboard_reader() {
        assert!(WINDOWS_CLIPBOARD_READ_SCRIPT.contains("TextDataFormat]::UnicodeText"));
    }
}
