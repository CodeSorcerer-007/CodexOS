# 🧩 Phase 3 — Complete Incomplete Features
## Agent Prompts (6 Agents, All Parallel)

> **Pre-condition:** Phase 1 AND Phase 2 must be FULLY complete and merged.
> **Goal:** Every feature that exists in the UI must have a working, non-mocked backend.
> **All agents use workspace mode: `branch`**

---

## P3-A1 — Keyring Engineer
**Model:** `pro` | **Priority:** CRITICAL | **Task:** Persistent Secrets via OS Keyring

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The Secrets Manager currently stores secrets IN MEMORY ONLY — all secrets are lost
when the app closes. This is unacceptable for a production tool.

Your job: integrate the Windows Credential Manager (and cross-platform keyring)
for persistent, encrypted secret storage.

## Step 1: Add keyring crate to Cargo.toml

```toml
keyring = "2.3"
```

## Step 2: Completely rewrite secrets.rs

The new secrets module must:
- Use `keyring` crate to persist secrets in the OS keyring
- Still maintain an in-memory cache for performance (avoid keyring lookup on every use)
- On startup, load all previously stored secret KEYS (not values) so the UI can show them
- Values are only decrypted when explicitly needed (run_with_secrets)

```rust
use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;

const SERVICE_NAME: &str = "vaultly";

// In-memory cache of secrets (key → value)
// Loaded from keyring on demand
pub struct SecretsState {
    pub cache: Mutex<HashMap<String, String>>,
    pub known_keys: Mutex<Vec<String>>, // persisted list of key names
}

impl SecretsState {
    pub fn new() -> Self {
        let state = SecretsState {
            cache: Mutex::new(HashMap::new()),
            known_keys: Mutex::new(Vec::new()),
        };
        // Load known keys from a special keyring entry on startup
        if let Ok(entry) = Entry::new(SERVICE_NAME, "__vault_keys__") {
            if let Ok(keys_json) = entry.get_password() {
                if let Ok(keys) = serde_json::from_str::<Vec<String>>(&keys_json) {
                    *state.known_keys.lock().unwrap() = keys;
                }
            }
        }
        state
    }
    
    fn persist_keys(&self) {
        let keys = self.known_keys.lock().unwrap().clone();
        if let Ok(entry) = Entry::new(SERVICE_NAME, "__vault_keys__") {
            let _ = entry.set_password(&serde_json::to_string(&keys).unwrap_or_default());
        }
    }
}

#[tauri::command]
pub fn add_secret(
    state: tauri::State<'_, SecretsState>,
    key: String,
    value: String,
) -> Result<(), String> {
    // Validate key name (alphanumeric + underscore)
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Key name must be alphanumeric with underscores only".to_string());
    }
    
    // Store in OS keyring
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("Failed to store secret: {}", e))?;
    
    // Update cache
    state.cache.lock().unwrap().insert(key.clone(), value);
    
    // Update known keys list
    let mut keys = state.known_keys.lock().unwrap();
    if !keys.contains(&key) {
        keys.push(key.clone());
        drop(keys);
        state.persist_keys();
    }
    
    Ok(())
}

#[tauri::command]
pub fn list_secret_keys(state: tauri::State<'_, SecretsState>) -> Vec<String> {
    state.known_keys.lock().unwrap().clone()
}

#[tauri::command]
pub fn remove_secret(
    state: tauri::State<'_, SecretsState>,
    key: String,
) -> Result<(), String> {
    // Remove from keyring
    if let Ok(entry) = Entry::new(SERVICE_NAME, &key) {
        let _ = entry.delete_credential();
    }
    
    // Remove from cache
    state.cache.lock().unwrap().remove(&key);
    
    // Remove from known keys
    let mut keys = state.known_keys.lock().unwrap();
    keys.retain(|k| k != &key);
    drop(keys);
    state.persist_keys();
    
    Ok(())
}

#[tauri::command]
pub fn run_with_secrets(
    state: tauri::State<'_, SecretsState>,
    cmd: String,
    required_keys: Vec<String>,
) -> Result<String, String> {
    let mut envs = HashMap::new();
    
    for key in &required_keys {
        // Check cache first
        let cached = state.cache.lock().unwrap().get(key).cloned();
        
        let value = if let Some(v) = cached {
            v
        } else {
            // Load from keyring
            let entry = Entry::new(SERVICE_NAME, key)
                .map_err(|e| format!("Keyring error for '{}': {}", key, e))?;
            let v = entry.get_password()
                .map_err(|_| format!("Secret '{}' not found in vault.", key))?;
            // Cache it
            state.cache.lock().unwrap().insert(key.clone(), v.clone());
            v
        };
        
        envs.insert(key.clone(), value);
    }
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let output = std::process::Command::new("cmd")
        .args(&["/C", &cmd])
        .envs(&envs)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

// New command to export secrets to an encrypted .env file
#[tauri::command]
pub fn export_secrets_to_env(
    state: tauri::State<'_, SecretsState>,
    output_path: String,
) -> Result<(), String> {
    let keys = state.known_keys.lock().unwrap().clone();
    let mut lines = Vec::new();
    
    for key in keys {
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| format!("Keyring error: {}", e))?;
        let value = entry.get_password()
            .map_err(|e| format!("Failed to read '{}': {}", key, e))?;
        lines.push(format!("{}={}", key, value));
    }
    
    std::fs::write(&output_path, lines.join("\n"))
        .map_err(|e| e.to_string())
}
```

