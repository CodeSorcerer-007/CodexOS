import { useState, useEffect } from 'react';
import { useStore, useToast } from '../store/store';
import { useDiagnosisStore } from '../store/diagnosisStore';
import { invoke } from '@tauri-apps/api/core';
import {
  checkForSoftwareUpdates,
  downloadAndInstallUpdate,
  type UpdateCheckResult,
} from '../services/updaterService';
import {
  RefreshCw,
  Download,
  ShieldCheck,
  Database,
  FileArchive,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
} from 'lucide-react';
import { reindexWorkspace, clearSearchIndex } from '../ipc';

interface MigrationStatus {
  current_version: number;
  target_version: number;
  is_up_to_date: boolean;
  applied_migrations: string[];
}

interface DiagnosticsSummary {
  app_version: string;
  os_name: string;
  os_arch: string;
  cpu_count: number;
  total_memory_mb: number;
  used_memory_mb: number;
  crash_dump_count: number;
  schema_version: number;
  log_file_count: number;
  is_telemetry_enabled: boolean;
}

interface WindowsIntegrationStatus {
  context_menu: {
    is_registered: boolean;
    supported: boolean;
    directory_registered: boolean;
    background_registered: boolean;
    drive_registered: boolean;
  };
  startup: {
    enabled: boolean;
    start_minimized: boolean;
    supported: boolean;
  };
  is_windows: boolean;
  win11_modern_menu_note: string;
  default_folder_note: string;
}

