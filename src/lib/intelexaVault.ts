// Client-side IndexedDB Vault for Intelexa Audio Sessions & Transcripts
// Ensures 100% data persistence on mobile devices, offline conference halls, and page reloads.

const DB_NAME = "IntelexaVaultDB";
const DB_VERSION = 1;
const STORE_SESSIONS = "sessions";
const STORE_CHUNKS = "audio_chunks";

export interface VaultSession {
  id: string;
  eventName: string;
  eventType: string;
  startTime: number;
  durationSeconds: number;
  whisperTranscript: string;
  webSpeechTranscript: string;
  finalTranscript?: string;
  chunkCount: number;
  updatedAt: number;
}

export interface VaultAudioChunk {
  sessionId: string;
  chunkIndex: number;
  offsetSec: number;
  blob: Blob;
  whisperText?: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunkStore = db.createObjectStore(STORE_CHUNKS, {
          keyPath: ["sessionId", "chunkIndex"],
        });
        chunkStore.createIndex("sessionId", "sessionId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save or update a session header in IndexedDB
 */
export async function saveVaultSession(session: Partial<VaultSession> & { id: string }): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    const store = tx.objectStore(STORE_SESSIONS);

    const getReq = store.get(session.id);
    getReq.onsuccess = () => {
      const existing = getReq.result || {};
      const updated: VaultSession = {
        ...existing,
        ...session,
        updatedAt: Date.now(),
      };
      store.put(updated);
    };
  } catch (err) {
    console.warn("IntelexaVault: failed to save session", err);
  }
}

/**
 * Store an audio chunk blob and transcription in IndexedDB
 */
export async function saveVaultChunk(chunk: VaultAudioChunk): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_CHUNKS, "readwrite");
    const store = tx.objectStore(STORE_CHUNKS);
    store.put(chunk);
  } catch (err) {
    console.warn("IntelexaVault: failed to save chunk", err);
  }
}

/**
 * Retrieve all audio chunks for a given session
 */
export async function getVaultChunks(sessionId: string): Promise<VaultAudioChunk[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CHUNKS, "readonly");
      const store = tx.objectStore(STORE_CHUNKS);
      const index = store.index("sessionId");
      const request = index.getAll(sessionId);

      request.onsuccess = () => {
        const sorted = (request.result || []).sort((a, b) => a.chunkIndex - b.chunkIndex);
        resolve(sorted);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn("IntelexaVault: failed to get chunks", err);
    return [];
  }
}

/**
 * Retrieve a session from IndexedDB
 */
export async function getVaultSession(sessionId: string): Promise<VaultSession | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SESSIONS, "readonly");
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn("IntelexaVault: failed to get session", err);
    return null;
  }
}

/**
 * Delete a session and its audio chunks from IndexedDB
 */
export async function deleteVaultSession(sessionId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx1 = db.transaction(STORE_SESSIONS, "readwrite");
    tx1.objectStore(STORE_SESSIONS).delete(sessionId);

    const tx2 = db.transaction(STORE_CHUNKS, "readwrite");
    const store = tx2.objectStore(STORE_CHUNKS);
    const index = store.index("sessionId");
    const req = index.getAllKeys(sessionId);
    req.onsuccess = () => {
      for (const key of req.result || []) {
        store.delete(key);
      }
    };
  } catch (err) {
    console.warn("IntelexaVault: failed to delete session", err);
  }
}