## Step 3: Add export_secrets_to_env to lib.rs invoke_handler

## Step 4: Update SecretsManager.tsx

Enhance the UI to show:
- A lock icon and "Secured by OS Keyring" badge (green)
- Import from .env file button (reads a .env file and imports all KEY=VALUE pairs)
- Export to .env button (calls export_secrets_to_env)
- Last-used timestamps would be nice but not required
- Show "Persistent" vs "Session-only" badge per secret (all are now persistent)
- Success toasts when adding/removing secrets using useToast()

Also add an "Import .env File" function:
```typescript
const importEnvFile = async () => {
  // Use Tauri dialog to pick a file
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ filters: [{ name: 'Env', extensions: ['env', 'txt'] }] });
  if (!path) return;
  const content = await invoke<string>('read_file_text', { path });
  // Parse KEY=VALUE lines
  const lines = content.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=');
    await invoke('add_secret', { key: key.trim(), value: valueParts.join('=').trim() });
  }
  fetchKeys();
  success('Imported secrets from .env file');
};
```

Note: You'll need to install tauri-plugin-dialog:
- Add to Cargo.toml: `tauri-plugin-dialog = "2"`
- Add to tauri.conf.json plugins list
- Register in lib.rs: .plugin(tauri_plugin_dialog::init())

## Step 5: Update Zustand Store
When secrets are loaded, update the secretsCount in the store:
```typescript
const fetchKeys = async () => {
  const k = await invoke<string[]>('list_secret_keys');
  setKeys(k);
  useStore.getState().setSecretsCount(k.length);
};
```

## Commit
git commit -m "feat(secrets): replace in-memory storage with OS keyring persistence"
```

---

## P3-A2 — FileOps Engineer
**Model:** `inherit` | **Priority:** High | **Task:** Full File Operations + Breadcrumbs

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The FileGrid component is a file BROWSER but is missing critical file operations:
- Create new file
- Create new folder
- Rename file/folder inline
- Delete file (with confirmation)
- Drag-and-drop to move files
- Path breadcrumb navigation
- Back/forward navigation

## Step 1: Add missing Rust commands

In files.rs (after Phase 1 split) or lib.rs, add:

```rust
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    std::fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

// write_file_text was added in Phase 2 by CRDT agent, verify it's there
// If not: 
#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```

Register all in lib.rs invoke_handler.

## Step 2: Add a Breadcrumb Component

