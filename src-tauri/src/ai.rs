use serde::{Deserialize, Serialize};
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize)]
pub struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaResponse {
    model: String,
    response: String,
    done: bool,
}

#[tauri::command]
pub async fn query_ollama(
    model: String,
    prompt: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let client = Client::new();
    let req_body = OllamaRequest {
        model: model.clone(),
        prompt,
        stream: true,
    };
    
    let res = client.post("http://localhost:11434/api/generate")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama (is it running?): {}", e))?;
        
    let mut stream = res.bytes_stream();
    
    while let Some(chunk) = stream.next().await {
        if let Ok(bytes) = chunk {
            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                // Ollama can send multiple JSON objects in one chunk separated by newlines
                for line in text.lines() {
                    if line.is_empty() { continue; }
                    if let Ok(parsed) = serde_json::from_str::<OllamaResponse>(line) {
                        let _ = app_handle.emit("ai-token", parsed.response);
                    }
                }
            }
        }
    }
    
    Ok(())
}
