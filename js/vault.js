/* ============================================================
   Sirens — OPFS Vault Module
   Manages diagram files in the Origin Private File System
   ============================================================ */

const FILE_EXT = '.mmd';
const VAULT_META_KEY = 'sirens-vault-meta';

/** @type {FileSystemDirectoryHandle|null} */
let _rootHandle = null;

/**
 * Initialise the OPFS root.
 * @returns {Promise<boolean>} true if OPFS is available
 */
export async function initVault() {
  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
    console.warn('[Vault] OPFS not supported in this browser.');
    return false;
  }
  try {
    _rootHandle = await navigator.storage.getDirectory();
    return true;
  } catch (err) {
    console.error('[Vault] Failed to get OPFS root:', err);
    return false;
  }
}

/** @returns {boolean} */
export function isVaultAvailable() {
  return _rootHandle !== null;
}

/**
 * List all .mmd files in the vault.
 * @returns {Promise<Array<{name: string, size: number, lastModified: number}>>}
 */
export async function listFiles() {
  if (!_rootHandle) return [];
  const files = [];
  for await (const [name, handle] of _rootHandle.entries()) {
    if (handle.kind === 'file' && name.endsWith(FILE_EXT)) {
      try {
        const file = await handle.getFile();
        files.push({
          name: name.slice(0, -FILE_EXT.length), // strip extension
          fullName: name,
          size: file.size,
          lastModified: file.lastModified,
        });
      } catch (_) {
        /* skip unreadable file */
      }
    }
  }
  // Sort by most recently modified
  files.sort((a, b) => b.lastModified - a.lastModified);
  return files;
}

/**
 * Save (create or overwrite) a diagram.
 * @param {string} name   Plain name without extension
 * @param {string} content
 */
export async function saveFile(name, content) {
  if (!_rootHandle) throw new Error('Vault not initialised');
  const safeName = sanitiseName(name) + FILE_EXT;
  const fileHandle = await _rootHandle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Load a diagram's content.
 * @param {string} name  Plain name without extension
 * @returns {Promise<string>}
 */
export async function loadFile(name) {
  if (!_rootHandle) throw new Error('Vault not initialised');
  const safeName = sanitiseName(name) + FILE_EXT;
  const fileHandle = await _rootHandle.getFileHandle(safeName);
  const file = await fileHandle.getFile();
  return file.text();
}

/**
 * Delete a diagram.
 * @param {string} name  Plain name without extension
 */
export async function deleteFile(name) {
  if (!_rootHandle) throw new Error('Vault not initialised');
  const safeName = sanitiseName(name) + FILE_EXT;
  await _rootHandle.removeEntry(safeName);
}

/**
 * Rename a diagram (copy + delete).
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameFile(oldName, newName) {
  const content = await loadFile(oldName);
  await saveFile(newName, content);
  await deleteFile(oldName);
}

/**
 * Get storage usage estimate.
 * @returns {Promise<{used: number, quota: number, percent: number}>}
 */
export async function getStorageEstimate() {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return { used: 0, quota: 0, percent: 0 };
  }
  const { usage, quota } = await navigator.storage.estimate();
  const used = usage || 0;
  const q = quota || 1;
  return { used, quota: q, percent: Math.min(100, (used / q) * 100) };
}

/**
 * Persist OPFS (request persistent storage to survive quota eviction).
 * @returns {Promise<boolean>}
 */
export async function requestPersistence() {
  if ('persist' in navigator.storage) {
    return navigator.storage.persist();
  }
  return false;
}

/**
 * Get the vault allocation cap stored in settings (in bytes).
 * Default: 500 MB
 * @returns {number}
 */
export function getAllocationCap() {
  const stored = localStorage.getItem('sirens-vault-allocation-mb');
  return parseInt(stored || '500', 10) * 1024 * 1024;
}

/**
 * Set the vault allocation cap (in MB).
 * @param {number} mb
 */
export function setAllocationCap(mb) {
  localStorage.setItem('sirens-vault-allocation-mb', String(mb));
}

/** Saved name of the most recently opened file */
export function getLastOpenedFile() {
  return localStorage.getItem('sirens-last-file') || null;
}

export function setLastOpenedFile(name) {
  if (name) {
    localStorage.setItem('sirens-last-file', name);
  } else {
    localStorage.removeItem('sirens-last-file');
  }
}

// ─── Recent Files ────────────────────────────────────────────

const RECENT_KEY = 'sirens-recent-files';
const RECENT_MAX = 5;

/**
 * Get the list of recently opened file names (most-recent first).
 * @returns {string[]}
 */
export function getRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

/**
 * Push a file name to the top of the recents list.
 * Deduplicates and trims to RECENT_MAX entries.
 * @param {string} name
 */
export function addRecentFile(name) {
  if (!name) return;
  const list = getRecentFiles().filter((n) => n !== name);
  list.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

/**
 * Remove a file name from the recents list (call after deletion).
 * @param {string} name
 */
export function removeRecentFile(name) {
  if (!name) return;
  const list = getRecentFiles().filter((n) => n !== name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

// ─── Helpers ────────────────────────────────────────────────

function sanitiseName(name) {
  // Replace characters illegal in most filesystems
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}

/** Format bytes to human-readable */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
