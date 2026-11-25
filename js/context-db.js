// context-db.js — archivio contestuale `sleep-screen-context`, separato dal
// database delle notti (`sleep-screen-lab`, db.js, che non viene toccato).
//
// Versione 1, tre object store:
//   profile             { id: 'me', version, data, createdAt, updatedAt }
//   contextPeriods      periodi con date (context.js), chiave `id`, indice `category`
//   contextPreferences  { key, value }: preferenze della personalizzazione e
//                       stato della migrazione del Profilo da localStorage
//
// Ogni funzione restituisce un esito ({ ok: true, ... } oppure
// { ok: false, reason }) e non lancia eccezioni: se l'archivio non è
// disponibile il resto dell'app continua a funzionare. Ogni scrittura è
// confermata solo a transazione completata E dopo una rilettura identica.

import { CONTEXT_DB_NAME, CONTEXT_DB_VERSION, MIGRATION_PREF_KEY } from './context.js';
import { PROFILE_VERSION, parseLegacyProfile, sameProfile, fingerprint } from './profile.js';

const OPEN_TIMEOUT_MS = 4000;
let dbPromise = null;

function openContextDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done({ ok: false, reason: 'timeout' }), OPEN_TIMEOUT_MS);
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { clearTimeout(timer); done({ ok: false, reason: 'unavailable' }); return; }
      req = indexedDB.open(CONTEXT_DB_NAME, CONTEXT_DB_VERSION);
    } catch (e) { clearTimeout(timer); done({ ok: false, reason: 'unavailable', error: e }); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('contextPeriods')) db.createObjectStore('contextPeriods', { keyPath: 'id' }).createIndex('category', 'category');
      if (!db.objectStoreNames.contains('contextPreferences')) db.createObjectStore('contextPreferences', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      const db = req.result;
      const missing = ['profile', 'contextPeriods', 'contextPreferences'].filter((s) => !db.objectStoreNames.contains(s));
      if (missing.length) { db.close(); done({ ok: false, reason: 'corrupt', missing }); return; }
      db.onversionchange = () => { db.close(); dbPromise = null; };
      done({ ok: true, db });
    };
    req.onerror = () => { clearTimeout(timer); done({ ok: false, reason: req.error && req.error.name === 'VersionError' ? 'newer_version' : 'unavailable', error: req.error }); };
    req.onblocked = () => console.warn('Archivio del contesto in attesa: chiudi le altre schede dell\'app.');
  }).then((r) => { if (!r.ok) dbPromise = null; return r; });
  return dbPromise;
}

// Per i test e per "Riprova": dimentica la connessione.
export function resetContextConnection() {
  if (dbPromise) dbPromise.then((r) => { if (r.ok) try { r.db.close(); } catch (e) { /* */ } });
  dbPromise = null;
}

function tx(db, stores, mode, fn) {
  return new Promise((resolve) => {
    let t;
    try { t = db.transaction(stores, mode); } catch (e) { resolve({ ok: false, reason: 'failed', error: e }); return; }
    const out = {};
    t.oncomplete = () => resolve({ ok: true, ...out });
    t.onerror = () => resolve({ ok: false, reason: t.error && t.error.name === 'QuotaExceededError' ? 'quota' : 'failed', error: t.error });
    t.onabort = () => resolve({ ok: false, reason: t.error && t.error.name === 'QuotaExceededError' ? 'quota' : 'aborted', error: t.error });
    try { fn(t, out); } catch (e) { try { t.abort(); } catch (_) { /* */ } resolve({ ok: false, reason: 'failed', error: e }); }
  });
}

const req2val = (r, out, key) => { r.onsuccess = () => { out[key] = r.result; }; };

