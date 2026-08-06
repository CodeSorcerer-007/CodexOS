# 📦 Phase 1 — Foundation: Fix & Clean
## Agent Prompts (6 Agents, All Parallel)

> **Pre-condition:** None. This is the first phase.
> **Post-condition:** Clean codebase, working architecture, error system in place.
> **All agents use workspace mode: `branch`** (isolated workspace per agent).

---

## P1-A1 — Repo Janitor
**Model:** `flash` | **Priority:** Immediate | **Parallel with:** All other P1 agents

### Mission
Remove all dead code, debug artifacts, junk files, and fix project metadata. Make the repository clean and professional.

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
This is a Tauri v2 + React 19 + Rust desktop developer toolkit.

Your ONLY job is to clean up the repository. Do every step completely.

## STEP 1: Delete junk files from the repo root
Delete these files (they serve no purpose in the codebase):
- e:\Github\CodexOS\Vaultly\rustup-init.exe  (12MB binary, should never be committed)
- e:\Github\CodexOS\Vaultly\fix.py
- e:\Github\CodexOS\Vaultly\refactor_tabs.cjs
- e:\Github\CodexOS\Vaultly\refactor_tabs.py
- e:\Github\CodexOS\Vaultly\src-tauri\boot_trace.txt
- e:\Github\CodexOS\Vaultly\src-tauri\out.txt

## STEP 2: Update .gitignore
Open e:\Github\CodexOS\Vaultly\.gitignore and add these entries if not present:
- *.exe (executables)
- *.pdb
- boot_trace.txt
- out.txt
- *.py (migration scripts)
- *.cjs (migration scripts — note: do NOT exclude production .cjs like postcss.config.js, be specific)

Actually be precise: add only:
```
# Dev artifacts
rustup-init.exe
boot_trace.txt
out.txt
fix.py
refactor_tabs.cjs
refactor_tabs.py
```

## STEP 3: Fix Cargo.toml metadata
Open e:\Github\CodexOS\Vaultly\src-tauri\Cargo.toml and update:
- name: "vaultly"
- description: "Vaultly — The Ultimate Offline Developer Toolkit. Built with Tauri v2 + Rust + React."
- authors: ["Vaultly Contributors"]
- license: "MIT"
- repository: "https://github.com/MasterZ1311/Vaultly"
- version: "2.0.0"

## STEP 4: Remove dead front-end components (move to _archive, don't delete in case they're needed)
These components are NOT imported or used anywhere in App.tsx or by any other component.
Create a folder: e:\Github\CodexOS\Vaultly\src\components\_archive\
Move (not delete) these files there:
- AnimatedSidebar.tsx (sidebar is now inlined in App.tsx)
- ShelfDock.tsx
- FABMenu.tsx
- ColorBoardOverlay.tsx
- TelemetryOverlay.tsx
- ProjectTasksSidebar.tsx
- InteractiveDriveCard.tsx
- LocalServerModal.tsx

To verify a component is truly unused before moving: search with grep for its export name being imported anywhere in src/.

## STEP 5: Remove the vestigial Tab interface
Open e:\Github\CodexOS\Vaultly\src\App.tsx.
The `Tab` interface (lines 30-35) defines `id` and `name` fields that are never used — the sidebar
now uses `activeApp` string IDs directly. Remove the `id` and `name` fields from the Tab interface,
leaving only:
```typescript
export interface Tab {
  activeApp: 'home' | 'files' | 'docker' | 'network' | 'database' | 'git' | 'devdocs' | 'terminal' | 'automation' | 'plugins' | 'sandbox' | 'ai' | 'memory' | 'market' | 'ast' | 'zkp' | 'gpu' | 'crdt' | 'secrets' | 'tunnel';
  currentPath: string | null;
}
```
Wait — actually check if removing `id` and `name` breaks any imports. VaultlyDashboard.tsx imports
`Tab` type. After removing, verify that file still compiles.

## STEP 6: Update package.json version
Change `"version": "0.0.0"` to `"version": "2.0.0"` in e:\Github\CodexOS\Vaultly\package.json.

## STEP 7: Verify
Run: npm run lint
Run: npx tsc --noEmit
Report any errors. Fix them if they are caused by your changes.

