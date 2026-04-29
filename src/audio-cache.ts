const DB_NAME = "mimo-tts-cache";
const DB_VERSION = 1;
const STORE_NAME = "audio";

interface CacheEntry {
  key: string;
  audioData: ArrayBuffer;
  format: string;
  createdAt: number;
}

/**
 * IndexedDB-based audio cache for TTS synthesis results.
 * No external dependencies — uses native IndexedDB API.
 */
export class AudioCache {
  private db: IDBDatabase | null = null;
  private expiryDays: number;

  constructor(expiryDays: number = 7) {
    this.expiryDays = expiryDays;
  }

  setExpiryDays(days: number): void {
    this.expiryDays = days;
  }

  async open(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
    });
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // Check expiry
        const ageMs = Date.now() - entry.createdAt;
        const maxAgeMs = this.expiryDays * 24 * 60 * 60 * 1000;
        if (ageMs > maxAgeMs) {
          // Expired — delete and return null
          void this.delete(key);
          resolve(null);
          return;
        }

        resolve(entry.audioData);
      };

      request.onerror = () => {
        reject(new Error(`Cache read failed: ${request.error?.message}`));
      };
    });
  }

  async set(key: string, audioData: ArrayBuffer, format: string): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = {
        key,
        audioData,
        format,
        createdAt: Date.now(),
      };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Cache write failed: ${request.error?.message}`));
      };
    });
  }

  async delete(key: string): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Cache delete failed: ${request.error?.message}`));
      };
    });
  }

  async clear(): Promise<void> {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(new Error(`Cache clear failed: ${request.error?.message}`));
      };
    });
  }

  async purgeExpired(): Promise<number> {
    await this.open();
    const maxAgeMs = this.expiryDays * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    let purged = 0;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("createdAt");
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          purged++;
          cursor.continue();
        } else {
          resolve(purged);
        }
      };

      request.onerror = () => {
        reject(new Error(`Cache purge failed: ${request.error?.message}`));
      };
    });
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

/**
 * Build a cache key from synthesis parameters.
 */
export function buildCacheKey(
  text: string,
  model: string,
  voice: string,
  styleInstruction: string,
  format: string,
  endpoint: string
): string {
  const raw = `${endpoint}|${model}|${voice}|${styleInstruction}|${format}|${text}`;
  return simpleHash(raw);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `tts-${Math.abs(hash).toString(36)}`;
}