export async function loadContext() {
  const o = await openContextDB();
  if (!o.ok) return o;
  const r = await tx(o.db, ['profile', 'contextPeriods', 'contextPreferences'], 'readonly', (t, out) => {
    req2val(t.objectStore('profile').get('me'), out, 'profileRec');
    req2val(t.objectStore('contextPeriods').getAll(), out, 'periods');
    req2val(t.objectStore('contextPreferences').getAll(), out, 'preferences');
  });
  if (!r.ok) return r;
  const rec = r.profileRec || null;
  if (rec && (rec.version !== PROFILE_VERSION || !rec.data || typeof rec.data !== 'object')) {
    // Un profilo scritto da una versione più recente non va letto come vuoto
    // né sovrascritto: si segnala.
    return { ok: true, profile: null, profileRecord: rec, profileUnreadable: true, periods: r.periods || [], preferences: r.preferences || [] };
  }
  return { ok: true, profile: rec ? rec.data : null, profileRecord: rec, profileUnreadable: false, periods: r.periods || [], preferences: r.preferences || [] };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function readBack(db, store, key) {
  const r = await tx(db, [store], 'readonly', (t, out) => req2val(t.objectStore(store).get(key), out, 'value'));
  return r.ok ? r.value : undefined;
}

export async function saveProfile(data, now = new Date()) {
  const o = await openContextDB();
  if (!o.ok) return o;
  const prev = await readBack(o.db, 'profile', 'me');
  if (prev && prev.version !== PROFILE_VERSION) return { ok: false, reason: 'unreadable_existing' };
  const rec = { id: 'me', version: PROFILE_VERSION, data, createdAt: prev ? prev.createdAt : now.toISOString(), updatedAt: now.toISOString() };
  const w = await tx(o.db, ['profile'], 'readwrite', (t) => t.objectStore('profile').put(rec));
  if (!w.ok) return w;
  const back = await readBack(o.db, 'profile', 'me');
  return same(back, rec) ? { ok: true, record: rec } : { ok: false, reason: 'verify_failed' };
}

export async function deleteProfile() {
  const o = await openContextDB();
  if (!o.ok) return o;
  const w = await tx(o.db, ['profile'], 'readwrite', (t) => t.objectStore('profile').delete('me'));
  if (!w.ok) return w;
  return (await readBack(o.db, 'profile', 'me')) === undefined ? { ok: true } : { ok: false, reason: 'verify_failed' };
}

export async function putPeriod(period) {
  const o = await openContextDB();
  if (!o.ok) return o;
  const w = await tx(o.db, ['contextPeriods'], 'readwrite', (t) => t.objectStore('contextPeriods').put(period));
  if (!w.ok) return w;
  return same(await readBack(o.db, 'contextPeriods', period.id), period) ? { ok: true } : { ok: false, reason: 'verify_failed' };
}

export async function deletePeriod(id) {
  const o = await openContextDB();
  if (!o.ok) return o;
  const w = await tx(o.db, ['contextPeriods'], 'readwrite', (t) => t.objectStore('contextPeriods').delete(id));
  if (!w.ok) return w;
  return (await readBack(o.db, 'contextPeriods', id)) === undefined ? { ok: true } : { ok: false, reason: 'verify_failed' };
}

export async function setContextPreference(key, value) {
  const o = await openContextDB();
  if (!o.ok) return o;
  const rec = { key, value };
  const w = await tx(o.db, ['contextPreferences'], 'readwrite', (t) => t.objectStore('contextPreferences').put(rec));
  if (!w.ok) return w;
  return same(await readBack(o.db, 'contextPreferences', key), rec) ? { ok: true } : { ok: false, reason: 'verify_failed' };
}

// Scrittura di un ripristino in un'unica transazione: o tutto o niente.
// replaceAll: svuota il contesto (tranne lo stato della migrazione) e
// scrive il contenuto del file. Dopo la scrittura si rilegge e si confronta.
export async function writeContextBatch({ profile, periods = [], preferences = [], replaceAll = false }, now = new Date()) {
  const o = await openContextDB();
  if (!o.ok) return o;
  let migrationRec = null;
  const profRec = profile ? { id: 'me', version: PROFILE_VERSION, data: profile, createdAt: now.toISOString(), updatedAt: now.toISOString() } : null;
  const w = await tx(o.db, ['profile', 'contextPeriods', 'contextPreferences'], 'readwrite', (t, out) => {
    const prefs = t.objectStore('contextPreferences');
    if (replaceAll) {
      const g = prefs.get(MIGRATION_PREF_KEY);
      g.onsuccess = () => {
        migrationRec = g.result || null;
        t.objectStore('profile').clear();
        t.objectStore('contextPeriods').clear();
        prefs.clear();
        if (migrationRec) prefs.put(migrationRec);
        if (profRec) t.objectStore('profile').put(profRec);
        periods.forEach((p) => t.objectStore('contextPeriods').put(p));
        preferences.forEach((x) => prefs.put(x));
      };
    } else {
      if (profRec) t.objectStore('profile').put(profRec);
      periods.forEach((p) => t.objectStore('contextPeriods').put(p));
      preferences.forEach((x) => prefs.put(x));
    }
    out.done = true;
  });
  if (!w.ok) return w;
  const after = await loadContext();
  if (!after.ok) return { ok: false, reason: 'verify_failed' };
  const byId = Object.fromEntries(after.periods.map((p) => [p.id, p]));
  const periodsOk = periods.every((p) => same(byId[p.id], p)) && (!replaceAll || after.periods.length === periods.length);
  const profileOk = profile === undefined || (profile === null ? (!replaceAll || after.profile === null) : same(after.profile, profile));
  return periodsOk && profileOk ? { ok: true, context: after } : { ok: false, reason: 'verify_failed' };
}

// ---------- Migrazione una tantum da localStorage `ssl_profile` ----------
// 1 lettura → 2 validazione → 3 scrittura → 4 rilettura → 5 confronto →
// 6 registrazione del completamento → 7 l'originale resta in localStorage.
// Se qualcosa fallisce l'originale non è toccato, non si creano duplicati
// (il profilo ha una sola chiave, 'me') e la migrazione si può ripetere.
// Esiti: done (migrated | empty | skipped), already, conflict, failed.
export async function migrateLegacyProfile(readRaw, todayISO, now = new Date()) {
  const o = await openContextDB();
  if (!o.ok) return { status: 'failed', reason: o.reason };
  const status = await readBack(o.db, 'contextPreferences', MIGRATION_PREF_KEY);
  if (status && status.value && ['migrated', 'empty', 'skipped'].includes(status.value.status)) return { status: 'already', record: status.value };
  let raw;
  try { raw = readRaw(); } catch (e) { return { status: 'failed', reason: 'source_unreadable' }; }
  const parsed = parseLegacyProfile(raw, todayISO);
  const mark = async (value) => {
    const r = await setContextPreference(MIGRATION_PREF_KEY, value);
    return r.ok ? { status: 'done', record: value } : { status: 'failed', reason: 'mark_failed' };
  };
  if (parsed.status === 'empty') return mark({ status: 'empty', at: now.toISOString() });
  if (parsed.status === 'corrupt' || parsed.status === 'unknown_version') {
    return { status: 'failed', reason: parsed.status, version: parsed.version };
  }
  const existing = await readBack(o.db, 'profile', 'me');
  if (existing) {
    // Un tentativo precedente può aver scritto il profilo senza registrare
    // il completamento: se è identico si registra, altrimenti non si
    // sovrascrive nulla e si chiede all'utente.
    if (existing.version === PROFILE_VERSION && sameProfile(existing.data, parsed.profile)) {
      return mark({ status: 'migrated', at: now.toISOString(), source: fingerprint(raw), dropped: parsed.dropped });
    }
    return { status: 'conflict', legacy: parsed.profile, current: existing.data || null };
  }
  const w = await saveProfile(parsed.profile, now);
  if (!w.ok) return { status: 'failed', reason: w.reason };
  const back = await readBack(o.db, 'profile', 'me');
  if (!back || !sameProfile(back.data, parsed.profile)) return { status: 'failed', reason: 'verify_failed' };
  return mark({ status: 'migrated', at: now.toISOString(), source: fingerprint(raw), dropped: parsed.dropped });
}

// Scelta dell'utente dopo un conflitto o un originale illeggibile: si
// registra la decisione; l'originale in localStorage resta comunque.
export async function resolveMigration(choice, legacyProfile, now = new Date()) {
  if (choice === 'use_legacy' && legacyProfile) {
    const w = await saveProfile(legacyProfile, now);
    if (!w.ok) return { status: 'failed', reason: w.reason };
    const r = await setContextPreference(MIGRATION_PREF_KEY, { status: 'migrated', at: now.toISOString(), choice });
    return r.ok ? { status: 'done' } : { status: 'failed', reason: 'mark_failed' };
  }
  const r = await setContextPreference(MIGRATION_PREF_KEY, { status: 'skipped', at: now.toISOString(), choice });
  return r.ok ? { status: 'done' } : { status: 'failed', reason: 'mark_failed' };
}
