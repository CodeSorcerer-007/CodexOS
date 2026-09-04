import { check, Update } from '@tauri-apps/plugin-updater';

export interface UpdateCheckResult {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
  error?: string;
  rawUpdate?: Update;
}

export type ProgressCallback = (progress: {
  downloaded: number;
  total?: number;
  percentage?: number;
}) => void;

/**
 * Checks for updates using the official Tauri updater plugin.
 * Gracefully handles offline environments, development mode, and missing endpoints.
 */
export async function checkForSoftwareUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = '2.1.0';

  try {
    const update = await check();
    if (update?.available) {
      return {
        available: true,
        currentVersion,
        version: update.version,
        date: update.date,
        body: update.body,
        rawUpdate: update,
      };
    }
    return {
      available: false,
      currentVersion,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // In dev mode or offline, treat endpoint unreachable gracefully
    return {
      available: false,
      currentVersion,
      error: message.includes('Could not fetch') || message.includes('network')
        ? 'Offline / updater endpoint unreachable'
        : message,
    };
  }
}

/**
 * Downloads and installs the pending update.
 */
export async function downloadAndInstallUpdate(
  update: Update,
  onProgress?: ProgressCallback
): Promise<void> {
  let downloadedBytes = 0;
  let contentLength: number | undefined = undefined;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength;
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        if (onProgress) {
          const percentage = contentLength
            ? Math.round((downloadedBytes / contentLength) * 100)
            : undefined;
          onProgress({
            downloaded: downloadedBytes,
            total: contentLength,
            percentage,
          });
        }
        break;
      case 'Finished':
        if (onProgress) {
          onProgress({
            downloaded: downloadedBytes,
            total: contentLength,
            percentage: 100,
          });
        }
        break;
    }
  });
}