Create src/components/Breadcrumb.tsx:
```typescript
import { useStore } from '../store/store';
import { ChevronRight, Home } from 'lucide-react';

export const Breadcrumb = () => {
  const currentPath = useStore(s => s.currentPath);
  const pushPath = useStore(s => s.pushPath);
  const canGoBack = useStore(s => s.canGoBack);
  const canGoForward = useStore(s => s.canGoForward);
  const goBack = useStore(s => s.goBack);
  const goForward = useStore(s => s.goForward);
  
  if (!currentPath) return null;
  
  // Split path into segments
  const segments = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
  
  const navigateTo = (index: number) => {
    // Rebuild path up to index
    const newPath = segments.slice(0, index + 1).join('\\');
    pushPath(newPath.includes(':') ? newPath : '\\' + newPath);
  };
  
  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-black/30 border-b border-white/5">
      {/* Back/Forward buttons */}
      <button disabled={!canGoBack} onClick={goBack} className="...">←</button>
      <button disabled={!canGoForward} onClick={goForward} className="...">→</button>
      
      {/* Home */}
      <button onClick={() => invoke('get_current_dir').then(pushPath)} className="...">
        <Home size={14} />
      </button>
      
      {/* Path segments */}
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-1">
          <ChevronRight size={12} className="text-gray-600" />
          <button
            onClick={() => navigateTo(i)}
            className="text-xs text-gray-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/10"
          >
            {seg}
          </button>
        </div>
      ))}
    </div>
  );
};
```

## Step 3: Rewrite FileGrid.tsx with Full File Operations

Enhance the existing FileGrid.tsx to add:

### Toolbar (above file list)
- Breadcrumb component (from Step 2)
- "New File" button
- "New Folder" button
- Grid/List view toggle (already exists)
- Search/filter input (client-side filter on file names)

### Inline Rename
- Double-click a file name to enter rename mode (inline text input)
- Press Enter to confirm, Escape to cancel
- On confirm, call rename_path command

### New File/Folder Dialog
- When "New File" is clicked, show an inline input at the top of the file list
- User types name and presses Enter
- Call create_file or create_directory command
- Refresh file list

### Delete with Confirmation
- Right-click context menu already exists but may not have a delete option
- Add "Delete" to the context menu
- Show a confirmation: window.confirm() for now (toast-based confirmation modal in Phase 4)
- Call delete_file command

### Drag and Drop
- Add HTML5 drag events to file items: `draggable={true}` on each item
- onDragStart: store the source file path in state
- onDragOver: preventDefault(), show visual highlight on target folder
- onDrop: call move_file command with source path and new path
- After move, refresh file list

### Complete Context Menu
The full right-click context menu should have:
1. 📋 Copy Absolute Path
2. 🌐 Copy as File URI
3. ✏️ Rename
4. 🗑️ Delete (show confirmation)
5. --- separator ---
6. 📦 Add to Shelf (for future use)
7. 📄 Preview (opens PreviewModal)
8. ⚡ Optimize Asset (for images)
9. 🔄 Convert Format (for JSON/YAML)
10. #️⃣ Verify Hash
11. --- separator ---
12. Git actions (already exist via GitContextMenu)

### Empty State
When the directory is empty, show:
"This directory is empty. Click 'New File' or 'New Folder' to get started."

## Step 4: Add Preview Integration
The PreviewModal component already exists (13KB, rich content).
From the file grid, double-clicking a non-directory file should open PreviewModal.
Currently: double-clicking a directory navigates into it.
Add: double-clicking a file opens PreviewModal.

## Step 5: Update App.tsx if needed
The new Breadcrumb component should be rendered above FileGrid in the 'files' case.

