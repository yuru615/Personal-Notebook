fn main() {
    println!("cargo:rerun-if-env-changed=ZHIQI_API_BASE_URL");
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
    println!("cargo:rustc-env=ZHIQI_API_BASE_URL={api_base_url}");
    tauri_build::build()
}
