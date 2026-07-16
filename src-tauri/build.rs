fn main() {
    println!("cargo:rerun-if-env-changed=ZHIQI_API_BASE_URL");
    println!("cargo:rerun-if-env-changed=ZHIQI_ALLOW_INSECURE_HTTP");
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
    let allow_insecure_http = std::env::var("ZHIQI_ALLOW_INSECURE_HTTP")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let api_base_url = std::env::var("ZHIQI_API_BASE_URL").unwrap_or_else(|_| {
        if profile == "release" {
            panic!("ZHIQI_API_BASE_URL is required for release builds");
        }
        "http://117.72.91.46".to_string()
    });
    if profile == "release"
        && !api_base_url.starts_with("https://")
        && !(allow_insecure_http && api_base_url.starts_with("http://"))
    {
        panic!("ZHIQI_API_BASE_URL must use HTTPS for release builds; set ZHIQI_ALLOW_INSECURE_HTTP=1 only for HTTP development builds");
    }
    println!("cargo:rustc-env=ZHIQI_API_BASE_URL={api_base_url}");
    tauri_build::build()
}
