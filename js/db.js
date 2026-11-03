// db.js — layer di storage isolato dietro un'interfaccia semplice.
// Oggi usa IndexedDB; in futuro può essere sostituito (es. sync cloud) senza
// toccare il resto dell'app, perché app.js parla solo con le funzioni esportate qui.

const DB_NAME = 'sleep-screen-lab';
const DB_VERSION = 1;
const STORE = 'entries';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'date' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllEntries() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const map = {};
        req.result.forEach((e) => { map[e.date] = e; });
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('Errore lettura IndexedDB', e);
    return {};
  }
}

export async function saveEntry(entry) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Errore scrittura IndexedDB', e);
    return false;
  }
}

// Preferenze semplici (tema, ultimo promemoria mostrato) — localStorage è
// sufficiente qui: piccoli valori scalari, nessun bisogno di query.
export function getPref(key, fallback) {
  try {
    const v = localStorage.getItem('ssl_' + key);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
export function setPref(key, value) {
  try { localStorage.setItem('ssl_' + key, value); } catch (e) { /* ignore */ }
}
