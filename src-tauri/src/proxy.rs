use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};
use tauri::{Emitter, Manager};
use hyper::{Body, Client, Request, Response, Server, Method};
use hyper::service::{make_service_fn, service_fn};
use hyper::client::HttpConnector;
use hyper_tls::HttpsConnector;
use std::convert::Infallible;
use rusqlite::Connection;
use std::path::PathBuf;

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
}

impl ProxyState {
    pub fn new() -> Self {
        ProxyState {
            is_running: Arc::new(AtomicBool::new(false)),
            counter: Arc::new(Mutex::new(0)),
        }
    }
}

pub fn get_db_conn(app_handle: &tauri::AppHandle) -> rusqlite::Result<Connection> {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    std::fs::create_dir_all(&path).unwrap_or_default();
    path.push("codexos.db");
    let conn = Connection::open(path)?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS proxy_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            request_headers TEXT NOT NULL,
            request_body TEXT NOT NULL,
            response_status INTEGER NOT NULL,
            response_headers TEXT NOT NULL,
            response_body TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL
        )",
        [],
    )?;
    
    // Also create table for settings and workflows while we are here
    conn.execute(
        "CREATE TABLE IF NOT EXISTS store_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;
    
    Ok(conn)
}

fn save_request(app_handle: &tauri::AppHandle, req: &CapturedRequest) {
    if let Ok(conn) = get_db_conn(app_handle) {
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
    }
}

async fn handle_request(
    req: Request<Body>,
    app_handle: tauri::AppHandle,
    counter: Arc<Mutex<u64>>,
    client: Client<HttpsConnector<HttpConnector>>,
) -> Result<Response<Body>, Infallible> {
    let start_time = SystemTime::now();
    let timestamp = start_time.duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;

    let mut id = 0;
    if let Ok(mut c) = counter.lock() {
        *c += 1;
        id = *c;
    }

    let method = req.method().to_string();
    let url = req.uri().to_string();
    
    let mut request_headers = Vec::new();
    for (k, v) in req.headers() {
        if let Ok(val) = v.to_str() {
            request_headers.push((k.to_string(), val.to_string()));
        }
    }

    let (parts, body) = req.into_parts();
    let body_bytes = hyper::body::to_bytes(body).await.unwrap_or_default();
    let request_body = String::from_utf8_lossy(&body_bytes).to_string();

    let mut proxy_req = Request::builder()
        .method(parts.method)
        .uri(parts.uri)
        .version(parts.version);
    
    for (k, v) in parts.headers.iter() {
        proxy_req = proxy_req.header(k.clone(), v.clone());
    }
    
    let proxy_req = proxy_req.body(Body::from(body_bytes.clone())).unwrap();

    let (response_status, response_headers, response_body_str, res_body_to_return) = match client.request(proxy_req).await {
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
            let returned_res = new_res.body(Body::from(res_bytes)).unwrap_or_else(|_| Response::new(Body::empty()));
            
            (status, res_headers, body_str, returned_res)
        }
        Err(e) => {
            (502, vec![], e.to_string(), Response::builder().status(502).body(Body::from(e.to_string())).unwrap())
        }
    };

    let duration_ms = start_time.elapsed().unwrap_or_default().as_millis() as u64;

    let captured_req = CapturedRequest {
        id,
        method,
        url,
        request_headers,
        request_body,
        response_status,
        response_headers,
        response_body: response_body_str,
        timestamp,
        duration_ms,
    };

    save_request(&app_handle, &captured_req);
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

    tokio::spawn(async move {
        let https = HttpsConnector::new();
        let client = Client::builder().build::<_, hyper::Body>(https);
        
        let app_handle_svc = app_handle.clone();
        let make_svc = make_service_fn(move |_conn| {
            let app_handle = app_handle_svc.clone();
            let counter = counter.clone();
            let client = client.clone();
            
            async move {
                Ok::<_, Infallible>(service_fn(move |req| {
                    handle_request(req, app_handle.clone(), counter.clone(), client.clone())
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

#[tauri::command]
pub fn get_captured_requests(app_handle: tauri::AppHandle) -> Vec<CapturedRequest> {
    if let Ok(conn) = get_db_conn(&app_handle) {
        let mut stmt = conn.prepare("SELECT id, method, url, request_headers, request_body, response_status, response_headers, response_body, timestamp, duration_ms FROM proxy_logs ORDER BY timestamp DESC LIMIT 100").unwrap();
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
        }).unwrap();
        
        return iter.filter_map(|r| r.ok()).collect();
    }
    vec![]
}

#[tauri::command]
pub fn clear_captured_requests(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Ok(conn) = get_db_conn(&app_handle) {
        let _ = conn.execute("DELETE FROM proxy_logs", []);
    }
    Ok(())
}

#[tauri::command]
pub async fn replay_request(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<CapturedRequest, String> {
    let start_time = SystemTime::now();
    let timestamp = start_time.duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;

    let https = HttpsConnector::new();
    let client = Client::builder().build::<_, hyper::Body>(https);
    
    let req_method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    
    let mut req_builder = Request::builder()
        .method(req_method)
        .uri(&url);
        
    for (k, v) in &headers {
        req_builder = req_builder.header(k.clone(), v.clone());
    }
    
    let req_body = body.unwrap_or_default();
    let req = req_builder.body(Body::from(req_body.clone())).map_err(|e| e.to_string())?;

    let (response_status, response_headers, response_body_str) = match client.request(req).await {
        Ok(res) => {
            let status = res.status().as_u16();
            let mut res_headers = Vec::new();
            for (k, v) in res.headers() {
                if let Ok(val) = v.to_str() {
                    res_headers.push((k.to_string(), val.to_string()));
                }
            }
            
            let res_bytes = hyper::body::to_bytes(res.into_body()).await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&res_bytes).to_string();
            
            (status, res_headers, body_str)
        }
        Err(e) => {
            (502, vec![], e.to_string())
        }
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

// Key-Value Store commands for Settings and Workflows
#[tauri::command]
pub fn kv_set(app_handle: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if let Ok(conn) = get_db_conn(&app_handle) {
        conn.execute(
            "INSERT OR REPLACE INTO store_kv (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kv_get(app_handle: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    if let Ok(conn) = get_db_conn(&app_handle) {
        let mut stmt = conn.prepare("SELECT value FROM store_kv WHERE key = ?1").unwrap();
        let mut iter = stmt.query_map(rusqlite::params![key], |row| {
            row.get::<_, String>(0)
        }).unwrap();
        
        if let Some(Ok(val)) = iter.next() {
            return Ok(Some(val));
        }
    }
    Ok(None)
}
