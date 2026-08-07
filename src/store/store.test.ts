import { expect, test, describe, beforeEach } from 'vitest';
import { useStore } from './store';

// Reset store to a known state before each test
const resetStore = () => {
  useStore.setState({
    tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null, openFiles: [] }],
    activeTabId: 'tab-1',
    activeApp: 'home',
    currentPath: null,
    selectedFile: null,
    openFiles: [],
    toasts: [],
    pathHistory: [],
    historyIndex: -1,
    canGoBack: false,
    canGoForward: false,
    isVaultLocked: true,
    secretsCount: 0,
    gitRepoPath: null,
    peerCount: 0,
    activeTunnelCount: 0,
    sshConnections: [],
  });
};

describe('useStore — default state', () => {
  beforeEach(resetStore);

  test('has one tab pointing to home', () => {
    const { tabs, activeApp } = useStore.getState();
    expect(tabs).toHaveLength(1);
    expect(activeApp).toBe('home');
  });

  test('vault is locked by default', () => {
    expect(useStore.getState().isVaultLocked).toBe(true);
  });
});

describe('useStore — settings', () => {
  beforeEach(resetStore);

  test('updates theme setting', () => {
    useStore.getState().updateSettings({ theme: 'light' });
    expect(useStore.getState().settings.theme).toBe('light');
    useStore.getState().updateSettings({ theme: 'dark' });
  });

  test('updates terminalShell setting', () => {
    useStore.getState().updateSettings({ terminalShell: 'cmd' });
    expect(useStore.getState().settings.terminalShell).toBe('cmd');
  });
});

describe('useStore — tab management', () => {
  beforeEach(resetStore);

  test('adds a new tab', () => {
    useStore.getState().addTab();
    expect(useStore.getState().tabs).toHaveLength(2);
  });

  test('closes a tab and falls back to previous', () => {
    useStore.getState().addTab();
    const { tabs } = useStore.getState();
    const firstId = tabs[0].id;
    const secondId = tabs[1].id;
    useStore.getState().setActiveTab(secondId);
    useStore.getState().closeTab(secondId);
    expect(useStore.getState().tabs).toHaveLength(1);
    expect(useStore.getState().activeTabId).toBe(firstId);
  });

  test('cannot close the last remaining tab', () => {
    const { tabs, activeTabId } = useStore.getState();
    useStore.getState().closeTab(activeTabId);
    expect(useStore.getState().tabs).toHaveLength(tabs.length);
  });

  test('does not exceed 8 tabs', () => {
    for (let i = 0; i < 10; i++) {
      useStore.getState().addTab();
    }
    expect(useStore.getState().tabs.length).toBeLessThanOrEqual(8);
  });

  test('reorders tabs', () => {
    useStore.getState().addTab();
    const { tabs } = useStore.getState();
    const [firstId, secondId] = [tabs[0].id, tabs[1].id];
    useStore.getState().reorderTabs(0, 1);
    const reordered = useStore.getState().tabs;
    expect(reordered[0].id).toBe(secondId);
    expect(reordered[1].id).toBe(firstId);
  });
});

describe('useStore — navigation history', () => {
  beforeEach(resetStore);

  test('pushPath records history and enables back', () => {
    useStore.getState().pushPath('/home/user');
    useStore.getState().pushPath('/home/user/projects');
    const state = useStore.getState();
    expect(state.currentPath).toBe('/home/user/projects');
    expect(state.canGoBack).toBe(true);
    expect(state.canGoForward).toBe(false);
  });

  test('goBack navigates to previous path', () => {
    useStore.getState().pushPath('/a');
    useStore.getState().pushPath('/b');
    useStore.getState().goBack();
    expect(useStore.getState().currentPath).toBe('/a');
    expect(useStore.getState().canGoForward).toBe(true);
  });

  test('goForward navigates forward after going back', () => {
    useStore.getState().pushPath('/a');
    useStore.getState().pushPath('/b');
    useStore.getState().goBack();
    useStore.getState().goForward();
    expect(useStore.getState().currentPath).toBe('/b');
    expect(useStore.getState().canGoForward).toBe(false);
  });

  test('pushPath clears forward history', () => {
    useStore.getState().pushPath('/a');
    useStore.getState().pushPath('/b');
    useStore.getState().goBack();
    useStore.getState().pushPath('/c');
    useStore.getState().goForward(); // should be no-op now
    expect(useStore.getState().currentPath).toBe('/c');
  });
});

