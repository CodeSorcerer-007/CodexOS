import { describe, test, expect, vi, beforeEach } from 'vitest';
import { checkForSoftwareUpdates, downloadAndInstallUpdate } from './updaterService';
import * as tauriUpdater from '@tauri-apps/plugin-updater';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

describe('updaterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns available: true when an update is available', async () => {
    const mockUpdate = {
      available: true,
      version: '2.2.0',
      date: '2026-09-04',
      body: 'Performance improvements and bug fixes',
      downloadAndInstall: vi.fn(),
    };
    vi.mocked(tauriUpdater.check).mockResolvedValue(mockUpdate as any);

    const result = await checkForSoftwareUpdates();
    expect(result.available).toBe(true);
    expect(result.version).toBe('2.2.0');
    expect(result.currentVersion).toBe('2.1.0');
  });

  test('returns available: false when up to date', async () => {
    vi.mocked(tauriUpdater.check).mockResolvedValue(null);

    const result = await checkForSoftwareUpdates();
    expect(result.available).toBe(false);
    expect(result.currentVersion).toBe('2.1.0');
  });

  test('handles network/offline errors gracefully', async () => {
    vi.mocked(tauriUpdater.check).mockRejectedValue(new Error('Could not fetch release manifest: network timeout'));

    const result = await checkForSoftwareUpdates();
    expect(result.available).toBe(false);
    expect(result.error).toContain('Offline / updater endpoint unreachable');
  });

  test('downloads and installs update reporting progress', async () => {
    const mockUpdate = {
      downloadAndInstall: vi.fn().mockImplementation(async (callback) => {
        callback({ event: 'Started', data: { contentLength: 1000 } });
        callback({ event: 'Progress', data: { chunkLength: 500 } });
        callback({ event: 'Finished' });
      }),
    };

    const progressReports: any[] = [];
    await downloadAndInstallUpdate(mockUpdate as any, (p) => progressReports.push(p));

    expect(mockUpdate.downloadAndInstall).toHaveBeenCalled();
    expect(progressReports.length).toBeGreaterThanOrEqual(1);
    expect(progressReports[0].percentage).toBe(50);
  });
});