## Commit
git commit -m "feat(files): add create/rename/delete/drag-drop, breadcrumb navigation, preview"
```

---

## P3-A3 — Settings Engineer
**Model:** `inherit` | **Priority:** High | **Task:** Full Settings Page

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The Settings button in the sidebar does NOTHING. There is no settings page.
Your job: build a complete settings page that persists to localStorage via Zustand.

## Step 1: Create src/components/SettingsPage.tsx

The settings page must include these sections:

### Section 1: General
- Default Working Directory (text input + browse button using Tauri dialog)
- Theme: Dark only for now (show it as selected, disabled)
- Language: English only (future expansion placeholder)

### Section 2: Terminal
- Default Shell: radio buttons for PowerShell / CMD / WSL (from Zustand settings.terminalShell)
- On WSL selection, check if WSL is installed: invoke('list_wsl_distros')
  - If WSL is installed, show a dropdown of distros
  - If not, show "WSL not detected"

### Section 3: Editor
- Font size selector (12/13/14/16/18)
- Tab size (2/4)
- Word wrap toggle

### Section 4: Appearance
- Sidebar: Auto-collapse toggle (maps to settings.sidebarCollapsed)
- Animations: Enable/disable Framer Motion animations (toggle)

### Section 5: About
- App version: read from package.json or tauri.conf.json
- Built with: Tauri v2, React 19, Rust
- GitHub link
- "Check for Updates" button (placeholder, shows a toast "You're on the latest version")

### Section 6: Danger Zone
- "Clear All Secrets" button: calls remove_secret for all keys (with confirmation)
- "Reset Settings to Defaults" button: resets Zustand settings to defaults
- "Clear Path History" button: resets navigation history

## Step 2: Design

Layout: Two-column on desktop, single-column on mobile.
Left column: section navigation (sticky sidebar within settings)
Right column: content

Style:
- Each section has a header with a colored icon
- Settings items are in clean rows with labels on left, controls on right
- Toggle switches should have a premium animated design (CSS-only or framer-motion)
- Save button at the bottom (auto-save is fine too — save on every change)

Example toggle switch:
```tsx
const Toggle = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${value ? 'bg-indigo-500' : 'bg-white/10'}`}
  >
    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-0'}`} />
  </button>
);
```

## Step 3: Wire Settings into Components

After creating the settings page:

### Wire terminalShell setting to TerminalMultiplexer.tsx
Open TerminalMultiplexer.tsx. When creating a new terminal session, read the shell from:
```typescript
const settings = useStore(s => s.settings);
const shell = settings.terminalShell === 'wsl' ? 'wsl.exe' :
              settings.terminalShell === 'cmd' ? 'cmd.exe' : 'powershell.exe';
// Use shell when calling start_multiplex_pty
```

### Wire defaultPath to VaultlyDashboard.tsx
If settings.defaultPath is set, auto-navigate to it on first open.

## Step 4: Add Settings to App.tsx Navigation

In App.tsx:
- The Settings button at the bottom of the sidebar currently does nothing
- Add an onClick: `setActiveApp('settings')`
- Add 'settings' to the activeApp union type
- Add a case in renderApp: `case 'settings': return <SettingsPage />;`
- Lazy-load SettingsPage

## Step 5: Persist on Change
Every settings change should automatically call:
```typescript
const updateSettings = useStore(s => s.updateSettings);
updateSettings({ terminalShell: 'wsl' });
// Zustand subscribe() in store.ts handles persistence to localStorage
```

## Commit
git commit -m "feat(settings): build complete settings page with localStorage persistence"
```

---

## P3-A4 — DB Studio Engineer
**Model:** `inherit` | **Priority:** Medium | **Task:** Database Studio with Table Browser

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The DatabaseStudio component shows a basic SQL query runner but lacks:
- Table browser (list of tables in the connected database)
- Schema view (column names, types, constraints)
- Data pagination
- Multiple connection support
- CSV export

## Step 1: Add new Rust commands in db.rs