## STEP 8: Commit
git add -A
git commit -m "chore(repo): remove junk files, fix metadata, archive unused components"
```

---

## P1-A2 — Rust Splitter
**Model:** `inherit` | **Priority:** High | **Parallel with:** All other P1 agents

### Mission
Break the monolithic 1353-line `lib.rs` into clean, domain-specific modules. This is critical for maintainability.

### Full Prompt

```
You are working on e:\Github\CodexOS\Vaultly\src-tauri\src\.
The file lib.rs is 1353 lines with 50+ Tauri commands all in one file. This is unmaintainable.

Your job: split lib.rs into clean domain modules WITHOUT changing any functionality.
Every command that worked before must still work identically after your refactor.

## Target Module Structure

After your refactor, src-tauri/src/ should look like:
```
src-tauri/src/
├── lib.rs              (only: use statements, shared structs, pub fn run())
├── main.rs             (unchanged)
├── vault.rs            (unchanged - already exists)
├── secrets.rs          (unchanged - already exists)
├── zkp.rs              (unchanged - already exists)
├── multiplexer.rs      (unchanged - already exists)
├── proxy.rs            (unchanged - already exists)
├── tunnel.rs           (unchanged - already exists)
├── plugin.rs           (unchanged - already exists)
├── db.rs               (unchanged - already exists)
├── devdocs.rs          (unchanged - already exists)
├── sys.rs              (unchanged - already exists)
├── files.rs            (NEW - file system operations)
├── git.rs              (NEW - all git commands)
├── docker.rs           (NEW - docker commands)
├── ports.rs            (NEW - port management, local server)
├── system_tools.rs     (NEW - services, env vars, hosts, wsl)
├── archive.rs          (NEW - zip operations)
├── crypto_tools.rs     (NEW - hash, SSL cert, image optimize, format convert)
└── ssh.rs              (NEW - SSH commands)
```

## Commands to Move to Each New File

### files.rs
Move these commands from lib.rs:
- get_drives()
- read_file_text()
- read_file_binary()
- write_file_binary_webrtc()
- get_current_dir()
- get_files_in_dir()
- scan_dev_bloat()
- purge_directories()
- bulk_rename()
- find_duplicates()
- copy_file()
- move_file()
- delete_file()
- get_treemap_data() (and its helper build_tree())
- get_code_metrics() (and its internal scan_dir())

Also move these structs to files.rs (and pub use them from lib.rs):
- DriveInfo
- BloatItem
- FileInfo
- SearchResult (used by search but move with files)
- TreeMapNode
- CodeMetrics
- DuplicateGroup

### git.rs
Move these commands:
- get_git_status()
- git_action()
- git_history()
- git_show()
- search_contents() (uses ripgrep, naturally lives here)

Move struct:
- GitCommitInfo

### docker.rs
Move:
- get_docker_containers()

Move struct:
- DockerContainer

### ports.rs
Move:
- get_active_ports()
- kill_process()
- spawn_local_server()
- start_tail_log()
- stop_tail_log()
- execute_http_request()

Move struct:
- PortInfo

Move state:
- TailState

### system_tools.rs
Move:
- get_env_vars()
- set_env_var()
- delete_env_var()
- get_services()
- manage_service()
- list_wsl_distros()
- get_project_tasks()
- read_hosts()
- write_hosts()
- install_font()

Move struct:
- WindowsService

### archive.rs
Move:
- list_zip_contents()
- read_zip_file()

Move struct:
- ZipEntryInfo

### crypto_tools.rs
Move:
- calculate_hash()
- optimize_image()
- convert_format()
- inspect_ssl_cert()

### ssh.rs
Move:
- ssh_list_dir()
- ssh_read_file_text()

## Instructions for Each New File

