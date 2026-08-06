use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Serialize, Deserialize};
use tauri::Emitter;
use hyper::{Body, Client, Request, Response, Server, Uri, Method};
use hyper::service::{make_service_fn, service_fn};
use hyper::client::HttpConnector;
use hyper_tls::HttpsConnector;
use futures::TryStreamExt;
use std::convert::Infallible;

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
    pub captured: Arc<Mutex<Vec<CapturedRequest>>>,
    pub counter: Arc<Mutex<u64>>,
}

impl ProxyState {
    pub fn new() -> Self {
        ProxyState {
            is_running: Arc::new(AtomicBool::new(false)),
            captured: Arc::new(Mutex::new(Vec::new())),
            counter: Arc::new(Mutex::new(0)),
        }
    }
}

async fn handle_request(
    req: Request<Body>,
    app_handle: tauri::AppHandle,
    captured: Arc<Mutex<Vec<CapturedRequest>>>,
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

    if let Ok(mut caps) = captured.lock() {
        caps.insert(0, captured_req.clone());
        if caps.len() > 100 {
            caps.truncate(100);
        }
    }

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
    let captured = state.captured.clone();
    let counter = state.counter.clone();

    tokio::spawn(async move {
        let https = HttpsConnector::new();
        let client = Client::builder().build::<_, hyper::Body>(https);
        
        let make_svc = make_service_fn(move |_conn| {
            let app_handle = app_handle.clone();
            let captured = captured.clone();
            let counter = counter.clone();
            let client = client.clone();
            
            async move {
                Ok::<_, Infallible>(service_fn(move |req| {
                    handle_request(req, app_handle.clone(), captured.clone(), counter.clone(), client.clone())
                }))
            }
        });

        let addr = ([127, 0, 0, 1], port).into();
        let server = match Server::try_bind(&addr) {
            Ok(s) => s,
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
pub fn get_captured_requests(state: tauri::State<'_, ProxyState>) -> Vec<CapturedRequest> {
    state.captured.lock().unwrap().clone()
}

#[tauri::command]
pub fn clear_captured_requests(state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    state.captured.lock().unwrap().clear();
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
