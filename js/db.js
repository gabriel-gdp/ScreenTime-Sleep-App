// db.js — layer di storage isolato dietro un'interfaccia semplice.
// Oggi usa IndexedDB; in futuro può essere sostituito (es. sync cloud) senza
// toccare il resto dell'app, perché app.js parla solo con le funzioni esportate qui.

const DB_NAME = 'sleep-screen-lab';
// v2: un record = una notte intera (vedi commento in analytics.js).
const DB_VERSION = 2;
const STORE = 'entries';
// Versione dello schema dei record, scritta nei backup JSON: un backup
// creato con uno schema precedente viene migrato con le stesse funzioni
// usate dall'aggiornamento del database.
export const SCHEMA_VERSION = DB_VERSION;

// Campi che nella v1 venivano salvati nel record del giorno in cui si
// compilava il check-in serale, ma che descrivono la notte che termina il
// giorno DOPO. La migrazione li sposta nel record di quella notte.
const EVENING_FIELDS = ['screenTimeTotal', 'lastScreenUse', 'is_outlier_screen_time', 'outlier_acknowledged_screen_time'];

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isEmpty(v) { return v === '' || v == null; }

// Trasformazione pura v1 → v2 (nessun accesso al database): usata sia
// dall'aggiornamento di IndexedDB sia dall'importazione di backup v1.
export function migrateRecordsV1toV2(records) {
  const next = {};
  const target = (date) => (next[date] = next[date] || { date });
  records.forEach((old) => {
    Object.keys(old).forEach((k) => {
      if (k === 'date' || isEmpty(old[k])) return;
      const date = EVENING_FIELDS.includes(k) ? nextDay(old.date) : old.date;
      target(date)[k] = old[k];
    });
  });
  return Object.values(next);
}

// Porta un elenco di record dallo schema `fromVersion` a quello attuale.
export function migrateRecords(records, fromVersion) {
  let out = records;
  if (fromVersion < 2) out = migrateRecordsV1toV2(out);
  return out;
}

// Eseguita dentro la transazione di upgrade: se qualcosa fallisce, l'intero
// upgrade viene annullato e i dati v1 restano intatti.
function migrateV1toV2(store) {
  const req = store.getAll();
  req.onsuccess = () => {
    const next = migrateRecordsV1toV2(req.result);
    store.clear();
    next.forEach((r) => store.put(r));
  };
}

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'date' });
        return;
      }
      if (e.oldVersion < 2) migrateV1toV2(req.transaction.objectStore(STORE));
    };
    req.onsuccess = () => {
      const db = req.result;
      // Se un'altra scheda/versione dell'app chiede un upgrade, chiudiamo
      // per non bloccarla; la prossima operazione riaprirà la connessione.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('Apertura IndexedDB in attesa: chiudi le altre schede dell\'app.');
  });
  return dbPromise;
}

// Lancia un errore se la lettura fallisce: l'app deve poter distinguere
// "nessun dato" da "dati non leggibili" e non mostrare un diario vuoto.
export async function getAllEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => {
      const map = {};
      req.result.forEach((e) => { map[e.date] = e; });
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

async function write(op) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transazione annullata'));
      try {
        op(tx.objectStore(STORE));
      } catch (e) {
        // Senza abort le scritture già inviate in questa transazione
        // verrebbero comunque salvate: con più record (importazione) si
        // otterrebbe un risultato a metà.
        try { tx.abort(); } catch (_) { /* già chiusa */ }
        reject(e);
      }
    });
  } catch (e) {
    console.error('Errore scrittura IndexedDB', e);
    return false;
  }
}

// Ritornano true solo a transazione completata con successo.
export function saveEntry(entry) { return write((store) => store.put(entry)); }
export function deleteEntry(date) { return write((store) => store.delete(date)); }

// Importazione da backup: TUTTI i record in un'unica transazione. Se anche
// una sola scrittura fallisce la transazione viene annullata e il database
// resta esattamente com'era prima (nessuna importazione a metà).
export function importEntries(records) {
  return write((store) => { records.forEach((r) => store.put(r)); });
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