describe('useStore — toast system', () => {
  beforeEach(resetStore);

  test('adds a toast with a unique id', () => {
    useStore.getState().addToast({ type: 'success', title: 'Done' });
    const { toasts } = useStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBeTruthy();
    expect(toasts[0].title).toBe('Done');
  });

  test('removes a toast by id', () => {
    useStore.getState().addToast({ type: 'error', title: 'Oops' });
    const id = useStore.getState().toasts[0].id;
    useStore.getState().removeToast(id);
    expect(useStore.getState().toasts).toHaveLength(0);
  });

  test('caps toast queue at 4 entries', () => {
    for (let i = 0; i < 6; i++) {
      useStore.getState().addToast({ type: 'info', title: `Toast ${i}` });
    }
    expect(useStore.getState().toasts.length).toBeLessThanOrEqual(4);
  });
});

describe('useStore — vault', () => {
  beforeEach(resetStore);

  test('setVaultLocked updates isVaultLocked', () => {
    useStore.getState().setVaultLocked(false);
    expect(useStore.getState().isVaultLocked).toBe(false);
    useStore.getState().setVaultLocked(true);
    expect(useStore.getState().isVaultLocked).toBe(true);
  });

  test('setSecretsCount updates secretsCount', () => {
    useStore.getState().setSecretsCount(5);
    expect(useStore.getState().secretsCount).toBe(5);
  });
});

describe('useStore — file management', () => {
  beforeEach(resetStore);

  test('openFile adds file to openFiles and sets selectedFile', () => {
    useStore.getState().openFile('/path/to/file.ts');
    const state = useStore.getState();
    expect(state.openFiles).toContain('/path/to/file.ts');
    expect(state.selectedFile).toBe('/path/to/file.ts');
  });

  test('openFile does not duplicate', () => {
    useStore.setState({ openFiles: [] });
    useStore.getState().openFile('/file.ts');
    useStore.getState().openFile('/file.ts');
    expect(useStore.getState().openFiles).toHaveLength(1);
  });

  test('closeFile removes file and updates selectedFile', () => {
    useStore.getState().openFile('/a.ts');
    useStore.getState().openFile('/b.ts');
    useStore.getState().closeFile('/b.ts');
    const state = useStore.getState();
    expect(state.openFiles).not.toContain('/b.ts');
    expect(state.selectedFile).toBe('/a.ts');
  });
});

describe('useStore — workspaces', () => {
  beforeEach(resetStore);

  test('openWorkspace adds to recentWorkspaces and sets currentPath', () => {
    useStore.getState().openWorkspace('/projects/myapp', 'My App');
    const state = useStore.getState();
    expect(state.currentPath).toBe('/projects/myapp');
    const recent = state.settings.recentWorkspaces;
    expect(recent[0].path).toBe('/projects/myapp');
    expect(recent[0].name).toBe('My App');
  });

  test('openWorkspace deduplicates entries', () => {
    useStore.getState().openWorkspace('/projects/myapp', 'My App');
    useStore.getState().openWorkspace('/projects/myapp', 'My App');
    const { recentWorkspaces } = useStore.getState().settings;
    const count = recentWorkspaces.filter(w => w.path === '/projects/myapp').length;
    expect(count).toBe(1);
  });

  test('recentWorkspaces capped at 10', () => {
    for (let i = 0; i < 15; i++) {
      useStore.getState().openWorkspace(`/projects/app${i}`, `App ${i}`);
    }
    expect(useStore.getState().settings.recentWorkspaces.length).toBeLessThanOrEqual(10);
  });
});
