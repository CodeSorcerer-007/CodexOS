# 🚀 Phase 4 — Scale & Polish | 📝 Phase 5 — Docs & Release
## Agent Prompts

---

# PHASE 4 — Scale & Polish
## 5 Agents, All Parallel

> **Pre-condition:** Phases 1, 2, 3 all complete and merged.
> **Goal:** Make the app feel polished, fast, and professional.

---

## P4-A1 — Tab Engineer
**Model:** `inherit` | **Task:** Multi-Tab Support

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The Tab interface exists in App.tsx but tabs were removed from the UI.
Your job: implement a proper multi-tab system so users can work in multiple views simultaneously.

## Design
- A thin tab bar sits above the main content area (below the title bar, to the right of the sidebar)
- Each tab shows: icon + module name + X to close
- Tabs can be reordered by drag-and-drop
- Clicking "+" adds a new tab (opens home/dashboard in the new tab)
- Each tab independently tracks: activeApp + currentPath + selectedFile
- Maximum 8 tabs

## Step 1: Update Zustand Store (store.ts)

```typescript
export interface AppTab {
  id: string;
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  label?: string; // auto-computed from activeApp
}

// Add to DashboardState:
tabs: AppTab[];
activeTabId: string;
addTab: () => void;
closeTab: (id: string) => void;
setActiveTab: (id: string) => void;
updateActiveTab: (changes: Partial<AppTab>) => void;
reorderTabs: (fromIndex: number, toIndex: number) => void;
```

Implementation:
```typescript
tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null }],
activeTabId: 'tab-1',

addTab: () => set((state) => {
  if (state.tabs.length >= 8) return state;
  const newTab: AppTab = {
    id: `tab-${Date.now()}`,
    activeApp: 'home',
    currentPath: null,
    selectedFile: null,
  };
  return { tabs: [...state.tabs, newTab], activeTabId: newTab.id };
}),

closeTab: (id) => set((state) => {
  if (state.tabs.length === 1) return state; // can't close last tab
  const newTabs = state.tabs.filter(t => t.id !== id);
  const newActiveId = state.activeTabId === id
    ? newTabs[newTabs.length - 1].id
    : state.activeTabId;
  return { tabs: newTabs, activeTabId: newActiveId };
}),

setActiveTab: (id) => set({ activeTabId: id }),

updateActiveTab: (changes) => set((state) => ({
  tabs: state.tabs.map(t => t.id === state.activeTabId ? { ...t, ...changes } : t),
})),

reorderTabs: (from, to) => set((state) => {
  const tabs = [...state.tabs];
  const [removed] = tabs.splice(from, 1);
  tabs.splice(to, 0, removed);
  return { tabs };
}),
```

## Step 2: Create TabBar Component (src/components/TabBar.tsx)