```rust
#[tauri::command]
pub async fn list_tables(url: String) -> Result<Vec<String>, String> {
    sqlx::any::install_default_drivers();
    let pool = AnyPoolOptions::new()
        .max_connections(1)
        .connect(&url).await.map_err(|e| format!("Connection error: {}", e))?;
    
    // Detect database type from URL
    let query = if url.starts_with("sqlite") {
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    } else if url.starts_with("postgres") {
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    } else if url.starts_with("mysql") {
        "SHOW TABLES"
    } else {
        return Err("Unsupported database type".to_string());
    };
    
    let rows = sqlx::query(query).fetch_all(&pool).await
        .map_err(|e| format!("Query error: {}", e))?;
    
    let tables = rows.iter().filter_map(|row| {
        row.try_get::<String, _>(0).ok()
    }).collect();
    
    Ok(tables)
}

#[tauri::command]
pub async fn get_table_schema(url: String, table: String) -> Result<Vec<ColumnInfo>, String> {
    // For SQLite: PRAGMA table_info({table})
    // For Postgres: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1
    // For MySQL: DESCRIBE {table}
    ...
}

#[derive(Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
    pub default_value: Option<String>,
}

#[tauri::command]
pub async fn get_table_data(url: String, table: String, page: i64, page_size: i64) -> Result<QueryResult, String> {
    // SELECT * FROM {table} LIMIT {page_size} OFFSET {page * page_size}
    // Returns QueryResult with columns + rows + total_count
    ...
}

#[derive(Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_count: Option<i64>,
}
```

Register new commands in lib.rs.

## Step 2: Rewrite DatabaseStudio.tsx

Read the current file first. Then redesign with:

### Layout: 3-Panel

**Left Panel: Connection + Tables**
- Connection URL input + Connect button
- Connection history (last 5 used) — stored in Zustand store
- After connecting: list of tables (from list_tables)
- Click a table to browse its data
- Each table shows row count badge

**Center Panel: Data Grid / Query Editor** (tabs)

Tab 1: Table Browser
- When a table is selected from left panel:
  - Show paginated data grid (10 rows per page)
  - Pagination controls (prev/next page)
  - Column headers that are clickable to sort (client-side)
  - Cell values are copyable on click

Tab 2: SQL Query Editor
- Monaco Editor (language: sql)
- Run Query button (Ctrl+Enter shortcut)
- Results shown below in same data grid style
- Query history (last 10 queries)

**Right Panel: Schema Inspector**
- When a table is selected, show its schema:
  - Column name, type, nullable, PK badge
  - Each column as a row with type badge colored by type

### Export
- "Export CSV" button above the data grid
- Client-side CSV generation from the current result set

### Error Handling
- Connection errors show toast with specific message
- Invalid SQL shows toast with the error

### Empty State
- When not connected: show a beautiful "Connect to Database" prompt
- Support SQLite (file picker button), PostgreSQL, MySQL connection strings
- Show example connection strings

## Commit
git commit -m "feat(database): add table browser, schema inspector, pagination, CSV export"
```

---

## P3-A5 — AI Engineer
**Model:** `pro` | **Priority:** Medium | **Task:** Local AI via Ollama

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The LocalAI component is a UI mockup with no actual AI functionality.
Your job: integrate Ollama for local LLM inference.

Ollama is a free, open-source tool that runs LLMs locally.
It has a simple REST API on localhost:11434.
We don't need an Ollama crate — just use reqwest to call its API.

## Step 1: Check if Ollama is running (Rust command)

```rust
// In src-tauri/src/lib.rs or a new ai.rs module

#[derive(Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
    pub modified_at: String,
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<Vec<OllamaModel>, String> {
    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:11434/api/tags")
        .send().await
        .map_err(|_| "Ollama is not running. Install from https://ollama.ai and run 'ollama serve'".to_string())?;
    
    #[derive(Deserialize)]
    struct OllamaResponse { models: Vec<OllamaModel> }
    
    let data: OllamaResponse = resp.json().await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;
    
    Ok(data.models)
}

#[tauri::command]
pub async fn chat_with_ollama(
    model: String,
    messages: Vec<ChatMessage>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use serde_json::json;
    
    let client = reqwest::Client::new();
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": true
    });
    
    let mut response = client
        .post("http://localhost:11434/api/chat")
        .json(&body)
        .send().await
        .map_err(|e| format!("Ollama request failed: {}", e))?;
    
    // Stream the response chunks
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(content) = json["message"]["content"].as_str() {
                    let _ = app_handle.emit("ai-token", content.to_string());
                }
                if json["done"].as_bool().unwrap_or(false) {
                    let _ = app_handle.emit("ai-done", ());
                    break;
                }
            }
        }
    }
    
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
}

