use hyper::client::HttpConnector;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Client, Method, Request, Response, Server};
use hyper_tls::HttpsConnector;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

use crate::kv::get_db_conn;
use crate::util::lock_poison_recover;

const MAX_PROXY_BODY_BYTES: usize = 52_428_800; // 50 MB
const MAX_STORED_BODY_BYTES: usize = 524_288; // 512 KB preview

fn truncate_body_for_storage(body: &str) -> String {
    if body.len() > MAX_STORED_BODY_BYTES {
        let mut truncated = body.chars().take(MAX_STORED_BODY_BYTES).collect::<String>();
        truncated.push_str("\n\n... [Truncated: Payload preview capped at 512KB for performance]");
        truncated
    } else {
        body.to_string()
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct CapturedRequest {
    pub id: u64,
    pub method: String,
    pub url: String,
    pub request_headers: Vec<(String, String)>,
    pub request_body: String,
    pub response_status: u16,
    pub response_headers: Vec<(String, String)>,
    pub response_body: String,
    pub timestamp: u64,
    pub duration_ms: u64,
}

pub struct ProxyState {
    pub is_running: Arc<AtomicBool>,
    pub counter: Arc<Mutex<u64>>,
    pub allowed_hosts: Arc<Mutex<Vec<String>>>,
    pub db: Arc<Mutex<Option<Connection>>>,
}

impl ProxyState {
    pub fn new() -> Self {
        ProxyState {
            is_running: Arc::new(AtomicBool::new(false)),
            counter: Arc::new(Mutex::new(0)),
            allowed_hosts: Arc::new(Mutex::new(Vec::new())),
            db: Arc::new(Mutex::new(None)),
        }
    }
}

fn is_ipv4_blocked(v4: std::net::Ipv4Addr) -> bool {
    let octets = v4.octets();
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_documentation()
        || octets[0] == 0
        || (octets[0] == 100 && (octets[1] & 0xc0) == 64) // 100.64.0.0/10 CGNAT
        || (octets[0] == 198 && (octets[1] & 0xfe) == 18) // 198.18.0.0/15 Benchmarking
}

fn is_ipv6_blocked(v6: std::net::Ipv6Addr) -> bool {
    let segments = v6.segments();
    if v6.is_loopback() || v6.is_multicast() || v6.is_unspecified() {
        return true;
    }
    // Link-local fe80::/10
    if (segments[0] & 0xffc0) == 0xfe80 {
        return true;
    }
    // Unique local address (ULA) fc00::/7
    if (segments[0] & 0xfe00) == 0xfc00 {
        return true;
    }
    // IPv4-mapped IPv6 ::ffff:0:0/96
    if let Some(v4) = v6.to_ipv4_mapped() {
        return is_ipv4_blocked(v4);
    }
    // IPv4-compatible IPv6 ::x.x.x.x
    if segments[0] == 0 && segments[1] == 0 && segments[2] == 0 && segments[3] == 0 && segments[4] == 0 && segments[5] == 0 {
        let v4 = std::net::Ipv4Addr::new(
            (segments[6] >> 8) as u8,
            (segments[6] & 0xff) as u8,
            (segments[7] >> 8) as u8,
            (segments[7] & 0xff) as u8,
        );
        return is_ipv4_blocked(v4);
    }
    false
}

pub fn is_ssrf_blocked(host: &str, allowed_hosts: &[String]) -> bool {
    let trimmed = host.trim().to_lowercase();
    let clean_host = if trimmed.starts_with('[') {
        trimmed.split(']').next().unwrap_or(&trimmed).trim_start_matches('[').to_string()
    } else if trimmed.contains(':') && trimmed.matches(':').count() == 1 {
        trimmed.split(':').next().unwrap_or(&trimmed).to_string()
    } else {
        trimmed
    };

    if allowed_hosts.iter().any(|h| {
        let clean_allowed = if h.starts_with('[') {
            h.split(']').next().unwrap_or(h).trim_start_matches('[').to_lowercase()
        } else if h.contains(':') && h.matches(':').count() == 1 {
            h.split(':').next().unwrap_or(h).to_lowercase()
        } else {
            h.trim().to_lowercase()
        };
        clean_allowed == clean_host
    }) {
        return false;
    }

    if clean_host == "localhost"
        || clean_host.ends_with(".localhost")
        || clean_host == "127.0.0.1"
        || clean_host == "::1"
        || clean_host == "0.0.0.0"
        || clean_host == "::"
        || clean_host == "instance-data"
        || clean_host == "metadata.google.internal"
        || clean_host == "metadata.internal"
        || clean_host == "169.254.169.254"
    {
        return true;
    }

    if let Ok(ip) = clean_host.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => is_ipv4_blocked(v4),
            std::net::IpAddr::V6(v6) => is_ipv6_blocked(v6),
        }
    } else {
        false
    }
}