```typescript
import { useStore } from '../store/store';
import { X, Plus } from 'lucide-react';
import { SIDEBAR_ITEMS } from '../App'; // export SIDEBAR_ITEMS from App.tsx

export const TabBar = () => {
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const setActiveTab = useStore(s => s.setActiveTab);
  const reorderTabs = useStore(s => s.reorderTabs);
  
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  const getTabLabel = (app: string) => {
    return SIDEBAR_ITEMS.find(i => i.id === app)?.label || app;
  };
  
  return (
    <div className="flex items-center h-9 bg-black/50 border-b border-white/5 overflow-x-auto no-scrollbar px-2 gap-1">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          draggable
          onDragStart={() => setDraggedIdx(index)}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={() => {
            if (draggedIdx !== null && draggedIdx !== index) {
              reorderTabs(draggedIdx, index);
            }
            setDraggedIdx(null);
          }}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-3 h-7 rounded-lg text-xs cursor-pointer transition-all shrink-0 group
            ${tab.id === activeTabId
              ? 'bg-white/10 text-white'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`}
        >
          <span>{getTabLabel(tab.activeApp)}</span>
          {tabs.length > 1 && (
            <X
              size={10}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            />
          )}
        </div>
      ))}
      
      {tabs.length < 8 && (
        <button
          onClick={addTab}
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-white/5 rounded-lg transition-all"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  );
};
```

## Step 3: Update App.tsx

- Export `SIDEBAR_ITEMS` (add `export` keyword to the const)
- Add `<TabBar />` between the title bar and the main content
- Replace direct `useStore(s => s.activeApp)` etc. with reading from the active tab:
```typescript
const tabs = useStore(s => s.tabs);
const activeTabId = useStore(s => s.activeTabId);
const updateActiveTab = useStore(s => s.updateActiveTab);

const activeTab = tabs.find(t => t.id === activeTabId)!;
const activeApp = activeTab.activeApp;
const currentPath = activeTab.currentPath;
const selectedFile = activeTab.selectedFile;

// Replace setActiveApp with:
const setActiveApp = (app: Tab['activeApp']) => updateActiveTab({ activeApp: app });
const setCurrentPath = (path: string | null) => updateActiveTab({ currentPath: path });
const setSelectedFile = (file: string | null) => updateActiveTab({ selectedFile: file });
```

## Step 4: Update TerminalMultiplexer
The terminal multiplexer should keep sessions alive even when you switch tabs.
Since Zustand state is global, sessions created in one tab persist when switching tabs.
No changes needed — it just works.

## Commit
git commit -m "feat(ui): add multi-tab support with drag-and-drop reordering"
```

---

## P4-A2 — Keyboard Engineer
**Model:** `flash` | **Task:** Global Keyboard Shortcuts

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
Add a comprehensive global keyboard shortcut system.

## Step 1: Create src/hooks/useKeyboardShortcuts.ts

```typescript
import { useEffect } from 'react';
import { useStore } from '../store/store';

export const useKeyboardShortcuts = () => {
  const setActiveApp = useStore(s => s.setActiveApp);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const activeTabId = useStore(s => s.activeTabId);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      
      // Navigation shortcuts (Ctrl+Number)
      if (ctrl && !shift) {
        const numMap: Record<string, string> = {
          '1': 'home', '2': 'files', '3': 'git', '4': 'terminal',
          '5': 'secrets', '6': 'tunnel', '7': 'network', '8': 'docker',
          '9': 'database',
        };
        if (numMap[e.key]) {
          e.preventDefault();
          setActiveApp(numMap[e.key] as any);
        }
        
        // Tab management
        if (e.key === 't') { e.preventDefault(); addTab(); }
        if (e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
        
        // Jump to settings
        if (e.key === ',') { e.preventDefault(); setActiveApp('settings' as any); }
      }
      
      // Ctrl+Shift shortcuts
      if (ctrl && shift) {
        if (e.key === 'P') { e.preventDefault(); setActiveApp('files' as any); } // Command palette placeholder
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveApp, addTab, closeTab, activeTabId]);
};
```

## Step 2: Mount in App.tsx
```typescript
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
// Inside App() function:
useKeyboardShortcuts();
```

## Step 3: Add a Keyboard Shortcuts Help Modal

Create src/components/KeyboardHelp.tsx - a modal showing all shortcuts.
Trigger it with Ctrl+? or Ctrl+/.

Show a clean table:
| Shortcut | Action |
|---|---|
| Ctrl+1-9 | Navigate to module |
| Ctrl+T | New Tab |
| Ctrl+W | Close Tab |
| Ctrl+, | Settings |
| Ctrl+? | Show Shortcuts |

## Step 4: Add tooltip to sidebar items showing their shortcut
Each sidebar button should have a `title` attribute showing the shortcut:
```tsx
<button title={`${item.label} (Ctrl+${index + 1})`} ...>
```

## Commit
git commit -m "feat(ui): add global keyboard shortcut system with Ctrl+1-9 navigation"
```

---

## P4-A3 — Onboarding Engineer
**Model:** `inherit` | **Task:** First-Run Onboarding Wizard

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
First-time users see the dashboard with no context. Build a first-run onboarding wizard.

## Logic
- On first launch (localStorage 'vaultly-onboarded' !== 'true'), show the wizard
- After completing or skipping, set 'vaultly-onboarded' = 'true'

## Step 1: Create src/components/OnboardingWizard.tsx

A multi-step wizard with 4 steps:

### Step 1: Welcome
- Vaultly logo + gradient
- "Welcome to Vaultly v2 — The Ultimate Developer Toolkit"
- "Let's set up your workspace in 60 seconds"
- Next button

### Step 2: Set Working Directory
- "Where do you work? Set your default directory."
- Large directory picker (Tauri dialog)
- Preview of the selected path
- Skip option

### Step 3: Detect Installed Tools
- Auto-detect on mount using Tauri commands:
  - git: `invoke('git_action', {path: '.', action: 'status', file: '', message: ''}).catch()` or simpler: run `git --version`
  - docker: run `docker --version`
  - rg (ripgrep): run `rg --version`
  - ollama: check http://localhost:11434
  - node: run `node --version`
  - wsl: invoke('list_wsl_distros')

Show each tool with:
- ✅ Green if detected + version
- ❌ Red if not found + "Install" link

Don't block — show Skip button.

### Step 4: Done
- Confetti animation (CSS only, no library needed — use keyframes)
- "You're all set!"
- "Open Vaultly" button that closes the wizard

## Step 2: Add detection commands to Rust

```rust
#[tauri::command]
pub fn detect_tool(tool: String) -> String {
    // Returns version string or empty string if not found
    let args = match tool.as_str() {
        "git" => vec!["--version"],
        "docker" => vec!["--version"],
        "rg" => vec!["--version"],
        "node" => vec!["--version"],
        _ => return String::new(),
    };
    
    std::process::Command::new(&tool)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}
```

Register in lib.rs.

## Step 3: Mount in App.tsx

```typescript
const [showOnboarding, setShowOnboarding] = useState(
  localStorage.getItem('vaultly-onboarded') !== 'true'
);

// In JSX, before </div>:
{showOnboarding && (
  <OnboardingWizard onComplete={() => {
    localStorage.setItem('vaultly-onboarded', 'true');
    setShowOnboarding(false);
  }} />
)}
```

## Step 4: Add "Reset Onboarding" to Settings Danger Zone
In SettingsPage.tsx, add a button that clears 'vaultly-onboarded' from localStorage.

## Commit
git commit -m "feat(ui): add first-run onboarding wizard with tool detection"
```

---

## P4-A4 — CrossPlatform Engineer
**Model:** `inherit` | **Task:** Abstract Windows-Only APIs

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
Many Rust commands are Windows-only. Make them cross-platform or fail gracefully on other OS.

## Current Windows-Only Commands to Audit and Fix

### 1. kill_process (uses `taskkill /F /PID`)
```rust
pub fn kill_process(pid: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("kill")
            .args(["-9", &pid])
            .output()
            .map_err(|e| e.to_string())?;
        if output.status.success() {
            Ok(format!("Process {} killed", pid))
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}
```

### 2. get_active_ports (uses `netstat -ano -p tcp`)
```rust
#[cfg(target_os = "windows")]
let output = Command::new("netstat").args(["-ano", "-p", "tcp"]).output()...;

#[cfg(target_os = "linux")]
let output = Command::new("ss").args(["-tlnp"]).output()...;

#[cfg(target_os = "macos")]
let output = Command::new("lsof").args(["-i", "TCP", "-n", "-P"]).output()...;
```

Implement the appropriate parsing for each OS.

### 3. get_env_vars / set_env_var / delete_env_var (PowerShell-only)
Wrap with `#[cfg(target_os = "windows")]`. On non-Windows, use:
```rust
#[cfg(not(target_os = "windows"))]
pub fn get_env_vars() -> Result<std::collections::HashMap<String, String>, String> {
    Ok(std::env::vars().collect())
}
```

### 4. get_services / manage_service (Windows-only by nature)
Keep as-is but add platform guard:
```rust
#[tauri::command]
pub fn get_services() -> Result<Vec<WindowsService>, String> {
    #[cfg(target_os = "windows")]
    { ... existing code ... }
    
    #[cfg(not(target_os = "windows"))]
    { Err("Services management is only available on Windows.".to_string()) }
}
```

### 5. install_font (uses PowerShell Shell.Application)
Same guard pattern.

### 6. read_hosts / write_hosts (Windows path hardcoded)
```rust
let path = if cfg!(target_os = "windows") {
    "C:\\Windows\\System32\\drivers\\etc\\hosts"
} else {
    "/etc/hosts"
};
```
The write_hosts function uses PowerShell for elevation.
On Linux/macOS, use pkexec or sudo:
```rust
#[cfg(not(target_os = "windows"))]
{
    let output = Command::new("pkexec")
        .args(["cp", temp_path_str, path])
        .output()
        .map_err(|e| e.to_string())?;
}
```

### 7. secrets.rs (uses std::os::windows::process::CommandExt)
Wrap the CREATE_NO_WINDOW flag:
```rust
#[cfg(target_os = "windows")]
{
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
```

### 8. start_pty / start_multiplex_pty (uses powershell.exe as default)
Change default shell to be OS-aware:
```rust
let default_shell = if cfg!(target_os = "windows") {
    "powershell.exe"
} else if cfg!(target_os = "macos") {
    "/bin/zsh"
} else {
    "/bin/bash"
};
```

## Step 2: Frontend — Show OS-Specific Messages
In ServicesModal.tsx (if it exists), add:
```typescript
const isWindows = navigator.userAgent.includes('Windows');
if (!isWindows) {
  return <div>Services management is only available on Windows.</div>;
}
```

## Step 3: Add OS Detection Command
```rust
#[tauri::command]
pub fn get_os_info() -> serde_json::Value {
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
    })
}
```

Store this in Zustand on app startup and use it to conditionally render Windows-only features.

## Commit
git commit -m "feat(platform): add cross-platform support with OS-specific implementations"
```

---

## P4-A5 — Perf Engineer
**Model:** `inherit` | **Task:** Performance Optimization

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
Audit and optimize React performance throughout the app.

## Step 1: Add useCallback to all event handlers in App.tsx
All the handler functions (handleHashVerify, handleFormatConvert, etc.) should already
use useCallback (added in P1-A4). Verify and add any missing ones.

## Step 2: Memoize expensive computed values in FileGrid.tsx
```typescript
import { useMemo, useCallback } from 'react';

// Memoize filtered/sorted files
const filteredFiles = useMemo(() =>
  files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())),
  [files, searchQuery]
);