export const SettingsPage = () => {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const store = useStore();
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const toast = useToast();

  // AI Copilot state
  const [copilotConfigured, setCopilotConfigured] = useState<boolean | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);

  // Auto-Updater state
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  // Diagnostics & Database Migrations state
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [diagSummary, setDiagSummary] = useState<DiagnosticsSummary | null>(null);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [localCrashRecording, setLocalCrashRecording] = useState(true);

  // Search & Indexing state
  const [indexStatusMsg, setIndexStatusMsg] = useState<string | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  // Windows Integration state
  const [winStatus, setWinStatus] = useState<WindowsIntegrationStatus | null>(null);
  const [isWinLoading, setIsWinLoading] = useState(false);

  useEffect(() => {
    invoke<boolean>('is_copilot_configured')
      .then(configured => setCopilotConfigured(configured))
      .catch(() => setCopilotConfigured(false));

    invoke<MigrationStatus>('get_db_migration_status')
      .then(status => setMigrationStatus(status))
      .catch(() => {});

    invoke<DiagnosticsSummary>('get_diagnostics_summary')
      .then(summary => {
        setDiagSummary(summary);
        setLocalCrashRecording(summary.is_telemetry_enabled);
      })
      .catch(() => {});

    invoke<WindowsIntegrationStatus>('get_windows_integration_status')
      .then(res => {
        if (res && typeof res === 'object' && 'context_menu' in res) {
          setWinStatus(res);
        }
      })
      .catch(() => {});
  }, []);

  const handlePathChange = async (pathStr: string) => {
    updateSettings({ defaultPath: pathStr });
    if (!pathStr.trim()) {
      setPathValid(null);
      toast.error('Invalid Path', 'Please enter a valid directory path');
      return;
    }
    try {
      await invoke('get_files_in_dir', { path: pathStr });
      setPathValid(true);
    } catch {
      setPathValid(false);
      toast.error('Invalid Default Path', `Directory '${pathStr}' does not exist on disk.`);
    }
  };

  const handleCopilotToggle = (value: boolean) => {
    store.setAiCopilotEnabled(value);
    useDiagnosisStore.getState().setEnabled(value);
  };

  const handleThresholdChange = (raw: string) => {
    const value = Number(raw);
    if (value < 1) {
      setThresholdError('Must be ≥ 1 MB');
    } else {
      setThresholdError(null);
      store.setMemorySpikeThresholdMb(value);
    }
  };

  const handleWindowChange = (raw: string) => {
    const value = Number(raw);
    if (value < 1) {
      setWindowError('Must be ≥ 1 second');
    } else {
      setWindowError(null);
      store.setMemorySpikeWindowSec(value);
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await checkForSoftwareUpdates();
      setUpdateResult(res);
      if (res.available) {
        toast.success('Update Available', `CodexOS v${res.version} is ready for installation.`);
      } else if (res.error) {
        toast.error('Update Check Failed', res.error);
      } else {
        toast.success('Up to Date', 'You are running the latest version of CodexOS.');
      }
    } catch (e: unknown) {
      toast.error('Update Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateResult?.rawUpdate) return;
    setIsInstallingUpdate(true);
    try {
      await downloadAndInstallUpdate(updateResult.rawUpdate, progress => {
        if (progress.percentage !== undefined) {
          setUpdateProgress(progress.percentage);
        }
      });
      toast.success('Update Downloaded', 'Restart CodexOS to apply the latest update.');
    } catch (e: unknown) {
      toast.error('Installation Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  const handleExportDiagnostics = async () => {
    setIsExportingReport(true);
    try {
      const zipPath = await invoke<string>('export_system_report');
      toast.success('Diagnostic Report Exported', `Saved to ${zipPath}`);
    } catch (e: unknown) {
      toast.error('Export Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleClearCrashes = async () => {
    try {
      const cleared = await invoke<number>('clear_crash_dumps');
      if (diagSummary) {
        setDiagSummary({ ...diagSummary, crash_dump_count: 0 });
      }
      toast.success('Crash Dumps Cleared', `Removed ${cleared} local crash records.`);
    } catch (e: unknown) {
      toast.error('Clear Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleCrashRecording = async (enabled: boolean) => {
    setLocalCrashRecording(enabled);
    try {
      await invoke('set_local_diagnostics_enabled', { enabled });
      toast.success(
        'Telemetry Preference Updated',
        enabled ? 'Local panic recording enabled' : 'Local panic recording disabled'
      );
    } catch {
      setLocalCrashRecording(!enabled);
    }
  };

  const handleToggleContextMenu = async () => {
    if (!winStatus) return;
    setIsWinLoading(true);
    try {
      const isReg = winStatus.context_menu.is_registered;
      const cmd = isReg ? 'unregister_context_menu' : 'register_context_menu';
      const res = await invoke<WindowsIntegrationStatus['context_menu']>(cmd);
      setWinStatus({ ...winStatus, context_menu: res });
      toast.success(
        isReg ? 'Context Menu Removed' : 'Context Menu Registered',
        isReg ? 'Removed "Open with CodexOS" from Explorer' : 'Added "Open with CodexOS" to Explorer'
      );
    } catch (e: unknown) {
      toast.error('Context Menu Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsWinLoading(false);
    }
  };

  const handleToggleStartup = async () => {
    if (!winStatus) return;
    setIsWinLoading(true);
    try {
      const nextEnabled = !winStatus.startup.enabled;
      const res = await invoke<WindowsIntegrationStatus['startup']>('set_windows_startup', {
        enabled: nextEnabled,
        startMinimized: winStatus.startup.start_minimized,
      });
      setWinStatus({ ...winStatus, startup: res });
      toast.success(
        nextEnabled ? 'Startup Enabled' : 'Startup Disabled',
        nextEnabled ? 'CodexOS will start at user login' : 'CodexOS startup entry removed'
      );
    } catch (e: unknown) {
      toast.error('Startup Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsWinLoading(false);
    }
  };

  const handleToggleStartMinimized = async () => {
    if (!winStatus) return;
    setIsWinLoading(true);
    try {
      const nextMin = !winStatus.startup.start_minimized;
      const res = await invoke<WindowsIntegrationStatus['startup']>('set_windows_startup', {
        enabled: true,
        startMinimized: nextMin,
      });
      setWinStatus({ ...winStatus, startup: res });
      toast.success('Preference Saved', nextMin ? 'Will launch minimized to tray' : 'Will launch visible');
    } catch (e: unknown) {
      toast.error('Preference Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsWinLoading(false);
    }
  };

  const handleRestoreDefaults = async () => {
    setIsWinLoading(true);
    try {
      const res = await invoke<WindowsIntegrationStatus>('restore_windows_defaults');
      setWinStatus(res);
      toast.success('Defaults Restored', 'All CodexOS Windows integrations removed cleanly.');
    } catch (e: unknown) {
      toast.error('Restore Error', e instanceof Error ? e.message : String(e));
    } finally {
      setIsWinLoading(false);
    }
  };

  const handleExportRegistryFiles = async () => {
    try {
      const [, unreg] = await invoke<[string, string]>('generate_registry_scripts');
      const blob = new Blob([unreg], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CodexOS-Rollback.reg';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Rollback Script Exported', 'Downloaded CodexOS-Rollback.reg');
    } catch (e: unknown) {
      toast.error('Export Error', e instanceof Error ? e.message : String(e));
    }
  };

  const handleReindexWorkspace = async () => {
    const ws = settings.defaultPath || '';
    if (!ws) {
      setIndexStatusMsg('Please set a Default Startup Path above before indexing.');
      return;
    }
    setIsReindexing(true);
    setIndexStatusMsg('Indexing workspace in background...');
    try {
      const res = await reindexWorkspace(ws, settings.searchCustomExclusions);
      setIndexStatusMsg(`Indexed ${res.file_count} files successfully at ${new Date(res.last_indexed * 1000).toLocaleTimeString()}.`);
      toast.success('Search Index Updated', `Indexed ${res.file_count} files.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIndexStatusMsg(`Indexing failed: ${msg}`);
      toast.error('Indexing Failed', msg);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleClearIndex = async () => {
    const ws = settings.defaultPath || '';
    if (!ws) return;
    try {
      await clearSearchIndex(ws);
      setIndexStatusMsg('Workspace search index cleared.');
      toast.success('Index Cleared', 'Workspace search index removed.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIndexStatusMsg(`Failed to clear index: ${msg}`);
      toast.error('Clear Index Failed', msg);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white p-8 overflow-y-auto">
      <div className="max-w-3xl w-full pb-16">
        <h1 className="text-2xl font-bold mb-6 text-indigo-400">Settings</h1>

        {/* General Environment */}
        <div className="bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="default-startup-path" className="block text-sm font-bold text-gray-400">
                Default Startup Path
              </label>
              {pathValid === true && <span className="text-xs font-bold text-green-400">✓ Path Exists</span>}
              {pathValid === false && <span className="text-xs font-bold text-red-400">✕ Path Not Found</span>}
            </div>
            <input
              id="default-startup-path"
              type="text"
              value={settings.defaultPath || ''}
              onChange={e => handlePathChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${
                pathValid === false
                  ? 'border-red-500 focus:border-red-500'
                  : pathValid === true
                  ? 'border-green-500 focus:border-green-500'
                  : 'border-white/10 focus:border-indigo-500'
              }`}
              placeholder="e.g. C:\Projects or /Users/me/code"
            />
          </div>

          <div>
            <label htmlFor="terminal-shell-select" className="block text-sm font-bold text-gray-400 mb-2">
              Terminal Shell
            </label>
            <select
              id="terminal-shell-select"
              value={settings.terminalShell || 'powershell'}
              onChange={e => updateSettings({ terminalShell: e.target.value as 'powershell' | 'cmd' | 'wsl' })}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">Command Prompt</option>
              <option value="wsl">WSL (bash)</option>
            </select>
          </div>

          <div>
            <label htmlFor="theme-select" className="block text-sm font-bold text-gray-400 mb-2">
              Theme
            </label>
            <select
              id="theme-select"
              value={settings.theme || 'dark'}
              onChange={e => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div>
            <label htmlFor="performance-mode-select" className="block text-sm font-bold text-gray-400 mb-2">
              Performance Mode
            </label>
            <select
              id="performance-mode-select"
              value={settings.performanceMode || 'lightweight'}
              onChange={e => store.setPerformanceMode(e.target.value as 'lightweight' | 'balanced' | 'developer')}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="lightweight">Lightweight (Recommended - Min RAM & CPU)</option>
              <option value="balanced">Balanced (Moderate Telemetry Refresh)</option>
              <option value="developer">Developer (High-Frequency 2s Telemetry)</option>
            </select>
          </div>
        </div>

        {/* Resource Telemetry Monitoring Toggle */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 flex items-center justify-between">
          <div>
            <label id="enable-monitoring-label" className="block text-sm font-bold text-gray-400">
              System Resource Telemetry
            </label>
            <p className="text-xs text-gray-500 mt-0.5">
              Continuously monitor CPU and RAM usage. When disabled, background timers are completely halted.
            </p>
          </div>
          <button
            id="enable-monitoring-toggle"
            type="button"
            data-testid="enable-monitoring-toggle"
            aria-labelledby="enable-monitoring-label"
            aria-checked={settings.monitoringEnabled ?? true}
            onClick={() => store.setMonitoringEnabled(!(settings.monitoringEnabled ?? true))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              (settings.monitoringEnabled ?? true) ? 'bg-indigo-600' : 'bg-white/10'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                (settings.monitoringEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Windows Explorer & Shell Integration */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-sky-400">Windows Explorer & Shell Integration</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Configure Explorer right-click menus, single-instance startup, and safe folder preferences.
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${winStatus?.is_windows ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30'}`}>
              {winStatus?.is_windows ? 'Windows 10/11' : 'Non-Windows Platform'}
            </span>
          </div>

          {/* Context Menu Integration */}
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-gray-200">Explorer Context Menu (&quot;Open with CodexOS&quot;)</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Adds right-click options to folders, folder background, and drive roots (Per-user HKCU, zero admin elevation).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded font-bold ${winStatus?.context_menu?.is_registered ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-500/20 text-gray-400'}`}>
                  {winStatus?.context_menu?.is_registered ? 'Registered' : 'Not Registered'}
                </span>
                <button
                  type="button"
                  data-testid="toggle-context-menu-btn"
                  disabled={isWinLoading || !winStatus?.context_menu?.supported}
                  onClick={handleToggleContextMenu}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    winStatus?.context_menu?.is_registered
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {winStatus?.context_menu?.is_registered ? 'Unregister' : 'Register Context Menu'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 italic">
              Windows 11 note: Registered verbs appear under classic &quot;Show more options&quot; (Shift+F10) without replacing system DLLs.
            </p>
          </div>

          {/* Startup Integration */}
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-gray-200">Windows Startup Launch</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Launch CodexOS automatically at user login via HKCU Run registry entry.
                </p>
              </div>
              <button
                type="button"
                data-testid="toggle-startup-btn"
                disabled={isWinLoading || !winStatus?.startup?.supported}
                onClick={handleToggleStartup}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  winStatus?.startup?.enabled
                    ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                    : 'bg-white/10 hover:bg-white/20 text-gray-300'
                }`}
              >
                {winStatus?.startup?.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            {winStatus?.startup?.enabled && (
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-xs text-gray-400">Start minimized to system tray</span>
                <input
                  type="checkbox"
                  data-testid="startup-minimized-checkbox"
                  checked={winStatus.startup.start_minimized ?? false}
                  onChange={handleToggleStartMinimized}
                  className="rounded border-white/20 bg-black/40 text-indigo-500 focus:ring-0 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Preferred Folder Opening & Explorer Recovery */}
          <div className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-2">
            <span className="text-sm font-bold text-gray-200">Default Folder Opening Policy</span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Windows 10/11 secures folder associations through cryptographic UserChoice hashes. CodexOS uses single-instance command forwarding and non-intrusive context menus while <strong>always retaining Windows Explorer as the default system shell and recovery safety net</strong>.
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                data-testid="restore-defaults-btn"
                onClick={handleRestoreDefaults}
                className="px-3 py-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded transition-colors flex items-center gap-1.5"
              >
                Restore Windows Defaults
              </button>
              <button
                type="button"
                data-testid="export-registry-btn"
                onClick={handleExportRegistryFiles}
                className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors flex items-center gap-1.5"
              >
                Export .REG Rollback Scripts
              </button>
            </div>
          </div>
        </div>

        {/* AI Root-Cause Copilot */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
          <h2 className="text-base font-bold text-indigo-400">AI Root-Cause Copilot</h2>

          <div className="flex items-center justify-between">
            <div>
              <label id="enable-ai-copilot-label" className="block text-sm font-bold text-gray-400">
                Enable AI Copilot
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Automatically diagnose terminal errors, memory spikes, and network failures
              </p>
            </div>
            <button
              id="enable-ai-copilot-toggle"
              role="switch"
              aria-labelledby="enable-ai-copilot-label"
              aria-checked={settings.aiCopilotEnabled}
              onClick={() => handleCopilotToggle(!settings.aiCopilotEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.aiCopilotEnabled ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.aiCopilotEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="block text-sm font-bold text-gray-400">AI Privacy & Engine</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Automated secret scrubbing enabled. Uses Mistral Cloud or Local Ollama.
              </p>
            </div>
            {copilotConfigured === null ? null : copilotConfigured ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                ✓ Ready (Hybrid / Local)
              </span>
            ) : (
              <button
                onClick={() => store.setActiveApp('secrets')}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
              >
                Configure Mistral Key →
              </button>
            )}
          </div>

          <div>
            <label htmlFor="memory-spike-threshold" className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Threshold (MB)
            </label>
            <input
              id="memory-spike-threshold"
              type="number"
              min={1}
              defaultValue={settings.memorySpikeThresholdMb}
              onChange={e => handleThresholdChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${
                thresholdError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-indigo-500'
              }`}
            />
            {thresholdError && <p className="mt-1 text-xs text-red-400">{thresholdError}</p>}
          </div>

          <div>
            <label htmlFor="memory-spike-window" className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Window (seconds)
            </label>
            <input
              id="memory-spike-window"
              type="number"
              min={1}
              defaultValue={settings.memorySpikeWindowSec}
              onChange={e => handleWindowChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${
                windowError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-indigo-500'
              }`}
            />
            {windowError && <p className="mt-1 text-xs text-red-400">{windowError}</p>}
          </div>
        </div>

        {/* Software Updates (Enterprise GA) */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RefreshCw className="text-cyan-400 w-5 h-5" />
              <div>
                <h2 className="text-base font-bold text-cyan-400">Software Updates</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Automated background patches verified with cryptographic signature checks
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full font-mono text-xs text-gray-300">
              v2.2.0 (Current)
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 border border-white/5 p-4 rounded-lg">
            <div className="text-xs space-y-1">
              <span className="text-gray-300 font-semibold block">Channel: Stable Enterprise GA</span>
              {updateResult?.available ? (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={14} />
                  <span>Version {updateResult.version} available!</span>
                </div>
              ) : updateResult?.error ? (
                <div className="flex items-center gap-1.5 text-amber-400">
                  <AlertCircle size={14} />
                  <span>{updateResult.error}</span>
                </div>
              ) : updateResult && !updateResult.available ? (
                <div className="flex items-center gap-1.5 text-green-400">
                  <CheckCircle2 size={14} />
                  <span>CodexOS is up to date (v2.2.0)</span>
                </div>
              ) : (
                <span className="text-gray-500">Check for verified package signatures</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {updateResult?.available && (
                <button
                  onClick={handleInstallUpdate}
                  disabled={isInstallingUpdate}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <Download size={14} />
                  {isInstallingUpdate
                    ? updateProgress !== null
                      ? `Downloading (${updateProgress}%)...`
                      : 'Installing...'
                    : 'Download & Install'}
                </button>
              )}

              <button
                onClick={handleCheckUpdates}
                disabled={isCheckingUpdate}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw size={13} className={isCheckingUpdate ? 'animate-spin' : ''} />
                {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostics, Privacy & Database Migrations (Enterprise GA) */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="text-emerald-400 w-5 h-5" />
              <div>
                <h2 className="text-base font-bold text-emerald-400">System Diagnostics & Storage Integrity</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Strictly local diagnostic reporting and atomic database schema migrations
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Database size={11} /> SQLite Schema v{migrationStatus?.current_version ?? 3}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <div>
                <span className="block text-sm font-bold text-gray-300">Local Crash Recording</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Saves unhandled panic traces locally to disk for debugging. Never sent to remote servers.
                </p>
              </div>
              <button
                type="button"
                aria-label="Toggle local crash recording"
                aria-pressed={localCrashRecording}
                onClick={() => handleToggleCrashRecording(!localCrashRecording)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  localCrashRecording ? 'bg-emerald-600' : 'bg-white/10'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    localCrashRecording ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-black/40 border border-white/5 p-4 rounded-lg">
              <div className="text-xs space-y-1">
                <span className="text-gray-300 font-semibold block">Export Diagnostic Bundle</span>
                <p className="text-gray-500 leading-relaxed">
                  Generates an encrypted, token-scrubbed archive (.zip) with system specs, sanitized logs, and schema integrity state.
                </p>
                {diagSummary && (
                  <div className="flex gap-4 text-[11px] text-gray-400 pt-1 font-mono">
                    <span>Logs: {diagSummary.log_file_count} files</span>
                    <span>Crashes recorded: {diagSummary.crash_dump_count}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {diagSummary && diagSummary.crash_dump_count > 0 && (
                  <button
                    onClick={handleClearCrashes}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                    title="Clear crash dumps"
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                )}

                <button
                  onClick={handleExportDiagnostics}
                  disabled={isExportingReport}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <FileArchive size={14} />
                  {isExportingReport ? 'Compiling Archive...' : 'Export Report (.zip)'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Workspace Indexing Engine */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Search className="text-cyan-400 w-5 h-5" />
              <div>
                <h2 className="text-base font-bold text-cyan-400">Advanced Search & Workspace Indexing</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Configure lightweight indexing, exclusions, and content search thresholds
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono border ${
                settings.searchIndexingEnabled
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
              }`}>
                {settings.searchIndexingEnabled ? 'Index Active' : 'On-Demand Streaming'}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Background Indexing Toggle */}
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <div>
                <span className="block text-sm font-bold text-gray-300">Background Workspace Metadata Indexing</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Keep a lightweight SQLite index of workspace filenames for instant lookups (&lt;10ms)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.searchIndexingEnabled}
                  onChange={(e) => updateSettings({ searchIndexingEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {/* Max File Size for Content Search */}
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <div>
                <span className="block text-sm font-bold text-gray-300">Max Searchable File Size (MB)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Skip large data files during content inspection to bound memory consumption
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={settings.searchMaxFileSizeMb || 10}
                  onChange={(e) => updateSettings({ searchMaxFileSizeMb: Math.max(1, Number(e.target.value) || 10) })}
                  className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-sm text-center text-zinc-200 outline-none focus:border-cyan-400"
                />
                <span className="text-xs text-zinc-500">MB</span>
              </div>
            </div>

            {/* Custom Exclusions */}
            <div className="py-2 border-b border-white/5">
              <span className="block text-sm font-bold text-gray-300 mb-1">Excluded Directory Names</span>
              <p className="text-xs text-gray-500 mb-2">
                Directories to skip during recursive search and background indexing (comma-separated)
              </p>
              <input
                type="text"
                value={(settings.searchCustomExclusions || []).join(', ')}
                onChange={(e) => {
                  const items = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                  updateSettings({ searchCustomExclusions: items });
                }}
                className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs font-mono text-zinc-200 outline-none focus:border-cyan-400"
              />
            </div>

            {/* Manual Re-index & Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <div className="text-xs text-zinc-400">
                {indexStatusMsg ? (
                  <span className="text-cyan-300 font-mono">{indexStatusMsg}</span>
                ) : (
                  <span>Click reindex to refresh the SQLite workspace catalog</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearIndex}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-lg text-xs transition-colors"
                >
                  Clear Index
                </button>
                <button
                  onClick={handleReindexWorkspace}
                  disabled={isReindexing}
                  className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isReindexing ? 'animate-spin' : ''} />
                  {isReindexing ? 'Indexing...' : 'Reindex Workspace'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