#[tauri::command]
pub fn set_proxy_whitelist(hosts: Vec<String>, state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    let mut lock = state.allowed_hosts.lock().map_err(|_| "Lock poisoned".to_string())?;
    *lock = hosts;
    Ok(())
}

#[tauri::command]
pub fn get_proxy_whitelist(state: tauri::State<'_, ProxyState>) -> Vec<String> {
    state.allowed_hosts.lock().map(|l| l.clone()).unwrap_or_default()
}

fn save_request(app_handle: &tauri::AppHandle, db_holder: &Arc<Mutex<Option<Connection>>>, req: &CapturedRequest) {
    let mut guard = lock_poison_recover(db_holder);

    if guard.is_none() {
        if let Ok(conn) = get_db_conn(app_handle) {
            *guard = Some(conn);
        }
    }

    if let Some(conn) = guard.as_mut() {
        let req_headers = serde_json::to_string(&req.request_headers).unwrap_or_default();
        let res_headers = serde_json::to_string(&req.response_headers).unwrap_or_default();

        let _ = conn.execute(
            "INSERT INTO proxy_logs (method, url, request_headers, request_body, response_status, response_headers, response_body, timestamp, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                req.method,
                req.url,
                req_headers,
                req.request_body,
                req.response_status,
                res_headers,
                req.response_body,
                req.timestamp,
                req.duration_ms,
            ],
        );

        // Cap proxy_logs to the 500 most recent records to prevent unbounded database growth
        let _ = conn.execute(
            "DELETE FROM proxy_logs WHERE id NOT IN (
                SELECT id FROM proxy_logs ORDER BY id DESC LIMIT 500
            )",
            [],
        );
    }
}

async fn handle_request(
    req: Request<Body>,
    app_handle: tauri::AppHandle,
    counter: Arc<Mutex<u64>>,
    allowed_hosts: Arc<Mutex<Vec<String>>>,
    db_holder: Arc<Mutex<Option<Connection>>>,
    client: Client<HttpsConnector<HttpConnector>>,
) -> Result<Response<Body>, Infallible> {
    let start_time = SystemTime::now();
    let timestamp = start_time.duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;

    let id = {
        let mut c = lock_poison_recover(&counter);
        *c += 1;
        *c
    };

    let method = req.method().to_string();
    let url = req.uri().to_string();

    let host = req.uri().host().unwrap_or("").to_string();
    let whitelist = lock_poison_recover(&allowed_hosts).clone();

    if is_ssrf_blocked(&host, &whitelist) {
        let blocked_msg = format!("SSRF Blocked: Destination '{}' is a private or local address. Add to proxy whitelist in settings if intended.", host);
        return Ok(Response::builder()
            .status(403)
            .body(Body::from(blocked_msg))
            .unwrap());
    }

    let mut request_headers = Vec::new();
    for (k, v) in req.headers() {
        if let Ok(val) = v.to_str() {
            request_headers.push((k.to_string(), val.to_string()));
        }
    }

    let (parts, body) = req.into_parts();
    let body_bytes = match hyper::body::to_bytes(body).await {
        Ok(b) => {
            if b.len() > MAX_PROXY_BODY_BYTES {
                return Ok(Response::builder()
                    .status(413)
                    .body(Body::from("Payload Too Large: Max body size is 50MB"))
                    .unwrap());
            }
            b
        }
        Err(e) => {
            return Ok(Response::builder()
                .status(400)
                .body(Body::from(format!("Failed to read request body: {}", e)))
                .unwrap());
        }
    };
    let request_body = String::from_utf8_lossy(&body_bytes).to_string();

    let mut proxy_req = Request::builder()
        .method(parts.method)
        .uri(parts.uri)
        .version(parts.version);

    for (k, v) in parts.headers.iter() {
        proxy_req = proxy_req.header(k.clone(), v.clone());
    }

    let proxy_req = match proxy_req.body(Body::from(body_bytes.clone())) {
        Ok(r) => r,
        Err(e) => {
            return Ok(Response::builder()
                .status(500)
                .body(Body::from(format!("Failed to construct proxy request: {}", e)))
                .unwrap());
        }
    };

    let (response_status, response_headers, response_body_str, res_body_to_return) =
        match client.request(proxy_req).await {
            Ok(res) => {
                let status = res.status().as_u16();
                let mut res_headers = Vec::new();
                for (k, v) in res.headers() {
                    if let Ok(val) = v.to_str() {
                        res_headers.push((k.to_string(), val.to_string()));
                    }
                }

                let (res_parts, res_body) = res.into_parts();
                let res_bytes = hyper::body::to_bytes(res_body).await.unwrap_or_default();
                let body_str = String::from_utf8_lossy(&res_bytes).to_string();

                let mut new_res = Response::builder()
                    .status(res_parts.status)
                    .version(res_parts.version);
                for (k, v) in res_parts.headers.iter() {
                    new_res = new_res.header(k.clone(), v.clone());
                }
                let returned_res = new_res
                    .body(Body::from(res_bytes))
                    .unwrap_or_else(|_| Response::new(Body::empty()));

                (status, res_headers, body_str, returned_res)
            }
            Err(e) => (
                502,
                vec![],
                e.to_string(),
                Response::builder()
                    .status(502)
                    .body(Body::from(e.to_string()))
                    .unwrap(),
            ),
        };

    let duration_ms = start_time.elapsed().unwrap_or_default().as_millis() as u64;

    let captured_req = CapturedRequest {
        id,
        method,
        url,
        request_headers,
        request_body: truncate_body_for_storage(&request_body),
        response_status,
        response_headers,
        response_body: truncate_body_for_storage(&response_body_str),
        timestamp,
        duration_ms,
    };

    save_request(&app_handle, &db_holder, &captured_req);
    let _ = app_handle.emit("proxy-request", captured_req);

    Ok(res_body_to_return)
}

