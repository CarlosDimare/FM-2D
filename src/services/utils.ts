// Random number between min and max (inclusive)
export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Weighted random to simulate bell curves for attributes
export const weightedRandom = (min: number, max: number, skew: number = 1): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  num = num / 10.0 + 0.5;
  if (num > 1 || num < 0) num = weightedRandom(min, max, skew);

  num = Math.pow(num, skew);
  num *= max - min;
  num += min;
  return Math.round(num);
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// --- INDEXED DB SAVING SYSTEM ---

const DB_NAME = 'FM_ARG_DB_V2';
const STORE_NAME = 'saves';
const PROFILES_KEY = 'fm_arg_profiles';

export interface SaveMetadata {
  id: string;
  label: string;
  date: Date;
  teamName: string;
  managerName: string;
  profile?: string;
}

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const toSafeDate = (val: unknown): Date => {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const LS_INDEX_KEY = 'fm2_saves_index_v1';
const LS_SAVE_PREFIX = 'fm2_save_v1_';
const GZIP_PREFIX = 'GZ1:';

type StoredSaveIndexEntry = {
  id: string;
  label: string;
  date: string;
  teamName: string;
  managerName: string;
  storage: 'localStorage' | 'indexedDB';
};

const readLocalSaveIndex = (): StoredSaveIndexEntry[] => {
  try {
    const raw = localStorage.getItem(LS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalSaveIndex = (entries: StoredSaveIndexEntry[]): void => {
  try {
    localStorage.setItem(LS_INDEX_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
};

const compressTextToBase64 = async (text: string): Promise<string | null> => {
  try {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return GZIP_PREFIX + btoa(binary);
  } catch {
    return null;
  }
};

const decompressTextFromBase64 = async (stored: string): Promise<string> => {
  if (!stored.startsWith(GZIP_PREFIX)) return stored;
  const binary = atob(stored.slice(GZIP_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
};

const putInIndexedDB = async (data: any): Promise<void> => {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(data);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const getFromIndexedDB = async (id: string): Promise<any | null> => {
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
};

const listFromIndexedDB = async (): Promise<SaveMetadata[]> => {
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results: SaveMetadata[] = (req.result || []).map((item: any) => ({
          id: item.id,
          label: item.label || 'Partida sin nombre',
          date: toSafeDate(item.lastPlayed),
          teamName: item.metaTeamName || 'Desconocido',
          managerName: item.metaManagerName || 'Manager',
        }));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
};

const deleteFromIndexedDB = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
};

export const saveGame = async (data: any): Promise<void> => {
  if (!data.id) data.id = generateUUID();
  const id = String(data.id);
  const metaEntry: StoredSaveIndexEntry = {
    id,
    label: data.label || 'Partida sin nombre',
    date: toSafeDate(data.lastPlayed).toISOString(),
    teamName: data.metaTeamName || 'Desconocido',
    managerName: data.metaManagerName || 'Manager',
    storage: 'localStorage',
  };

  let storedInLocalStorage = false;
  try {
    const serialized = JSON.stringify(data);
    const compressed = await compressTextToBase64(serialized);
    const payload = compressed && compressed.length < serialized.length ? compressed : serialized;
    localStorage.setItem(`${LS_SAVE_PREFIX}${id}`, payload);
    storedInLocalStorage = true;
    // Limpiar copia previa en IndexedDB si existía para evitar duplicados
    void deleteFromIndexedDB(id);
  } catch {
    storedInLocalStorage = false;
  }

  if (!storedInLocalStorage) {
    // Respaldo transparente en IndexedDB si el guardado supera el límite de cuota de localStorage
    try { localStorage.removeItem(`${LS_SAVE_PREFIX}${id}`); } catch { /* ignore */ }
    await putInIndexedDB(data);
    metaEntry.storage = 'indexedDB';
  }

  const index = readLocalSaveIndex().filter(e => e.id !== id);
  index.unshift(metaEntry);
  writeLocalSaveIndex(index);
};

export const loadGame = async (id: string): Promise<any | null> => {
  try {
    const raw = localStorage.getItem(`${LS_SAVE_PREFIX}${id}`);
    if (raw) {
      const jsonText = await decompressTextFromBase64(raw);
      return JSON.parse(jsonText);
    }
  } catch (err) {
    console.warn('Error reading save from localStorage, trying fallback:', err);
  }
  return await getFromIndexedDB(id);
};

export const listSaves = async (): Promise<SaveMetadata[]> => {
  const byId = new Map<string, SaveMetadata>();

  // 1. Partidas indexadas en localStorage
  for (const entry of readLocalSaveIndex()) {
    byId.set(entry.id, {
      id: entry.id,
      label: entry.label || 'Partida sin nombre',
      date: toSafeDate(entry.date),
      teamName: entry.teamName || 'Desconocido',
      managerName: entry.managerName || 'Manager',
    });
  }

  // 2. Compatibilidad con partidas previas en IndexedDB
  const idbSaves = await listFromIndexedDB();
  for (const item of idbSaves) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
};

export const checkSaveExists = async (): Promise<boolean> => {
  if (readLocalSaveIndex().length > 0) return true;
  try {
    const db = await initDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return false;
  }
};

export const deleteSave = async (id: string): Promise<void> => {
  try {
    localStorage.removeItem(`${LS_SAVE_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
  const index = readLocalSaveIndex().filter(e => e.id !== id);
  writeLocalSaveIndex(index);
  await deleteFromIndexedDB(id);
};

export const saveProfile = async (profileName: string, data: any): Promise<void> => {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
    profiles[profileName] = { data, updatedAt: new Date().toISOString() };
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch { /* ignore */ }
};

export const loadProfile = async (profileName: string): Promise<any | null> => {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
    const profile = profiles[profileName];
    return profile ? profile.data : null;
  } catch { return null; }
};

export const listProfiles = async (): Promise<string[]> => {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
    return Object.keys(profiles).sort((a, b) => {
      const da = profiles[a].updatedAt || '';
      const db = profiles[b].updatedAt || '';
      return db.localeCompare(da);
    });
  } catch { return []; }
};

export const deleteProfile = async (profileName: string): Promise<void> => {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || '{}');
    delete profiles[profileName];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch { /* ignore */ }
};