// Memoize loadFiles
const loadFiles = useCallback(async () => {
  // ... existing implementation
}, [currentPath]);
```

## Step 3: Add Virtual Scrolling for Large Directories
For directories with 100+ files, standard rendering is slow.
Install:
```bash
npm install @tanstack/react-virtual
```

In FileGrid.tsx, for the list view with many files:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);
const virtualizer = useVirtualizer({
  count: filteredFiles.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 56, // item height in pixels
});

return (
  <div ref={parentRef} className="overflow-y-auto flex-1" style={{ height: '100%' }}>
    <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <div
          key={virtualItem.index}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: `${virtualItem.size}px`,
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          {/* Render file item */}
        </div>
      ))}
    </div>
  </div>
);
```
Only apply virtual scrolling in list view, not grid view.

## Step 4: Fix SecretsManager re-renders
In SecretsManager.tsx, fetchKeys() is called multiple times.
Deduplicate with useCallback:
```typescript
const fetchKeys = useCallback(async () => {
  try {
    const k = await invoke<string[]>('list_secret_keys');
    setKeys(k);
    useStore.getState().setSecretsCount(k.length);
  } catch (e) {
    console.error(e);
  }
}, []);
```

## Step 5: Debounce search inputs
In any search input across the app (FileGrid filter, NetworkInterceptor filter, etc.):
```typescript
const [searchQuery, setSearchQuery] = useState('');
const debouncedQuery = useDeferredValue(searchQuery); // React 18+ built-in
// Use debouncedQuery for filtering, setSearchQuery for input onChange
```

