# 🔄 Phase 2 — Real Data: Replace All Mocks
## Agent Prompts (7 Agents, All Parallel)

> **Pre-condition:** Phase 1 must be FULLY complete and merged.
> **Goal:** Every UI element shows real data. Remove all hardcoded values, setTimeout simulations, and stub functions.
> **All agents use workspace mode: `branch`** (isolated workspace per agent).

---

## P2-A1 — Tunnel Engineer
**Model:** `pro` | **Priority:** Critical | **Task:** Real Port Tunneling

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The current "Port Tunnel" feature generates FAKE URLs and does NO actual tunneling.
Your job: implement real localhost port tunneling using SSH reverse tunnels.

## Current State (What to Replace)
File: src-tauri/src/tunnel.rs
The start_tunnel command returns a fake URL like "https://vault-tun-1000.vaultly.net".
No actual network connection is made.

## Target: Real SSH Reverse Tunnel

### Strategy
Use OpenSSH (which ships with Windows 10+) to create reverse tunnels via a relay server.
The command is: ssh -R 0:localhost:{local_port} nokey@serveo.net
serveo.net is a free, open-source SSH relay service that provides public URLs.
(Fallback: also support localhost.run as alternative)

### Implementation Plan

#### 1. Update Cargo.toml (src-tauri/Cargo.toml)
No new crates needed — we use std::process::Command to spawn ssh.

#### 2. Rewrite tunnel.rs completely

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

pub struct TunnelProcess {
    pub child: Child,
    pub public_url: String,
    pub local_port: u16,
}

pub struct TunnelState {
    pub tunnels: Arc<Mutex<HashMap<u16, TunnelProcess>>>,
}

