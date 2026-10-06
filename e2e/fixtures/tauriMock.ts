/* oxlint-disable react-hooks/rules-of-hooks, no-useless-escape */
import { test as base, expect, type Page } from '@playwright/test';

export interface DriveInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

export interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface GitStatusMock {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface MockOptions {
  vaultLocked?: boolean;
  masterPassword?: string;
  currentPath?: string | null;
  drives?: DriveInfo[];
  files?: Record<string, FileInfo[]>;
  gitStatus?: GitStatusMock;
  branches?: { name: string; hash?: string; is_current?: boolean; is_remote?: boolean; current?: boolean }[];
  history?: { hash: string; message: string; author: string; timestamp: number }[];
  fileContents?: Record<string, string>;
  activePorts?: { port: number; process: string; pid: number; protocol: string }[];
  skipOnboarding?: boolean;
}

export const DEFAULT_DRIVES: DriveInfo[] = [
  {
    name: 'Local Disk (C:)',
    mount_point: 'C:',
    total_space: 512 * 1024 * 1024 * 1024,
    available_space: 256 * 1024 * 1024 * 1024,
  },
  {
    name: 'Data (D:)',
    mount_point: 'D:',
    total_space: 1024 * 1024 * 1024 * 1024,
    available_space: 800 * 1024 * 1024 * 1024,
  },
];

export const DEFAULT_FILES: Record<string, FileInfo[]> = {
  'This PC': [],
  'C:': [
    { name: 'workspace', path: 'C:/workspace', is_dir: true, size_bytes: 0 },
    { name: 'Users', path: 'C:/Users', is_dir: true, size_bytes: 0 },
    { name: 'Program Files', path: 'C:/Program Files', is_dir: true, size_bytes: 0 },
    { name: 'system.log', path: 'C:/system.log', is_dir: false, size_bytes: 1420 },
  ],
  'C:/workspace': [
    { name: 'src', path: 'C:/workspace/src', is_dir: true, size_bytes: 0 },
    { name: 'docs', path: 'C:/workspace/docs', is_dir: true, size_bytes: 0 },
    { name: 'package.json', path: 'C:/workspace/package.json', is_dir: false, size_bytes: 1847 },
    { name: 'README.md', path: 'C:/workspace/README.md', is_dir: false, size_bytes: 4210 },
    { name: 'tsconfig.json', path: 'C:/workspace/tsconfig.json', is_dir: false, size_bytes: 650 },
  ],
  'C:/workspace/src': [
    { name: 'components', path: 'C:/workspace/src/components', is_dir: true, size_bytes: 0 },
    { name: 'App.tsx', path: 'C:/workspace/src/App.tsx', is_dir: false, size_bytes: 8198 },
    { name: 'main.tsx', path: 'C:/workspace/src/main.tsx', is_dir: false, size_bytes: 520 },
    { name: 'ipc.ts', path: 'C:/workspace/src/ipc.ts', is_dir: false, size_bytes: 4528 },
  ],
  'C:/workspace/docs': [
    { name: 'ARCHITECTURE.md', path: 'C:/workspace/docs/ARCHITECTURE.md', is_dir: false, size_bytes: 12400 },
    { name: 'API.md', path: 'C:/workspace/docs/API.md', is_dir: false, size_bytes: 8600 },
  ],
};

export const DEFAULT_GIT_STATUS: GitStatusMock = {
  branch: 'main',
  staged: [],
  unstaged: ['src/App.tsx', 'package.json'],
  untracked: ['src/new_feature.ts'],
};

/**
 * Injects a comprehensive Tauri 2 browser IPC mock into the page.
 */
export async function setupTauriMock(page: Page, options: MockOptions = {}): Promise<void> {
  const mergedOptions = {
    vaultLocked: options.vaultLocked ?? false,
    masterPassword: options.masterPassword ?? 'secret123',
    currentPath: options.currentPath !== undefined ? options.currentPath : 'C:/workspace',
    drives: options.drives ?? DEFAULT_DRIVES,
    files: options.files ?? DEFAULT_FILES,
    gitStatus: options.gitStatus ?? { ...DEFAULT_GIT_STATUS },
    branches: (options.branches ?? [
      { name: 'main', hash: 'e2e789a123', is_current: true, is_remote: false },
      { name: 'feature/e2e-testing', hash: 'b456cde789', is_current: false, is_remote: false },
      { name: 'release/v2.2.0', hash: 'a123f01456', is_current: false, is_remote: false },
    ]).map((b) => ({
      name: b.name,
      hash: b.hash ?? '0000000',
      is_current: b.is_current ?? b.current ?? false,
      is_remote: b.is_remote ?? false,
    })),
    history: options.history ?? [
      { hash: 'e2e789a', message: 'feat: add automated e2e testing suite', author: 'CodexOS Team', timestamp: 1728000000 },
      { hash: 'b456cde', message: 'fix: harden IPC isolation boundary', author: 'CodexOS Security', timestamp: 1727900000 },
      { hash: 'a123f01', message: 'chore: initial v2.2.0 release prep', author: 'Release Bot', timestamp: 1727800000 },
    ],
    fileContents: options.fileContents ?? {
      'C:/workspace/README.md': '# CodexOS\nPrivacy-first developer operating environment.',
      'C:/workspace/package.json': '{\n  "name": "codexos",\n  "version": "2.2.0"\n}\n',
    },
    activePorts: options.activePorts ?? [
      { port: 1420, process: 'vite', pid: 1042, protocol: 'tcp' },
      { port: 3000, process: 'node', pid: 2048, protocol: 'tcp' },
      { port: 5432, process: 'postgres', pid: 3100, protocol: 'tcp' },
    ],
    skipOnboarding: options.skipOnboarding ?? true,
  };

  await page.addInitScript((mockState) => {
    if (mockState.skipOnboarding) {
      localStorage.setItem('codexos-onboarded', 'true');
    }

    // Set initial path in localStorage if needed by store
    const initialSettings = {
      theme: 'dark',
      terminalShell: 'bash',
      recentWorkspaces: [
        { path: 'C:/workspace', name: 'CodexOS Core' },
        { path: 'C:/Users/demo/project', name: 'Demo Project' },
      ],
    };
    if (!localStorage.getItem('codexos-settings')) {
      localStorage.setItem('codexos-settings', JSON.stringify(initialSettings));
    }

    if (!localStorage.getItem('codexos-tabs') && mockState.currentPath) {
      localStorage.setItem(
        'codexos-tabs',
        JSON.stringify({
          tabs: [
            {
              id: 'tab-1',
              activeApp: 'home',
              currentPath: mockState.currentPath,
              selectedFile: null,
              openFiles: [],
              pathHistory: [mockState.currentPath],
              historyIndex: 0,
            },
          ],
          activeTabId: 'tab-1',
        })
      );
    }

    // Callbacks & listeners registry
    let callbackIdCounter = 0;
    const listeners: Record<string, { id: number; handler: number }[]> = {};

    const emitEvent = (eventName: string, payload: unknown) => {
      const list = listeners[eventName] || [];
      for (const item of list) {
        const fn = (window as unknown as Record<string, (arg: unknown) => void>)[`_${item.handler}`];
        if (typeof fn === 'function') {
          fn({ event: eventName, payload, id: item.id });
        }
      }
    };

    const state = {
      vaultLocked: mockState.vaultLocked,
      masterPassword: mockState.masterPassword,
      currentPath: mockState.currentPath,
      drives: mockState.drives,
      files: { ...mockState.files },
      gitStatus: {
        branch: mockState.gitStatus.branch,
        staged: [...mockState.gitStatus.staged],
        unstaged: [...mockState.gitStatus.unstaged],
        untracked: [...mockState.gitStatus.untracked],
      },
      branches: [...mockState.branches],
      history: [...mockState.history],
      fileContents: { ...mockState.fileContents },
      activePorts: [...mockState.activePorts],
      ptySessions: new Set<string>(),
      kv: {
        'codexos-onboarded': 'true',
        'codexos-settings': JSON.stringify(initialSettings),
      } as Record<string, string>,
    };

    // Expose mock state and event emitter to window for test manipulation
    (window as unknown as Record<string, unknown>).__TAURI_MOCK_STATE__ = state;
    (window as unknown as Record<string, unknown>).__TAURI_MOCK_EMIT__ = emitEvent;

    // Tauri 2 Internals Structure
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' },
      },
      transformCallback: (callback: (data: unknown) => void, once = false) => {
        const id = ++callbackIdCounter;
        (window as unknown as Record<string, (arg: unknown) => void>)[`_${id}`] = (res: unknown) => {
          callback(res);
          if (once) {
            delete (window as unknown as Record<string, (arg: unknown) => void>)[`_${id}`];
          }
        };
        return id;
      },
      unregisterCallback: (id: number) => {
        delete (window as unknown as Record<string, (arg: unknown) => void>)[`_${id}`];
      },
      convertFileSrc: (filePath: string) => filePath,
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        switch (cmd) {
          // --- Window Management ---
          case 'plugin:window|is_maximized':
            return false;
          case 'plugin:window|minimize':
          case 'plugin:window|maximize':
          case 'plugin:window|toggle_maximize':
          case 'plugin:window|close':
          case 'window_minimize':
          case 'window_toggle_maximize':
          case 'window_close':
            return null;

          // --- Events Plugin ---
          case 'plugin:event|listen': {
            const eventName = args.event as string;
            const handlerId = args.handler as number;
            const id = ++callbackIdCounter;
            if (!listeners[eventName]) listeners[eventName] = [];
            listeners[eventName].push({ id, handler: handlerId });
            return id;
          }
          case 'plugin:event|unlisten': {
            const eventName = args.event as string;
            const eventId = args.eventId as number;
            if (listeners[eventName]) {
              listeners[eventName] = listeners[eventName].filter((l) => l.id !== eventId);
            }
            return null;
          }
          case 'plugin:event|emit': {
            const eventName = args.event as string;
            emitEvent(eventName, args.payload);
            return null;
          }

          // --- Vault Management ---
          case 'is_vault_locked':
            return state.vaultLocked;
          case 'unlock_vault': {
            const password = args.password as string;
            if (password === state.masterPassword) {
              state.vaultLocked = false;
              return true;
            }
            return false;
          }
          case 'lock_vault':
            state.vaultLocked = true;
            return true;

          case 'list_secret_keys':
            return [];
          case 'add_secret':
          case 'remove_secret':
          case 'has_secret':
            return null;

          // --- System Telemetry & System Stats ---
          case 'get_sys_stats':
            return {
              cpu_usage: 18.5,
              mem_total: 16 * 1024 * 1024 * 1024,
              mem_used: 7 * 1024 * 1024 * 1024,
              drives: state.drives,
            };
          case 'get_drives':
            return state.drives;
          case 'get_api_version':
            return '2.2.0';
          case 'get_current_dir':
            return state.currentPath || 'C:/workspace';
          case 'get_allowed_paths':
            return ['C:/workspace', 'C:'];
          case 'add_allowed_path':
          case 'remove_allowed_path':
            return null;

          // --- File Workspace ---
          case 'get_files_in_dir': {
            const path = (args.path as string) || '';
            const normalized = path.replace(/\\/g, '/').replace(/\/$/, '');
            if (state.files[path]) return state.files[path];
            if (state.files[normalized]) return state.files[normalized];
            // If matching drive or subfolder
            for (const key of Object.keys(state.files)) {
              if (key.toLowerCase() === normalized.toLowerCase()) {
                return state.files[key];
              }
            }
            return [];
          }
          case 'get_file_info': {
            const path = args.path as string;
            const name = path.split(/[\/\\]/).pop() || path;
            return {
              name,
              path,
              is_dir: false,
              size_bytes: 1024,
            };
          }
          case 'read_file_text': {
            const path = args.path as string;
            return state.fileContents[path] || '// Mock file content\nconsole.log("CodexOS");\n';
          }
          case 'write_file_text': {
            const path = args.path as string;
            const content = args.content as string;
            state.fileContents[path] = content;
            return null;
          }
          case 'create_file': {
            const path = args.path as string;
            const name = path.split(/[\/\\]/).pop() || path;
            const dir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
            const list = state.files[dir] || [];
            list.push({ name, path, is_dir: false, size_bytes: 0 });
            state.files[dir] = list;
            return null;
          }
          case 'create_directory': {
            const path = args.path as string;
            const name = path.split(/[\/\\]/).pop() || path;
            const dir = path.substring(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')));
            const list = state.files[dir] || [];
            list.push({ name, path, is_dir: true, size_bytes: 0 });
            state.files[dir] = list;
            state.files[path] = [];
            return null;
          }
          case 'delete_file': {
            const path = args.path as string;
            for (const dir of Object.keys(state.files)) {
              state.files[dir] = state.files[dir].filter((f) => f.path !== path);
            }
            return null;
          }
          case 'rename_path': {
            const oldPath = args.oldPath as string;
            const newPath = args.newPath as string;
            const newName = newPath.split(/[\/\\]/).pop() || newPath;
            for (const dir of Object.keys(state.files)) {
              for (const f of state.files[dir]) {
                if (f.path === oldPath) {
                  f.path = newPath;
                  f.name = newName;
                }
              }
            }
            return null;
          }

          // --- Terminal PTY Multiplexer ---
          case 'start_multiplex_pty': {
            const id = args.id as string;
            state.ptySessions.add(id);
            // Simulate initial shell prompt delivery via pty-output event
            setTimeout(() => {
              emitEvent(`pty-output-${id}`, '\r\n\x1b[36mCodexOS Terminal v2.2.0 (PTY ready)\x1b[0m\r\nuser@codexos:~$ ');
            }, 30);
            return null;
          }
          case 'write_multiplex_pty': {
            const id = args.id as string;
            const data = (args.data as string) || '';
            if (data === '\r' || data.includes('\r') || data.includes('\n')) {
              // Command entered
              setTimeout(() => {
                emitEvent(`pty-output-${id}`, '\r\nCodexOS command executed successfully [status 0]\r\nuser@codexos:~$ ');
              }, 20);
            } else {
              // Character echo
              emitEvent(`pty-output-${id}`, data);
            }
            return null;
          }
          case 'resize_multiplex_pty':
            return null;
          case 'kill_multiplex_pty': {
            const id = args.id as string;
            state.ptySessions.delete(id);
            return null;
          }

          // --- Visual Git Client ---
          case 'get_git_status':
            return {
              branch: state.gitStatus.branch,
              staged: [...state.gitStatus.staged],
              unstaged: [...state.gitStatus.unstaged],
              untracked: [...state.gitStatus.untracked],
            };
          case 'git_action': {
            const action = args.action as string;
            const file = args.file as string | null;
            if (action === 'add') {
              if (file === '.' || !file) {
                state.gitStatus.staged.push(...state.gitStatus.unstaged, ...state.gitStatus.untracked);
                state.gitStatus.unstaged = [];
                state.gitStatus.untracked = [];
              } else {
                state.gitStatus.unstaged = state.gitStatus.unstaged.filter((f) => f !== file);
                state.gitStatus.untracked = state.gitStatus.untracked.filter((f) => f !== file);
                if (!state.gitStatus.staged.includes(file)) {
                  state.gitStatus.staged.push(file);
                }
              }
            } else if (action === 'restore_staged') {
              if (file === '.' || !file) {
                state.gitStatus.unstaged.push(...state.gitStatus.staged);
                state.gitStatus.staged = [];
              } else {
                state.gitStatus.staged = state.gitStatus.staged.filter((f) => f !== file);
                if (!state.gitStatus.unstaged.includes(file)) {
                  state.gitStatus.unstaged.push(file);
                }
              }
            } else if (action === 'commit') {
              state.gitStatus.staged = [];
            }
            return null;
          }
          case 'git_history':
            return state.history;
          case 'get_branches':
            return state.branches;
          case 'git_checkout': {
            const branch = args.branch as string;
            state.gitStatus.branch = branch;
            return null;
          }
          case 'git_create_branch': {
            const branch = args.branch as string;
            state.branches.push({ name: branch, hash: 'f00123a456', is_current: false, is_remote: false });
            state.gitStatus.branch = branch;
            return null;
          }
          case 'git_pull':
          case 'git_fetch':
          case 'git_stash':
          case 'git_stash_pop':
            return null;
          case 'get_file_diff': {
            const file = args.file as string;
            return `--- a/${file}\n+++ b/${file}\n@@ -10,3 +10,4 @@\n- old line\n+ new modified line in ${file}\n`;
          }
          case 'get_staged_diff': {
            const file = args.file as string;
            return `--- a/${file}\n+++ b/${file}\n@@ -1,5 +1,6 @@\n+ staged changes for ${file}\n`;
          }

          // --- SQLite KV Store & State Persistence ---
          case 'kv_get': {
            const key = args.key as string;
            return state.kv[key] ?? null;
          }
          case 'kv_set': {
            const key = args.key as string;
            const value = args.value as string;
            state.kv[key] = value;
            return null;
          }

          // --- System Ports, Diagnostics & Tools ---
          case 'get_active_ports':
            return state.activePorts;
          case 'get_diagnostics_summary':
            return { error_count: 0, crash_count: 0 };
          case 'set_local_diagnostics_enabled':
            return null;
          case 'detect_tool':
            return 'v2.2.0';
          case 'is_ollama_running':
            return false;
          case 'is_proxy_running':
            return false;
          case 'get_captured_requests':
            return [];
          case 'get_proxy_whitelist':
            return ['localhost', '127.0.0.1'];
          case 'diagnose_issue':
            return {
              cause: 'Simulated Diagnostic Check',
              confidence: 'high',
              explanation: 'All local subsystem health signals are within bounds.',
              suggested_fix: 'Proceed normally.',
              related_files: [],
            };
          case 'query_sqlite':
            return { columns: ['id', 'status'], rows: [['1', 'healthy']] };
          case 'query_database':
            return [{ id: 1, status: 'ok' }];
          case 'get_docker_containers':
          case 'get_docker_images':
            return [];
          case 'list_tunnels':
            return [];

          default:
            return null;
        }
      },
    };

    (window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event: string, eventId: number) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l.id !== eventId);
        }
      },
    };

    (window as unknown as Record<string, unknown>).isTauri = true;
  }, mergedOptions);
}

/**
 * Playwright test fixture with automatic Tauri mock injection.
 */
export const test = base.extend<{
  mockOptions: MockOptions;
}>({
  mockOptions: [{}, { option: true }],
  page: async ({ page, mockOptions }, use) => {
    await setupTauriMock(page, mockOptions);
    await use(page);
  },
});

export { expect };