#[tauri::command]
pub async fn ollama_pull_model(
    model: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // POST /api/pull with streaming progress
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "name": model });
    let mut response = client.post("http://localhost:11434/api/pull")
        .json(&body).send().await.map_err(|e| e.to_string())?;
    
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                let status = json["status"].as_str().unwrap_or("").to_string();
                let _ = app_handle.emit("ollama-pull-progress", status);
            }
        }
    }
    Ok(())
}
```

## Step 2: Rewrite LocalAI.tsx completely

Read the existing file first. Then build a real AI chat interface:

### UI Design: VSCode-Copilot style

**Left Panel: Model Selector**
- Check Ollama status on mount: invoke('check_ollama_status')
- If not running: show a beautiful "Setup Required" screen with:
  - "Download Ollama" link
  - Instructions: "1. Install Ollama, 2. Run `ollama serve`, 3. Pull a model with `ollama pull llama3.2`"
  - A refresh button
- If running: show list of installed models with size badges
- Model selector dropdown
- "Pull New Model" section: input + button to pull a model
  - Show pull progress stream

**Main Panel: Chat Interface**
- Message list (scrollable)
  - User messages: right-aligned, indigo background
  - Assistant messages: left-aligned, dark background with markdown rendering
  - Streaming tokens appear in real-time (listen to 'ai-token' event)
- Input area (bottom):
  - Textarea with Ctrl+Enter to send
  - Send button with loading state during inference
  - "New Chat" button to clear history

**Context Injection**
- If currentPath is set: show a toggle "Inject current file as context"
- If toggled on: prepend file contents to the system message

**Markdown Rendering**
- Parse basic markdown: **bold**, `code`, ```code blocks```, # headings
- Code blocks should have a copy button

**System Prompt**
Default system prompt:
```
You are a helpful coding assistant integrated into Vaultly, a developer toolkit.
Help the user with code, debugging, and technical questions.
Be concise and practical.
```

Allow editing the system prompt in a collapsible section.

### Listen to Streaming Events
```typescript
useEffect(() => {
  const unlistenToken = listen<string>('ai-token', (event) => {
    setMessages(prev => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + event.payload };
      } else {
        msgs.push({ role: 'assistant', content: event.payload });
      }
      return msgs;
    });
  });
  
  const unlistenDone = listen('ai-done', () => {
    setIsStreaming(false);
  });
  
  return () => {
    unlistenToken.then(fn => fn());
    unlistenDone.then(fn => fn());
  };
}, []);
```

## Step 3: Register commands in lib.rs

## Step 4: Create a new mod ai.rs (or add to lib.rs)
If using a separate file, add `mod ai;` and register all commands.

## Commit
git commit -m "feat(ai): integrate Ollama local LLM with streaming chat interface"
```

---

## P3-A6 — AST Engineer
**Model:** `pro` | **Priority:** Medium | **Task:** Real AST Transforms with web-tree-sitter

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The ASTRefactor component is a UI with no real AST analysis.
web-tree-sitter is already installed. Your job: wire it to parse real code
and provide actionable refactoring suggestions.

## What web-tree-sitter Does
web-tree-sitter is a WASM-compiled version of tree-sitter that runs in the browser.
It can parse code in many languages and produce an AST (abstract syntax tree).

## Step 1: Download Tree-Sitter Grammar Files

Tree-sitter needs language-specific WASM files. Download them:
```bash
npm install tree-sitter-wasms
```
This package provides pre-compiled .wasm grammars for TypeScript, JavaScript, Rust, Python, etc.

## Step 2: Rewrite ASTRefactor.tsx completely

