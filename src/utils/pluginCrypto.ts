import type { PluginItem, InstalledPlugin } from '../types/plugin';

export const INSTALLED_PLUGINS_STORAGE_KEY = 'codexos_installed_plugins';

/**
 * Computes the SHA-256 hash (in lowercase hexadecimal) of given string or Uint8Array.
 * If data is a valid hex string of even length, it is decoded as raw bytecode.
 * Otherwise, string data is encoded using UTF-8.
 */
export async function computeSha256(data: string | Uint8Array): Promise<string> {
  let bytes: Uint8Array;

  if (typeof data === 'string') {
    const isHex = /^[0-9a-fA-F]+$/.test(data) && data.length % 2 === 0;
    if (isHex) {
      const bytePairs = data.match(/.{1,2}/g) || [];
      bytes = new Uint8Array(bytePairs.map((byte) => parseInt(byte, 16)));
    } else {
      bytes = new TextEncoder().encode(data);
    }
  } else {
    bytes = data;
  }

  const cryptoApi = (typeof window !== 'undefined' && window.crypto?.subtle)
    ? window.crypto.subtle
    : globalThis.crypto?.subtle;

  if (cryptoApi) {
    const hashBuffer = await cryptoApi.digest('SHA-256', bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Web Crypto API (crypto.subtle) is not available');
}

/**
 * Verifies that the package bytecode matches the plugin's declared SHA-256 hash.
 */
export async function verifyPluginChecksum(
  plugin: PluginItem,
  bytecodeOverride?: Uint8Array | string
): Promise<{ valid: boolean; computedHash: string }> {
  const payloadToHash = bytecodeOverride ?? plugin.bytecode ?? plugin.wasmFile;
  const computedHash = await computeSha256(payloadToHash);
  const valid = computedHash.toLowerCase() === plugin.sha256.toLowerCase();
  return { valid, computedHash };
}

/**
 * Loads all installed plugins from localStorage.
 * Handles backward compatibility if the stored value was an array of string IDs.
 */
export function loadInstalledPlugins(): InstalledPlugin[] {
  try {
    const raw = localStorage.getItem(INSTALLED_PLUGINS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: unknown): InstalledPlugin => {
      if (typeof item === 'string') {
        return {
          id: item,
          name: item,
          version: '1.0.0',
          author: 'Unknown',
          description: 'Imported plugin',
          category: 'DevTools',
          size: 'Unknown',
          downloads: 0,
          verified: true,
          wasmFile: `${item}.wasm`,
          sha256: '',
          installedAt: new Date().toISOString(),
          enabled: true,
        };
      }

      const pluginObj = item as Record<string, unknown>;
      return {
        id: String(pluginObj.id || ''),
        name: String(pluginObj.name || pluginObj.id || ''),
        version: String(pluginObj.version || '1.0.0'),
        author: String(pluginObj.author || 'Unknown'),
        description: String(pluginObj.description || ''),
        category: (pluginObj.category as InstalledPlugin['category']) || 'DevTools',
        size: String(pluginObj.size || '1.0 MB'),
        downloads: Number(pluginObj.downloads || 0),
        verified: Boolean(pluginObj.verified ?? true),
        wasmFile: String(pluginObj.wasmFile || `${pluginObj.id}.wasm`),
        sha256: String(pluginObj.sha256 || ''),
        bytecode: pluginObj.bytecode ? String(pluginObj.bytecode) : undefined,
        corrupted: Boolean(pluginObj.corrupted),
        installedAt: String(pluginObj.installedAt || new Date().toISOString()),
        enabled: pluginObj.enabled !== false,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Saves the installed plugins list to localStorage and triggers a change event.
 */
export function saveInstalledPlugins(plugins: InstalledPlugin[]): void {
  try {
    localStorage.setItem(INSTALLED_PLUGINS_STORAGE_KEY, JSON.stringify(plugins));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('codexos_installed_plugins_changed', { detail: plugins }));
    }
  } catch (err) {
    console.error('Failed to save installed plugins to localStorage', err);
  }
}

/**
 * Adds or updates an installed plugin record with verified: true, enabled: true, and installedAt.
 */
export function addInstalledPlugin(plugin: PluginItem, verified = true): InstalledPlugin[] {
  const current = loadInstalledPlugins();
  const existingIndex = current.findIndex((p) => p.id === plugin.id);

  const installedRecord: InstalledPlugin = {
    ...plugin,
    verified,
    enabled: true,
    installedAt: new Date().toISOString(),
  };

  let next: InstalledPlugin[];
  if (existingIndex >= 0) {
    next = [...current];
    next[existingIndex] = installedRecord;
  } else {
    next = [...current, installedRecord];
  }

  saveInstalledPlugins(next);
  return next;
}

/**
 * Removes an installed plugin by ID from storage.
 */
export function removeInstalledPlugin(pluginId: string): InstalledPlugin[] {
  const current = loadInstalledPlugins();
  const next = current.filter((p) => p.id !== pluginId);
  saveInstalledPlugins(next);
  return next;
}

/**
 * Toggles the enabled state of an installed plugin.
 */
export function toggleInstalledPluginEnabled(pluginId: string): InstalledPlugin[] {
  const current = loadInstalledPlugins();
  const next = current.map((p) => {
    if (p.id === pluginId) {
      return { ...p, enabled: !p.enabled };
    }
    return p;
  });
  saveInstalledPlugins(next);
  return next;
}