## Step 6: Add React.memo to pure display components
Any component that receives only primitive props and doesn't use hooks:
- Wrap with React.memo()
- Examples: file cards in FileGrid, toast items, branch items in VisualGit

## Step 7: Check for Memory Leaks
Review all useEffect cleanup functions:
- Every `listen()` call (Tauri events) must have a cleanup that calls the unlisten function
- Every `setInterval` must be cleared in cleanup
- Every Yjs provider must be destroyed in cleanup

Go through these components and verify:
- CollaborativeEditor.tsx ✓ (has cleanup)
- PortTunnel.tsx — verify cleanup
- NetworkInterceptor.tsx — verify cleanup
- LogViewer.tsx — verify stop_tail_log is called on unmount
- MemoryProfiler.tsx — verify interval is cleared

## Step 8: Bundle Analysis
Run:
```bash
npm run build
npx vite-bundle-visualizer
```
Report the largest chunks and whether any should be split further.

## Commit
git commit -m "perf: add virtual scrolling, useCallback/memo, fix memory leaks, optimize re-renders"
```

---

# PHASE 5 — Docs & Release
## 3 Agents, All Parallel

> **Pre-condition:** Phases 1-4 all complete and merged.
> **Goal:** Comprehensive documentation, tests, and release pipeline.

---

## P5-A1 — README Orchestrator
**Model:** `flash` | **Task:** All Documentation

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
Your ONLY job is documentation. Do not change any code files.

## Step 1: Rewrite README.md completely

The README should be world-class, like a top GitHub project. Include:

### Structure:
```
# Vaultly — The Ultimate Offline Developer Toolkit
[Hero Screenshot or Banner]