```typescript
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Parser from 'web-tree-sitter';
import { useToast } from '../store/store';
import Editor from '@monaco-editor/react';

interface ASTNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: ASTNode[];
  isNamed: boolean;
}

interface RefactorSuggestion {
  type: string;
  message: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
}

export const ASTRefactor = ({ currentPath }: { currentPath: string | null }) => {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [ast, setAst] = useState<ASTNode | null>(null);
  const [suggestions, setSuggestions] = useState<RefactorSuggestion[]>([]);
  const [selectedNode, setSelectedNode] = useState<ASTNode | null>(null);
  const [parserReady, setParserReady] = useState(false);
  const parserRef = useRef<Parser | null>(null);
  const { error: toastError } = useToast();

  // Initialize Tree-Sitter
  useEffect(() => {
    Parser.init({
      locateFile: (scriptName: string) => {
        // Point to the WASM file from tree-sitter-wasms package
        return `/node_modules/tree-sitter-wasms/out/${scriptName}`;
      },
    }).then(async () => {
      parserRef.current = new Parser();
      setParserReady(true);
    });
  }, []);

  // Load file when path changes
  useEffect(() => {
    if (currentPath && !currentPath.endsWith('/')) {
      invoke<string>('read_file_text', { path: currentPath })
        .then(content => {
          setCode(content);
          const ext = currentPath.split('.').pop() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript', js: 'javascript',
            rs: 'rust', py: 'python',
          };
          setLanguage(langMap[ext] || 'typescript');
        })
        .catch(e => toastError('Failed to load file', String(e)));
    }
  }, [currentPath]);

  // Parse code when it changes
  const parseCode = async (src: string) => {
    if (!parserRef.current || !parserReady) return;
    
    try {
      const langWasmMap: Record<string, string> = {
        typescript: 'tree-sitter-typescript.wasm',
        javascript: 'tree-sitter-javascript.wasm',
        rust: 'tree-sitter-rust.wasm',
        python: 'tree-sitter-python.wasm',
      };
      
      const wasmPath = `/node_modules/tree-sitter-wasms/out/${langWasmMap[language] || 'tree-sitter-typescript.wasm'}`;
      const Lang = await Parser.Language.load(wasmPath);
      parserRef.current.setLanguage(Lang);
      
      const tree = parserRef.current.parse(src);
      const rootNode = treeToJson(tree.rootNode);
      setAst(rootNode);
      
      // Analyze for suggestions
      const newSuggestions = analyzeTree(tree.rootNode, src);
      setSuggestions(newSuggestions);
    } catch (e) {
      console.error('Parse error:', e);
    }
  };

  // Convert tree-sitter node to serializable JSON
  const treeToJson = (node: Parser.SyntaxNode): ASTNode => ({
    type: node.type,
    text: node.text.slice(0, 50), // truncate for display
    startPosition: node.startPosition,
    endPosition: node.endPosition,
    isNamed: node.isNamed,
    children: node.children.map(treeToJson),
  });

  // Analyze AST for common issues
  const analyzeTree = (node: Parser.SyntaxNode, src: string): RefactorSuggestion[] => {
    const suggestions: RefactorSuggestion[] = [];
    
    const traverse = (n: Parser.SyntaxNode) => {
      // Check for console.log statements (should be removed in production)
      if (n.type === 'call_expression') {
        const text = n.text;
        if (text.startsWith('console.log') || text.startsWith('console.error')) {
          suggestions.push({
            type: 'Debug Statement',
            message: `Remove debug statement: ${text.slice(0, 40)}...`,
            line: n.startPosition.row + 1,
            severity: 'warning',
          });
        }
      }
      
      // Check for very long functions (> 50 lines)
      if (n.type === 'function_declaration' || n.type === 'arrow_function') {
        const lines = n.endPosition.row - n.startPosition.row;
        if (lines > 50) {
          suggestions.push({
            type: 'Long Function',
            message: `Function is ${lines} lines long. Consider breaking it into smaller functions.`,
            line: n.startPosition.row + 1,
            severity: 'warning',
          });
        }
      }
      
      // Check for TODO comments
      if (n.type === 'comment' && n.text.includes('TODO')) {
        suggestions.push({
          type: 'TODO',
          message: n.text.trim(),
          line: n.startPosition.row + 1,
          severity: 'info',
        });
      }
      
      // TypeScript: check for any type usage
      if (n.type === 'predefined_type' && n.text === 'any') {
        suggestions.push({
          type: 'Type Safety',
          message: 'Avoid using `any` type. Use a specific type or `unknown`.',
          line: n.startPosition.row + 1,
          severity: 'warning',
        });
      }
      
      n.children.forEach(traverse);
    };
    
    traverse(node);
    return suggestions;
  };

  useEffect(() => {
    if (code && parserReady) {
      const debounce = setTimeout(() => parseCode(code), 500);
      return () => clearTimeout(debounce);
    }
  }, [code, language, parserReady]);

  return (
    <div className="flex h-full">
      {/* Left: Code Editor */}
      <div className="w-1/2 flex flex-col border-r border-white/10">
        {/* Language selector + file info header */}
        <Editor
          height="60%"
          language={language}
          value={code}
          onChange={v => setCode(v || '')}
          theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 13 }}
        />
        
        {/* Suggestions Panel */}
        <div className="flex-1 overflow-y-auto border-t border-white/10 p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
            {suggestions.length} Suggestions
          </h3>
          {suggestions.map((s, i) => (
            <div key={i} className={`flex gap-3 p-3 mb-2 rounded-lg border text-sm
              ${s.severity === 'warning' ? 'border-amber-500/30 bg-amber-500/10' :
                s.severity === 'error' ? 'border-red-500/30 bg-red-500/10' :
                'border-blue-500/30 bg-blue-500/10'}`}>
              <span className="font-bold text-xs opacity-60">{s.line}</span>
              <div>
                <div className="font-bold">{s.type}</div>
                <div className="opacity-70">{s.message}</div>
              </div>
            </div>
          ))}
          {suggestions.length === 0 && parserReady && (
            <div className="text-green-400 text-sm">✅ No issues found</div>
          )}
        </div>
      </div>
      
      {/* Right: AST Explorer */}
      <div className="w-1/2 overflow-y-auto p-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
          AST Explorer
        </h3>
        {ast && <ASTNodeView node={ast} depth={0} />}
      </div>
    </div>
  );
};

const ASTNodeView = ({ node, depth }: { node: ASTNode; depth: number }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  
  return (
    <div style={{ marginLeft: depth * 16 }} className="font-mono text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex gap-2 py-0.5 hover:bg-white/5 cursor-pointer rounded"
      >
        <span className={node.isNamed ? 'text-indigo-400' : 'text-gray-500'}>
          {node.children.length > 0 ? (expanded ? '▾' : '▸') : '·'}
          {node.type}
        </span>
        {!node.isNamed && <span className="text-gray-600">"{node.text}"</span>}
      </div>
      {expanded && node.children.map((child, i) => (
        <ASTNodeView key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};
```

## Step 3: Add to App.tsx Navigation
The 'ast' case already exists in the switch. Verify it passes `currentPath`.

## Commit
git commit -m "feat(ast): wire web-tree-sitter for real AST parsing, refactor suggestions, explorer"
```

---

## Phase 3 Completion Checklist

- [ ] Secrets persist after app restart (test: add a secret, close app, reopen, secret still there)
- [ ] FileGrid: can create new file, rename, delete, drag to move
- [ ] Breadcrumb navigation works with back/forward buttons
- [ ] Settings page loads, changes persist after app restart
- [ ] Database Studio connects to SQLite, lists tables, browses data
- [ ] LocalAI shows "Ollama not running" message if Ollama not installed (graceful)
- [ ] AST Explorer shows real parse tree for TypeScript code
- [ ] AST suggestions panel shows real issues (console.log, any type, long functions)
- [ ] `cargo check` — 0 errors
- [ ] `npm run build` — 0 errors

## Next Step
After Phase 3 is verified: **Launch all 5 Phase 4 agents simultaneously.**