impl TunnelState {
    pub fn new() -> Self {
        TunnelState {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub local_port: u16,
    pub public_url: String,
    pub status: String,
}

#[tauri::command]
pub fn start_tunnel(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, TunnelState>,
    local_port: u16,
) -> Result<TunnelInfo, String> {
    let mut tunnels = state.tunnels.lock().unwrap();
    if tunnels.contains_key(&local_port) {
        return Err(format!("Port {} is already tunneled.", local_port));
    }

    // Use serveo.net for free SSH tunneling
    // ssh -R 80:localhost:{port} nokey@serveo.net
    let mut child = Command::new("ssh")
        .args([
            "-o", "StrictHostKeyChecking=no",
            "-o", "ServerAliveInterval=60",
            "-R", &format!("80:localhost:{}", local_port),
            "nokey@serveo.net",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start SSH tunnel: {}. Make sure OpenSSH is installed.", e))?;

    // Read the assigned URL from ssh output
    // serveo.net outputs: "Forwarding HTTP traffic from https://xxxx.serveo.net"
    let stderr = child.stderr.take()
        .ok_or("Could not capture ssh stderr")?;

    let reader = BufReader::new(stderr);
    let mut public_url = String::new();

    for line in reader.lines().take(20) {
        if let Ok(line) = line {
            // Emit progress to frontend
            let _ = app_handle.emit("tunnel-log", &line);
            if line.contains("https://") {
                // Extract URL from the line
                if let Some(url_start) = line.find("https://") {
                    public_url = line[url_start..].split_whitespace().next()
                        .unwrap_or("").to_string();
                    break;
                }
            }
            if line.contains("http://") {
                if let Some(url_start) = line.find("http://") {
                    public_url = line[url_start..].split_whitespace().next()
                        .unwrap_or("").to_string();
                    break;
                }
            }
        }
    }

    if public_url.is_empty() {
        let _ = child.kill();
        return Err("Could not obtain public URL from SSH relay. Check your internet connection.".to_string());
    }

    let info = TunnelInfo {
        local_port,
        public_url: public_url.clone(),
        status: "Active".to_string(),
    };

    tunnels.insert(local_port, TunnelProcess {
        child,
        public_url,
        local_port,
    });

    Ok(info)
}

#[tauri::command]
pub fn stop_tunnel(state: tauri::State<'_, TunnelState>, local_port: u16) -> Result<(), String> {
    let mut tunnels = state.tunnels.lock().unwrap();
    if let Some(mut tunnel) = tunnels.remove(&local_port) {
        let _ = tunnel.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn list_tunnels(state: tauri::State<'_, TunnelState>) -> Vec<TunnelInfo> {
    let tunnels = state.tunnels.lock().unwrap();
    tunnels.values().map(|t| TunnelInfo {
        local_port: t.local_port,
        public_url: t.public_url.clone(),
        status: "Active".to_string(),
    }).collect()
}
```

#### 3. Update PortTunnel.tsx Frontend (src/components/PortTunnel.tsx)

The frontend needs to:
- Show real tunnel URLs (link that opens in browser)
- Display tunnel logs from the "tunnel-log" event
- Show a QR code of the public URL (qrcode.react is already installed!)
- Handle errors gracefully with toast notifications

Read the current PortTunnel.tsx first, then rewrite it with:
```typescript
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../store/store';

// Full real implementation replacing the mock
```

Key UI elements:
- Port input field (number, 1-65535)
- "Start Tunnel" button that shows a spinner while SSH connects
- Once connected: show the public URL as a clickable link + QR code
- Log console showing SSH output in real-time
- Stop button for each active tunnel
- List of all active tunnels
- Loading state with message "Connecting to relay server..."

#### 4. Add "tunnel-log" event listener in PortTunnel.tsx
```typescript
useEffect(() => {
  const unlisten = listen<string>('tunnel-log', (event) => {
    setLogs(prev => [...prev, event.payload]);
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

#### 5. Error Handling
Every invoke() must use try/catch and call useToast().error() on failure.

## Verification
- Start a local HTTP server (use `spawn_local_server` command) on port 8080
- Start a tunnel for port 8080
- Verify a real URL is returned
- Visit the URL in a browser

## Commit
git commit -m "feat(tunnel): replace mock tunnel with real SSH reverse tunneling via serveo.net"
```

---

## P2-A2 — Proxy Engineer
**Model:** `pro` | **Priority:** High | **Task:** Real HTTP MITM Proxy

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The current "Network Interceptor" is a raw TCP listener that just reads bytes.
It is NOT an HTTP proxy — it cannot inspect or replay HTTP requests.
Your job: build a real HTTP proxy that intercepts, displays, and allows replaying requests.

## Current State
File: src-tauri/src/proxy.rs — raw TCP listener on port 8080

## Target: Real HTTP Intercepting Proxy

### Strategy
Use hyper (already in Cargo.toml) to build a proper HTTP/1.1 forwarding proxy
that captures request/response pairs and emits them to the frontend.

### Implementation

#### 1. Rewrite proxy.rs

The proxy should:
- Listen on a configurable port (default 8082 to avoid conflict with local server)
- For each request: capture method, URL, headers, body
- Forward the request to the actual server (transparent proxy)
- Capture the response status, headers, body
- Emit both request and response as a JSON event to the frontend
- Store the last N (100) request/response pairs in memory

```rust
use hyper::{Body, Client, Request, Response, Server};
use hyper::service::{make_service_fn, service_fn};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use serde::{Serialize, Deserialize};

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
    pub timestamp: u64, // Unix ms
    pub duration_ms: u64,
}

pub struct ProxyState {
    pub is_running: Arc<AtomicBool>,
    pub captured: Arc<Mutex<Vec<CapturedRequest>>>,
    pub counter: Arc<Mutex<u64>>,
}

// Use hyper to build the proxy service
// Each incoming request: capture → forward → capture response → emit event

#[tauri::command]
pub async fn start_proxy(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, ProxyState>,
    port: u16,
) -> Result<(), String> { ... }

#[tauri::command]
pub fn stop_proxy(state: tauri::State<'_, ProxyState>) -> Result<(), String> { ... }

#[tauri::command]
pub fn get_captured_requests(state: tauri::State<'_, ProxyState>) -> Vec<CapturedRequest> { ... }

#[tauri::command]
pub fn clear_captured_requests(state: tauri::State<'_, ProxyState>) -> Result<(), String> { ... }

#[tauri::command]
pub async fn replay_request(
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<CapturedRequest, String> { ... }
```

#### 2. Register new commands in lib.rs
Add to invoke_handler!:
- proxy::get_captured_requests
- proxy::clear_captured_requests
- proxy::replay_request
Update start_proxy to accept a `port: u16` parameter.

#### 3. Rewrite NetworkInterceptor.tsx (src/components/NetworkInterceptor.tsx)

The new UI must show:
- Proxy status (running/stopped) + port number
- Start/Stop button
- Instructions: "Set your browser/curl proxy to 127.0.0.1:{port}"
- Real-time request list (table):
  - Method (colored badges: GET=blue, POST=green, DELETE=red, etc.)
  - URL
  - Status code (colored: 2xx=green, 4xx=amber, 5xx=red)
  - Duration (ms)
  - Timestamp
- Click a request to see a detail panel:
  - Full request headers and body
  - Full response headers and body
  - JSON/XML pretty printing if content-type matches
  - "Replay" button that re-sends the request
- "Clear" button to clear the log
- Filter bar: filter by method, URL contains, status code

Use Framer Motion for the detail panel slide-in animation.
Use a left-panel list + right-panel detail layout (like Postman).

Listen to "proxy-request" events for real-time updates.

#### 4. Error Handling
All invoke() calls use useToast().error() on failure.

## Commit
git commit -m "feat(proxy): replace TCP stub with real HTTP MITM proxy using hyper"
```

---

## P2-A3 — CRDT Engineer
**Model:** `pro` | **Priority:** High | **Task:** Real Collaborative Editor

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The CollaborativeEditor component uses setTimeout to SIMULATE peer connections.
No real P2P collaboration happens. Your job: wire real collaboration using Yjs + y-webrtc.

## Current State
File: src/components/CollaborativeEditor.tsx
- Uses Yjs (Y.Doc, getText) ✅ already imported
- Simulates peer connections with setTimeout ❌
- Uses a plain textarea ❌ (should use Monaco Editor)
- No actual WebRTC connection ❌

## Dependencies Already in package.json
- yjs: ✅
- peerjs: ✅ (for signaling fallback)
- @monaco-editor/react: ✅
- web-tree-sitter: ✅ (for syntax highlighting)

## Missing Dependency — Install It
```bash
npm install y-webrtc
```
This provides the WebRTC provider for Yjs.

## Implementation Plan

### 1. Rewrite CollaborativeEditor.tsx completely

```typescript
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';
import type { editor } from 'monaco-editor';

export const CollaborativeEditor = ({ currentPath }: { currentPath: string | null }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebrtcProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  
  const [roomId, setRoomId] = useState('vaultly-default');
  const [peers, setPeers] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [language, setLanguage] = useState('typescript');
  const { error: toastError } = useToast();

  // Load file from disk when currentPath changes
  useEffect(() => {
    if (currentPath && !currentPath.endsWith('/')) {
      invoke<string>('read_file_text', { path: currentPath })
        .then(content => {
          setFileContent(content);
          // Detect language from extension
          const ext = currentPath.split('.').pop() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript', js: 'javascript',
            jsx: 'javascript', rs: 'rust', py: 'python', md: 'markdown',
            json: 'json', yaml: 'yaml', yml: 'yaml', css: 'css', html: 'html',
          };
          setLanguage(langMap[ext] || 'plaintext');
        })
        .catch(e => toastError('Failed to load file', String(e)));
    }
  }, [currentPath]);

  const joinRoom = (id: string) => {
    // Clean up existing session
    if (bindingRef.current) bindingRef.current.destroy();
    if (providerRef.current) providerRef.current.destroy();
    if (ydocRef.current) ydocRef.current.destroy();

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    
    const ytext = ydoc.getText('monaco');
    
    // Initialize with file content if editor is empty
    if (fileContent && ytext.toString() === '') {
      ytext.insert(0, fileContent);
    }

    // Connect via WebRTC
    const provider = new WebrtcProvider(id, ydoc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
    });
    providerRef.current = provider;

    provider.on('synced', (synced: boolean) => {
      setIsConnected(synced);
    });

    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      setPeers(states.size - 1); // exclude self
    });

    // Set local awareness (user cursor color)
    provider.awareness.setLocalStateField('user', {
      name: 'You',
      color: '#6366f1',
    });

    // Bind to Monaco if editor is mounted
    if (editorRef.current) {
      bindToEditor(ytext);
    }
    
    setIsConnected(true);
  };

  const bindToEditor = (ytext: Y.Text) => {
    if (!editorRef.current || !providerRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    
    if (bindingRef.current) bindingRef.current.destroy();
    
    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editorRef.current]),
      providerRef.current.awareness,
    );
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    
    // If already connected, bind immediately
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('monaco');
      bindToEditor(ytext);
    }
  };

  const saveFile = async () => {
    if (!currentPath || !editorRef.current) return;
    try {
      const content = editorRef.current.getValue();
      // Write back to file using fs (add write_file_text command to Rust if not exists)
      await invoke('write_file_text', { path: currentPath, content });
      useToast().success('File saved', currentPath);
    } catch (e) {
      toastError('Save failed', String(e));
    }
  };

  useEffect(() => {
    joinRoom(roomId);
    return () => {
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white">
      {/* Header with Room ID, peer count, save button */}
      ...
      {/* Monaco Editor */}
      <Editor
        height="100%"
        language={language}
        theme="vs-dark"
        onMount={handleEditorMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
      />
    </div>
  );
};
```

### 2. Add write_file_text command to Rust (if not already present)
Check src-tauri/src/files.rs (or lib.rs after Phase 1 split).
Add if missing:
```rust
#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```
Register in lib.rs invoke_handler.

### 3. Install y-monaco
```bash
npm install y-monaco
```

### 4. UI Design
The editor should look like VSCode-dark but with the Vaultly indigo/purple glow theme.
Show:
- Room ID input (user can change room to collaborate on same doc)
- Peer avatars (colored dots for each connected peer)
- Language detection badge
- Save to disk button (Ctrl+S)
- Connection status indicator

## Commit
git commit -m "feat(crdt): replace simulated CRDT with real y-webrtc + Monaco collaborative editor"
```

---

## P2-A4 — Docker Engineer
**Model:** `inherit` | **Priority:** High | **Task:** Real Docker Controls + Logs

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The Docker Dashboard shows a container list but has NO controls (start/stop/remove/logs).
Your job: add full container lifecycle management and real-time log streaming.

## Step 1: Expand docker.rs (or create src-tauri/src/docker.rs after Phase 1 split)

Add these new commands:

```rust
#[tauri::command]
pub fn docker_action(container_id: String, action: String) -> Result<String, String> {
    // action: "start", "stop", "restart", "remove"
    let valid_actions = ["start", "stop", "restart", "rm"];
    let cmd_action = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        "restart" => "restart",
        "remove" => "rm",
        _ => return Err("Invalid action".to_string()),
    };
    
    let output = std::process::Command::new("docker")
        .args([cmd_action, &container_id])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn stream_docker_logs(
    app_handle: tauri::AppHandle,
    container_id: String,
    tail_lines: u32,
) -> Result<(), String> {
    // Spawn docker logs -f --tail={n} {id} and stream to frontend
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    
    let mut child = Command::new("docker")
        .args(["logs", "-f", "--tail", &tail_lines.to_string(), &container_id])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    
    let event_name = format!("docker-log-{}", container_id);
    
    // Stream stdout
    let app_handle_clone = app_handle.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_clone.emit(&event_clone, line);
        }
    });
    
    // Stream stderr
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(&event_name, format!("[STDERR] {}", line));
        }
    });
    
    Ok(())
}

#[tauri::command]
pub fn get_docker_images() -> Result<Vec<DockerImage>, String> {
    // docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}"
    ...
}

#[derive(Serialize, Deserialize)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
}

#[tauri::command]
pub fn docker_pull_image(image: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    // spawn docker pull and stream output
    ...
}

#[tauri::command]
pub fn docker_remove_image(image_id: String) -> Result<(), String> {
    ...
}
```

Register all new commands in lib.rs invoke_handler.

## Step 2: Rewrite DockerDashboard.tsx (src/components/DockerDashboard.tsx)

Current UI only lists containers. New UI must have:

### Layout: 3-panel design
1. **Left Panel**: Container list with status badges
2. **Right Top Panel**: Selected container details + action buttons
3. **Right Bottom Panel**: Live log stream

### Container List Item
Each container shows:
- Color-coded status dot (green=running, red=stopped, amber=paused)
- Container name (large, bold)
- Image name (small, gray)
- Port mappings
- Action buttons (start/stop/restart/remove) with confirmation for remove

### Container Details
When a container is selected:
- Full details: ID, image, state, created at, network
- Port mappings list
- Resource usage (if running): requires `docker stats --no-stream`
- Environment variables: `docker inspect` output

### Log Viewer Panel
- "View Logs" button that starts streaming
- Last 100 lines shown
- Auto-scroll to bottom
- Clear button
- Color-coded lines (STDERR in red)

### Images Tab
- Separate tab to view Docker images
- Pull new image (input + button)
- Remove image button

### Empty State
When Docker is not installed/running, show a helpful message:
"Docker is not running. Start Docker Desktop to use this feature."

### Error Handling
All invoke() calls use useToast() for errors.

## Step 3: Add `docker stats` parsing
```rust
#[tauri::command]
pub fn get_container_stats(container_id: String) -> Result<ContainerStats, String> {
    let output = std::process::Command::new("docker")
        .args(["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}", &container_id])
        .output()
        .map_err(|e| e.to_string())?;
    // parse output
}
```

## Commit
git commit -m "feat(docker): add real container controls, log streaming, image management"
```

---

## P2-A5 — Git Engineer
**Model:** `inherit` | **Priority:** High | **Task:** Real Git Diff + Branch Management

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The VisualGit component shows file status and commit history but is missing:
- Branch listing + switching
- Pull/fetch
- Diff viewer (shows what changed in a file)
- Clone repository
Your job: add all of these using the git CLI (already used in the codebase).

## Step 1: Add new Rust commands to git.rs (or lib.rs before Phase 1 split)

```rust
#[tauri::command]
pub fn get_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    // git branch -a --format="%(refname:short)|%(objectname:short)|%(HEAD)"
    let output = Command::new("git")
        .current_dir(&path)
        .args(["branch", "-a", "--format=%(refname:short)|%(objectname:short)|%(HEAD)"])
        .output()
        .map_err(|e| e.to_string())?;
    
    let mut branches = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            branches.push(BranchInfo {
                name: parts[0].trim().to_string(),
                hash: parts[1].to_string(),
                is_current: parts[2] == "*",
                is_remote: parts[0].contains("remotes/"),
            });
        }
    }
    Ok(branches)
}

#[derive(Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub hash: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(&path)
        .args(["checkout", &branch])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_create_branch(path: String, branch: String) -> Result<String, String> {
    // git checkout -b {branch}
    ...
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    // git pull
    ...
}

#[tauri::command]
pub fn git_fetch(path: String) -> Result<String, String> {
    // git fetch --all
    ...
}

#[tauri::command]
pub fn get_file_diff(path: String, file: String) -> Result<String, String> {
    // git diff -- {file} (for unstaged)
    let output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--", &file])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn get_staged_diff(path: String, file: String) -> Result<String, String> {
    // git diff --cached -- {file}
    ...
}

#[tauri::command]
pub fn git_clone(url: String, destination: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    // Spawn git clone and stream output
    std::thread::spawn(move || {
        let mut child = Command::new("git")
            .args(["clone", "--progress", &url, &destination])
            .stderr(std::process::Stdio::piped())
            .spawn();
        // Stream stderr to "git-progress" event
    });
    Ok(())
}

#[tauri::command]
pub fn git_stash(path: String) -> Result<String, String> {
    // git stash
    ...
}

#[tauri::command]
pub fn git_stash_pop(path: String) -> Result<String, String> {
    // git stash pop
    ...
}
```

Register all in lib.rs invoke_handler.

## Step 2: Rewrite VisualGit.tsx (src/components/VisualGit.tsx)

Read the current file first to understand its existing structure, then enhance it:

### New Layout (3-panel vertical + horizontal split)

**Left Panel: Branch & Status**
- Current branch displayed prominently at top (with branch switch dropdown)
- "New Branch" button + input
- "Pull" and "Fetch" buttons
- Modified files list (from git status)
  - Click to see diff
  - Stage/unstage checkboxes
- Staged files list
- Commit message input + Commit + Push buttons

**Right Panel: Tabs**
1. **Diff Tab**: Show the diff of the selected file
   - Use Monaco Editor in diff mode (editor.createDiffEditor) for beautiful inline diffs
   - Or render a simple colored line-by-line diff if Monaco diff is complex
   - Color: red for deletions, green for additions
2. **History Tab**: Commit log (already exists, keep it)
3. **Branches Tab**: List all local + remote branches
   - Click to checkout
   - "Create branch" button

**Clone Section**
- A "Clone Repository" section at the top when no path is set
- URL input + destination picker + Clone button
- Progress log during clone

**Stash Controls**
- "Stash Changes" button
- "Pop Stash" button

### Diff Rendering
Parse the unified diff format and render colored blocks:
```typescript
const renderDiff = (diff: string) => {
  return diff.split('\n').map((line, i) => {
    if (line.startsWith('+') && !line.startsWith('+++')) return <div key={i} className="bg-green-500/10 text-green-400 font-mono text-xs px-2">{line}</div>;
    if (line.startsWith('-') && !line.startsWith('---')) return <div key={i} className="bg-red-500/10 text-red-400 font-mono text-xs px-2">{line}</div>;
    if (line.startsWith('@@')) return <div key={i} className="bg-blue-500/10 text-blue-400 font-mono text-xs px-2">{line}</div>;
    return <div key={i} className="text-gray-500 font-mono text-xs px-2">{line}</div>;
  });
};
```

## Commit
git commit -m "feat(git): add branch management, diff viewer, pull/fetch, stash, clone"
```

---

## P2-A6 — Dashboard Engineer
**Model:** `inherit` | **Priority:** Medium | **Task:** Live System Vitals

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The VaultlyDashboard component has HARDCODED values:
- "4.2%" CPU load (fake)
- "Active" ZKP status (always "Active", meaningless)
- "3 Peers" P2P mesh (fake)

Your job: replace all hardcoded values with real live data.

## Step 1: Real CPU and Memory (Rust backend already exists)
The `get_sys_stats` command in sys.rs returns real CPU and memory data.
Use this to update the dashboard stats every 2 seconds.

## Step 2: Update VaultlyDashboard.tsx

Replace the static stat boxes with dynamic values:

```typescript
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/store';

interface SysStats {
  cpu_usage: number;
  mem_total: number;
  mem_used: number;
  drives: Array<{ name: string; mount_point: string; total_space: number; available_space: number }>;
}

export const VaultlyDashboard = ({ onOpenApp }) => {
  const [sysStats, setSysStats] = useState<SysStats | null>(null);
  const secretsCount = useStore(s => s.secretsCount);
  const activeTunnelCount = useStore(s => s.activeTunnelCount);
  const currentPath = useStore(s => s.currentPath);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await invoke<SysStats>('get_sys_stats');
        setSysStats(stats);
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024 ** 3; // GB
    return `${(bytes / k).toFixed(1)} GB`;
  };

  // Stat widgets now use real data:
  // Widget 1: CPU - sysStats?.cpu_usage.toFixed(1) + '%'
  // Widget 2: Memory - formatBytes(sysStats?.mem_used) + ' / ' + formatBytes(sysStats?.mem_total)
  // Widget 3: Active Secrets - secretsCount (from Zustand store)

  // Show a mini animated bar chart for CPU usage history (last 20 readings)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  useEffect(() => {
    if (sysStats) {
      setCpuHistory(prev => [...prev.slice(-19), sysStats.cpu_usage]);
    }
  }, [sysStats]);
  ...
};
```

## Step 3: Add CPU History Spark Chart
Use recharts (already installed) to show a small spark line of CPU history in the stat widget.
Use a simple 60px tall LineChart with no axes, just the line.

## Step 4: Add "Quick Stats" Row
Below the 3 main stat boxes, add a row showing:
- Total disk space across all drives (sum from sysStats.drives)
- Available disk space
- Git status: if currentPath is set, show how many files are modified
- Active Docker containers: invoke get_docker_containers and show count

## Step 5: Make Widget Cards Dynamic
The 6 "Pinned Utilities" cards should show a small status badge:
- Terminal: show number of active PTY sessions (from Zustand store if tracked)
- Secrets: show secretsCount badge
- Tunnel: show activeTunnelCount badge
- Git: show modified file count if in a git repo

## Step 6: Remove ALL Hardcoded Values
Search VaultlyDashboard.tsx for any string literals that represent data values:
- "4.2%" → real CPU
- "Active" → real ZKP check (the zkp module is working; show "Initialized" if module loads)
- "3 Peers" → real peer count from P2PSyncModal state (0 unless connected)
- Remove any static demo text and replace with real values or "—" placeholder

## Commit
git commit -m "feat(dashboard): replace all hardcoded values with live system data"
```

---

## P2-A7 — GPU Engineer
**Model:** `inherit` | **Priority:** Low | **Task:** Real GPU Metrics

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The GPUCluster component is a pure UI mockup with no real GPU data.
Your job: get real GPU metrics using Windows Management Instrumentation (WMI) / WMIC.

## Strategy
Use PowerShell/WMIC to query GPU stats — no new Rust crate needed.

## Step 1: Add Rust commands (in sys.rs or a new gpu.rs file)

```rust
#[derive(Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub adapter_ram: String,
    pub driver_version: String,
    pub video_processor: String,
}

#[tauri::command]
pub fn get_gpu_info() -> Result<Vec<GpuInfo>, String> {
    let script = "Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,VideoProcessor | ConvertTo-Json";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    
    let json = String::from_utf8_lossy(&output.stdout);
    
    // Parse the JSON. Note: if only one GPU, it's an object not array.
    // Handle both cases.
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let items = if value.is_array() {
        value.as_array().unwrap().clone()
    } else {
        vec![value]
    };
    
    let gpus = items.iter().filter_map(|item| {
        Some(GpuInfo {
            name: item["Name"].as_str()?.to_string(),
            adapter_ram: format!("{} MB", item["AdapterRAM"].as_u64().unwrap_or(0) / 1_048_576),
            driver_version: item["DriverVersion"].as_str().unwrap_or("Unknown").to_string(),
            video_processor: item["VideoProcessor"].as_str().unwrap_or("Unknown").to_string(),
        })
    }).collect();
    
    Ok(gpus)
}

#[tauri::command]
pub fn get_gpu_utilization() -> Result<u8, String> {
    // Get GPU utilization via nvidia-smi if NVIDIA GPU, else return 0
    // Try nvidia-smi first (NVIDIA GPUs)
    let nvidia = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"])
        .output();
    
    if let Ok(output) = nvidia {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            return s.trim().parse::<u8>().map_err(|e| e.to_string());
        }
    }
    
    // Fallback: use WMIC for basic GPU process info
    Ok(0)
}
```

Register in lib.rs.

## Step 2: Rewrite GPUCluster.tsx

Replace the mock UI with real data:

```typescript
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface GpuInfo {
  name: string;
  adapter_ram: string;
  driver_version: string;
  video_processor: string;
}

export const GPUCluster = () => {
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [utilization, setUtilization] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<GpuInfo[]>('get_gpu_info')
      .then(setGpus)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
    
    const poll = setInterval(async () => {
      try {
        const util = await invoke<number>('get_gpu_utilization');
        setUtilization(util);
      } catch {}
    }, 2000);
    
    return () => clearInterval(poll);
  }, []);

  // Render each GPU as a card with:
  // - GPU name (large)
  // - VRAM amount
  // - Driver version
  // - Utilization % (animated bar, only if nvidia-smi is available)
  // - Circular gauge for utilization
};
```

## Commit
git commit -m "feat(gpu): replace mock GPU view with real WMI/nvidia-smi data"
```

---

## Phase 2 Completion Checklist

After all 7 agents complete and branches are merged:
- [ ] Port Tunnel creates a real public URL (test with a running local server)
- [ ] Network Proxy captures real HTTP traffic
- [ ] Collaborative Editor shows real peer count (open 2 instances to test)
- [ ] Docker containers can be started/stopped/logs streamed
- [ ] Git diff viewer shows real file diffs
- [ ] Dashboard CPU/memory shows real system values (refreshes every 2s)
- [ ] GPU panel shows actual installed GPU info
- [ ] ZERO hardcoded data values remain in any component
- [ ] `cargo check` — 0 errors
- [ ] `npm run build` — 0 errors

## Next Step
After Phase 2 is verified: **Launch all 6 Phase 3 agents simultaneously.**