> One app to rule them all. File management, terminals, Git, Docker, secrets, AI, and more — 
> all in a blazing-fast local desktop app built with Tauri v2 + Rust + React 19.

## ✨ Features
[Feature table with icons, organized by category]

## 📸 Screenshots
[Grid of screenshots for each major feature]

## 🚀 Quick Start
### Prerequisites
- Windows 10+ / macOS 12+ / Ubuntu 20+
- Rust (1.77+)
- Node.js (20+)
- (Optional) Git, Docker, Ollama, ripgrep

### Installation
\`\`\`bash
git clone https://github.com/MasterZ1311/Vaultly
cd Vaultly
npm install
npm run tauri dev
\`\`\`

## 🏗️ Architecture
[Architecture diagram in Mermaid]

## 📦 Building for Production
\`\`\`bash
npm run tauri build
\`\`\`

## ⌨️ Keyboard Shortcuts
[Full shortcuts table]

## 🛠️ Feature Deep Dives
Links to feature-specific docs in /docs/ folder

## 🤝 Contributing
[Contributing guidelines]

## 📄 License
MIT
```

## Step 2: Create /docs/ folder with feature docs

Create e:\Github\CodexOS\Vaultly\docs\:

- docs/FEATURES.md — Complete feature list with descriptions
- docs/KEYBOARD_SHORTCUTS.md — All keyboard shortcuts
- docs/VAULT_ENCRYPTION.md — How vault encryption works (AES-256-GCM, PBKDF2)
- docs/P2P_SYNC.md — How P2P file sync works
- docs/SECRETS_MANAGER.md — Security model for secrets
- docs/PLUGIN_SYSTEM.md — How to write a WASM plugin
- docs/CONTRIBUTING.md — Contributing guide
- docs/BUILDING.md — Detailed build instructions for all platforms
- docs/ARCHITECTURE.md — Technical architecture document with diagrams