For each new file (e.g., files.rs):
1. Add the necessary `use` imports at the top (copy from lib.rs what's needed for those functions).
2. Make all structs `pub`.
3. Make all command functions `pub`.
4. At the top of each file add: `#[allow(dead_code)]` only if needed.

## New lib.rs Structure

After extraction, lib.rs should contain ONLY:
1. All `mod` declarations for the new modules.
2. Any shared state structs that multiple modules use (PtyState, SysState, NetState).
3. The `pub fn run()` function with ALL invoke_handler! entries updated to use module paths.
4. The minimum necessary `use` imports.

## PtyState
Keep PtyState in lib.rs (it's used by start_pty/write_pty which are superseded but keep for compatibility).
Actually — start_pty and write_pty ARE superseded by multiplexer. Keep them in lib.rs as deprecated
commands for now (they'll be removed in a later phase).

## invoke_handler Update
In the pub fn run() function, update all command references to use their module path:
```rust
files::get_drives,
files::get_files_in_dir,
// etc.
```

## Verification Steps
After refactoring:
1. Run: cargo check
   - Fix ALL compilation errors before proceeding.
2. Run: cargo build (debug build to catch runtime issues)
3. Verify the invoke_handler! macro has all commands listed.

## Common Pitfalls
- Circular imports: if files.rs needs SearchResult but git.rs also needs it, keep shared structs in lib.rs.
- Missing use statements: copy ALL use lines that each extracted function needs.
- Private vs public: all moved functions and structs must be `pub`.

## Commit
git commit -m "refactor(rust): split monolithic lib.rs into domain modules"
```

---

## P1-A3 — Toast Architect
**Model:** `inherit` | **Priority:** CRITICAL (others depend on this) | **Parallel with:** P1 agents (but others should wait to wire errors until this is done)

### Mission
Build a global, beautiful toast notification system from scratch. This is the most important Phase 1 task — every other agent's error handling depends on it.

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
This is a Tauri v2 + React 19 desktop app with Tailwind v4, Framer Motion, and Zustand.

Your job: Build a complete, production-grade global toast notification system.

## Requirements
- Toast types: success, error, warning, info
- Toasts appear in bottom-right corner of screen
- Slide-in animation from right, slide-out when dismissed
- Auto-dismiss after configurable duration (default: 4 seconds for success/info, 6 for error/warning)
- Max 4 toasts visible at once (queue older ones)
- Click to dismiss
- Shows an icon matching the type
- No external library — build it with Framer Motion + Tailwind

## Step 1: Expand the Zustand Store
Open e:\Github\CodexOS\Vaultly\src\store\store.ts and add toast state:

```typescript
import { create } from 'zustand';
import type { Tab } from '../App';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = never auto-dismiss
}

interface DashboardState {
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  toasts: Toast[];
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<DashboardState>((set) => ({
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
  toasts: [],
  setActiveApp: (app) => set({ activeApp: app }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  addToast: (toast) => set((state) => ({
    toasts: [
      ...state.toasts.slice(-3), // keep last 3, add new = max 4
      { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    ]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  })),
}));

// Convenience hook for triggering toasts
export const useToast = () => {
  const addToast = useStore((s) => s.addToast);
  return {
    success: (title: string, message?: string) => addToast({ type: 'success', title, message, duration: 4000 }),
    error: (title: string, message?: string) => addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (title: string, message?: string) => addToast({ type: 'warning', title, message, duration: 5000 }),
    info: (title: string, message?: string) => addToast({ type: 'info', title, message, duration: 4000 }),
  };
};
```

## Step 2: Create the ToastContainer Component
Create e:\Github\CodexOS\Vaultly\src\components\ToastContainer.tsx:

The component must:
- Read `toasts` and `removeToast` from useStore
- Render toasts in the bottom-right corner (fixed position, z-index 9999)
- Each toast has:
  - Background: glassmorphism style matching the app (dark, blurred)
  - Left colored border: green for success, red for error, amber for warning, blue for info
  - Icon (use lucide-react): CheckCircle2 (success), XCircle (error), AlertTriangle (warning), Info (info)
  - Title in white bold text
  - Optional message in gray-400 text
  - X button to dismiss
  - Animated progress bar at the bottom showing time remaining
- Use Framer Motion AnimatePresence for slide-in/slide-out
- Entry animation: x: 100 -> x: 0, opacity: 0 -> 1
- Exit animation: x: 100, opacity: 0
- Auto-dismiss: use useEffect with setTimeout; on mount start timer, on unmount clear it
- The progress bar shrinks from 100% to 0% over the toast duration using CSS animation

Make it look absolutely premium. Use these Tailwind classes as guidance:
- Container: fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end
- Each toast: relative w-80 bg-[#0f0f0f]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden
- Add a subtle glow shadow matching the toast type color

## Step 3: Create Individual Toast Item Component
Inside ToastContainer.tsx, create a ToastItem sub-component that:
1. Receives the toast data and a remove function
2. Manages its own dismissal timer with useEffect
3. Has the animated shrinking progress bar
4. Handles click-to-dismiss on the whole toast

## Step 4: Mount ToastContainer in App.tsx
Open e:\Github\CodexOS\Vaultly\src\App.tsx.
At the very end of the returned JSX (inside the outermost div, after </main>), add:
```tsx
<ToastContainer />
```
Import ToastContainer at the top.

## Step 5: Update ErrorBoundary to use Toast
Open e:\Github\CodexOS\Vaultly\src\components\ErrorBoundary.tsx.
The ErrorBoundary currently shows a fallback UI. Keep the fallback UI but also:
- After catching an error, if possible call useStore.getState().addToast({ type: 'error', title: 'Module Error', message: error.message })
- Note: ErrorBoundary is a class component, so you can call useStore.getState() directly (not a hook).

## Step 6: Write a quick usage example comment at the top of store.ts
```typescript
// Usage: const { success, error } = useToast();
// success('File saved!');
// error('Operation failed', err.message);
```

## Step 7: Verify
Run: npx tsc --noEmit
Fix all type errors.
Run: npm run lint

## Commit
git commit -m "feat(ui): add global toast notification system with Zustand + Framer Motion"
```

---

## P1-A4 — Window Fix
**Model:** `flash` | **Priority:** High | **Parallel with:** All other P1 agents

### Mission
Fix the broken Tauri v2 window controls and wire the currently-broken FileGrid optional props.

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
This is a Tauri v2 + React 19 desktop app.

## TASK 1: Fix Window Controls in App.tsx

Open e:\Github\CodexOS\Vaultly\src\App.tsx.

Current broken code (around line 166-168):
```tsx
<button onClick={() => invoke('plugin:window|close')} ... />
<button onClick={() => invoke('plugin:window|minimize')} ... />
<button onClick={() => invoke('plugin:window|maximize')} ... />
```

This is not valid Tauri v2 API. Replace with:

First, add this import at the top of App.tsx:
```tsx
import { getCurrentWindow } from '@tauri-apps/api/window';
```

Then replace the onClick handlers:
```tsx
<button onClick={() => getCurrentWindow().close()} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 cursor-pointer ml-2 transition-colors" />
<button onClick={() => getCurrentWindow().minimize()} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 cursor-pointer ml-2 transition-colors" />
<button onClick={() => getCurrentWindow().toggleMaximize()} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 cursor-pointer ml-2 transition-colors" />
```

Remove the now-unused `invoke` import from `@tauri-apps/api/core` only if it is not used elsewhere
in App.tsx. Check: `invoke` IS used in some other files but check App.tsx specifically.

## TASK 2: Wire FileGrid Optional Props in App.tsx

The FileGrid component accepts these optional callback props that are currently NEVER passed from App.tsx:
- onHashVerify?: (path: string) => void
- onFormatConvert?: (path: string, targetFormat: string) => void
- onAddToShelf?: (path: string) => void  
- onOptimizeAsset?: (path: string) => void

These callbacks are connected to context menu items in FileGrid. When App.tsx doesn't pass them,
those menu items silently do nothing.

In App.tsx, find where FileGrid is rendered (in renderApp switch, case 'files'):
```tsx
case 'files': return <FileGrid currentPath={currentPath || ""} onNavigate={setCurrentPath} selectedFile={selectedFile} onSelect={setSelectedFile} />;
```

Replace with handlers that actually do something useful.
Add these imports/state at the top of the App function (after existing useStore calls):

For hash verify and format convert and optimize, we need to invoke Tauri commands. For now,
we'll show a success message using console (the toast system from P1-A3 will be added later).

Add these handler functions inside the App component:
```tsx
const handleHashVerify = useCallback(async (path: string) => {
  try {
    const hash = await invoke<string>('calculate_hash', { path, algorithm: 'sha256' });
    // Will use toast after P1-A3 merges, for now alert
    alert(`SHA256: ${hash}`);
  } catch (e) {
    alert(`Hash error: ${e}`);
  }
}, []);

const handleFormatConvert = useCallback(async (path: string, targetFormat: string) => {
  try {
    const newPath = await invoke<string>('convert_format', { path, targetFormat });
    alert(`Converted: ${newPath}`);
  } catch (e) {
    alert(`Convert error: ${e}`);
  }
}, []);

const handleOptimizeAsset = useCallback(async (path: string) => {
  try {
    const result = await invoke<string>('optimize_image', { path });
    alert(result);
  } catch (e) {
    alert(`Optimize error: ${e}`);
  }
}, []);
```

Note: Add `import { useCallback } from 'react';` — update the existing React import.
Also add `import { invoke } from '@tauri-apps/api/core';` if not already imported.

Then update the FileGrid render:
```tsx
case 'files': return (
  <FileGrid
    currentPath={currentPath || ""}
    onNavigate={setCurrentPath}
    selectedFile={selectedFile}
    onSelect={setSelectedFile}
    onHashVerify={handleHashVerify}
    onFormatConvert={handleFormatConvert}
    onOptimizeAsset={handleOptimizeAsset}
    onAddToShelf={(path) => alert(`Added to shelf: ${path}`)} // placeholder until ShelfDock is implemented
  />
);
```

## TASK 3: Check tauri.conf.json for decorations
Open e:\Github\CodexOS\Vaultly\src-tauri\tauri.conf.json.
Make sure the window has:
```json
"decorations": false
```
If it's not set or set to true, set it to false so the custom title bar is used.

## TASK 4: Verify
Run: npx tsc --noEmit
Run: cargo check
Report and fix any errors.

## Commit
git commit -m "fix(ui): fix Tauri v2 window controls, wire FileGrid callbacks"
```

---

## P1-A5 — Store Expander
**Model:** `inherit` | **Priority:** High | **Parallel with:** All other P1 agents

### Mission
Expand the Zustand store to hold all meaningful shared application state. Currently the store has only 3 fields; dozens of components each manage their own isolated state for things that should be shared.

### Full Prompt

```
You are working on the Vaultly project at e:\Github\CodexOS\Vaultly.
The app uses Zustand for state management (src/store/store.ts).
Currently the store only has 3 fields. You need to expand it significantly.

IMPORTANT: The P1-A3 agent (Toast Architect) is also modifying store.ts.
If that agent has already added toast state, do NOT remove it. Add your new state
alongside the existing state.

## New State to Add to the Store

### 1. Navigation State
```typescript
// Breadcrumb history for back/forward navigation in file browser
pathHistory: string[];
historyIndex: number;
pushPath: (path: string) => void;
goBack: () => void;
goForward: () => void;
canGoBack: boolean;
canGoForward: boolean;
```

### 2. Git State
```typescript
// Shared git status so FileGrid and VisualGit stay in sync
gitRepoPath: string | null;
setGitRepoPath: (path: string | null) => void;
```

### 3. Active Tunnels Badge
```typescript
// Number of active tunnels - shown as badge on sidebar icon
activeTunnelCount: number;
setActiveTunnelCount: (count: number) => void;
```

### 4. Active Secrets Badge
```typescript
// Number of secrets in memory vault - shown as badge
secretsCount: number;
setSecretsCount: (count: number) => void;
```

### 5. Settings State
```typescript
// Persisted settings (will be saved to localStorage)
settings: {
  defaultPath: string;
  terminalShell: 'powershell' | 'cmd' | 'wsl';
  theme: 'dark'; // only dark for now, future expansion
  sidebarCollapsed: boolean;
};
updateSettings: (partial: Partial<DashboardState['settings']>) => void;
```

### 6. SSH Connections
```typescript
// Recently used SSH connections
sshConnections: string[];
addSshConnection: (connection: string) => void;
```

## Implementation Details

For settings, persist to localStorage using Zustand's subscribe:
```typescript
// After creating the store, add persistence:
useStore.subscribe((state) => {
  localStorage.setItem('vaultly-settings', JSON.stringify(state.settings));
});

// Initialize from localStorage:
const savedSettings = localStorage.getItem('vaultly-settings');
// Use in the initial state
```

For pathHistory navigation:
```typescript
pushPath: (path) => set((state) => {
  const newHistory = [...state.pathHistory.slice(0, state.historyIndex + 1), path];
  return {
    pathHistory: newHistory,
    historyIndex: newHistory.length - 1,
    currentPath: path,
    canGoBack: newHistory.length > 1,
    canGoForward: false,
  };
}),
goBack: () => set((state) => {
  if (!state.canGoBack) return state;
  const newIndex = state.historyIndex - 1;
  return {
    historyIndex: newIndex,
    currentPath: state.pathHistory[newIndex],
    canGoBack: newIndex > 0,
    canGoForward: true,
  };
}),
goForward: () => set((state) => {
  if (!state.canGoForward) return state;
  const newIndex = state.historyIndex + 1;
  return {
    historyIndex: newIndex,
    currentPath: state.pathHistory[newIndex],
    canGoBack: true,
    canGoForward: newIndex < state.pathHistory.length - 1,
  };
}),
```

## Verify Current Store Usage
Before changing setCurrentPath, make sure all components that currently call setCurrentPath
will still work. The `setCurrentPath` can now call `pushPath` internally:
```typescript
setCurrentPath: (path) => {
  if (path === null) return;
  useStore.getState().pushPath(path);
},
```

## Also Update App.tsx
In App.tsx, update the back/forward navigation. The navigation area in the FileGrid toolbar
should use the new store methods. Check if FileGrid accepts back/forward props and update accordingly.

## Type Safety
Make sure the full DashboardState interface is properly typed with all new fields.
Export types that might be needed by components:
```typescript
export type { DashboardState };
```

## Verify
Run: npx tsc --noEmit
Fix all type errors — none should remain.

## Commit
git commit -m "feat(store): expand Zustand store with navigation, settings, badges, SSH state"
```

---

## P1-A6 — Icon Cleanup
**Model:** `flash` | **Priority:** Low | **Parallel with:** All other P1 agents

### Mission
Replace the 4 inline SVG function components in App.tsx with proper lucide-react imports.

### Full Prompt

```
You are working on e:\Github\CodexOS\Vaultly\src\App.tsx.
The file has 4 hand-written SVG icon functions that are redundant (lines 59-62):
- function Activity(props: any) { return <svg>...</svg>; }
- function Users(props: any) { return <svg>...</svg>; }
- function Cpu(props: any) { return <svg>...</svg>; }
- function Store(props: any) { return <svg>...</svg>; }

These shadow the lucide-react icons with the same names.

## Task
1. Check the current lucide-react version in package.json. Version ^1.28.0 is installed.
   Verify that Activity, Users, Cpu, and Store exist in this version by checking the
   import from 'lucide-react' — if they exist, use them.

2. Update the import at line 4 in App.tsx:
   Current: `import { LayoutDashboard, HardDrive, Network, GitBranch, TerminalSquare, Settings, Workflow, Box, ShieldAlert, Zap, Layers, MonitorPlay, Key, Webhook } from 'lucide-react';`
   New: Add Activity, Users, Cpu, Store (and remove duplicates):
   `import { LayoutDashboard, HardDrive, Network, GitBranch, TerminalSquare, Settings, Workflow, Box, ShieldAlert, Zap, Layers, MonitorPlay, Key, Webhook, Activity, Users, Cpu, Store } from 'lucide-react';`

3. Delete the 4 inline function definitions (lines 59-62 approximately).

4. Verify that SIDEBAR_ITEMS still renders correctly — the icon JSX like `<Activity size={20} />`
   should now use the lucide version, which works identically.

5. Also check VaultlyDashboard.tsx — it imports Activity from lucide-react separately.
   Since App.tsx was defining its own Activity, there might be a conflict. Check that
   VaultlyDashboard.tsx uses `import { Activity } from 'lucide-react'` directly and keep that.

## Verify
Run: npx tsc --noEmit
Run: npm run lint
No errors should remain.

## Commit
git commit -m "fix(ui): replace inline SVG icon components with lucide-react imports"
```

---

## Phase 1 Completion Checklist

After all 6 agents complete, verify:
- [ ] `cargo check` — 0 errors
- [ ] `npx tsc --noEmit` — 0 errors  
- [ ] `npm run lint` — 0 errors
- [ ] `npm run build` — builds successfully
- [ ] `rustup-init.exe` is gone from the repo
- [ ] `lib.rs` is under 200 lines
- [ ] Toast notification appears when you trigger an error
- [ ] Window close/minimize/maximize buttons work
- [ ] FileGrid context menu actions work (hash, convert, optimize)
- [ ] No dead component files in `src/components/` (moved to `_archive/`)

## Next Step
After Phase 1 is verified: **Launch all 7 Phase 2 agents simultaneously.**