#[tauri::command]
pub async fn start_proxy(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ProxyState>,
    port: u16,
) -> Result<(), String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err("Proxy is already running".to_string());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let is_running = state.is_running.clone();
    let counter = state.counter.clone();
    let allowed_hosts = state.allowed_hosts.clone();
    let db = state.db.clone();

    tokio::spawn(async move {
        let https = HttpsConnector::new();
        let client = Client::builder().build::<_, hyper::Body>(https);

        let app_handle_svc = app_handle.clone();
        let make_svc = make_service_fn(move |_conn| {
            let app_handle = app_handle_svc.clone();
            let counter = counter.clone();
            let allowed_hosts = allowed_hosts.clone();
            let db = db.clone();
            let client = client.clone();

            async move {
                Ok::<_, Infallible>(service_fn(move |req| {
                    handle_request(
                        req,
                        app_handle.clone(),
                        counter.clone(),
                        allowed_hosts.clone(),
                        db.clone(),
                        client.clone(),
                    )
                }))
            }
        });

        let addr = ([127, 0, 0, 1], port).into();
        let server = match Server::try_bind(&addr) {
            Ok(s) => s.serve(make_svc),
            Err(e) => {
                let _ = app_handle.emit("proxy-error", e.to_string());
                is_running.store(false, Ordering::SeqCst);
                return;
            }
        };

        let graceful = server.with_graceful_shutdown(async {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                if !is_running.load(Ordering::SeqCst) {
                    break;
                }
            }
        });

        if let Err(e) = graceful.await {
            let _ = app_handle.emit("proxy-error", e.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_proxy(state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    state.is_running.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn is_proxy_running(state: tauri::State<'_, ProxyState>) -> bool {
    state.is_running.load(Ordering::SeqCst)
}

pub fn get_request_by_id(app_handle: &tauri::AppHandle, id: u64) -> Option<CapturedRequest> {
    if let Ok(conn) = get_db_conn(app_handle) {
        let mut stmt = conn
            .prepare("SELECT id, method, url, request_headers, request_body, response_status, response_headers, response_body, timestamp, duration_ms FROM proxy_logs WHERE id = ?1")
            .ok()?;
        let result = stmt.query_row(rusqlite::params![id], |row| {
            let req_headers_str: String = row.get(3)?;
            let res_headers_str: String = row.get(6)?;
            Ok(CapturedRequest {
                id: row.get(0)?,
                method: row.get(1)?,
                url: row.get(2)?,
                request_headers: serde_json::from_str(&req_headers_str).unwrap_or_default(),
                request_body: row.get(4)?,
                response_status: row.get(5)?,
                response_headers: serde_json::from_str(&res_headers_str).unwrap_or_default(),
                response_body: row.get(7)?,
                timestamp: row.get(8)?,
                duration_ms: row.get(9)?,
            })
        });
        return result.ok();
    }
    None
}

fn with_proxy_db<F, R>(app_handle: &tauri::AppHandle, state: &ProxyState, f: F) -> Option<R>
where
    F: FnOnce(&mut Connection) -> Option<R>,
{
    let mut guard = lock_poison_recover(&state.db);
    if guard.is_none() {
        if let Ok(conn) = get_db_conn(app_handle) {
            *guard = Some(conn);
        }
    }
    guard.as_mut().and_then(f)
}

#[tauri::command]
pub fn get_captured_requests(app_handle: tauri::AppHandle, state: tauri::State<'_, ProxyState>) -> Vec<CapturedRequest> {
    with_proxy_db(&app_handle, &state, |conn| {
        let mut stmt = conn.prepare("SELECT id, method, url, request_headers, request_body, response_status, response_headers, response_body, timestamp, duration_ms FROM proxy_logs ORDER BY timestamp DESC LIMIT 100").ok()?;
        let iter = stmt.query_map([], |row| {
            let req_headers_str: String = row.get(3)?;
            let res_headers_str: String = row.get(6)?;
            let req_headers = serde_json::from_str(&req_headers_str).unwrap_or_default();
            let res_headers = serde_json::from_str(&res_headers_str).unwrap_or_default();

            Ok(CapturedRequest {
                id: row.get(0)?,
                method: row.get(1)?,
                url: row.get(2)?,
                request_headers: req_headers,
                request_body: row.get(4)?,
                response_status: row.get(5)?,
                response_headers: res_headers,
                response_body: row.get(7)?,
                timestamp: row.get(8)?,
                duration_ms: row.get(9)?,
            })
        }).ok()?;
        Some(iter.filter_map(|r| r.ok()).collect())
    }).unwrap_or_default()
}

#[tauri::command]
pub fn clear_captured_requests(app_handle: tauri::AppHandle, state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    with_proxy_db(&app_handle, &state, |conn| {
        let _ = conn.execute("DELETE FROM proxy_logs", []);
        Some(())
    });
    Ok(())
}

#[tauri::command]
pub async fn replay_request(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    state: tauri::State<'_, ProxyState>,
) -> Result<CapturedRequest, String> {
    let parsed_url: hyper::Uri = url.parse().map_err(|e: hyper::http::uri::InvalidUri| e.to_string())?;
    let host = parsed_url.host().unwrap_or("").to_string();
    let whitelist = lock_poison_recover(&state.allowed_hosts).clone();

    if is_ssrf_blocked(&host, &whitelist) {
        return Err(format!("SSRF Blocked: '{}' is a private or local address. Add to proxy whitelist in settings if intended.", host));
    }

    let start_time = SystemTime::now();
    let timestamp = start_time.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;

    let https = HttpsConnector::new();
    let client = Client::builder().build::<_, hyper::Body>(https);

    let req_method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;

    let mut req_builder = Request::builder().method(req_method).uri(&url);

    for (k, v) in &headers {
        req_builder = req_builder.header(k.clone(), v.clone());
    }

    let req_body = body.unwrap_or_default();
    let req = req_builder
        .body(Body::from(req_body.clone()))
        .map_err(|e| e.to_string())?;

    let (response_status, response_headers, response_body_str) = match client.request(req).await {
        Ok(res) => {
            let status = res.status().as_u16();
            let mut res_headers = Vec::new();
            for (k, v) in res.headers() {
                if let Ok(val) = v.to_str() {
                    res_headers.push((k.to_string(), val.to_string()));
                }
            }

            let res_bytes = hyper::body::to_bytes(res.into_body())
                .await
                .unwrap_or_default();
            let body_str = String::from_utf8_lossy(&res_bytes).to_string();

            (status, res_headers, body_str)
        }
        Err(e) => (502, vec![], e.to_string()),
    };

    let duration_ms = start_time.elapsed().unwrap_or_default().as_millis() as u64;

    Ok(CapturedRequest {
        id: 0,
        method,
        url,
        request_headers: headers,
        request_body: req_body,
        response_status,
        response_headers,
        response_body: response_body_str,
        timestamp,
        duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_ssrf_blocked_localhost_and_loopback() {
        let allowed = vec![];
        assert!(is_ssrf_blocked("localhost", &allowed));
        assert!(is_ssrf_blocked("127.0.0.1", &allowed));
        assert!(is_ssrf_blocked("127.0.0.1:8080", &allowed));
        assert!(is_ssrf_blocked("::1", &allowed));
        assert!(is_ssrf_blocked("sub.localhost", &allowed));
    }

    #[test]
    fn test_is_ssrf_blocked_private_ips() {
        let allowed = vec![];
        assert!(is_ssrf_blocked("192.168.1.1", &allowed));
        assert!(is_ssrf_blocked("10.0.0.1", &allowed));
        assert!(is_ssrf_blocked("172.16.0.1", &allowed));
        assert!(is_ssrf_blocked("169.254.169.254", &allowed)); // AWS metadata
    }

    #[test]
    fn test_is_ssrf_blocked_allowed_whitelist() {
        let allowed = vec!["127.0.0.1".to_string(), "api.internal".to_string()];
        assert!(!is_ssrf_blocked("127.0.0.1", &allowed));
        assert!(!is_ssrf_blocked("127.0.0.1:3000", &allowed));
        assert!(!is_ssrf_blocked("api.internal", &allowed));
    }

    #[test]
    fn test_is_ssrf_allowed_public_domains() {
        let allowed = vec![];
        assert!(!is_ssrf_blocked("api.github.com", &allowed));
        assert!(!is_ssrf_blocked("crates.io:443", &allowed));
    }
}