## Step 3: Update CHANGELOG.md

Create a CHANGELOG.md in the root:
```
# Changelog

## [2.0.0] - 2026-08-XX
### Added
- Complete Tauri v2 + React 19 + Rust rewrite
- AES-256-GCM vault encryption
- In-memory secrets vault with OS keyring persistence
- Real port tunneling via SSH relay (serveo.net)
- HTTP MITM proxy with request inspection
- Real-time CRDT collaborative editing (Yjs + WebRTC)
- Local AI inference via Ollama integration
- Real AST parsing with web-tree-sitter
- Multi-tab workspace
- Global keyboard shortcuts
- First-run onboarding wizard
- Cross-platform support (Windows/macOS/Linux)
... full list of all features
```

## Step 4: Create .github/ISSUE_TEMPLATE/ files

- bug_report.md
- feature_request.md

## Step 5: Create .github/PULL_REQUEST_TEMPLATE.md

## Commit
git commit -m "docs: complete README rewrite, feature docs, CHANGELOG, GitHub templates"
```

---

## P5-A2 — Test Engineer
**Model:** `inherit` | **Task:** Tests

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The project has almost no tests. Your job: add comprehensive tests.

## Rust Tests (src-tauri/src/)

### vault.rs tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    
    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // Create a temp directory with test files
        let tmp_dir = std::env::temp_dir().join("vaultly_test");
        fs::create_dir_all(&tmp_dir).unwrap();
        fs::write(tmp_dir.join("test.txt"), "Hello, Vaultly!").unwrap();
        
        let out_vault = std::env::temp_dir().join("test.vault");
        let out_dir = std::env::temp_dir().join("vaultly_decrypted");
        
        // Encrypt
        encrypt_vault(
            tmp_dir.to_str().unwrap().to_string(),
            "test_password_123".to_string(),
            out_vault.to_str().unwrap().to_string(),
        ).expect("Encryption failed");
        
        assert!(out_vault.exists());
        
        // Decrypt
        decrypt_vault(
            out_vault.to_str().unwrap().to_string(),
            "test_password_123".to_string(),
            out_dir.to_str().unwrap().to_string(),
        ).expect("Decryption failed");
        
        let content = fs::read_to_string(out_dir.join("test.txt")).unwrap();
        assert_eq!(content, "Hello, Vaultly!");
        
        // Cleanup
        fs::remove_dir_all(tmp_dir).ok();
        fs::remove_file(out_vault).ok();
        fs::remove_dir_all(out_dir).ok();
    }
    
    #[test]
    fn test_wrong_password_fails() {
        // ... similar setup but use wrong password for decrypt
        // Should return Err
    }
}
```

### files.rs tests
```rust
#[test]
fn test_get_files_in_dir() {
    let tmp = std::env::temp_dir();
    let result = get_files_in_dir(tmp.to_str().unwrap().to_string());
    assert!(result.is_ok());
}

#[test]
fn test_create_and_delete_file() {
    let path = std::env::temp_dir().join("vaultly_test_create.txt");
    create_file(path.to_str().unwrap().to_string()).unwrap();
    assert!(path.exists());
    delete_file(path.to_str().unwrap().to_string()).unwrap();
    assert!(!path.exists());
}

#[test]
fn test_calculate_hash() {
    let path = std::env::temp_dir().join("vaultly_hash_test.txt");
    std::fs::write(&path, "hello world").unwrap();
    let hash = calculate_hash(path.to_str().unwrap().to_string(), "sha256".to_string()).unwrap();
    // Known SHA256 of "hello world"
    assert_eq!(hash, "b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576dbef0d45ae1e8a78");
    std::fs::remove_file(path).ok();
}
```

