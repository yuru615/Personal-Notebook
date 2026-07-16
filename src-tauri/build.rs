fn main() {
    println!("cargo:rerun-if-env-changed=ZHIQI_API_BASE_URL");
    println!("cargo:rerun-if-env-changed=TAURI_UPDATER_PUBLIC_KEY");
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
    let api_base_url = std::env::var("ZHIQI_API_BASE_URL").unwrap_or_else(|_| {
        if profile == "release" {
            panic!("ZHIQI_API_BASE_URL is required for release builds");
        }
        "http://117.72.91.46".to_string()
    });
    if profile == "release" && !api_base_url.starts_with("https://") {
        panic!("ZHIQI_API_BASE_URL must use HTTPS for release builds");
    }
    let updater_public_key = std::env::var("TAURI_UPDATER_PUBLIC_KEY").unwrap_or_default();
    if profile == "release" && updater_public_key.trim().is_empty() {
        panic!("TAURI_UPDATER_PUBLIC_KEY is required for release builds");
    }
    println!("cargo:rustc-env=ZHIQI_API_BASE_URL={api_base_url}");
    println!("cargo:rustc-env=TAURI_UPDATER_PUBLIC_KEY={updater_public_key}");
    tauri_build::build()
}
