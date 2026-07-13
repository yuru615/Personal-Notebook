use std::net::SocketAddr;

use crate::storage::{StorageError, StorageResult};

pub fn authorize(
    peer: Option<SocketAddr>,
    authorization: Option<&str>,
    token: &str,
) -> StorageResult<()> {
    let expected = format!("Bearer {token}");

    if peer.is_some_and(|address| address.ip().is_loopback())
        && authorization == Some(expected.as_str())
    {
        return Ok(());
    }

    Err(StorageError::new(
        "unauthorized",
        "local MCP authorization failed",
    ))
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::authorize;

    #[test]
    fn accepts_only_loopback_requests_with_the_exact_bearer_token() {
        let loopback: SocketAddr = "127.0.0.1:38472".parse().expect("loopback address");
        let lan: SocketAddr = "192.168.1.20:38472".parse().expect("lan address");

        assert!(authorize(Some(loopback), Some("Bearer token"), "token").is_ok());
        assert!(authorize(Some(lan), Some("Bearer token"), "token").is_err());
        assert!(authorize(Some(loopback), Some("Bearer wrong"), "token").is_err());
    }
}