### zkp.rs — Tests already exist, verify they pass:
```bash
cargo test -p app -- zkp::tests
```

### secrets.rs — Tests:
```rust
#[test]
fn test_add_and_retrieve_secret() {
    // Use a test-specific service name to avoid polluting real keyring
    let entry = keyring::Entry::new("vaultly-test", "TEST_KEY_123").unwrap();
    entry.set_password("test_value").unwrap();
    let retrieved = entry.get_password().unwrap();
    assert_eq!(retrieved, "test_value");
    entry.delete_credential().ok();
}
```

## Frontend Tests

### Setup Vitest
```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom @vitejs/plugin-react
```

Add to vite.config.ts:
```typescript
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
}
```

Create src/test/setup.ts:
```typescript
import '@testing-library/jest-dom';
// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
```

### Test store.ts (Zustand)
```typescript
// src/test/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store/store';
import { act } from '@testing-library/react';

describe('Store', () => {
  beforeEach(() => {
    useStore.setState({
      activeApp: 'home',
      currentPath: null,
      toasts: [],
    });
  });
  
  it('should add a toast', () => {
    act(() => {
      useStore.getState().addToast({ type: 'success', title: 'Test' });
    });
    expect(useStore.getState().toasts).toHaveLength(1);
    expect(useStore.getState().toasts[0].type).toBe('success');
  });
  
  it('should remove a toast', () => {
    act(() => {
      useStore.getState().addToast({ type: 'error', title: 'Error' });
    });
    const id = useStore.getState().toasts[0].id;
    act(() => {
      useStore.getState().removeToast(id);
    });
    expect(useStore.getState().toasts).toHaveLength(0);
  });
  
  it('should navigate with history', () => {
    act(() => {
      useStore.getState().pushPath('C:\\Users');
      useStore.getState().pushPath('C:\\Users\\Documents');
    });
    expect(useStore.getState().currentPath).toBe('C:\\Users\\Documents');
    act(() => { useStore.getState().goBack(); });
    expect(useStore.getState().currentPath).toBe('C:\\Users');
  });
});
```

### Test ToastContainer
```typescript
// src/test/ToastContainer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastContainer } from '../components/ToastContainer';
import { useStore } from '../store/store';

it('renders a toast when one is in the store', () => {
  useStore.setState({
    toasts: [{ id: '1', type: 'success', title: 'Test Toast' }]
  });
  render(<ToastContainer />);
  expect(screen.getByText('Test Toast')).toBeInTheDocument();
});
```

## Step 3: Add test scripts to package.json
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest --coverage"
```

## Step 4: Run all tests and fix failures
```bash
cargo test
npm run test
```
Fix any test failures.

## Commit
git commit -m "test: add Rust unit tests for vault/files/secrets, React component tests"
```

---

## P5-A3 — Release Engineer
**Model:** `flash` | **Task:** Build & Release Pipeline

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
Set up the production build pipeline, GitHub Actions CI, and release configuration.

## Step 1: Update tauri.conf.json for production

```json
{
  "productName": "Vaultly",
  "version": "2.0.0",
  "identifier": "com.vaultly.app",
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "copyright": "© 2026 Vaultly Contributors",
    "category": "DeveloperTool",
    "shortDescription": "The Ultimate Offline Developer Toolkit",
    "longDescription": "Vaultly combines file management, terminals, Git, Docker, secrets management, local AI, and more into one blazing-fast native desktop app."
  },
  "windows": {
    "decorations": false,
    "width": 1280,
    "height": 800,
    "minWidth": 900,
    "minHeight": 600,
    "resizable": true,
    "title": "Vaultly",
    "visible": false
  }
}
```

## Step 2: Create GitHub Actions CI workflow

