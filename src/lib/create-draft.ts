import { isFreshTimestamp } from '@/lib/auth-return';

export type CreateDraftSlot =
  | 'solo'
  | 'farLeft'
  | 'left'
  | 'center'
  | 'right'
  | 'farRight';

export interface CreateDraftPhoto {
  slot: CreateDraftSlot;
  name: string;
  type: string;
  blob: Blob;
}

export interface CreateDraftSettings {
  modelOption: string;
  resolution: string;
  duration: number;
  aspectRatio: string;
}

/** Local photos plus the choices needed to resume generate after OAuth. */
export interface CreateDraft {
  campaign: 'bulin' | 'bridges' | 'peeper';
  effect: 'solo' | 'trio';
  settings: CreateDraftSettings;
  photos: CreateDraftPhoto[];
  savedAt: number;
}

const DB_NAME = 'bulin-create-draft';
const STORE = 'draft';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export async function saveCreateDraft(draft: CreateDraft) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withStore('readwrite', (store) => store.put(draft, KEY));
  } catch {
    // Quota or private mode. Same-page email sign-in still has the files.
  }
}

export async function loadCreateDraft(): Promise<CreateDraft | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const draft = await withStore<CreateDraft | undefined>(
      'readonly',
      (store) => store.get(KEY)
    );
    if (!draft?.photos?.length || !isFreshTimestamp(draft.savedAt)) {
      if (draft) await clearCreateDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export async function clearCreateDraft() {
  if (typeof indexedDB === 'undefined') return;
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // Ignore — a stale draft expires on the next read.
  }
}