Create .github/workflows/build.yml:
```yaml
name: Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test-rust:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Run Rust tests
        working-directory: src-tauri
        run: cargo test

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run frontend tests
        run: npm run test
      - name: TypeScript check
        run: npx tsc --noEmit
      - name: Lint
        run: npm run lint

  build-tauri:
    needs: [test-rust, test-frontend]
    strategy:
      matrix:
        platform: [windows-latest, ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install Ubuntu deps
        if: matrix.platform == 'ubuntu-latest'
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - name: Install frontend deps
        run: npm ci
      - name: Build Tauri app
        run: npm run tauri build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: vaultly-${{ matrix.platform }}
          path: src-tauri/target/release/bundle/
```

## Step 3: Create release workflow

Create .github/workflows/release.yml:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create-release.outputs.result }}
    steps:
      - uses: actions/checkout@v4
      - name: Create Release
        id: create-release
        uses: actions/github-script@v7
        with:
          script: |
            const { data } = await github.rest.repos.createRelease({
              owner: context.repo.owner,
              repo: context.repo.repo,
              tag_name: context.ref.replace('refs/tags/', ''),
              name: `Vaultly ${context.ref.replace('refs/tags/', '')}`,
              draft: true,
              prerelease: false
            });
            return data.id;

  build-and-upload:
    needs: create-release
    strategy:
      matrix:
        platform: [windows-latest, ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: dtolnay/rust-toolchain@stable
      - name: Install Ubuntu deps
        if: matrix.platform == 'ubuntu-latest'
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          releaseId: ${{ needs.create-release.outputs.release_id }}
```

## Step 4: Create an .editorconfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{js,ts,tsx,jsx,json,css}]
indent_style = space
indent_size = 2

[*.rs]
indent_style = space
indent_size = 4

[*.toml]
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

## Step 5: Verify the full build succeeds
```bash
npm run build
# Check output in src-tauri/target/release/bundle/
```

## Commit
git commit -m "ci: add GitHub Actions build/test/release pipeline, update tauri.conf.json"
```

---

## 🏁 Final Completion Checklist

After ALL phases are complete:

### Code Quality
- [ ] `cargo check` — 0 errors, 0 warnings
- [ ] `cargo test` — all tests pass
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run lint` — 0 warnings
- [ ] `npm run test` — all tests pass
- [ ] `npm run build` — builds successfully

### Features
- [ ] Every sidebar module opens without errors
- [ ] Vault encryption: encrypt and decrypt a test folder ✅
- [ ] Secrets: add a secret, restart app, secret persists ✅
- [ ] Port tunnel: creates a real public URL ✅
- [ ] Proxy: captures HTTP traffic ✅
- [ ] Git: shows branches, diff viewer works ✅
- [ ] Docker: lists containers, start/stop works ✅
- [ ] Terminal: opens PTY, commands execute ✅
- [ ] CRDT Editor: two instances sync in real-time ✅
- [ ] Local AI: connects to Ollama if running ✅
- [ ] AST: parses TypeScript and shows tree ✅
- [ ] Dashboard: shows real CPU/memory ✅
- [ ] Settings: changes persist after restart ✅
- [ ] Tabs: multiple tabs work independently ✅
- [ ] Keyboard shortcuts: Ctrl+1-9 navigation ✅
- [ ] Onboarding: shows on first launch ✅
- [ ] Toast notifications: errors/successes show up ✅
- [ ] Window controls: close/minimize/maximize work ✅

### UX
- [ ] No hardcoded data anywhere
- [ ] No console.error-only error handling (all user-visible)
- [ ] App loads in < 2 seconds
- [ ] Switching between modules is instant (lazy loading + cache)
- [ ] No memory leaks (all subscriptions cleaned up)

### Documentation
- [ ] README.md is comprehensive with installation instructions
- [ ] CHANGELOG.md exists
- [ ] GitHub Actions CI passes
