import { getAllEntries, saveEntry, deleteEntry, importEntries, getPref, setPref as writePref, removePref, SCHEMA_VERSION, migrateRecords, inspectDatabase } from './db.js';
import { buildBackup, backupFilename, parseBackup, planImport, sameRecord, downloadFile, MAX_BACKUP_BYTES } from './backup.js';
import {
  pad, todayISO, addDays, nowHHMM, computeNightMetrics, dayStatus,
  daysInMonth, firstWeekdayOfMonth, WEEKDAY_LABELS, downloadCSV, formatDuration,
  minutesToHHMM, hhmmToMinutes,
  periodSummary, regularityForWindow, screenInBedStatus,
  applyDescriptiveFilters, DEFAULT_DESCRIPTIVE_FILTERS, filtersActive,
  bedtimeRangeWarning, wakeTimeRangeWarning, screenTimeTotalWarning,
  eveningComplete, sleepComplete, eveningStarted, sleepStarted,
} from './analytics.js';
import { ANALYSIS_CONFIG as CFG } from './config.js';
import { generateDemoEntries, DEMO_NIGHTS } from './demo.js';
import { SOURCES, LINKS, STATUS, SUMMARY, BIBLIOGRAPHY_SOURCE } from './bibliography.js';
// Profilo e contesto (archivio separato `sleep-screen-context`): solo
// personalizzazione e contestualizzazione, mai letti da analisi, backup
// delle notti o CSV. Interfaccia in ui-profile.js.
import { sriHTML, trendSectionHTML } from './ui-trends.js';
import { initContext, renderProfile as renderProfileScreen, contextGreetingName, contextBirthday, nightContextHTML, contextTrendHTML } from './ui-profile.js';
import {
  FIELD_LABELS, PROVENANCE_GROUPS, PROVENANCE_LABELS, SCREEN_STATUS_LABELS, MANUAL_MAX_DAYS_BEFORE,
  provenanceSummary, fieldsOfGroups, planProvenance, planScreenDate, manualScreenDate, verifyOperation,
} from './provenance.js';
import {
  QUESTIONS, analyzeAll, abstentionText, provenanceNote, resultTexts, sensitivityText, habitualAttempt, newCache, inPresleepWindow,
} from './inference.js';
import {
  EMPTY_DRAFT, draftFromRecord, draftToRecord, sameData, hasData, parseIntInput,
  awakeningsDraftError, awakeningsUnknownHistoric, AWAKENINGS_MAX, AWAKE_MINUTES_MAX,
  CONTEXT_FIELDS, DAY_TYPES, PROVENANCE_FIELDS, lateChangedFields, withMeta, screenTimeReference, provenanceOf,
} from './record.js';

const svg = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;
const ICONS = {
  moon: svg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  sunrise: svg('<path d="M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  smartphone: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>'),
  trending: svg('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  settings: svg('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
  chevronLeft: svg('<polyline points="15 18 9 12 15 6"/>'),
  chevronRight: svg('<polyline points="9 18 15 12 9 6"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  user: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
};

// Il record di una notte (campi, bozze, regole dei risvegli) è definito in
// record.js, condiviso con il backup.
const isEmpty = (v) => v === '' || v == null;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const state = {
  theme: getPref('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  tab: 'today',
  entries: {},
  loaded: false,
  loadError: false,
  selectedDate: todayISO(), // giorno di RISVEGLIO della notte aperta
  // Bozze non salvate, una per notte: cambiare notte o schermata non fa
  // perdere quanto già inserito.
  drafts: {},
  saving: false,
  // Armato dal primo tap su "Salva" se ci sono valori insoliti (non
  // bloccanti); il secondo tap conferma. Si azzera a ogni modifica.
  confirmPending: false,
  saveMsg: { type: '', text: '' },
  calendarMonth: (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })(),
  remindersEnabled: getPref('reminders_enabled', '0') === '1',
  // Data di risveglio della notte per cui l'avviso è stato ignorato.
  reminderDismissed: getPref('reminder_dismissed_night', ''),
  updateReady: false, // nuova versione attiva ma non ancora applicata (bozze aperte)
  storagePersisted: null, // true/false se il browser lo dichiara, null se non si sa
  renderedDay: null, // giorno di calendario dell'ultimo rendering (per il cambio data)
  // Modalità demo: entries punta ai dati di esempio, realEntries custodisce
  // quelli veri. Non persistita: riaprendo l'app si riparte sempre dai dati
  // reali, così non si rischia di compilare per errore notti finte.
  demo: false,
  realEntries: null,
  realDrafts: null,
  includeOutliers: false,
  // Periodo del riepilogo in Andamento (7, 28 o 90 notti): preferenza locale.
  period: [7, 28, 90].includes(Number(getPref('trend_period', '7'))) ? Number(getPref('trend_period', '7')) : 7,
  // Filtri delle descrizioni (Fase 5.1): preferenza di questo dispositivo.
  filters: readFilters(),
  // Misura scelta in "Andamento di una misura" (L3): preferenza locale.
  trendVariable: getPref('trend_variable', 'duration'),
  // Navigazione nel tempo del riepilogo (0 = periodo che finisce oggi).
  periodOffset: 0,
  // Ripristino da backup in corso: null, { error }, { records, meta, mode,
  // confirm, busy } oppure { done, ok, text }.
  importState: null,
  // Schema settimanale dei giorni vincolati/liberi (indice = giorno della
  // settimana del risveglio, 0 = domenica) e definizioni dei chip.
  dayTemplate: readTemplate(),
  contextDefs: {
    lateCaffeineFrom: readTimePref('late_caffeine_from', CFG.LATE_CAFFEINE_FROM),
    alcoholFrom: readTimePref('alcohol_from', CFG.ALCOHOL_FROM),
  },
  // Aggiornamento del database in attesa (schermata con backup verificato).
  migration: null,
  // Preferenza locale non salvata (setPref fallito): mostra un avviso.
  prefError: null,
  // Dati inseriti oltre la finestra di tempestività: domanda sull'origine.
  askProvenance: false,
  // Strumento "Origine dei dati" (Impostazioni): null oppure
  // { mode: 'prov' | 'screen', ...scelte, busy, result, undo }.
  provTool: null,
};
function readTemplate() {
  try {
    const t = JSON.parse(getPref('daytype_template', 'null'));
    if (Array.isArray(t) && t.length === 7 && t.every((v) => DAY_TYPES.includes(v))) return t;
  } catch (e) { /* valore non valido: si usa lo schema iniziale */ }
  return [...CFG.DEFAULT_DAYTYPE_TEMPLATE];
}
function readTimePref(key, fallback) {
  const v = getPref(key, fallback);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}

const root = document.getElementById('app');
applyTheme(state.theme);

async function init() {
  window.__sslBooted = true; // vedi controllo di avvio in index.html
  // Prima di aprire il database alla versione attuale si controlla se
  // serve un aggiornamento: in quel caso si chiede un backup verificato e
  // si confrontano i dati prima e dopo (vedi renderMigration).
  try {
    const info = await inspectDatabase();
    if (info.needsUpgrade) {
      state.migration = { fromVersion: info.version, before: info.records, step: 'backup', backupOk: false, saved: false };
      state.loaded = true;
      render();
      return;
    }
  } catch (e) {
    console.error('Controllo della versione del database non riuscito', e);
  }
  await startApp();
}

async function startApp() {
  try {
    state.entries = await getAllEntries();
  } catch (e) {
    console.error('Errore lettura IndexedDB', e);
    state.loadError = true;
  }
  state.loaded = true;
  if (!state.loadError) restoreDrafts();
  state.selectedDate = defaultNight();
  render();
  if (!state.loadError) checkReminder();
  // Archivio del Profilo e del contesto: facoltativo, non blocca il Diario.
  initContext({
    getPref, removePref, todayISO,
    onChange: () => { if (!state.migration && state.loaded) render(); },
  }).catch((e) => console.warn('Contesto non disponibile', e));
  registerServiceWorker();
  requestPersistentStorage();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onResume(); });
  setInterval(() => { if (document.visibilityState === 'visible') onDayChange(); }, 60000);
}

// ---------- Bozze persistenti ----------
// Le bozze non salvate vengono copiate in localStorage a ogni modifica:
// iOS chiude spesso le app in background, e un aggiornamento dell'app
// ricarica la pagina. In entrambi i casi quanto inserito si ritrova.
// Restano BOZZE: non entrano nelle analisi né nel database finché non le
// salvi. In demo non vengono scritte (sono dati finti).
const DRAFTS_KEY = 'drafts_v1';
function persistDrafts() {
  if (state.demo) return;
  const dirty = {};
  Object.keys(state.drafts).forEach((date) => { if (isDirty(date)) dirty[date] = state.drafts[date]; });
  setPref(DRAFTS_KEY, JSON.stringify(dirty));
}
function restoreDrafts() {
  let stored = {};
  try { stored = JSON.parse(getPref(DRAFTS_KEY, '{}')) || {}; } catch (e) { stored = {}; }
  Object.entries(stored).forEach(([date, d]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !d || typeof d !== 'object') return;
    const draft = { ...EMPTY_DRAFT };
    if (typeof d.screenTimeTotal === 'number' && d.screenTimeTotal >= 0 && d.screenTimeTotal < 1440) draft.screenTimeTotal = d.screenTimeTotal;
    ['lastScreenUse', 'bedtime', 'wakeTime', 'inBedTime', 'sleepAttempt'].forEach((f) => { if (typeof d[f] === 'string' && /^\d{2}:\d{2}$/.test(d[f])) draft[f] = d[f]; });
    if (DAY_TYPES.includes(d.dayType)) { draft.dayType = d.dayType; draft.dayTypeSource = d.dayTypeSource === 'template' ? 'template' : 'confirmed'; }
    else if (d.dayType === null) { draft.dayType = null; draft.dayTypeSource = null; }
    CONTEXT_FIELDS.forEach((f) => { if (typeof d[f] === 'boolean' || d[f] === null) draft[f] = d[f]; });
    if (d.lastScreenUseSource === 'button' || d.lastScreenUseSource === 'manual') draft.lastScreenUseSource = d.lastScreenUseSource;
    if (Number.isInteger(d.quality) && d.quality >= 1 && d.quality <= 10) draft.quality = d.quality;
    if (d.awakeningsOn === true || d.awakeningsOn === false || d.awakeningsOn === null) draft.awakeningsOn = d.awakeningsOn;
    if (Number.isInteger(d.awakenings) && d.awakenings >= 1 && d.awakenings <= AWAKENINGS_MAX) draft.awakenings = d.awakenings;
    if (Number.isInteger(d.awakeMinutes) && d.awakeMinutes >= 1 && d.awakeMinutes <= AWAKE_MINUTES_MAX) draft.awakeMinutes = d.awakeMinutes;
    state.drafts[date] = draft;
  });
  persistDrafts(); // ripulisce le bozze che nel frattempo coincidono con i dati salvati
}
const hasDirtyDrafts = () => Object.keys(state.drafts).some(isDirty);

// ---------- Aggiornamenti dell'app ----------
let swRegistration = null;
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  // Una nuova versione ha preso il controllo. Se non c'è nulla in sospeso
  // si ricarica subito; se ci sono bozze o un salvataggio in corso non si
  // interrompe l'utente: compare un avviso e si aggiorna quando vuole
  // (le bozze restano in localStorage; se la scrittura fallisce lo dice
  // l'avviso di setPref).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!hasDirtyDrafts() && !state.saving) { applyUpdate(); return; }
    state.updateReady = true;
    render();
  });
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
    .then((reg) => { swRegistration = reg; })
    .catch((e) => console.error('SW registration failed', e));
}
let reloading = false;
function applyUpdate() {
  if (reloading) return;
  reloading = true;
  persistDrafts();
  location.reload();
}

// L'app su iPhone può restare in memoria per giorni: al ritorno in primo
// piano si controllano aggiornamenti e cambio di data.
function onResume() {
  if (swRegistration) swRegistration.update().catch(() => {});
  onDayChange();
}
function onDayChange() {
  if (!state.loaded || state.loadError || state.renderedDay === todayISO()) return;
  // Non si sposta la notte aperta sotto le mani di chi sta scrivendo.
  const editing = document.activeElement && document.activeElement.classList.contains('time-native');
  if (editing) return;
  if (!hasDirtyDrafts()) state.selectedDate = defaultNight();
  render();
  checkReminder();
}

async function requestPersistentStorage() {
  // Chiede al browser di non cancellare i dati in caso di poco spazio o
  // di inattività prolungata. Non mostra richieste all'utente; l'esito è
  // indicato nelle Impostazioni.
  try {
    if (!navigator.storage || !navigator.storage.persisted) return;
    let ok = await navigator.storage.persisted();
    if (!ok && navigator.storage.persist) ok = await navigator.storage.persist();
    state.storagePersisted = ok;
  } catch (e) { state.storagePersisted = null; }
}

// Notte aperta di default, decisa dallo stato dei dati (non dall'ora):
// se la notte appena trascorsa non ha ancora il risveglio compilato si apre
// quella, altrimenti la notte che inizia stasera.
function defaultNight() {
  const t = todayISO();
  return sleepComplete(state.entries[t]) ? addDays(t, 1) : t;
}

// ---------- Bozze ----------
function draftFor(date) {
  if (!state.drafts[date]) state.drafts[date] = draftFromRecord(state.entries[date], date, state.dayTemplate);
  return state.drafts[date];
}
// Il record che si salverebbe ora: è anche quello usato per i calcoli
// mostrati a schermo, così anteprima e dato salvato coincidono.
const draftRecord = (date) => draftToRecord(draftFor(date), state.entries[date], date, state.contextDefs);
// L'utente ha svuotato tutti i campi di una notte già salvata: salvare
// significa eliminarla, e va detto esplicitamente (e confermato).
function isDeletion(date) {
  return !!state.drafts[date] && !!state.entries[date] && !hasData(draftRecord(date));
}
function isDirty(date) {
  if (!state.drafts[date]) return false;
  return !sameData(draftRecord(date), state.entries[date]);
}

function validate(date) {
  const d = draftFor(date);
  const record = draftRecord(date);
  let m = computeNightMetrics(record, date);
  const bedW = bedtimeRangeWarning(d.bedtime);
  const wakeW = wakeTimeRangeWarning(d.wakeTime);
  const screenW = screenTimeTotalWarning(d.screenTimeTotal);
  // Risvegli: obbligatori e validati solo con la casella selezionata; se
  // mancano o non sono validi il salvataggio è bloccato.
  const awErr = date > todayISO() ? null : awakeningsDraftError(d);
  // Con i risvegli non validi il sonno effettivo non ha senso: si mostra
  // solo l'errore dei risvegli, non un secondo messaggio derivato.
  if (awErr) m = { ...m, effectiveSleepMin: null, effectiveError: null };
  const errors = [m.durationError, m.screenFreeError, m.attemptError, m.inBedError, m.effectiveError, awErr && awErr.text].filter(Boolean);
  const sleepWarnings = [m.durationWarning, m.screenFreeWarning, bedW, wakeW].filter(Boolean);
  const screenWarnings = [screenW].filter(Boolean);
  // Da confermare ma senza segnare la notte come anomala (una latenza
  // lunga può essere reale: non deve escludere la notte dalle analisi).
  const confirmOnly = [m.latencyWarning].filter(Boolean);
  return { d, record, m, awErr, bedW, wakeW, screenW, errors, sleepWarnings, screenWarnings, confirmOnly, warnings: [...screenWarnings, ...sleepWarnings, ...confirmOnly] };
}

// ---------- Etichette ----------
const dayLong = (date) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' });
const monthLong = (date) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { month: 'long' });
const weekdayShort = (date) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
const dayNum = (date) => Number(date.slice(8, 10));

function nightTitle(date) {
  const start = addDays(date, -1);
  const sameMonth = start.slice(0, 7) === date.slice(0, 7);
  // es. "Notte tra lunedì 2 e martedì 3 novembre"
  return sameMonth
    ? `Notte tra ${dayLong(start)} e ${dayLong(date)} ${monthLong(date)}`
    : `Notte tra ${dayLong(start)} ${monthLong(start)} e ${dayLong(date)} ${monthLong(date)}`;
}
function nightChipTop(date) {
  const t = todayISO();
  if (date === addDays(t, 1)) return 'Stasera';
  if (date === t) return 'Notte scorsa';
  return `${weekdayShort(addDays(date, -1))}–${weekdayShort(date)}`;
}
const STATUS_WORD = { complete: 'completa', partial: 'parziale', missing: 'senza dati' };

// ---------- Utility UI ----------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14161C' : '#F6F3EE');
}
const tabContent = () => root.querySelector('#tab-content');

// Ogni preferenza passa da qui: se la scrittura non riesce (spazio
// esaurito, archiviazione bloccata) compare un avviso persistente, invece
// di far credere che la scelta sia stata salvata.
const PREF_ERROR_TEXT = {
  quota: 'lo spazio di archiviazione del browser è esaurito',
  unavailable: 'il browser blocca l\'archiviazione locale (per esempio in navigazione privata)',
  failed: 'la scrittura non è riuscita',
  invalid: 'il valore non è valido',
};
function setPref(key, value) {
  const r = writePref(key, value);
  if (!r.ok) {
    console.warn('Preferenza non salvata', key, r.reason);
    state.prefError = { key, reason: r.reason };
    showPrefErrorBanner();
  }
  return r;
}
function prefErrorBannerHTML() {
  if (!state.prefError) return '';
  return `<div class="demo-banner pref-error" role="alert" id="pref-error">${ICONS.alert}<span><strong>Impostazioni non salvate</strong>: ${PREF_ERROR_TEXT[state.prefError.reason] || PREF_ERROR_TEXT.failed}. Le scelte e le bozze non salvate valgono finché l'app resta aperta; le notti già salvate non sono toccate.</span></div>`;
}
function showPrefErrorBanner() {
  if (!root || root.querySelector('#pref-error')) return;
  const header = root.querySelector('header');
  if (header) header.insertAdjacentHTML('afterend', prefErrorBannerHTML());
}

// Il rendering ricrea i controlli: senza questo, dopo ogni tocco su una
// notte, su "Salva" o su una scheda il focus finiva sul documento e chi
// usa tastiera o VoiceOver perdeva la posizione. Si memorizza "quale"
// controllo aveva il focus (id o attributo dati) e lo si ritrova dopo.
function focusKey(el = document.activeElement) {
  if (!el || el === document.body || !root.contains(el)) return null;
  if (el.id) return `#${el.id}`;
  for (const a of ['data-tab', 'data-date', 'data-q', 'data-open']) {
    if (el.hasAttribute(a)) return `[${a}="${el.getAttribute(a)}"]`;
  }
  return null;
}
function restoreFocus(key, fallback) {
  if (!key) return;
  const el = root.querySelector(key) || (fallback && root.querySelector(fallback));
  if (el) el.focus({ preventScroll: true });
}
function msgHTML(text, kind, id) {
  return `<p class="msg msg-${kind}"${id ? ` id="${id}"` : ''}>${kind === 'info' ? ICONS.info : ICONS.alert}<span>${text}</span></p>`;
}

// Il messaggio "salvato" si ritira da solo dopo qualche secondo, ma solo se
// nel frattempo l'utente non ha cambiato notte/schermata o non è arrivato
// un messaggio più recente.
function fadeSaveMsgAfter(date) {
  const msgAtSaveTime = state.saveMsg;
  setTimeout(() => {
    if (state.tab === 'today' && state.selectedDate === date && state.saveMsg === msgAtSaveTime) {
      state.saveMsg = { type: '', text: '' };
      updateTodayDerived();
    }
  }, 3500);
}

// ---------- Header + Nav ----------
function renderHeader({ profileButton = true } = {}) {
  const dateLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const nextTheme = state.theme === 'light' ? 'scuro' : 'chiaro';
  // Personalizzazione: saluto con il nome scelto nel profilo (se c'è).
  const name = contextGreetingName();
  const greeting = name
    ? `<span class="greeting" id="header-greeting">${contextBirthday(todayISO()) ? 'Buon compleanno' : 'Ciao'}, ${escapeHTML(name)}</span> · `
    : '';
  const onProfile = state.tab === 'profile';
  return `
    <header class="header">
      <div>
        <h1 class="app-title serif">Diario del sonno</h1>
        <p class="date">${greeting}${dateLabel}</p>
      </div>
      <div class="header-actions">
        ${profileButton ? `<button type="button" class="icon-btn ${onProfile ? 'active' : ''}" id="profile-btn" aria-label="Profilo${name ? ` di ${escapeHTML(name)}` : ''}" ${onProfile ? 'aria-current="page"' : ''}>${ICONS.user}</button>` : ''}
        <button type="button" class="icon-btn" id="theme-toggle" aria-label="Passa al tema ${nextTheme}">${state.theme === 'light' ? ICONS.moon : ICONS.sun}</button>
      </div>
    </header>`;
}

function renderNav() {
  const tabs = [
    { id: 'today', icon: ICONS.book, label: 'Diario' },
    { id: 'trend', icon: ICONS.trending, label: 'Andamento' },
    { id: 'calendar', icon: ICONS.calendar, label: 'Calendario' },
    { id: 'settings', icon: ICONS.settings, label: 'Impostazioni' },
  ];
  return `
    <nav class="bottom-nav" aria-label="Navigazione principale"><div class="inner">
      ${tabs.map((t) => `
        <button type="button" data-tab="${t.id}" class="${state.tab === t.id ? 'active' : ''}" ${state.tab === t.id ? 'aria-current="page"' : ''}>
          ${t.icon}<span>${t.label}</span>
        </button>`).join('')}
    </div></nav>`;
}

// ---------- Diario (una notte alla volta) ----------
function nightDates() {
  const t = todayISO();
  const arr = [];
  for (let i = -6; i <= 1; i++) arr.push(addDays(t, i));
  return arr;
}

// La notte "appena conclusa" è quella terminata con il risveglio di oggi
// (prima si controllava per errore quella terminata ieri). Il promemoria
// scatta solo se è completamente vuota: mai per notti compilate in parte.
const reminderNight = () => todayISO();
function reminderDue() {
  const n = reminderNight();
  return !state.loadError && dayStatus(state.entries[n]) === 'missing' && !isDirty(n) && state.reminderDismissed !== n;
}

function renderReminderBanner() {
  const n = reminderNight();
  // Se quella notte è già aperta qui sotto, l'avviso sarebbe un doppione.
  if (!reminderDue() || state.selectedDate === n) return '';
  return `
    <div class="reminder-banner" role="note">
      ${ICONS.alert}
      <span>La notte appena trascorsa (${nightTitle(n).replace('Notte tra ', 'tra ')}) non ha ancora nessun dato.</span>
      <div class="reminder-actions">
        <button type="button" class="link-btn" id="reminder-open">Compila</button>
        <button type="button" class="link-btn muted-link" id="dismiss-reminder">Ignora</button>
      </div>
    </div>`;
}

function chipHTML(date) {
  const active = date === state.selectedDate;
  const status = dayStatus(state.entries[date]);
  const start = addDays(date, -1);
  return `
    <button type="button" class="night-chip ${active ? 'active' : ''}" data-date="${date}" aria-pressed="${active}"
      aria-label="${nightTitle(date)}, ${STATUS_WORD[status]}${isDirty(date) ? ', modifiche non salvate' : ''}">
      <span class="chip-top">${nightChipTop(date)}</span>
      <span class="chip-bottom">${dayNum(start)}→${dayNum(date)}</span>
      <span class="chip-dot ${isDirty(date) ? 'dirty' : status}" aria-hidden="true"></span>
    </button>`;
}

// Campo orario: il valore visibile è un nostro elemento centrato, sempre
// nello stesso formato (24h, o "3h 15m" per lo screen time); sopra c'è il
// campo nativo trasparente, che al tocco apre il selettore a rotelle di iOS.
// Così l'allineamento non dipende da come Safari disegna i campi orario.
function timeDisplay(kind, value) {
  if (isEmpty(value)) return { text: 'Imposta', empty: true };
  return { text: kind === 'duration' ? formatDuration(value) : value, empty: false };
}
function timeRow({ id, label, help, value, kind = 'clock', extra = '' }) {
  const disp = timeDisplay(kind, value);
  const nativeValue = kind === 'duration' ? minutesToHHMM(value) : value;
  return `
    <div class="row">
      <label class="row-label" for="${id}">${label}${help ? `<span class="row-help">${help}</span>` : ''}</label>
      <div class="row-control">${extra}
        <div class="time-field" id="${id}-field">
          <span class="time-display ${disp.empty ? 'is-empty' : ''}" id="${id}-display" aria-hidden="true">${disp.text}</span>
          <input type="time" class="time-native" id="${id}" value="${nativeValue}">
        </div>
      </div>
    </div>
    <div class="row-msg" id="${id}-msg"></div>`;
}

// ---------- Risvegli notturni (vedi record.js per le regole) ----------
function awakeningsHTML(d, date) {
  const on = d.awakeningsOn === true;
  const historic = d.awakeningsOn === null && awakeningsUnknownHistoric(state.entries[date]);
  return `
    <div class="row aw-row">
      <label class="aw-check" for="aw-on">
        <input type="checkbox" id="aw-on" ${on ? 'checked' : ''} aria-controls="aw-fields" aria-expanded="${on}">
        <span>Ho avuto risvegli durante la notte</span>
      </label>
    </div>
    ${historic ? `<div class="row-note" id="aw-historic"><p class="muted small">Per questa notte i risvegli non sono stati registrati: restano "non indicati", a meno che tu non li indichi.</p><button type="button" class="link-btn" id="aw-none">Segna: nessun risveglio</button></div>` : ''}
    <div id="aw-fields" ${on ? '' : 'hidden'}>
      <div class="row">
        <label class="row-label" for="aw-count">Numero di risvegli</label>
        <div class="row-control stepper">
          <button type="button" class="btn-chip step" id="aw-dec" aria-label="Un risveglio in meno">−</button>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="num-input" id="aw-count" value="${on ? d.awakenings : ''}" autocomplete="off">
          <button type="button" class="btn-chip step" id="aw-inc" aria-label="Un risveglio in più">+</button>
        </div>
      </div>
      <div class="row">
        <label class="row-label" for="aw-minutes">Minuti svegli in totale<span class="row-help">Somma approssimativa dei periodi svegli dopo il primo addormentamento, escluso il risveglio finale</span></label>
        <div class="row-control"><input type="text" inputmode="numeric" pattern="[0-9]*" class="num-input" id="aw-minutes" value="${on ? d.awakeMinutes : ''}" placeholder="min" autocomplete="off"><span class="unit" aria-hidden="true">min</span></div>
      </div>
    </div>
    <div class="row-msg" id="aw-msg"></div>`;
}

function attachAwakeningsListeners(d) {
  const $ = (id) => document.getElementById(id);
  const box = $('aw-on');
  if (!box) return; // notte futura: nessun mattino da compilare
  box.addEventListener('change', () => {
    d.awakeningsOn = box.checked;
    if (box.checked && !(Number.isInteger(d.awakenings) && d.awakenings >= 1)) d.awakenings = 1;
    onDraftEdit();
    renderToday(); // mostra o nasconde i campi; il focus resta sulla casella
  });
  const none = $('aw-none');
  if (none) none.addEventListener('click', () => { d.awakeningsOn = false; onDraftEdit(); renderToday(); restoreFocus('#aw-on'); });
  const count = $('aw-count'), minutes = $('aw-minutes');
  if (count) count.addEventListener('input', () => { d.awakenings = parseIntInput(count.value); onDraftEdit(); });
  if (minutes) minutes.addEventListener('input', () => { d.awakeMinutes = parseIntInput(minutes.value); onDraftEdit(); });
  const step = (delta) => {
    const cur = Number.isInteger(d.awakenings) ? d.awakenings : 1;
    d.awakenings = Math.min(AWAKENINGS_MAX, Math.max(1, cur + delta));
    count.value = d.awakenings;
    onDraftEdit();
  };
  if ($('aw-dec')) $('aw-dec').addEventListener('click', () => step(-1));
  if ($('aw-inc')) $('aw-inc').addEventListener('click', () => step(1));
}

// ---------- Schema 4: coricamento, tipo di giorno, indicatori, origine ----------
// Coricamento: facoltativo e compresso, per non allungare il check-in.
function inBedHTML(d) {
  if (isEmpty(d.inBedTime) && !state.showInBed) {
    return `<div class="row-note"><button type="button" class="link-btn" id="inbed-add">+ Aggiungi l'ora in cui sei andato/a a letto</button></div>`;
  }
  return timeRow({ id: 'f-inbed', label: 'Sei andato/a a letto alle', help: 'Facoltativo: quando ti sei messo/a a letto', value: d.inBedTime });
}

function dayTypeHTML(d) {
  return `
    <div class="ctx-block" role="group" aria-labelledby="daytype-label">
      <p class="quality-label" id="daytype-label">Stamattina avevi un orario vincolato?<span class="row-help">Lavoro, studio, appuntamento, sveglia obbligata</span></p>
      <div class="segmented seg-2">
        <button type="button" data-daytype="constrained" aria-pressed="false">Sì, vincolato</button>
        <button type="button" data-daytype="free" aria-pressed="false">No, libero</button>
      </div>
      <p class="muted small" id="daytype-note"></p>
    </div>`;
}

const CONTEXT_UI = [
  { f: 'lateCaffeine', label: () => `Caffeina dopo le ${state.contextDefs.lateCaffeineFrom}`, help: 'Caffè, tè, bevande energetiche o cola' },
  { f: 'alcohol', label: () => `Alcol dalle ${state.contextDefs.alcoholFrom}`, help: 'Almeno una bevanda alcolica fino a quando hai provato a dormire' },
  { f: 'stress', label: () => 'Giornata più stressante del solito', help: 'Rispetto alle tue giornate abituali' },
  { f: 'unusualNight', label: () => 'Notte insolita', help: 'Malattia o sintomi, farmaci insoliti, viaggio o fuso orario, turno notturno, disturbo esterno, evento eccezionale. Viene esclusa dalle analisi, mai cancellata.' },
];
function contextHTML(d) {
  const any = CONTEXT_FIELDS.some((f) => typeof d[f] === 'boolean');
  return `
    <details class="ctx-details" id="ctx-details" ${any || state.ctxOpen ? 'open' : ''}>
      <summary>Ieri e stanotte <span class="muted small" id="ctx-count"></span></summary>
      <p class="muted small">Facoltativo. Tocca di nuovo una risposta per tornare a "non indicato": una risposta mancante non vale come "no".</p>
      ${CONTEXT_UI.map((c) => `
        <div class="ctx-row" role="group" aria-labelledby="ctx-${c.f}">
          <p class="ctx-label" id="ctx-${c.f}">${c.label()}<span class="row-help">${c.help}</span></p>
          <div class="ctx-btns">
            <button type="button" class="btn-chip" data-ctx="${c.f}" data-val="yes" aria-pressed="false">Sì</button>
            <button type="button" class="btn-chip" data-ctx="${c.f}" data-val="no" aria-pressed="false">No</button>
          </div>
        </div>`).join('')}
    </details>`;
}

function provenanceAskHTML() {
  return `
    <div class="prov-ask" role="group" aria-labelledby="prov-ask-title">
      <p class="prov-title" id="prov-ask-title">Stai inserendo dati di più di ${CFG.PROSPECTIVE_WINDOW_HOURS} ore fa. Da dove vengono?</p>
      <p class="muted small">Serve a distinguere le registrazioni dell'epoca da quelle ricostruite. Riguarda solo i campi che hai cambiato ora.</p>
      <div class="prov-btns">
        <button type="button" class="btn-ghost" data-prov="transcribed">Da una nota scritta all'epoca</button>
        <button type="button" class="btn-ghost" data-prov="retrospective">Ricostruiti a memoria</button>
        <button type="button" class="btn-ghost" data-prov="unknown">Non so</button>
      </div>
    </div>`;
}

function attachSchema4Listeners(d) {
  const add = document.getElementById('inbed-add');
  if (add) add.addEventListener('click', () => { state.showInBed = true; renderToday(); restoreFocus('#f-inbed'); });
  root.querySelectorAll('[data-daytype]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.daytype;
    // Toccare la scelta già confermata la toglie (torna "non indicato").
    if (d.dayType === v && d.dayTypeSource === 'confirmed') { d.dayType = null; d.dayTypeSource = null; }
    else { d.dayType = v; d.dayTypeSource = 'confirmed'; }
    onDraftEdit();
  }));
  root.querySelectorAll('[data-ctx]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.ctx, v = b.dataset.val === 'yes';
    d[f] = d[f] === v ? null : v;
    onDraftEdit();
  }));
  const det = document.getElementById('ctx-details');
  if (det) det.addEventListener('toggle', () => { state.ctxOpen = det.open; });
  root.querySelector('#provenance-ask').addEventListener('click', (e) => {
    const b = e.target.closest('[data-prov]');
    if (!b) return;
    state.provenanceAnswer = b.dataset.prov;
    state.askProvenance = false;
    onSave();
  });
}

function renderToday() {
  const key = focusKey();
  const date = state.selectedDate;
  const d = draftFor(date);
  const t = todayISO();
  const future = date > t; // il risveglio di questa notte non è ancora avvenuto
  const start = addDays(date, -1);
  const showNow = date === addDays(t, 1) || (date === t && isEmpty(d.bedtime));

  tabContent().innerHTML = `
    ${renderReminderBanner()}
    <div class="night-strip" role="group" aria-label="Scegli la notte">${nightDates().map(chipHTML).join('')}</div>

    <div class="night-head">
      <h2 class="night-title serif" tabindex="-1">${nightTitle(date)}</h2>
      <p class="night-meta" id="night-meta"></p>
    </div>

    <section class="card" aria-labelledby="evening-title">
      <div class="card-head">
        <span class="card-icon">${ICONS.smartphone}</span>
        <div class="card-titles"><h3 id="evening-title">Prima di dormire</h3><p>Sera di ${dayLong(start)}, anche dopo mezzanotte</p></div>
        <span class="part-status" id="evening-status"></span>
      </div>
      ${timeRow({ id: 'f-screentime', label: `Screen time di ${dayLong(start)}`, help: `Totale del giorno di calendario ${dayLong(start)} ${monthLong(start)}, in ore e minuti`, value: d.screenTimeTotal, kind: 'duration' })}
      ${t > start && (t === date || isEmpty(d.screenTimeTotal)) ? `<div class="row-note">${msgHTML(`${t === date ? 'È già passata la mezzanotte' : `Stai compilando una sera passata`}: in Tempo di utilizzo seleziona <strong>${dayLong(start)}</strong>, non ${t === date ? 'oggi' : 'il giorno attuale'}. Il totale di un giorno non include l'uso dopo la sua mezzanotte.`, 'info')}</div>` : ''}
      ${timeRow({ id: 'f-lastuse', label: 'Ultimo utilizzo prima di addormentarti', help: 'Anche dopo mezzanotte, es. 00:30', value: d.lastScreenUse,
    extra: showNow ? '<button type="button" class="btn-chip" id="lastuse-now" aria-label="Imposta l\'ultimo utilizzo all\'ora attuale">Adesso</button>' : '' })}
    </section>

    <section class="card" aria-labelledby="sleep-title">
      <div class="card-head">
        <span class="card-icon">${ICONS.sunrise}</span>
        <div class="card-titles"><h3 id="sleep-title">Sonno e risveglio</h3><p>${capitalize(dayLong(date))}, mattina</p></div>
        <span class="part-status" id="sleep-status"></span>
      </div>
      ${future ? `<p class="placeholder">${ICONS.moon}<span>Questa parte si compila domani mattina, quando ti svegli.</span></p>` : `
        ${inBedHTML(d)}
        ${timeRow({ id: 'f-attempt', label: 'Hai provato a dormire alle', help: 'Quando hai smesso di fare altro, telefono compreso', value: d.sleepAttempt })}
        ${timeRow({ id: 'f-bedtime', label: 'Ti sei addormentato/a alle', value: d.bedtime })}
        ${timeRow({ id: 'f-waketime', label: 'Ti sei svegliato/a alle', value: d.wakeTime })}
        ${awakeningsHTML(d, date)}
        <div class="quality-block">
          <p class="quality-label" id="quality-label">Qualità percepita del sonno</p>
          <div class="quality-grid" role="radiogroup" aria-labelledby="quality-label">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
              <button type="button" class="quality-btn" data-q="${n}" role="radio" aria-checked="false" tabindex="-1" aria-label="${n} su 10${n === 1 ? ', pessima' : n === 10 ? ', ottima' : ''}">${n}</button>`).join('')}
          </div>
          <div class="quality-scale" aria-hidden="true"><span>1 · pessima</span><span>10 · ottima</span></div>
        </div>
        ${dayTypeHTML(d)}
        ${contextHTML(d)}`}
    </section>

    <section class="summary" id="summary"></section>
    <div id="night-context" aria-live="off"></div>

    <div id="provenance-ask"></div>
    <button type="button" class="btn-primary" id="save-btn" aria-describedby="save-status"></button>
    <p class="save-status" id="save-status" role="status"></p>
    <p class="visually-hidden" id="live-errors" role="alert"></p>
  `;
  state.lastAnnouncedErrors = '';
  attachTodayListeners();
  updateTodayDerived();
  centerActiveChip();
  restoreFocus(key, '.night-title');
}

function centerActiveChip() {
  const strip = root.querySelector('.night-strip');
  const active = strip && strip.querySelector('.night-chip.active');
  if (!active) return;
  strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
}

function partStatusHTML(complete, started, futureText) {
  if (futureText) return `<span class="pill">${futureText}</span>`;
  if (complete) return `<span class="pill pill-ok">${ICONS.check}Completo</span>`;
  if (started) return '<span class="pill pill-partial">Parziale</span>';
  return '<span class="pill">Da compilare</span>';
}

function summaryHTML(v) {
  const { m } = v;
  const stat = (label, value, hint) => `
    <div class="stat-box">
      <p class="label">${label}</p>
      <p class="value serif">${value}</p>
      ${hint ? `<p class="hint-small">${hint}</p>` : ''}
    </div>`;
  const durationHint = m.durationMin == null && !m.durationError ? 'Con addormentamento e risveglio' : 'Dall\'addormentamento al risveglio finale';
  const freeHint = m.screenFreeMin == null && !m.screenFreeError ? 'Con ultimo utilizzo e addormentamento' : '';
  const r = v.record;
  const effHint = m.effectiveSleepMin != null
    ? (r.awakeMinutes ? `Intervallo meno ${r.awakeMinutes} min svegli` : 'Nessun risveglio indicato')
    : v.awErr ? 'Completa i risvegli' : m.durationMin == null ? 'Con intervallo e risvegli' : !Number.isInteger(r.awakenings) ? 'Risvegli non indicati per questa notte' : '';
  const msgs = [
    m.durationError && msgHTML(m.durationError, 'error', 'err-duration'),
    m.screenFreeError && msgHTML(m.screenFreeError, 'error', 'err-screenfree'),
    m.attemptError && msgHTML(m.attemptError, 'error', 'err-attempt'),
    m.inBedError && msgHTML(m.inBedError, 'error', 'err-inbed'),
    m.effectiveError && msgHTML(m.effectiveError, 'error', 'err-effective'),
    m.durationWarning && msgHTML(m.durationWarning, 'warn', 'warn-duration'),
    m.screenFreeWarning && msgHTML(m.screenFreeWarning, 'warn', 'warn-screenfree'),
    m.latencyWarning && msgHTML(m.latencyWarning, 'warn', 'warn-latency'),
  ].filter(Boolean);
  if (state.confirmPending && isDeletion(state.selectedDate)) {
    msgs.push(msgHTML('Hai svuotato tutti i campi. Confermando, i dati salvati di questa notte vengono eliminati dal dispositivo.', 'warn'));
  } else if (state.confirmPending && v.warnings.length && !v.errors.length) {
    msgs.push(msgHTML(v.sleepWarnings.length || v.screenWarnings.length
      ? 'Alcuni valori sembrano insoliti. Se sono corretti, tocca di nuovo il pulsante per salvarli comunque: verranno segnati come anomalie, non modificati.'
      : 'Se il valore è corretto, tocca di nuovo il pulsante per salvarlo.', 'info'));
  }
  // L0 (Fase 4): latenze e uso dello schermo dopo il tentativo e a letto.
  // "A letto" solo con coricamento e ultimo utilizzo registrati all'epoca:
  // la provenienza è quella che i dati avranno salvandoli adesso.
  const facts = [];
  if (m.screenAfterAttempt != null) facts.push(`Schermo dopo aver provato a dormire: <strong>${m.screenAfterAttempt ? 'sì' : 'no'}</strong>`);
  if (r.inBedTime && r.lastScreenUse && !m.inBedError) {
    const preview = withMeta(r, state.entries[state.selectedDate], new Date(), state.provenanceAnswer || null);
    const st = screenInBedStatus(preview, state.selectedDate);
    facts.push(`Schermo a letto: <strong>${st === 'yes' ? 'sì' : st === 'no' ? 'no' : 'non determinabile'}</strong>${st === 'undetermined' ? ' <span class="muted">(solo con orari registrati all\'epoca)</span>' : ''}`);
  }
  return `
    <div class="stat-grid">
      ${stat('Intervallo di sonno', formatDuration(m.durationMin), durationHint)}
      ${stat('Sonno effettivo stimato', formatDuration(m.effectiveSleepMin), effHint)}
      ${stat('Senza schermo prima di dormire', formatDuration(m.screenFreeMin), freeHint)}
      ${m.latencyMin != null ? stat('Tempo per addormentarti', formatDuration(m.latencyMin), 'Dal tentativo all\'addormentamento · stima soggettiva') : ''}
      ${m.latencyAfterUseMin != null && m.latencyAfterUseMin !== m.latencyMin ? stat('Dopo l\'ultimo utilizzo', formatDuration(m.latencyAfterUseMin), 'Da quando hai lasciato lo schermo · stima soggettiva') : ''}
    </div>
    ${facts.length ? `<ul class="night-facts">${facts.map((f) => `<li>${f}</li>`).join('')}</ul>` : ''}
    ${msgs.join('')}`;
}

// Aggiorna tutto ciò che dipende dalla bozza SENZA ricreare gli input:
// così un selettore orario aperto non viene mai chiuso a metà.
function updateTodayDerived() {
  if (state.tab !== 'today' || !root.querySelector('#save-btn')) return;
  const date = state.selectedDate;
  const v = validate(date);
  const { d, m } = v;
  const future = date > todayISO();
  const $ = (sel) => root.querySelector(sel);

  // Per la notte di stasera durata e tempo senza schermo non sono ancora
  // calcolabili (servono gli orari di domattina): niente riquadri vuoti.
  $('#summary').innerHTML = future ? '' : summaryHTML(v);
  const nc = $('#night-context');
  if (nc) nc.innerHTML = future || state.demo ? '' : nightContextHTML(draftRecord(date), date, escapeHTML);
  const setMsg = (id, text, kind) => { const el = $(id); if (el) el.innerHTML = text ? msgHTML(text, kind) : ''; };
  setMsg('#f-screentime-msg', v.screenW, 'warn');
  setMsg('#f-bedtime-msg', v.bedW, 'warn');
  setMsg('#f-waketime-msg', v.wakeW, 'warn');
  setMsg('#aw-msg', v.awErr && v.awErr.text, v.awErr && v.awErr.missing ? 'info' : 'error');
  ['aw-count', 'aw-minutes'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const bad = !!(v.awErr && !v.awErr.missing) || !!(m.effectiveError && id === 'aw-minutes');
    if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (v.awErr || m.effectiveError) el.setAttribute('aria-describedby', m.effectiveError && id === 'aw-minutes' ? 'aw-msg err-effective' : 'aw-msg');
    else el.removeAttribute('aria-describedby');
  });

  const invalid = {
    'f-lastuse': !!m.screenFreeError,
    'f-inbed': !!m.inBedError,
    'f-attempt': !!(m.attemptError || m.inBedError),
    'f-bedtime': !!(m.screenFreeError || m.durationError || m.attemptError),
    'f-waketime': !!m.durationError,
  };
  Object.entries(invalid).forEach(([id, bad]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    document.getElementById(`${id}-field`).classList.toggle('is-invalid', bad);
  });
  [['f-screentime', 'duration', d.screenTimeTotal], ['f-lastuse', 'clock', d.lastScreenUse],
    ['f-bedtime', 'clock', d.bedtime], ['f-waketime', 'clock', d.wakeTime],
    ['f-attempt', 'clock', d.sleepAttempt], ['f-inbed', 'clock', d.inBedTime]].forEach(([id, kind, value]) => {
    const el = document.getElementById(`${id}-display`);
    if (!el) return;
    const disp = timeDisplay(kind, value);
    el.textContent = disp.text;
    el.classList.toggle('is-empty', disp.empty);
  });

  // Errori e avvisi collegati ai campi a cui si riferiscono, così lo
  // screen reader li legge quando il campo riceve il focus.
  const describedBy = {
    'f-screentime': ['f-screentime-msg'],
    'f-lastuse': ['err-screenfree', 'warn-screenfree'],
    'f-inbed': ['err-inbed'],
    'f-attempt': ['err-attempt', 'err-inbed', 'warn-latency'],
    'f-bedtime': ['f-bedtime-msg', 'err-duration', 'err-screenfree', 'err-attempt', 'warn-duration', 'warn-screenfree', 'warn-latency'],
    'f-waketime': ['f-waketime-msg', 'err-duration', 'warn-duration'],
  };
  Object.entries(describedBy).forEach(([id, ids]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const present = ids.filter((x) => { const t = document.getElementById(x); return t && t.textContent.trim(); });
    if (present.length) el.setAttribute('aria-describedby', present.join(' ')); else el.removeAttribute('aria-describedby');
  });
  // Gli errori bloccanti si annunciano una volta quando compaiono o
  // cambiano, non a ogni modifica di un campo.
  const errText = v.errors.join(' ');
  const live = $('#live-errors');
  if (live && errText !== state.lastAnnouncedErrors) { live.textContent = errText; state.lastAnnouncedErrors = errText; }

  // Gruppo qualità: un solo punto di tabulazione (il valore scelto, o 1),
  // frecce per muoversi, come un normale gruppo di opzioni.
  const qBtns = [...root.querySelectorAll('.quality-btn')];
  qBtns.forEach((b) => {
    const on = Number(b.dataset.q) === d.quality;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = (d.quality == null ? Number(b.dataset.q) === 1 : on) ? 0 : -1;
  });

  // Tipo di giorno e indicatori: stato dei pulsanti (aria-pressed).
  root.querySelectorAll('[data-daytype]').forEach((b) => b.setAttribute('aria-pressed', String(d.dayType === b.dataset.daytype)));
  const dtNote = $('#daytype-note');
  if (dtNote) dtNote.textContent = d.dayType && d.dayTypeSource === 'template' ? 'Proposto dal tuo schema settimanale: tocca per correggerlo.' : d.dayType ? '' : 'Non indicato';
  root.querySelectorAll('[data-ctx]').forEach((b) => b.setAttribute('aria-pressed', String(d[b.dataset.ctx] === (b.dataset.val === 'yes'))));
  const ctxCount = $('#ctx-count');
  if (ctxCount) { const n = CONTEXT_FIELDS.filter((f) => typeof d[f] === 'boolean').length; ctxCount.textContent = n ? `${n} su 4 indicati` : 'facoltativo'; }
  // Domanda sull'origine dei dati inseriti in ritardo.
  const ask = $('#provenance-ask');
  if (ask) ask.innerHTML = state.askProvenance && !v.errors.length ? provenanceAskHTML() : '';

  $('#evening-status').innerHTML = partStatusHTML(eveningComplete(d), eveningStarted(d));
  $('#sleep-status').innerHTML = partStatusHTML(sleepComplete(d), sleepStarted(d), future ? 'Domani' : '');

  const saved = state.entries[date];
  const dirty = isDirty(date);
  const savedStatus = dayStatus(saved);
  const metaParts = [{ complete: 'Notte completa', partial: 'Salvata in parte', missing: 'Nessun dato salvato' }[savedStatus]];
  if (dirty) metaParts.push('<span class="dirty-text">modifiche non salvate</span>');
  $('#night-meta').innerHTML = metaParts.join(' · ');

  // aria-disabled invece di disabled: il pulsante resta raggiungibile da
  // tastiera e VoiceOver ne legge lo stato ("Salvato", "Correggi…"); i
  // tocchi in questi stati vengono ignorati da onSave.
  const btn = $('#save-btn');
  btn.className = 'btn-primary';
  let off = false;
  if (state.saving) { btn.textContent = 'Salvataggio…'; off = true; }
  else if (v.errors.length) { btn.textContent = v.awErr && !m.durationError && !m.screenFreeError && !m.attemptError && !m.inBedError ? (v.awErr.missing ? 'Completa i risvegli per salvare' : 'Correggi i risvegli per salvare') : 'Correggi i dati per salvare'; off = true; }
  else if (state.askProvenance) { btn.textContent = 'Scegli da dove vengono i dati'; off = true; }
  else if (!dirty) {
    if (saved) { btn.innerHTML = `${ICONS.check}<span>Salvato</span>`; btn.classList.add('is-saved'); }
    else btn.textContent = 'Salva';
    off = true;
  } else if (isDeletion(date)) {
    btn.textContent = state.confirmPending ? 'Conferma: elimina i dati della notte' : 'Elimina i dati di questa notte';
    btn.classList.add('is-danger');
  } else if (state.confirmPending && v.warnings.length) { btn.textContent = 'Conferma e salva comunque'; btn.classList.add('is-confirm'); }
  else btn.textContent = 'Salva';
  btn.setAttribute('aria-disabled', String(off));

  const status = $('#save-status');
  status.textContent = state.saveMsg.text;
  status.className = `save-status ${state.saveMsg.type === 'error' ? 'is-error' : ''}`;
}

function onDraftEdit() {
  state.confirmPending = false;
  state.askProvenance = false;
  state.provenanceAnswer = null;
  state.saveMsg = { type: '', text: '' };
  persistDrafts();
  updateTodayDerived();
  const chip = root.querySelector(`.night-chip[data-date="${state.selectedDate}"] .chip-dot`);
  if (chip) chip.className = `chip-dot ${isDirty(state.selectedDate) ? 'dirty' : dayStatus(state.entries[state.selectedDate])}`;
}

function selectNight(date) {
  state.selectedDate = date;
  state.showInBed = false;
  state.confirmPending = false;
  state.askProvenance = false;
  state.provenanceAnswer = null;
  state.saveMsg = { type: '', text: '' };
  if (state.tab !== 'today') setTab('today'); else renderToday();
}

function attachTodayListeners() {
  root.querySelectorAll('.night-chip').forEach((btn) => btn.addEventListener('click', () => selectNight(btn.dataset.date)));

  const d = draftFor(state.selectedDate);
  const bind = (id, apply) => {
    const el = document.getElementById(id);
    if (!el) return;
    const handler = () => { apply(el.value); onDraftEdit(); };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  };
  bind('f-screentime', (v) => { d.screenTimeTotal = hhmmToMinutes(v); });
  bind('f-lastuse', (v) => { d.lastScreenUse = v; d.lastScreenUseSource = v ? 'manual' : null; });
  bind('f-attempt', (v) => { d.sleepAttempt = v; });
  bind('f-inbed', (v) => { d.inBedTime = v; });
  bind('f-bedtime', (v) => { d.bedtime = v; });
  bind('f-waketime', (v) => { d.wakeTime = v; });

  const nowBtn = document.getElementById('lastuse-now');
  if (nowBtn) nowBtn.addEventListener('click', () => {
    d.lastScreenUse = nowHHMM();
    d.lastScreenUseSource = 'button';
    document.getElementById('f-lastuse').value = d.lastScreenUse;
    onDraftEdit();
  });

  root.querySelectorAll('.quality-btn').forEach((btn) => btn.addEventListener('click', () => {
    const n = Number(btn.dataset.q);
    d.quality = d.quality === n ? null : n; // secondo tocco = deseleziona
    onDraftEdit();
  }));
  const qGrid = root.querySelector('.quality-grid');
  if (qGrid) qGrid.addEventListener('keydown', (e) => {
    const cur = Number(document.activeElement && document.activeElement.dataset.q);
    if (!cur) return;
    const next = { ArrowRight: cur + 1, ArrowDown: cur + 1, ArrowLeft: cur - 1, ArrowUp: cur - 1, Home: 1, End: 10 }[e.key];
    if (next == null) return;
    e.preventDefault();
    const n = Math.min(10, Math.max(1, next));
    d.quality = n; // come nei gruppi di opzioni nativi: muoversi = selezionare
    onDraftEdit();
    root.querySelector(`.quality-btn[data-q="${n}"]`).focus();
  });

  attachAwakeningsListeners(d);
  attachSchema4Listeners(d);
  document.getElementById('save-btn').addEventListener('click', onSave);

  const dismissBtn = document.getElementById('dismiss-reminder');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    state.reminderDismissed = reminderNight();
    setPref('reminder_dismissed_night', state.reminderDismissed);
    renderToday();
    const strip = root.querySelector('.night-chip.active');
    if (strip) strip.focus({ preventScroll: true });
  });
  const openBtn = document.getElementById('reminder-open');
  if (openBtn) openBtn.addEventListener('click', () => {
    selectNight(reminderNight());
    restoreFocus(`[data-date="${reminderNight()}"]`);
  });
}

async function onSave() {
  const date = state.selectedDate;
  const v = validate(date);
  if (state.saving || v.errors.length || !isDirty(date)) return;
  if ((v.warnings.length || isDeletion(date)) && !state.confirmPending) {
    state.confirmPending = true;
    updateTodayDerived();
    return;
  }

  // Si salva esattamente ciò che è visibile a schermo; i campi vuoti
  // restano assenti (mai convertiti in 0 o stimati).
  let record = { ...v.record };
  const withData = hasData(record);
  // Provenienza: i campi inseriti o modificati oltre la finestra di
  // tempestività richiedono una risposta sull'origine (una volta sola).
  const now = new Date();
  if (withData && lateChangedFields(record, state.entries[date], now).length && !state.provenanceAnswer) {
    state.askProvenance = true;
    updateTodayDerived();
    const first = document.querySelector('#provenance-ask button');
    if (first) first.focus();
    return;
  }
  if (withData) record = withMeta(record, state.entries[date], now, state.provenanceAnswer);
  state.askProvenance = false;
  if (withData) {
    record.is_outlier_bedtime = v.sleepWarnings.length > 0;
    record.outlier_acknowledged_bedtime = record.is_outlier_bedtime;
    record.is_outlier_screen_time = v.screenWarnings.length > 0;
    record.outlier_acknowledged_screen_time = record.is_outlier_screen_time;
  }

  state.saving = true;
  updateTodayDerived();
  // In demo le modifiche restano in memoria: il database reale non si tocca.
  const ok = state.demo ? true : withData ? await saveEntry(record) : await deleteEntry(date);
  state.saving = false;
  // Se il salvataggio fallisce, la conferma già data resta valida: il
  // tentativo successivo salva direttamente, senza chiederla di nuovo.
  // Anche la risposta sull'origine resta valida finché il salvataggio non
  // riesce: si azzera solo a salvataggio completato.
  if (ok) { state.confirmPending = false; state.provenanceAnswer = null; }

  if (ok) {
    const next = { ...state.entries };
    if (withData) next[date] = record; else delete next[date];
    state.entries = next;
    delete state.drafts[date];
    persistDrafts();
    state.saveMsg = state.demo
      ? { type: 'ok', text: 'Salvato solo nella demo (non sul dispositivo).' }
      : { type: 'ok', text: withData ? 'Salvato sul dispositivo.' : 'Dati della notte eliminati.' };
  } else {
    state.saveMsg = { type: 'error', text: 'Salvataggio non riuscito: i dati inseriti sono ancora qui, riprova.' };
  }
  if (state.tab === 'today' && state.selectedDate === date) {
    renderToday();
    if (ok) fadeSaveMsgAfter(date);
  }
}

// ---------- Andamento ----------
const shortRange = (dates) => {
  const a = addDays(dates[0], -1), b = dates[dates.length - 1];
  const f = (d, withMonth) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
  return `${f(a, a.slice(5, 7) !== b.slice(5, 7))} – ${f(b, true)}`;
};
const nightShort = (date) => `${weekdayShort(addDays(date, -1))}–${weekdayShort(date)} ${dayNum(addDays(date, -1))}→${dayNum(date)}`;

// Riepilogo di periodo (ANALYTICS_METHODOLOGY.md §5): mediana, intervallo
// interquartile (IQR), minimo–massimo, numero di notti e copertura. Nessun
// confronto con frecce tra periodi e nessuna media "di sintesi".
const PERIODS = [7, 28, 90];

// ---------- Filtri delle descrizioni (Fase 5.1) ----------
// Valgono per la panoramica e per il grafico degli orari; non per la
// regolarità e per le tre domande, che hanno criteri propri.
function readFilters() {
  let f = {};
  try { f = JSON.parse(getPref('trend_filters', '{}')) || {}; } catch (e) { f = {}; }
  return {
    dayType: ['all', 'constrained', 'free'].includes(f.dayType) ? f.dayType : DEFAULT_DESCRIPTIVE_FILTERS.dayType,
    includeUnusual: f.includeUnusual === true,
    provenance: ['all', 'recorded'].includes(f.provenance) ? f.provenance : DEFAULT_DESCRIPTIVE_FILTERS.provenance,
  };
}
function saveFilters() { setPref('trend_filters', JSON.stringify(state.filters)); }
function filteredEntries() { return applyDescriptiveFilters(state.entries, state.filters); }
const DAYTYPE_FILTER_WORD = { all: 'tutti i giorni', constrained: 'solo mattini vincolati', free: 'solo mattini liberi' };
function filtersHTML(filt) {
  const f = state.filters;
  const r = filt.removed;
  const summary = `${DAYTYPE_FILTER_WORD[f.dayType]} · notti insolite ${f.includeUnusual ? 'incluse' : 'escluse'} · ${f.provenance === 'all' ? 'tutte le origini' : "solo dati registrati all'epoca"}`;
  const effects = [];
  if (r.dayType) effects.push(`${nightsWord(r.dayType)} dell'altro tipo di giorno`);
  if (r.noDayType) effects.push(`${nightsWord(r.noDayType)} senza tipo di giorno`);
  if (r.unusual) effects.push(`${nightsWord(r.unusual)} ${r.unusual === 1 ? 'insolita' : 'insolite'}`);
  if (r.values) effects.push(`${r.values} ${r.values === 1 ? 'valore' : 'valori'} non ${r.values === 1 ? 'registrato' : 'registrati'} all'epoca${r.nightsEmptied ? ` (${nightsWord(r.nightsEmptied)} senza altri dati)` : ''}`);
  const seg = (name, val, label) => `<button type="button" class="seg-btn" data-f-${name}="${val}" aria-pressed="${f[name === 'daytype' ? 'dayType' : 'provenance'] === val}">${label}</button>`;
  return `
      <details class="filters" id="trend-filters"${filtersActive(f) ? ' open' : ''}>
        <summary><span class="filters-label">Filtri</span><span class="filters-summary" id="filters-summary">${summary}</span></summary>
        <div class="filters-body">
          <p class="filters-h" id="fdt-label">Tipo di giorno</p>
          <div class="segmented seg-3" role="group" aria-labelledby="fdt-label">
            ${seg('daytype', 'all', 'Tutti')}${seg('daytype', 'constrained', 'Vincolati')}${seg('daytype', 'free', 'Liberi')}
          </div>
          <div class="check-row"><input type="checkbox" id="f-unusual" ${f.includeUnusual ? 'checked' : ''}> <label for="f-unusual">Includi le notti insolite</label></div>
          <p class="filters-h" id="fprov-label">Origine dei dati</p>
          <div class="segmented seg-2" role="group" aria-labelledby="fprov-label">
            ${seg('prov', 'all', 'Tutte')}${seg('prov', 'recorded', "Registrate all'epoca")}
          </div>
          <p class="muted small">I filtri valgono per questa panoramica e per il grafico degli orari. Regolarità e "Schermo e sonno" usano sempre i propri criteri, descritti in ogni scheda. I dati salvati non cambiano.</p>
        </div>
      </details>
      ${effects.length ? `<p class="muted small filters-effect" id="filters-effect">Esclusi dai filtri: ${effects.join('; ')}.</p>
      <p class="muted small filters-order" id="filters-order">Ogni notte è contata una sola volta, per il primo filtro che la esclude, in quest'ordine: tipo di giorno, notti insolite, origine. I numeri non vanno sommati come se ogni filtro fosse applicato da solo a tutte le notti. I valori non registrati all'epoca sono tolti dalle notti che restano; le notti rimaste senza altri dati sono indicate tra parentesi.</p>` : ''}`;
}

// ---------- Grafico degli orari (actogramma, Fase 5.2) ----------
// Una riga per notte, sull'orologio dalle 18:00 alle 14:00 del giorno dopo:
// tratto chiaro dal coricamento al tentativo, tratto medio dal tentativo
// all'addormentamento, barra piena dall'addormentamento al risveglio; punto
// dell'ultimo utilizzo; segno del solito orario H (come in P1: notti
// precedenti registrate all'epoca). Pieno = dati inseriti al momento o
// ricopiati da note dell'epoca; vuoto = ricostruiti o di origine non nota.
// Descrittivo: nessuna inferenza.
const ACT_START = 18 * 60, ACT_SPAN = 20 * 60;
const actX = (hhmm) => { if (!hhmm) return null; const m = (hhmmToMinutes(hhmm) - ACT_START + 1440) % 1440; return m <= ACT_SPAN ? m : null; };
const RECORDED = ['prospective', 'transcribed'];
function actogramHTML(filt, dates) {
  const ents = filt.entries;
  const n = dates.length;
  const rowH = n <= 7 ? 26 : n <= 28 ? 13 : 7;
  const W = 360, L = 58, R = 8, top = 4, axisH = 22;
  const pw = W - L - R;
  const X = (m) => L + (m / ACT_SPAN) * pw;
  const H = top + n * rowH + axisH;
  const cache = newCache();
  const parts = [], rows = [];
  let withData = 0, offAxis = 0;
  dates.forEach((date, i) => {
    // Solo il record filtrato: nessun valore recuperato da state.entries.
    const y = top + i * rowH, e = ents[date];
    const mid = y + rowH / 2, bh = Math.max(3, rowH * 0.56);
    const dow = new Date(date + 'T12:00:00').getDay();
    if (e && e.dayType === 'free') parts.push(`<rect class="act-free" data-date="${date}" x="${L}" y="${y}" width="${pw}" height="${rowH}"/>`);
    const showLabel = n <= 28 || i % 7 === 0 || i === n - 1;
    if (showLabel) parts.push(`<text class="act-day" x="${L - 4}" y="${mid + 3.5}" text-anchor="end">${WEEKDAY_LABELS[(dow + 6) % 7]} ${Number(date.slice(8))}</text>`);
    // flags[campo] = 'incoherent' | 'offaxis' (solo stati ed errori già
    // esistenti); un valore assente resta "—".
    const row = { date, inBed: null, attempt: null, onset: null, wake: null, last: null, h: null, note: [], flags: {} };
    rows.push(row);
    if (!e) return;
    const m = computeNightMetrics(e, date);
    const rec = (f) => RECORDED.includes(provenanceOf(e, f));
    const cls = (base, fields) => `${base}${fields.every(rec) ? '' : ' hollow'}`;
    let any = false;
    const xs = { inBed: actX(e.inBedTime), attempt: e.sleepAttempt && !m.attemptError ? actX(e.sleepAttempt) : null, onset: actX(e.bedtime), wake: actX(e.wakeTime), last: actX(e.lastScreenUse) };
    ['inBedTime', 'sleepAttempt', 'bedtime', 'wakeTime', 'lastScreenUse'].forEach((f) => { if (e[f] && actX(e[f]) == null) offAxis++; });
    Object.assign(row, { inBed: e.inBedTime || null, attempt: e.sleepAttempt || null, onset: e.bedtime || null, wake: e.wakeTime || null, last: e.lastScreenUse || null });
    ['inBedTime', 'sleepAttempt', 'bedtime', 'wakeTime', 'lastScreenUse'].forEach((f) => { if (e[f] && !rec(f)) row.note.push(f); });
    // Incoerenze già calcolate da computeNightMetrics, poi orari fuori fascia.
    if (m.durationError) { row.flags.bedtime = 'incoherent'; row.flags.wakeTime = 'incoherent'; }
    if (m.attemptError) row.flags.sleepAttempt = 'incoherent';
    if (m.inBedError) row.flags.inBedTime = 'incoherent';
    if (m.screenFreeError) row.flags.lastScreenUse = 'incoherent';
    ['inBedTime', 'sleepAttempt', 'bedtime', 'wakeTime', 'lastScreenUse'].forEach((f) => { if (e[f] && !row.flags[f] && actX(e[f]) == null) row.flags[f] = 'offaxis'; });
    if (!m.durationError && xs.onset != null && xs.wake != null && xs.wake > xs.onset) {
      parts.push(`<rect class="${cls('act-sleep', ['bedtime', 'wakeTime'])}" data-date="${date}" x="${X(xs.onset)}" y="${mid - bh / 2}" width="${X(xs.wake) - X(xs.onset)}" height="${bh}" rx="1.5"/>`);
      any = true;
    } else if (m.durationError) row.note.push('incoerente');
    const endLat = xs.onset != null ? xs.onset : null;
    if (xs.attempt != null && endLat != null && endLat >= xs.attempt) {
      parts.push(`<rect class="${cls('act-lat', ['sleepAttempt', 'bedtime'])}" data-date="${date}" x="${X(xs.attempt)}" y="${mid - bh / 2}" width="${Math.max(1, X(endLat) - X(xs.attempt))}" height="${bh}" rx="1.5"/>`);
      any = true;
    }
    // Tratto "a letto" (consolidamento della Fase 5). Fine del tratto:
    // - tentativo presente e utilizzabile (coerente e nella fascia) → tentativo;
    // - tentativo davvero assente → addormentamento (ripiego già previsto);
    // - tentativo presente ma incoerente o fuori fascia → nessun tratto:
    //   niente ripiego silenzioso (il valore resta nella tabella, segnato).
    // Pieno solo se entrambi gli estremi usati sono registrati all'epoca.
    const attemptPresent = !!e.sleepAttempt;
    let bedEnd = null, bedEndField = null;
    if (attemptPresent && xs.attempt != null) { bedEnd = xs.attempt; bedEndField = 'sleepAttempt'; }
    else if (!attemptPresent && xs.onset != null) { bedEnd = xs.onset; bedEndField = 'bedtime'; }
    if (xs.inBed != null && bedEnd != null && bedEnd >= xs.inBed && !m.inBedError) {
      parts.push(`<rect class="${cls('act-bed', ['inBedTime', bedEndField])}" data-date="${date}" data-end="${bedEndField}" x="${X(xs.inBed)}" y="${mid - bh / 2}" width="${Math.max(1, X(bedEnd) - X(xs.inBed))}" height="${bh}" rx="1.5"/>`);
      any = true;
    }
    // Riferimento H di P1–P3 (decisione del 18/11/2026): volutamente
    // calcolato su tutte le notti con i criteri consolidati, indipendente dai
    // filtri descrittivi. È l'unico accesso a state.entries del grafico.
    const h = habitualAttempt(state.entries, date, { provenance: 'recorded', cache });
    if (h.time && actX(h.time) != null) {
      row.h = h.time;
      parts.push(`<line class="act-h" data-date="${date}" x1="${X(actX(h.time))}" x2="${X(actX(h.time))}" y1="${y + 1}" y2="${y + rowH - 1}"/>`);
    }
    if (xs.last != null) {
      parts.push(`<circle class="${cls('act-dot', ['lastScreenUse'])}" data-date="${date}" cx="${X(xs.last)}" cy="${mid}" r="${Math.max(2, Math.min(4, rowH * 0.22))}"/>`);
      any = true;
    }
    if (e.unusualNight === true) parts.push(`<path class="act-unusual" data-date="${date}" d="M${L - 2} ${mid - 3} l3 3 l-3 3 l-3 -3 z"/>`);
    if (any) withData++;
  });
  // Asse: ogni 2 ore, dalle 18 alle 14.
  const ticks = [];
  for (let k = 0; k <= ACT_SPAN; k += 120) {
    const x = X(k);
    const lab = pad(((ACT_START + k) / 60) % 24);
    ticks.push(`<line class="act-grid" x1="${x}" x2="${x}" y1="${top}" y2="${top + n * rowH}"/><text class="act-tick" x="${x}" y="${top + n * rowH + 14}" text-anchor="middle">${lab}</text>`);
  }
  const first = dates[0], last = dates[n - 1];
  const desc = `Orari di ${n} notti dal ${fmtDate(first)} al ${fmtDate(last)}: ${withData} con almeno un orario. Barre dal coricamento al risveglio, punto dell'ultimo utilizzo, segno del solito orario. I dati sono anche nella tabella sotto il grafico.`;
  // Cella: "—" = dato assente; ° = non registrato all'epoca; "incoerente" e
  // "fuori grafico" = valore presente ma non disegnato (distinti tra loro).
  const FLAG_WORD = { incoherent: 'incoerente', offaxis: 'fuori grafico' };
  const cell = (v, f, row) => (v ? `${v}${row.note.includes(f) ? '°' : ''}${row.flags[f] ? ` <span class="cell-flag" data-flag="${row.flags[f]}">· ${FLAG_WORD[row.flags[f]]}</span>` : ''}` : '—');
  return `
    <section class="analysis-block" aria-labelledby="act-title">
      <h2 class="section-h serif" id="act-title">Orari</h2>
      <p class="section-sub">Le tue notti una sotto l'altra, dalla più vecchia alla più recente${filtersActive(state.filters) ? ', con i filtri della panoramica' : ''}. È una descrizione: non dice che cosa influisce su che cosa.</p>
      <div class="card card-pad act-card">
        <svg class="actogram" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="act-svg-title act-svg-desc" preserveAspectRatio="xMidYMin meet">
          <title id="act-svg-title">Grafico degli orari</title>
          <desc id="act-svg-desc">${desc}</desc>
          ${ticks.join('')}
          ${parts.join('')}
        </svg>
        <div class="act-legend" aria-hidden="true">
          <span><i class="sw act-bed-sw"></i>a letto, prima del tentativo</span>
          <span><i class="sw act-lat-sw"></i>dal tentativo all'addormentamento</span>
          <span><i class="sw act-sleep-sw"></i>sonno (fino al risveglio)</span>
          <span><i class="sw act-dot-sw"></i>ultimo utilizzo dello schermo</span>
          <span><i class="sw act-h-sw"></i>solito orario di riposo</span>
          <span><i class="sw act-hollow-sw"></i>vuoto: ricostruito o origine non nota</span>
          <span><i class="sw act-free-sw"></i>mattino libero</span>
          <span><i class="sw act-unusual-sw"></i>notte insolita</span>
        </div>
        <p class="muted small act-h-note">Il riferimento H rappresenta l\'orario abituale utilizzato nelle analisi P1–P3. È indipendente dai filtri descrittivi applicati all\'actogramma.</p>
        ${offAxis ? `<p class="muted small">${offAxis} ${offAxis === 1 ? 'orario è fuori' : 'orari sono fuori'} dalla fascia 18:00–14:00 e non ${offAxis === 1 ? 'è disegnato' : 'sono disegnati'}: ${offAxis === 1 ? 'lo trovi' : 'li trovi'} nella tabella.</p>` : ''}
        <details>
          <summary>Vedi come tabella</summary>
          <div class="table-scroll"><table class="prov-table act-table">
            <thead><tr><th scope="col">Notte</th><th scope="col">A letto</th><th scope="col">Tentativo</th><th scope="col">Addorm.</th><th scope="col">Risveglio</th><th scope="col">Ultimo uso</th><th scope="col">Solito orario</th></tr></thead>
            <tbody>${rows.slice().reverse().map((row) => `<tr data-date="${row.date}"><th scope="row">${nightShort(row.date)}</th><td>${cell(row.inBed, 'inBedTime', row)}</td><td>${cell(row.attempt, 'sleepAttempt', row)}</td><td>${cell(row.onset, 'bedtime', row)}</td><td>${cell(row.wake, 'wakeTime', row)}</td><td>${cell(row.last, 'lastScreenUse', row)}</td><td>${row.h || '—'}</td></tr>`).join('')}</tbody>
          </table></div>
          <p class="muted small">— = dato assente. ° = ricostruito a memoria o di origine non nota. "incoerente" = in contrasto con gli altri orari della notte (non disegnato). "fuori grafico" = fuori dalla fascia 18:00–14:00 (non disegnato). Notti dalla più recente.</p>
        </details>
        <details>
          <summary>Come leggerlo e limiti</summary>
          <p class="detail">Ogni riga è una notte, indicata con il giorno del risveglio, dalla sera (a sinistra, dalle 18:00) al mattino dopo (a destra, fino alle 14:00). Il tratto più chiaro è il tempo a letto prima di provare a dormire, quello medio il tempo dal tentativo all'addormentamento, la barra piena il sonno fino al risveglio, senza i risvegli notturni (di cui non si conoscono gli orari). Il punto è l'ultimo utilizzo dello schermo. Il segno verticale è il tuo solito orario di riposo in quella notte, calcolato come nelle tre domande (mediana delle 28 notti precedenti, almeno 14 registrate all'epoca, senza anomalie). Il riferimento H rappresenta l\'orario abituale utilizzato nelle analisi P1–P3. È indipendente dai filtri descrittivi applicati all\'actogramma. Se il tentativo di dormire è incoerente o fuori dalla fascia del grafico, il tratto "a letto" non viene disegnato invece di essere sostituito con l'addormentamento; il valore resta nella tabella, segnato.</p>
          <p class="detail"><strong>Limiti.</strong> Gli orari sono letti sull'orologio: nelle notti del cambio d'ora la lunghezza delle barre può differire di un'ora dal tempo reale. Sono stime soggettive inserite al mattino. Le notti con orari incoerenti non hanno la barra del sonno.</p>
        </details>
      </div>
    </section>`;
}
const fmtDur = (v) => formatDuration(Math.round(v));
const METRIC_UI = {
  durationMin: { label: 'Intervallo di sonno', fmt: fmtDur },
  effectiveSleepMin: { label: 'Sonno effettivo stimato', fmt: fmtDur },
  awakenings: { label: 'Risvegli per notte', fmt: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)) },
  screenTimeTotal: { label: 'Screen time della giornata', fmt: fmtDur },
  screenFreeMin: { label: 'Senza schermo prima di dormire', fmt: fmtDur },
  latencyMin: { label: 'Tempo per addormentarti', fmt: fmtDur },
  latencyAfterUseMin: { label: 'Dopo l\'ultimo utilizzo', fmt: fmtDur },
};
const FIELD_WORD = { durationMin: 'intervallo di sonno', effectiveSleepMin: 'sonno effettivo stimato', screenFreeMin: 'tempo senza schermo', screenTimeTotal: 'screen time', latencyMin: 'tempo per addormentarti', latencyAfterUseMin: 'tempo dopo l\'ultimo utilizzo' };
const nightsWord = (n) => `${n} ${n === 1 ? 'notte' : 'notti'}`;

function statLines(s, fmt) {
  if (s.n === 0) return '<p class="n">Nessun dato</p>';
  if (s.median == null) {
    return `<p class="n">Solo ${nightsWord(s.n)}: ${s.values.map(fmt).join(', ')}</p><p class="n">La mediana compare da ${CFG.MEDIAN_MIN_NIGHTS} notti.</p>`;
  }
  return `
    ${s.q1 != null ? `<p class="n">metà delle notti tra ${fmt(s.q1)} e ${fmt(s.q3)}</p>` : `<p class="n">IQR da ${CFG.IQR_MIN_NIGHTS} notti</p>`}
    <p class="n">min ${fmt(s.min)} · max ${fmt(s.max)}</p>
    <p class="n">su ${nightsWord(s.n)}</p>`;
}

function metricTile(key, cur, more = '') {
  const ui = METRIC_UI[key];
  const s = cur.stats[key];
  const extra = (key === 'awakenings' && s.n > 0
    ? `<p class="n">${s.values.filter((v) => v > 0).length} su ${nightsWord(s.n)} con almeno un risveglio</p>` : '') + more;
  return `
    <div class="metric-tile">
      <p class="label">${ui.label}${s.median != null ? ' <span class="muted-delta">mediana</span>' : ''}</p>
      <p class="value serif">${s.median == null ? '—' : ui.fmt(s.median)}</p>
      ${statLines(s, ui.fmt)}
      ${extra}
      ${s.n === 0 ? '' : `<span class="conf conf-${s.confidence.level}">${s.confidence.label}</span>`}
    </div>`;
}

// Qualità: scala ordinale 1–10, mostrata come distribuzione dei voti più la
// mediana. Indicatore descrittivo secondario (docs/research/FINAL_ANALYTICS_SPEC.md §4).
function qualityTile(cur) {
  const s = cur.stats.quality;
  const maxC = Math.max(1, ...cur.qualityCounts);
  const desc = cur.qualityCounts.map((c, i) => (c ? `${i + 1}: ${c}` : '')).filter(Boolean).join(', ');
  return `
    <div class="metric-tile quality-tile">
      <p class="label">Qualità percepita${s.median != null ? ' <span class="muted-delta">mediana</span>' : ''}</p>
      <p class="value serif">${s.median == null ? '—' : `${Number.isInteger(s.median) ? s.median : s.median.toFixed(1)}<small>/10</small>`}</p>
      ${s.n ? `<div class="qdist" role="img" aria-label="Distribuzione dei voti: ${desc}">
        ${cur.qualityCounts.map((c, i) => `<span class="qcol"><span class="qbar" style="height:${c ? Math.max(8, Math.round((c / maxC) * 100)) : 0}%"></span><span class="qlab">${i + 1}</span></span>`).join('')}
      </div>` : ''}
      <p class="n">${s.n === 0 ? 'Nessun dato' : `su ${nightsWord(s.n)}`}</p>
      ${s.n === 0 ? '' : `<span class="conf conf-${s.confidence.level}">${s.confidence.label}</span>`}
    </div>`;
}

function barsHTML(summary) {
  const durs = summary.nights.map((n) => (summary.excluded.some((x) => x.date === n.date && x.fields.includes('durationMin')) ? null : n.durationMin));
  const maxH = Math.max(600, ...durs.filter((v) => v != null));
  const compact = summary.nights.length > 7;
  const desc = summary.nights.map((n) => `${nightShort(n.date)}: ${n.durationMin != null ? formatDuration(n.durationMin) : 'nessun dato'}${n.awakeMinutes > 0 ? `, di cui ${formatDuration(n.awakeMinutes)} svegli` : ''}${n.quality != null ? `, qualità ${n.quality}` : ''}`).join('; ');
  return `
    <div class="bars ${compact ? 'is-compact' : ''}" role="img" aria-label="Notte per notte. ${desc}">
      ${summary.nights.map((n, i) => {
    const dur = n.durationMin;
    const isOut = durs[i] == null && dur != null;
    const h = dur != null ? Math.max(6, Math.round((dur / maxH) * 100)) : 0;
    const awakePct = dur != null && n.awakeMinutes > 0 ? Math.min(100, Math.round((n.awakeMinutes / dur) * 100)) : 0;
    return `
        <div class="bar-col">
          ${compact ? '' : `<span class="bar-value">${dur != null ? `${Math.floor(dur / 60)}h${pad(dur % 60)}` : ''}</span>`}
          <div class="bar-track">${dur != null ? `<div class="bar ${isOut ? 'is-outlier' : ''}" style="height:${h}%">${awakePct ? `<div class="bar-awake" style="height:${Math.max(4, awakePct)}%"></div>` : ''}</div>` : '<div class="bar-empty"></div>'}</div>
          ${compact ? '' : `<span class="bar-q ${n.quality == null ? 'is-empty' : ''}">${n.quality != null ? n.quality : '·'}</span>
          <span class="bar-day">${weekdayShort(n.date)}</span>`}
        </div>`;
  }).join('')}
    </div>
    <div class="bars-legend"><span><span class="key key-bar"></span>Intervallo di sonno</span>${summary.nights.some((n) => n.awakeMinutes > 0) ? '<span><span class="key key-awake"></span>Minuti svegli</span>' : ''}${compact ? '' : '<span><span class="key key-q">7</span>Qualità</span>'}${summary.excluded.length ? '<span><span class="key key-out"></span>Anomalia</span>' : ''}</div>`;
}

// Descrittivo (tutte le provenienze): notti del periodo con l'ultimo
// utilizzo nell'ora prima del tuo solito orario di riposo (H).
// Consolidamento della Fase 5: sia l'ultimo utilizzo sia il solito orario H
// di questa metrica DESCRITTIVA si calcolano sul set filtrato `ents` (tutti
// i filtri attivi, compreso il tipo di giorno), mai su state.entries.
// habitualAttempt e i suoi criteri non cambiano: cambia solo l'insieme di
// notti che riceve. Nessun valore predefinito per `ents`, perché non si
// possa tornare per sbaglio ai dati non filtrati. L'H delle schede P1–P3 e
// dell'actogramma resta quello consolidato, indipendente dai filtri.
function habitualShareHTML(cur, ents) {
  const cache = newCache();
  let yes = 0, n = 0, noH = 0, lastNoH = null;
  cur.nights.forEach((x) => {
    const e = ents[x.date];
    if (!e || !e.lastScreenUse || (e.is_outlier_bedtime && !state.includeOutliers)) return;
    const h = habitualAttempt(ents, x.date, { provenance: 'all', cache });
    if (!h.time) { noH++; lastNoH = h; return; }
    n++; if (inPresleepWindow(e.lastScreenUse, h.time)) yes++;
  });
  const active = filtersActive(state.filters);
  const missing = active && noH
    ? `<p class="n habitual-missing">Solito orario non calcolabile con questi filtri (servono almeno ${CFG.HABITUAL_MIN_VALUES} notti valide nelle ${CFG.HABITUAL_WINDOW_NIGHTS} precedenti)${lastNoH ? `: ${lastNoH.n}/${lastNoH.min} nell'ultima notte del periodo` : ''}${n ? `; ${nightsWord(noH)} senza solito orario` : ''}.</p>` : '';
  return (n ? `<p class="n habitual-share">schermo nell'ora prima del tuo solito orario: ${yes} su ${nightsWord(n)}</p>` : '') + missing;
}
// Fine del periodo mostrato nel riepilogo, nel grafico degli orari e
// nell'andamento: oggi, oppure periodi precedenti (navigazione nel tempo).
function periodEnd() { return addDays(todayISO(), -state.periodOffset * state.period); }
function actogramSectionHTML() {
  const days = state.period;
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDays(periodEnd(), -i));
  return actogramHTML(filteredEntries(), dates);
}
function periodHTML() {
  const days = state.period;
  const filt = filteredEntries();
  const end = periodEnd();
  const cur = periodSummary(filt.entries, end, days, { includeOutliers: state.includeOutliers });
  const anyData = cur.nightsWithData > 0;
  const bestWorst = cur.best ? `
    <div class="best-worst">
      <button type="button" class="night-link" data-open="${cur.best.date}">
        <span class="bw-label">Qualità più alta</span>
        <span class="bw-main">${nightShort(cur.best.date)}</span>
        <span class="bw-sub">Qualità ${cur.best.quality}${cur.best.durationMin != null ? ` · ${formatDuration(cur.best.durationMin)}` : ''}</span>
      </button>
      <button type="button" class="night-link" data-open="${cur.worst.date}">
        <span class="bw-label">Qualità più bassa</span>
        <span class="bw-main">${nightShort(cur.worst.date)}</span>
        <span class="bw-sub">Qualità ${cur.worst.quality}${cur.worst.durationMin != null ? ` · ${formatDuration(cur.worst.durationMin)}` : ''}</span>
      </button>
    </div>` : '';

  const allExcluded = state.includeOutliers
    ? periodSummary(filt.entries, end, days).excluded
    : cur.excluded;
  const outlierNote = allExcluded.length ? `
    <details class="outlier-note">
      <summary>${ICONS.info}<span>${state.includeOutliers
    ? `Le anomalie confermate (${nightsWord(allExcluded.length)}) sono incluse nelle statistiche.`
    : `${allExcluded.length} ${allExcluded.length === 1 ? 'notte con valori segnati come anomali è esclusa' : 'notti con valori segnati come anomali sono escluse'} dalle statistiche.`}</span></summary>
      <ul>${allExcluded.map((x) => `<li>${nightShort(x.date)}: ${x.fields.map((f) => FIELD_WORD[f]).join(', ')}</li>`).join('')}</ul>
      <button type="button" class="btn-ghost" id="toggle-outliers">${state.includeOutliers ? 'Escludi le anomalie dalle statistiche' : 'Includi le anomalie nelle statistiche'}</button>
    </details>` : '';

  return `
    <section class="week" aria-labelledby="week-title">
      <div class="section-title-row">
        <div>
          <h2 class="section-h serif" id="week-title">${state.periodOffset ? `${days} notti` : `Ultime ${days} notti`}</h2>
          <p class="section-sub">${shortRange(cur.dates)}</p>
        </div>
        <span class="badge ${cur.coverage.level}" title="Notti con almeno un dato">Copertura ${cur.nightsWithData}/${days}</span>
      </div>
      <div class="segmented seg-3" role="group" aria-label="Periodo del riepilogo">
        ${PERIODS.map((p) => `<button type="button" class="seg-btn" data-period="${p}" aria-pressed="${p === days}">${p} notti</button>`).join('')}
      </div>
      <div class="period-nav" role="group" aria-label="Sposta il periodo nel tempo">
        <button type="button" class="btn-ghost" id="period-prev" aria-label="${days} notti precedenti">‹ Precedenti</button>
        ${state.periodOffset ? '<button type="button" class="btn-ghost" id="period-today">Torna a oggi</button>' : ''}
        <button type="button" class="btn-ghost" id="period-next" aria-label="${days} notti successive" ${state.periodOffset ? '' : 'disabled'}>Successive ›</button>
      </div>
      ${state.periodOffset ? '<p class="muted small" id="period-past-note">Stai guardando un periodo passato: riepilogo, grafico degli orari e andamento si riferiscono a queste date. Regolarità, contesto e le tre domande più sotto si riferiscono sempre a oggi.</p>' : ''}
      ${filtersHTML(filt)}
      ${anyData ? `
        <div class="metric-grid">
          ${metricTile('durationMin', cur)}
          ${metricTile('effectiveSleepMin', cur)}
          ${qualityTile(cur)}
          ${metricTile('awakenings', cur)}
          ${metricTile('screenTimeTotal', cur)}
          ${metricTile('screenFreeMin', cur, habitualShareHTML(cur, filt.entries))}
          ${cur.stats.latencyMin.n ? `
          ${metricTile('latencyMin', cur, cur.afterAttempt.n ? `<p class="n">schermo dopo il tentativo: ${cur.afterAttempt.yes} su ${nightsWord(cur.afterAttempt.n)}</p>` : '')}
          ${metricTile('latencyAfterUseMin', cur)}` : ''}
        </div>
        ${filtersActive(state.filters) ? '<p class="muted small">Con i filtri attivi, copertura e statistiche contano solo le notti e i valori che li soddisfano.</p>' : ''}
        <p class="compare-note"><strong>Come leggere questi numeri.</strong> Il numero grande è la <strong>mediana</strong>: metà delle notti sta sopra, metà sotto. "Metà delle notti tra… e…" è l'intervallo interquartile (dal 25° al 75° percentile): dove cade la metà centrale delle tue notti. Ogni riquadro indica su quante notti è calcolato, perché i dati mancanti differiscono da un riquadro all'altro. Risvegli e sonno effettivo stimato contano solo le notti in cui i risvegli sono indicati; i tempi per addormentarti solo quelle con l'ora in cui hai provato a dormire, e sono stime soggettive. La copertura conta le notti con almeno un dato. Sono descrizioni delle tue notti, non spiegazioni.</p>
        ${bestWorst}
        ${outlierNote}
        ${days <= 28 ? `<div class="card card-pad chart-block">
          <p class="chart-label">Notte per notte</p>
          ${barsHTML(cur)}
        </div>` : ''}` : `<div class="card card-pad"><p class="muted">${state.periodOffset ? 'Nessuna notte registrata in questo periodo.' : `Nessuna notte registrata negli ultimi ${days} giorni. Il riepilogo compare dalla prima notte salvata.`}</p></div>`}
    </section>`;
}

const REASON_WORD = { outlier: 'anomalia confermata', incoherent: 'orari incoerenti', unusual: 'notte insolita', provenance: 'origine non registrata all\'epoca' };
const roundTo5 = (v) => Math.round(v / 5) * 5;
const signedMin = (v) => { const x = roundTo5(v); return x === 0 ? '0 min' : `${x > 0 ? '+' : '−'}${Math.abs(x)} min`; };
function regularityHTML() {
  const t = todayISO();
  const r = regularityForWindow(state.entries, t, { includeOutliers: state.includeOutliers });
  const period = `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  const listed = r.excluded.filter((x) => x.reason !== 'provenance');
  const byProv = r.excluded.length - listed.length;
  const excl = listed.length
    ? `<p class="detail"><strong>Escluse:</strong> ${listed.map((x) => `${nightShort(x.date)} (${REASON_WORD[x.reason]})`).join('; ')}.</p>` : '';
  const provNote = byProv
    ? `<p class="detail" id="reg-prov-note">${nightsWord(byProv)} ${byProv === 1 ? 'non è considerata' : 'non sono considerate'} perché addormentamento o risveglio sono ricostruiti a memoria o di origine non nota. Puoi classificarne l'origine in Impostazioni → Origine dei dati.</p>` : '';
  const sd = (v) => (v == null ? 'non definita' : `${roundTo5(v)} min`);
  const tile = (label, v, mean) => `<div><p class="label">${label}</p><p class="serif big-num">${sd(v)}</p><p class="muted small">variabilità attorno alle ${mean || '—'}</p></div>`;
  const bt = r.byType;
  const typeRows = (bt.constrained.shown || bt.free.shown) ? `
    <div class="reg-types">
      <p class="label">Per tipo di giorno</p>
      <table class="prov-table"><thead><tr><th scope="col">Mattino</th><th scope="col">Notti</th><th scope="col">Addorm.</th><th scope="col">Risveglio</th></tr></thead><tbody>
      ${[['constrained', 'Vincolato'], ['free', 'Libero']].map(([k, l]) => `<tr><th scope="row">${l}</th><td>${bt[k].n}</td><td>${bt[k].shown ? sd(bt[k].sdOnset) : '—'}</td><td>${bt[k].shown ? sd(bt[k].sdWake) : '—'}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small">"—": servono almeno ${CFG.REGULARITY_MIN_NIGHTS_PER_TYPE} notti di quel tipo.</p>
    </div>` : '';
  const sj = r.sjl;
  const sjl = sj.shown
    ? `<p class="reg-sjl" id="reg-sjl"><strong>Differenza tra giorni liberi e vincolati</strong> (punto medio del sonno): ${sj.minutes === 0 ? 'nessuna' : `${signedMin(sj.minutes)}, ${sj.minutes > 0 ? 'più tardi' : 'più presto'} nei giorni liberi`} (${sj.midFree} contro ${sj.midConstrained}; ${sj.nFree} notti libere, ${sj.nConstrained} vincolate).</p>`
    : `<p class="muted small" id="reg-sjl">Differenza tra giorni liberi e vincolati: servono almeno ${sj.min} notti di ciascun tipo con il tipo di giorno indicato (finora ${sj.nFree} libere, ${sj.nConstrained} vincolate).</p>`;
  // Notti escluse SOLO da questo confronto per il cambio dell'ora (Fase 4.1).
  const DST_WORD = {
    dst_ambiguous: "un orario cade nell'ora ripetuta del ritorno all'ora solare: non si può sapere quale delle due occorrenze hai registrato",
    dst_nonexistent: "un orario cade nell'ora che non esiste per il passaggio all'ora legale",
  };
  const sjlDst = sj.excluded.length
    ? `<p class="muted small" id="reg-sjl-dst">Non usate per la differenza tra giorni liberi e vincolati (restano nel diario e nelle altre analisi): ${sj.excluded.map((x) => `${nightShort(x.date)} (${DST_WORD[x.reason]})`).join('; ')}.</p>` : '';
  return `
    <section class="analysis-block" aria-labelledby="reg-title">
      <h2 class="section-h serif" id="reg-title">Regolarità degli orari</h2>
      <div class="card card-pad">
        ${r.shown ? `
          <div class="reg-grid">
            ${tile('Addormentamento', r.sdOnset, r.meanOnset)}
            ${tile('Risveglio', r.sdWake, r.meanWake)}
            ${r.attempt.shown ? tile('Tentativo di dormire', r.attempt.sd, r.attempt.mean) : ''}
          </div>
          <p class="muted small">${nightsWord(r.n)} con addormentamento e risveglio registrati all'epoca, ${period}.${!r.attempt.shown && r.attempt.n ? ` Il tentativo di dormire compare da ${r.attempt.min} notti (${r.attempt.n}/${r.attempt.min}).` : ''}</p>
          ${typeRows}` : `
          <p class="muted">Servono almeno ${r.min} notti con addormentamento e risveglio registrati all'epoca negli ultimi ${r.days} giorni (${r.n}/${r.min} finora).</p>`}
        ${sjl}
        ${sjlDst}
        ${sriHTML(state.entries, todayISO(), state.includeOutliers)}
        ${provNote}
        <details>
          <summary>Come è calcolata e limiti</summary>
          <p class="detail"><strong>Metodo.</strong> Deviazione standard circolare degli orari, in minuti, arrotondata a 5: indica di quanto i tuoi orari si discostano in genere dal loro valore medio, tenendo conto della mezzanotte (23:30 e 00:30 distano 30 minuti, non 23 ore). Periodo: gli ultimi ${r.days} giorni di calendario. Minimo: ${r.min} notti (scelta progettuale, non uno standard).</p>
          <p class="detail"><strong>Dati usati.</strong> Solo orari inseriti al momento o ricopiati da note dell'epoca: le ricostruzioni a memoria tendono a far sembrare gli orari più regolari di quanto siano. Escluse le notti insolite e, di default, le anomalie confermate.</p>
          <p class="detail"><strong>Giorni liberi e vincolati.</strong> Differenza tra il punto medio del sonno (a metà tra addormentamento e risveglio, sul tempo reale e poi letto sull'orologio: corretto anche nelle notti del cambio d'ora) nei giorni liberi e in quelli vincolati, con il segno. Le notti con un orario inesistente o ripetuto per il cambio d'ora non entrano in questo confronto. È una descrizione, non un giudizio.</p>
          <p class="detail"><strong>Limiti.</strong> Con 14–20 notti l'incertezza della stima è di circa ±20%, con meno notti per tipo di giorno è maggiore. Non considera i risvegli notturni né i sonnellini. Non è un punteggio e non c'è un valore "giusto": descrive solo quanto variano i tuoi orari.</p>
          ${excl}
          ${r.excluded.some((x) => x.reason === 'outlier') || state.includeOutliers ? `<p class="detail">${state.includeOutliers ? 'Le anomalie confermate sono incluse (impostazione scelta nel riepilogo).' : 'Le anomalie confermate si possono includere dal riepilogo.'}</p>` : ''}
        </details>
        ${foundationHTML('regularity')}
      </div>
    </section>`;
}

// ---------- Le tre domande (Fase 4; js/inference.js) ----------
// Nessun numero finché non sono soddisfatte tutte le condizioni (notti
// registrate all'epoca, tipo di giorno, gruppi, n_eff): al loro posto, che
// cosa manca. Il risultato è sempre un'associazione osservata.
// Motivi di esclusione (Fase 4.1): mutuamente esclusivi, una notte è
// contata una sola volta, al primo criterio non soddisfatto.
const EXCL_WORD = {
  missing: 'senza tutti i dati necessari', incoherent: 'con orari incoerenti tra loro',
  screenAfterAttempt: "con l'ultimo utilizzo dopo l'ora in cui hai provato a dormire",
  screenAfterOnset: "con l'ultimo utilizzo dopo l'addormentamento",
  provenance: 'con dati ricostruiti a memoria o di origine non nota', unusual: 'notti insolite', outlier: 'con anomalie confermate sugli orari',
  noH: `senza abbastanza notti precedenti (almeno ${CFG.HABITUAL_MIN_VALUES} valide su ${CFG.HABITUAL_WINDOW_NIGHTS}) per il tuo solito orario`,
  confounder: 'con caffeina tardiva, alcol o stress non indicati come "no"',
  noDayType: 'senza tipo di giorno', noWindow: 'senza abbastanza notti vicine per il confronto con il periodo',
};
function habitualLineHTML(r) {
  const h = r.habitualNow;
  if (!h) return '';
  return h.time
    ? `<p class="muted small q-habitual">Il tuo solito orario di riposo, oggi: <strong>${h.time}</strong> (mediana di ${h.n} notti valide delle ${CFG.HABITUAL_WINDOW_NIGHTS} precedenti; le anomalie confermate non contano mai).</p>`
    : `<p class="muted small q-habitual">Il tuo solito orario di riposo non è ancora calcolabile: ${h.n} notti valide delle ${CFG.HABITUAL_WINDOW_NIGHTS} precedenti con l'ora in cui hai provato a dormire, ne servono ${h.min}.</p>`;
}
// ---------- Fondamento scientifico (Fase 5.3–5.4; js/bibliography.js) ----------
// La letteratura sta solo qui e nella sezione delle Impostazioni, mai nella
// stessa frase di un risultato personale. Numeri solo da fonti V1.
const SRC = Object.fromEntries(SOURCES.map((x) => [x.id, x]));
const STATUS_CLASS = { V1: 'v1', V2: 'v2', NV: 'nv', ESCLUSO: 'excl', APP: 'app' };
const fmtDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
function sourceItemHTML(src, { full = false } = {}) {
  const text = src.status === 'V1' || src.status === 'APP' ? src.finding : src.qualitative;
  const ids = [src.doi ? `DOI ${src.doi}` : null, src.pmid ? `PMID ${src.pmid}` : null].filter(Boolean).join(' · ');
  return `<li class="src" data-src="${src.id}">
      <p class="src-head"><span class="src-badge ${STATUS_CLASS[src.status]}">${STATUS[src.status].label}</span>${src.pediatric ? '<span class="src-badge ped">studi su bambini e ragazzi</span>' : ''}<strong>${src.short}</strong></p>
      ${src.population !== '—' || src.design !== '—' ? `<p class="src-pop">${[src.population, src.design].filter((x) => x && x !== '—').join(' · ')}</p>` : ''}
      <p class="src-text">${text}</p>
      ${src.limits ? `<p class="src-lim">Limiti: ${src.limits}</p>` : ''}
      ${full ? `<p class="src-ref"><em>${src.title}</em>${src.journal && src.journal !== '—' ? `. ${src.journal}` : ''}${ids ? ` · ${ids}` : ''}${src.url ? ` · <a href="${src.url}" target="_blank" rel="noopener noreferrer">fonte originale</a> <span class="muted">(serve internet)</span>` : ''} · ultima verifica: ${fmtDay(src.verifiedOn)}</p>` : ''}
    </li>`;
}
function foundationHTML(key) {
  const l = LINKS[key];
  const list = (ids) => `<ul class="src-list">${ids.map((id) => sourceItemHTML(SRC[id])).join('')}</ul>`;
  return `
    <details class="q-sec-details foundation" data-foundation="${key}">
      <summary>7 · Fondamento scientifico</summary>
      ${l.phenomenon.length ? `<p class="q-sub">Evidenza generale: che cosa hanno trovato studi su altre persone</p>
      <p class="muted small">Riguarda gruppi di persone, non te: non è una previsione su di te e non spiega il tuo risultato.</p>
      ${list(l.phenomenon)}` : ''}
      ${l.context.length ? `<p class="q-sub">Contesto (non prova diretta per adulti)</p>${list(l.context)}` : ''}
      ${l.method.length ? `<p class="q-sub">Da dove viene il metodo</p>${list(l.method)}` : ''}
      ${l.measurement.length ? `<p class="q-sub">Limiti della misura</p>${list(l.measurement)}` : ''}
      <button type="button" class="link-btn" data-goto-science>Tutte le fonti e il loro stato di verifica ›</button>
    </details>`;
}

function questionCardHTML(q, r) {
  const ok = r.status === 'ok';
  const degenerate = r.status === 'degenerate_variance';
  const counts = r.counts;
  const exclusions = Object.entries(EXCL_WORD).filter(([k]) => counts[k]).map(([k, w]) => `${counts[k]} ${w}`);
  const anomalies = r.includeOutliers ? 'incluse le anomalie confermate sugli orari (scelta nel riepilogo; non per il solito orario)' : 'escluse le anomalie confermate sugli orari';
  const sec = (n, label, body, id = '') => `<section class="q-sec"${id ? ` id="${id}"` : ''}><h4 class="q-el">${n} · ${label}</h4>${body}</section>`;
  // 1. Che cosa si analizza
  const what = q.id === 'P2'
    ? "Le notti in cui l'ultimo utilizzo dello schermo è dopo l'ora in cui hai provato a dormire, confrontate con le altre. Esito: il tempo dall'ultimo utilizzo (o dal tentativo, se è più tardi) all'addormentamento."
    : `Le notti in cui l'ultimo utilizzo dello schermo cade nell'ora che precede il tuo solito orario di riposo (da un'ora prima fino al solito orario compreso), confrontate con tutte le altre notti, anche quelle in cui l'ultimo utilizzo è dopo il solito orario. Il solito orario è la mediana delle ore in cui hai provato a dormire nelle ${CFG.HABITUAL_WINDOW_NIGHTS} notti precedenti (almeno ${CFG.HABITUAL_MIN_VALUES} valide), esclusa quella in esame. ${q.id === 'P1' ? "Le notti in cui l'ultimo utilizzo è dopo l'ora in cui hai provato a dormire non sono usate: lo schermo verrebbe dopo l'esito." : "L'ultimo utilizzo può essere dopo l'ora in cui hai provato a dormire, ma non dopo l'addormentamento."} Esito: ${q.outcomeText}.`;
  // Le spiegazioni lunghe stanno in sezioni espandibili (23/11/2026): la
  // scheda resta nell'ordine dei sette elementi ma su iPhone non occupa
  // più di uno schermo prima del risultato.
  const s1 = sec(1, 'Che cosa si analizza', `<p class="muted small">${q.question}</p><details class="q-more"><summary>Definizione completa</summary><p class="detail">${what} L'esposizione è solo sì/no in base all'orario dell'ultimo utilizzo: non misura quanti minuti hai usato lo schermo.</p></details>`);
  // 2. Quali dati
  const s2 = sec(2, 'Quali dati', `
      <p class="detail q-short">Notti usate: ${counts.eligible} su ${counts.considered} nel diario.</p>
      <details class="q-more"><summary>Quali notti e perché</summary>
      <p class="detail">Notti con ${q.fieldsText}, tutti inseriti al momento o ricopiati da note dell'epoca, con il tipo di giorno indicato; escluse le notti insolite; ${anomalies}. Si controlla la coerenza solo degli orari che questa domanda usa.</p>
      <p class="detail" id="q-${q.id}-nights"><strong>Notti.</strong> Nel diario fino a oggi: ${counts.considered}; usate${ok || degenerate ? ' nel confronto' : ' finora'}: ${counts.eligible}.${exclusions.length ? ` Non usate (ognuna contata una volta, per il primo motivo): ${exclusions.join('; ')}.` : ''}</p>
      </details>
      ${provenanceNote(r) ? `<p class="muted small">${provenanceNote(r)}</p>` : ''}`);
  // 3. Periodo e numeri
  const nums = r.n
    ? `<p class="detail">${r.from ? `Dal ${fmtDate(r.from)} al ${fmtDate(r.to)}. ` : ''}${nightsWord(r.n)}${r.n1 != null ? `: ${r.n1} ${q.groupYes}, ${r.n0} ${q.groupNo}` : ''}${r.neff ? `. Notti "indipendenti" stimate (n_eff): ${Math.floor(r.neff)}` : ''}.</p>`
    : `<p class="detail">Ancora nessun confronto: ${nightsWord(r.kept || 0)} ${r.kept === 1 ? 'utilizzabile' : 'utilizzabili'} su almeno ${CFG.N_EFF_MIN} necessarie.</p>`;
  const s3 = sec(3, 'Periodo e numeri', `${habitualLineHTML(r)}${nums}`);
  // 4. Come è calcolato (con la formula)
  const s4 = `
    <details class="q-sec-details" id="q-${q.id}-method">
      <summary>4 · Come è calcolato</summary>
      <p class="detail">Ogni valore è confrontato con la media delle notti vicine (±${CFG.RESIDUAL_HALF_WINDOW_NIGHTS} giorni, almeno ${CFG.RESIDUAL_MIN_VALUES}), per togliere i cambiamenti lenti, e con la media del suo tipo di giorno (libero o vincolato). Poi si confrontano le medie dei due gruppi. L'intervallo al 95% tiene conto del fatto che notti vicine si somigliano. Con tre domande analizzate insieme si applica la correzione di Benjamini–Hochberg. I valori sono arrotondati a 5 minuti.</p>
      <pre class="formula" aria-label="Formula">r = valore − media(notti entro ±${CFG.RESIDUAL_HALF_WINDOW_NIGHTS} giorni) − media del tipo di giorno
Δ = media(r | ${q.id === 'P2' ? 'uso dopo il tentativo' : "ultimo utilizzo in quell'ora"}) − media(r | altre notti)
n_eff = n · (1 − ρE·ρr) / (1 + ρE·ρr)
SE = s · √(1/n₁ + 1/n₀) · √(n / n_eff)
intervallo al 95% = Δ ± 1,96 · SE</pre>
      <p class="detail">ρE e ρr: somiglianza tra notti consecutive (autocorrelazione) dell'esposizione e dei valori. s: deviazione standard combinata dei due gruppi. Se s è zero il risultato è "non stimabile". Il valore p serve solo alla correzione e non viene mostrato.</p>
    </details>`;
  // 5. Nei tuoi dati
  let s5, s6;
  const limitsDetails = `<details class="q-sec-details" id="q-${q.id}-limits"><summary>Assunzioni e limiti del metodo</summary><p class="detail">Gli orari sono stime soggettive inserite al mattino. Il metodo tiene conto del periodo e del tipo di giorno, non di altri fattori (impegni, malessere, stress non indicato): per questo un risultato resta un'associazione e non dice che cosa causa che cosa. Dati mancanti che dipendono da com'è andata la notte possono spostare il risultato.</p></details>`;
  if (degenerate) {
    s5 = sec(5, 'Nei tuoi dati', abstentionText(r).map((tx) => `<p class="muted">${tx}</p>`).join(''));
    s6 = sec(6, 'Limiti', limitsDetails);
  } else if (ok) {
    const x = resultTexts(r);
    const sens = r.sensitivity.length ? `
      <details class="q-sec-details" id="q-${q.id}-sens">
        <summary>Altre verifiche (analisi di sensibilità)</summary>
        <ul class="sens-list">${r.sensitivity.map((sv) => `<li><span>${sv.label}</span><strong>${sensitivityText(sv)}</strong></li>`).join('')}</ul>
        <p class="detail">Se queste righe vanno nella stessa direzione del risultato principale, il risultato non dipende da una scelta particolare dei dati. Non lo sostituiscono.</p>
      </details>` : '';
    s5 = sec(5, 'Nei tuoi dati', `
      <p class="q-result">${x.headline}</p>
      ${x.descriptive ? `<p class="muted small">${x.descriptive}</p>` : ''}
      ${x.bh ? msgHTML(x.bh, 'info') : ''}
      ${sens}`);
    s6 = sec(6, 'Limiti e spiegazioni alternative', `
      ${x.clear ? `<p class="detail"><strong>Possibile interpretazione:</strong> ${x.interpretation}</p>
      <div class="detail"><strong>Spiegazioni alternative:</strong><ul>${x.alternatives.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : '<p class="detail">Senza una differenza chiara non si propongono interpretazioni.</p>'}
      ${limitsDetails}`);
  } else {
    const kept = r.n != null ? r.n : r.kept;
    s5 = sec(5, 'Nei tuoi dati', `
      ${abstentionText(r).map((tx) => `<p class="muted">${tx}</p>`).join('')}
      ${r.status === 'few' ? `<div class="q-progress" role="img" aria-label="${kept} notti utilizzabili su ${CFG.N_EFF_MIN}"><span style="width:${Math.min(100, Math.round((100 * kept) / CFG.N_EFF_MIN))}%"></span></div>` : ''}`);
    s6 = sec(6, 'Limiti', limitsDetails);
  }
  return `
    <article class="card card-pad q-card" id="q-${q.id}" aria-labelledby="q-${q.id}-title">
      <div class="q-head">
        <h3 class="q-title" id="q-${q.id}-title">${q.title}</h3>
        <span class="badge ${ok ? 'high' : 'low'}">${ok ? 'Dati sufficienti' : degenerate ? 'Risultato non stimabile' : 'Dati non ancora sufficienti'}</span>
      </div>
      ${s1}${s2}${s3}${s4}${s5}${s6}
      ${foundationHTML(q.id)}
    </article>`;
}
function questionsHTML() {
  const results = analyzeAll(state.entries, { endDate: todayISO(), includeOutliers: state.includeOutliers });
  return `
    <section class="analysis-block" aria-labelledby="qs-title">
      <h2 class="section-h serif" id="qs-title">Schermo e sonno</h2>
      <p class="section-sub">Tre domande, sempre le stesse. Un risultato compare solo quando ci sono abbastanza notti con dati registrati all'epoca; prima l'app ti dice che cosa manca. Ogni risultato descrive un'associazione nelle tue notti, non una causa.</p>
      <p class="section-sub" id="qs-outliers">${state.includeOutliers
    ? "Anomalie confermate sugli orari: <strong>incluse</strong> in queste analisi, nelle verifiche e nelle altre statistiche (non nel calcolo del tuo solito orario)."
    : "Anomalie confermate sugli orari: <strong>escluse</strong> da queste analisi e dalle altre statistiche."}</p>
      ${state.includeOutliers || results.some((r) => r.counts && r.counts.outlier > 0)
    ? `<button type="button" class="btn-ghost qs-toggle" id="toggle-outliers-q">${state.includeOutliers ? 'Escludi le anomalie' : 'Includi le anomalie'}</button>` : ''}
      ${QUESTIONS.map((q, i) => questionCardHTML(q, results[i])).join('')}
    </section>`;
}
function renderTrend() {
  const key = focusKey();
  const t = todayISO();
  const lastNightEntry = state.entries[t];
  const lastNightMetrics = computeNightMetrics(lastNightEntry, t);
  const lastNight = { quality: lastNightEntry && lastNightEntry.quality != null ? lastNightEntry.quality : null, durationMin: lastNightMetrics.durationMin };
  const lastNightFilled = lastNight.quality != null || lastNight.durationMin != null;

  tabContent().innerHTML = `
    <div class="hero">
      <p class="label">Notte scorsa</p>
      ${lastNightFilled ? `
      <div class="hero-row">
        <div><span class="serif hero-num">${lastNight.quality != null ? lastNight.quality : '—'}</span><span class="hero-unit">/10 qualità</span></div>
        <div><p class="hero-dur">${formatDuration(lastNight.durationMin)}</p><p class="hero-dur-label">intervallo di sonno</p></div>
      </div>` : `
      <button type="button" class="hero-empty" data-open="${t}">
        <span>Non hai ancora compilato il risveglio di stamattina.</span><span class="hero-cta">Compila ora ›</span>
      </button>`}
    </div>

    ${periodHTML()}

    ${actogramSectionHTML()}

    ${trendSectionHTML(filteredEntries().entries, { endDate: periodEnd(), days: state.period, variable: state.trendVariable, includeOutliers: state.includeOutliers })}

    ${regularityHTML()}

    ${state.demo ? '' : contextTrendHTML(state.entries, { endDate: t, provenance: state.filters.provenance, includeOutliers: state.includeOutliers }, profileDeps())}

    ${questionsHTML()}
  `;
  const moveTo = (off, focusId) => {
    state.periodOffset = Math.max(0, off);
    renderTrend();
    const again = document.getElementById(focusId) || document.getElementById('period-prev');
    if (again && !again.disabled) again.focus({ preventScroll: true }); else { const p = document.getElementById('period-prev'); if (p) p.focus({ preventScroll: true }); }
  };
  const pp = document.getElementById('period-prev'); if (pp) pp.addEventListener('click', () => moveTo(state.periodOffset + 1, 'period-prev'));
  const pn = document.getElementById('period-next'); if (pn) pn.addEventListener('click', () => moveTo(state.periodOffset - 1, 'period-next'));
  const pt = document.getElementById('period-today'); if (pt) pt.addEventListener('click', () => moveTo(0, 'period-prev'));
  const tv = document.getElementById('trend-var');
  if (tv) tv.addEventListener('change', () => { state.trendVariable = tv.value; setPref('trend_variable', tv.value); renderTrend(); const again = document.getElementById('trend-var'); if (again) again.focus({ preventScroll: true }); });
  root.querySelectorAll('[data-goto-profile]').forEach((b) => b.addEventListener('click', () => setTab('profile')));

  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => selectNight(b.dataset.open)));
  root.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
    state.period = Number(b.dataset.period);
    state.periodOffset = 0;
    setPref('trend_period', String(state.period));
    renderTrend();
    const again = root.querySelector(`[data-period="${state.period}"]`);
    if (again) again.focus({ preventScroll: true });
  }));
  // "Tutte le fonti" → sezione Fondamento scientifico nelle Impostazioni.
  root.querySelectorAll('[data-goto-science]').forEach((b) => b.addEventListener('click', () => {
    setTab('settings');
    const sci = document.getElementById('science');
    if (sci) { sci.open = true; sci.scrollIntoView({ block: 'start' }); const sm = sci.querySelector('summary'); if (sm) sm.focus({ preventScroll: true }); }
  }));
  // Filtri (Fase 5.1).
  const refilter = (focusSel) => {
    saveFilters();
    renderTrend();
    const d = document.getElementById('trend-filters');
    if (d) d.open = true;
    const again = focusSel && root.querySelector(focusSel);
    if (again) again.focus({ preventScroll: true });
  };
  root.querySelectorAll('[data-f-daytype]').forEach((b) => b.addEventListener('click', () => { state.filters.dayType = b.dataset.fDaytype; refilter(`[data-f-daytype="${b.dataset.fDaytype}"]`); }));
  root.querySelectorAll('[data-f-prov]').forEach((b) => b.addEventListener('click', () => { state.filters.provenance = b.dataset.fProv; refilter(`[data-f-prov="${b.dataset.fProv}"]`); }));
  const fu = document.getElementById('f-unusual');
  if (fu) fu.addEventListener('change', () => { state.filters.includeUnusual = fu.checked; refilter('#f-unusual'); });
  const tog = document.getElementById('toggle-outliers');
  if (tog) tog.addEventListener('click', () => {
    state.includeOutliers = !state.includeOutliers;
    renderTrend();
    const det = root.querySelector('.outlier-note');
    if (det) det.open = true;
    const again = document.getElementById('toggle-outliers');
    if (again) again.focus({ preventScroll: true });
  });
  // Stessa preferenza, dalla sezione "Schermo e sonno" (Fase 4.1): P1–P3
  // usano tutto lo storico, quindi il comando deve esserci anche quando il
  // periodo scelto nel riepilogo non contiene anomalie.
  const togQ = document.getElementById('toggle-outliers-q');
  if (togQ) togQ.addEventListener('click', () => {
    state.includeOutliers = !state.includeOutliers;
    renderTrend();
    const again = document.getElementById('toggle-outliers-q');
    if (again) again.focus({ preventScroll: true });
  });
  restoreFocus(key);
}

// ---------- Calendario ----------
function renderCalendar() {
  const { year, month } = state.calendarMonth;
  const total = daysInMonth(year, month);
  const leading = firstWeekdayOfMonth(year, month);
  const t = todayISO();
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= total; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    cells.push({ day, dateStr, isFuture: dateStr > t, status: dayStatus(state.entries[dateStr]) });
  }
  const monthLabel = new Date(year, month, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  tabContent().innerHTML = `
    <div class="cal-nav">
      <button type="button" class="icon-btn" id="cal-prev" aria-label="Mese precedente">${ICONS.chevronLeft}</button>
      <h2 class="serif month-label" aria-live="polite">${monthLabel}</h2>
      <button type="button" class="icon-btn" id="cal-next" aria-label="Mese successivo">${ICONS.chevronRight}</button>
    </div>
    <div class="cal-grid" aria-hidden="true">${WEEKDAY_LABELS.map((w) => `<div class="weekday">${w}</div>`).join('')}</div>
    <div class="cal-days">
      ${cells.map((cell) => {
    if (!cell) return '<div></div>';
    const { day, dateStr, isFuture, status } = cell;
    const cls = ['cal-cell'];
    if (dateStr === t) cls.push('today');
    if (dateStr === state.selectedDate) cls.push('selected');
    return `<button type="button" class="${cls.join(' ')}" data-date="${dateStr}" ${isFuture ? 'disabled' : ''}
          aria-label="Notte terminata il ${day} ${monthLabel}, ${STATUS_WORD[status]}">
          <span>${day}</span><span class="cal-dot ${status}"></span>
        </button>`;
  }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="dot complete"></span>Completa</span>
      <span><span class="dot partial"></span>Parziale</span>
      <span><span class="dot missing"></span>Senza dati</span>
    </div>
    <p class="footnote">Ogni giorno indica la notte terminata con il risveglio di quel giorno. Tocca un giorno per aprirla e completarla o correggerla.</p>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => shiftMonth(1));
  root.querySelectorAll('.cal-cell:not(:disabled)').forEach((btn) => btn.addEventListener('click', () => selectNight(btn.dataset.date)));
}
function shiftMonth(delta) {
  const key = focusKey();
  const d = new Date(state.calendarMonth.year, state.calendarMonth.month + delta, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
  restoreFocus(key); // resta sul pulsante "mese precedente/successivo"
}

// ---------- Impostazioni ----------
function renderSettings() {
  const key = focusKey();
  tabContent().innerHTML = `
    <section class="card card-pad">
      <h3 class="settings-title">Aspetto</h3>
      <div class="segmented" role="group" aria-label="Tema">
        <button type="button" class="${state.theme === 'light' ? 'active' : ''}" id="theme-light" aria-pressed="${state.theme === 'light'}">Chiaro</button>
        <button type="button" class="${state.theme === 'dark' ? 'active' : ''}" id="theme-dark" aria-pressed="${state.theme === 'dark'}">Scuro</button>
      </div>
    </section>
    <section class="card card-pad">
      <h3 class="settings-title">Promemoria</h3>
      <p class="muted">Un avviso leggero se la notte appena trascorsa non ha nessun dato; mai per notti compilate in parte. Compare quando apri l'app: senza un server, su iPhone un'app web non può inviare notifiche mentre è chiusa.</p>
      <button type="button" class="btn-ghost ${state.remindersEnabled ? 'active' : ''}" id="reminder-toggle" aria-pressed="${state.remindersEnabled}">${state.remindersEnabled ? 'Attivo' : 'Disattivato'}</button>
      <p class="muted small" id="reminder-note"></p>
    </section>
    <section class="card card-pad" aria-labelledby="week-tpl-title">
      <h3 class="settings-title" id="week-tpl-title">Giorni vincolati e liberi</h3>
      <p class="muted">Lo schema della tua settimana tipo. Serve solo a proporre il tipo di giorno quando compili un nuovo mattino; puoi sempre correggerlo notte per notte, e il valore della singola notte prevale.</p>
      <div class="tpl-grid">
        ${[1, 2, 3, 4, 5, 6, 0].map((i) => `
          <button type="button" class="tpl-day ${state.dayTemplate[i] === 'constrained' ? 'is-constrained' : ''}" data-tpl="${i}" aria-pressed="${state.dayTemplate[i] === 'constrained'}">
            <span class="tpl-name">${WEEKDAY_FULL[i]}</span><span class="tpl-val">${state.dayTemplate[i] === 'constrained' ? 'Vincolato' : 'Libero'}</span>
          </button>`).join('')}
      </div>
      <p class="muted small">Il giorno è quello del risveglio: "lunedì vincolato" vale per la notte tra domenica e lunedì.</p>
    </section>
    <section class="card card-pad" aria-labelledby="ctx-defs-title">
      <h3 class="settings-title" id="ctx-defs-title">Definizioni degli indicatori</h3>
      <p class="muted">Orari usati nelle domande "Caffeina dopo le…" e "Alcol dalle…". Sono scelte personali, non soglie cliniche. Ogni risposta salvata conserva l'orario in vigore quando l'hai data.</p>
      <div class="row">
        <label class="row-label" for="def-caffeine">Caffeina tardiva: dopo le</label>
        <div class="row-control"><input type="time" class="def-time" id="def-caffeine" value="${state.contextDefs.lateCaffeineFrom}"></div>
      </div>
      <div class="row">
        <label class="row-label" for="def-alcohol">Alcol: dalle</label>
        <div class="row-control"><input type="time" class="def-time" id="def-alcohol" value="${state.contextDefs.alcoholFrom}"></div>
      </div>
    </section>
    <section class="card card-pad" aria-labelledby="data-title">
      <h3 class="settings-title" id="data-title">I tuoi dati</h3>
      <p class="muted">Restano solo su questo dispositivo, senza copie altrove. Salva ogni tanto un backup e conservalo fuori dal telefono (es. in iCloud Drive o via email).</p>
      ${state.storagePersisted === true ? '<p class="muted small">Archiviazione protetta: il browser non cancellerà i dati per liberare spazio.</p>' : state.storagePersisted === false ? '<p class="muted small">Il browser non garantisce la conservazione a lungo termine dei dati: usa l\'app dalla schermata Home e salva backup periodici.</p>' : ''}
      <div class="data-actions">
        <div class="data-action">
          <button type="button" class="btn-ghost" id="backup-json" ${state.demo ? 'disabled' : ''}>${ICONS.download}<span>Salva backup completo</span></button>
          <p class="muted small">File JSON con tutte le notti, per ripristinare l'app anche su un altro dispositivo.${lastBackupText()}</p>
        </div>
        <div class="data-action">
          <button type="button" class="btn-ghost" id="restore-json" ${state.demo || (state.importState && state.importState.busy) ? 'disabled' : ''}>${ICONS.upload}<span>Ripristina da backup</span></button>
          <input type="file" id="restore-file" accept="application/json,.json" class="visually-hidden" tabindex="-1" aria-hidden="true" aria-label="File di backup da ripristinare">
          <p class="muted small">Prima di modificare qualcosa ti mostra cosa contiene il file e chiede conferma.</p>
        </div>
        <div class="data-action">
          <button type="button" class="btn-ghost" id="export-csv" ${state.demo ? 'disabled' : ''}>${ICONS.download}<span>Esporta CSV</span></button>
          <p class="muted small">Una riga per notte, per analizzare i dati in un foglio di calcolo. Non serve per il ripristino.</p>
        </div>
      </div>
      ${state.demo ? '<p class="muted small">Backup, ripristino ed export non sono disponibili in modalità demo: escine per usare i tuoi dati reali.</p>' : ''}
      ${importPanelHTML()}
    </section>
    ${provenanceSectionHTML()}
    ${scienceSectionHTML()}
    <section class="card card-pad">
      <h3 class="settings-title">Modalità demo</h3>
      <p class="muted">Mostra l'app con ${DEMO_NIGHTS} notti di dati di esempio, per vedere come appaiono le analisi. I dati finti restano solo in memoria: non si mescolano ai tuoi, non vengono esportati e spariscono quando chiudi l'app.</p>
      <button type="button" class="btn-ghost ${state.demo ? 'active' : ''}" id="demo-toggle" aria-pressed="${state.demo}">${state.demo ? 'Attiva — tocca per uscire' : 'Disattivata'}</button>
    </section>
    <section class="card card-pad">
      <h3 class="settings-title">Su questa versione</h3>
      <p class="muted">App installabile, funziona anche offline, nessun dato lascia il dispositivo e nessuna connessione verso servizi esterni. Diario con origine dei dati, calendario, andamento descrittivo (riepilogo, orari, andamento di una misura, regolarità con SRI da diario), tre domande su schermo e sonno, Fondamento scientifico, Profilo con storico del lavoro e delle routine, backup delle notti e del contesto, export CSV.</p>
      <p class="muted small">Dati delle notti: schema ${SCHEMA_VERSION}. Archivio del Profilo e del contesto: separato, versione 1. Rilascio del 23/11/2026.</p>
    </section>
  `;

  document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
  document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
  document.getElementById('export-csv').addEventListener('click', () => { if (!state.demo) downloadCSV(state.entries); });
  attachBackupListeners();
  attachProvenanceListeners();
  root.querySelectorAll('[data-tpl]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.tpl);
    state.dayTemplate[i] = state.dayTemplate[i] === 'constrained' ? 'free' : 'constrained';
    setPref('daytype_template', JSON.stringify(state.dayTemplate));
    renderSettings();
  }));
  [['def-caffeine', 'lateCaffeineFrom', 'late_caffeine_from'], ['def-alcohol', 'alcoholFrom', 'alcohol_from']].forEach(([id, k, pref]) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!/^\d{2}:\d{2}$/.test(e.target.value)) { e.target.value = state.contextDefs[k]; return; }
      state.contextDefs[k] = e.target.value;
      setPref(pref, e.target.value);
    });
  });
  document.getElementById('demo-toggle').addEventListener('click', () => { setDemo(!state.demo); render(); });
  document.getElementById('reminder-toggle').addEventListener('click', async () => {
    let note = '';
    if (!state.remindersEnabled) {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        state.remindersEnabled = perm === 'granted';
        if (perm === 'denied') note = 'Le notifiche sono bloccate nelle impostazioni del telefono.';
      } else {
        note = "Su iPhone le notifiche funzionano solo con l'app aggiunta alla schermata Home.";
      }
    } else {
      state.remindersEnabled = false;
    }
    setPref('reminders_enabled', state.remindersEnabled ? '1' : '0');
    renderSettings();
    document.getElementById('reminder-note').textContent = note;
  });
  restoreFocus(key);
}

// ---------- Backup e ripristino (vedi js/backup.js e docs/DATA_MODEL.md §7) ----------
function lastBackupText() {
  const last = getPref('last_backup', '');
  if (!last) return ' Nessun backup salvato finora da questa app.';
  const d = new Date(last);
  return isNaN(d) ? '' : ` Ultimo backup: ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
}

function saveBackup() {
  if (state.demo) return;
  const now = new Date();
  const backup = buildBackup(state.entries, { schemaVersion: SCHEMA_VERSION, now });
  downloadFile(JSON.stringify(backup, null, 2), backupFilename(now), 'application/json');
  setPref('last_backup', now.toISOString());
}

const WEEKDAY_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const fmtDate = (date) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

function importPanelHTML() {
  const s = state.importState;
  if (!s) return '';
  if (s.error) {
    return `<div class="import-panel" id="import-panel" tabindex="-1" role="region" aria-labelledby="import-title">
      <h4 id="import-title">Ripristino non possibile</h4>
      ${msgHTML(`${s.error} I dati del dispositivo non sono stati modificati.`, 'error')}
      <div class="import-actions"><button type="button" class="btn-ghost" id="import-cancel">Chiudi</button></div>
    </div>`;
  }
  if (s.done) {
    return `<div class="import-panel" id="import-panel" tabindex="-1" role="region" aria-labelledby="import-title">
      <h4 id="import-title">${s.ok ? 'Ripristino completato' : 'Ripristino non riuscito'}</h4>
      ${msgHTML(s.text, s.ok ? 'info' : 'error')}
      <div class="import-actions"><button type="button" class="btn-ghost" id="import-cancel">Chiudi</button></div>
    </div>`;
  }
  const plan = planImport(s.records, state.entries, s.mode);
  const m = s.meta;
  const exported = m.exportedAt && !isNaN(new Date(m.exportedAt)) ? new Date(m.exportedAt).toLocaleString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'data sconosciuta';
  const onlyDevice = Object.keys(state.entries).filter((d) => !s.records.some((r) => r.date === d)).length;
  const draftsHit = s.records.filter((r) => isDirty(r.date)).length;
  const conflictList = plan.conflicts.slice(0, 8).map((r) => fmtDate(r.date)).join(', ') + (plan.conflicts.length > 8 ? ` e altre ${plan.conflicts.length - 8}` : '');
  const replacing = plan.mode === 'replace' && plan.conflicts.length > 0;
  let label;
  if (s.busy) label = 'Importazione…';
  else if (!plan.toWrite.length) label = 'Niente da importare';
  else if (replacing) {
    const nNotti = (n) => `${n} ${n === 1 ? 'notte' : 'notti'}`;
    label = s.confirm ? `Conferma: sostituisci ${nNotti(plan.conflicts.length)}`
      : plan.add.length ? `Importa ${nNotti(plan.add.length)} e sostituiscine ${plan.conflicts.length}` : `Sostituisci ${nNotti(plan.conflicts.length)}`;
  }
  else label = `Importa ${plan.add.length} ${plan.add.length === 1 ? 'notte nuova' : 'notti nuove'}`;
  const off = s.busy || !plan.toWrite.length;
  return `<div class="import-panel" id="import-panel" tabindex="-1" role="region" aria-labelledby="import-title">
    <h4 id="import-title">Ripristino da backup</h4>
    <p class="muted small">${s.fileName ? `${escapeHTML(s.fileName)} · ` : ''}creato il ${exported} · ${m.count} ${m.count === 1 ? 'notte' : 'notti'}${m.firstDate ? ` (dal ${fmtDate(m.firstDate)} al ${fmtDate(m.lastDate)})` : ''}${m.migrated ? ' · creato con una versione precedente: convertito al formato attuale' : ''}</p>
    <ul class="import-counts">
      <li><strong>${plan.add.length}</strong> ${plan.add.length === 1 ? 'nuova: verrà aggiunta' : 'nuove: verranno aggiunte'}</li>
      <li><strong>${plan.identical.length}</strong> già ${plan.identical.length === 1 ? 'presente e identica' : 'presenti e identiche'}: nessuna modifica</li>
      <li><strong>${plan.conflicts.length}</strong> già ${plan.conflicts.length === 1 ? 'presente' : 'presenti'} con dati diversi${plan.conflicts.length ? ` (${conflictList})` : ''}${plan.metaOnly.length ? `; di cui ${plan.metaOnly.length} con gli stessi valori e solo l'origine dei dati diversa` : ''}</li>
    </ul>
    ${plan.conflicts.length ? `
    <fieldset class="import-mode">
      <legend>Per le notti con dati diversi</legend>
      <label><input type="radio" name="import-mode" value="add" ${s.mode === 'add' ? 'checked' : ''}> Mantieni i dati del dispositivo</label>
      <label><input type="radio" name="import-mode" value="replace" ${s.mode === 'replace' ? 'checked' : ''}> Sostituiscili con quelli del backup</label>
    </fieldset>` : ''}
    <p class="muted small">${onlyDevice ? `Le ${onlyDevice} ${onlyDevice === 1 ? 'notte presente' : 'notti presenti'} solo sul dispositivo non verranno toccate. ` : ''}Nessuna notte viene eliminata.</p>
    ${m.incoherent.length ? msgHTML(`${m.incoherent.length} ${m.incoherent.length === 1 ? 'notte del backup ha' : 'notti del backup hanno'} orari incoerenti: verranno importate così come sono e il diario le segnalerà per essere corrette.`, 'warn') : ''}
    ${draftsHit ? msgHTML(`Hai modifiche non salvate su ${draftsHit} di queste notti: resteranno come bozze, da salvare o scartare.`, 'info') : ''}
    ${replacing && s.confirm ? msgHTML(`Le ${plan.conflicts.length} notti in conflitto verranno sovrascritte con i dati del backup. Se vuoi tenerne una copia, salva prima un backup.`, 'warn') : ''}
    <div class="import-actions">
      <button type="button" class="btn-primary ${replacing && s.confirm ? 'is-danger' : ''}" id="import-confirm" aria-disabled="${off}">${label}</button>
      <button type="button" class="btn-ghost" id="import-cancel" ${s.busy ? 'disabled' : ''}>Annulla</button>
      <button type="button" class="link-btn" id="import-backup-first" ${s.busy ? 'disabled' : ''}>Salva prima un backup dei dati attuali</button>
    </div>
  </div>`;
}

function escapeHTML(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function attachBackupListeners() {
  const $ = (id) => document.getElementById(id);
  $('backup-json').addEventListener('click', () => { saveBackup(); renderSettings(); });
  $('restore-json').addEventListener('click', () => { if (!state.demo) $('restore-file').click(); });
  $('restore-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { state.importState = { error: 'Il file è troppo grande per essere un backup di questa app.' }; showImportPanel(); return; }
    let text;
    try { text = await file.text(); } catch (err) { state.importState = { error: 'Non riesco a leggere il file.' }; showImportPanel(); return; }
    const parsed = parseBackup(text, { schemaVersion: SCHEMA_VERSION, migrate: migrateRecords });
    state.importState = parsed.ok
      ? { fileName: file.name, records: parsed.records, meta: parsed.meta, mode: 'add', confirm: false, busy: false }
      : { error: parsed.error };
    showImportPanel();
  });
  if (!state.importState) return;
  const cancel = $('import-cancel');
  if (cancel) cancel.addEventListener('click', () => { state.importState = null; renderSettings(); $('restore-json').focus({ preventScroll: true }); });
  const first = $('import-backup-first');
  if (first) first.addEventListener('click', () => { saveBackup(); renderSettings(); });
  root.querySelectorAll('input[name="import-mode"]').forEach((r) => r.addEventListener('change', () => {
    state.importState.mode = r.value;
    state.importState.confirm = false;
    renderSettings();
  }));
  const go = $('import-confirm');
  if (go) go.addEventListener('click', runImport);
}

function showImportPanel() {
  renderSettings();
  const panel = document.getElementById('import-panel');
  if (panel) { panel.focus({ preventScroll: true }); panel.scrollIntoView({ block: 'nearest' }); }
}

async function runImport() {
  const s = state.importState;
  if (!s || s.busy || s.error || s.done || state.demo) return;
  // Il piano si ricalcola sui dati attuali al momento della conferma.
  const plan = planImport(s.records, state.entries, s.mode);
  if (!plan.toWrite.length) return;
  if (plan.mode === 'replace' && plan.conflicts.length && !s.confirm) { s.confirm = true; renderSettings(); return; }
  s.busy = true;
  renderSettings();
  const ok = await importEntries(plan.toWrite);
  // Si rilegge il database invece di fidarsi dello stato in memoria, e si
  // verifica che ogni notte scritta corrisponda a quella del backup.
  let fresh = null;
  try { fresh = await getAllEntries(); } catch (e) { fresh = null; }
  if (fresh) state.entries = fresh;
  persistDrafts();
  const verified = ok && fresh && plan.toWrite.every((r) => fresh[r.date] && sameRecord(fresh[r.date], r));
  const replaced = plan.mode === 'replace' ? plan.conflicts.length : 0;
  state.importState = verified
    ? { done: true, ok: true, text: `Importate ${plan.toWrite.length} ${plan.toWrite.length === 1 ? 'notte' : 'notti'} (${plan.add.length} nuove${replaced ? `, ${replaced} sostituite` : ''}). Il database è stato riletto e ogni notte importata corrisponde al backup.` }
    : { done: true, ok: false, text: ok
      ? "L'importazione è stata scritta ma la verifica ha trovato differenze: controlla le notti importate o riprova."
      : 'Importazione non riuscita: nessun dato è stato modificato. Riprova; se succede di nuovo, il file potrebbe essere troppo grande per lo spazio disponibile.' };
  showImportPanel();
}

// ---------- Origine dei dati (Fase 3; js/provenance.js, DATA_MODEL.md §8) ----------
// Classifica la provenienza dei valori e il giorno dello Screen Time su un
// intervallo di notti. Anteprima prima della conferma; scrittura in
// un'unica transazione; rilettura del database e verifica che sia cambiato
// solo ciò che doveva; "Annulla questa operazione" finché le notti toccate
// non vengono modificate in altro modo. I valori del diario non cambiano mai.
const nNotti = (n) => `${n} ${n === 1 ? 'notte' : 'notti'}`;
const nValori = (n) => `${n} ${n === 1 ? 'valore' : 'valori'}`;
const fmtDayLong = (date) => new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function entryRange() {
  const dates = Object.keys(state.entries).sort();
  return { first: dates[0] || todayISO(), last: dates[dates.length - 1] || todayISO() };
}
function openProvTool(mode) {
  const { first, last } = entryRange();
  state.provTool = mode === 'prov'
    ? { mode, from: first, to: last, groups: [], target: null, onlyUnknown: true }
    : { mode, scope: 'range', from: first, to: last, action: null, night: last, choice: null, day: '' };
}

// Sezione "Fondamento scientifico" (Fase 5.4): tutta la bibliografia,
// consultabile offline, con lo stato e la data dell'ultima verifica.
function scienceSectionHTML() {
  const groups = [
    ['V1', 'Fonti verificate'], ['V2', 'Fonti con verifica in corso (citate senza numeri)'],
    ['ESCLUSO', 'Escluse come prova per adulti'], ['NV', 'Non verificate (non usate)'], ['APP', "Verifica dell'app"],
  ];
  return `
    <details class="card card-pad science" id="science">
      <summary><h3 class="settings-title">Fondamento scientifico</h3></summary>
      <p class="muted">Le fonti su cui si basano le scelte dell'app, con lo stato di verifica di ciascuna. È consultabile anche senza internet. Le prove della letteratura riguardano gruppi di persone: non sono previsioni su di te e non compaiono mai nella stessa frase dei tuoi risultati.</p>
      <p class="q-sub">Che cosa dice, in sintesi, la letteratura verificata</p>
      <ul class="sci-summary">${SUMMARY.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="q-sub">Come sono usate le fonti</p>
      <ul class="sci-summary">
        <li>Numeri solo da fonti verificate, sempre con la popolazione e il tipo di studio.</li>
        <li>Fonti con verifica in corso: solo affermazioni senza numeri.</li>
        <li>Studi su bambini e ragazzi: solo come contesto, con l'etichetta.</li>
        <li>Fonti non verificate o escluse: elencate, mai usate a sostegno.</li>
        <li>Ogni citazione dice se riguarda il fenomeno, il metodo o la misura.</li>
      </ul>
      ${groups.map(([st, label]) => {
    const list = SOURCES.filter((x) => x.status === st);
    return list.length ? `<details class="sci-group" data-status="${st}"><summary>${label} (${list.length})</summary><p class="muted small">${STATUS[st].detail}</p><ul class="src-list">${list.map((x) => sourceItemHTML(x, { full: true })).join('')}</ul></details>` : '';
  }).join('')}
      <p class="muted small">Verifiche del 10–11 novembre 2026; dettagli in ${BIBLIOGRAPHY_SOURCE}. La verifica delle fonti "in corso" può essere completata con accesso diretto agli articoli.</p>
    </details>`;
}
function provenanceSectionHTML() {
  const sum = provenanceSummary(state.entries);
  const t = sum.totals;
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const screenTotal = sum.screen.verified + sum.screen.presumed + sum.screen.unknown;
  const rows = PROVENANCE_FIELDS.filter((f) => Object.values(sum.fields[f]).some((n) => n > 0)).map((f) => {
    const c = sum.fields[f];
    return `<tr><th scope="row">${FIELD_LABELS[f]}</th><td>${c.prospective}</td><td>${c.transcribed}</td><td>${c.retrospective}</td><td>${c.unknown}</td></tr>`;
  }).join('');
  const off = state.demo;
  const tool = state.provTool;
  return `
    <section class="card card-pad" aria-labelledby="prov-title">
      <h3 class="settings-title" id="prov-title">Origine dei dati</h3>
      <p class="muted">Per ogni valore l'app ricorda se è stato inserito al momento, ricopiato da note dell'epoca o ricostruito a memoria. I dati inseriti prima di questa funzione hanno origine non nota finché non li classifichi tu. Classificare non cambia nessun valore del diario e si può correggere quando vuoi.</p>
      ${total ? `
      <ul class="prov-summary" id="prov-summary">
        ${['prospective', 'transcribed', 'retrospective', 'unknown'].map((p) => `<li><span>${PROVENANCE_LABELS[p]}</span><strong>${t[p]}</strong></li>`).join('')}
      </ul>
      <p class="muted small">${nValori(total)} in ${nNotti(sum.nights)}.${screenTotal ? ` Giorno dello Screen Time: ${sum.screen.verified} ${sum.screen.verified === 1 ? 'verificato' : 'verificati'}, ${sum.screen.presumed} ${sum.screen.presumed === 1 ? 'presunto' : 'presunti'} (giorno prima del risveglio, non controllato), ${sum.screen.unknown} ${sum.screen.unknown === 1 ? 'sconosciuto' : 'sconosciuti'}.` : ''}</p>
      <details class="prov-details">
        <summary>Per campo</summary>
        <div class="table-scroll"><table class="prov-table">
          <thead><tr><th scope="col">Campo</th><th scope="col" title="${PROVENANCE_LABELS.prospective}">Al momento</th><th scope="col" title="${PROVENANCE_LABELS.transcribed}">Da note</th><th scope="col" title="${PROVENANCE_LABELS.retrospective}">A memoria</th><th scope="col" title="${PROVENANCE_LABELS.unknown}">Non nota</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </details>` : '<p class="muted small">Nessun dato salvato.</p>'}
      ${!tool ? `
      <div class="data-actions">
        <div class="data-action">
          <button type="button" class="btn-ghost" id="prov-open" ${off || !total ? 'disabled' : ''}>Classifica l'origine dei dati</button>
        </div>
        <div class="data-action">
          <button type="button" class="btn-ghost" id="screen-open" ${off || !screenTotal ? 'disabled' : ''}>Giorno dello Screen Time</button>
          <p class="muted small">Conferma, segna come sconosciuto o correggi il giorno a cui si riferisce lo Screen Time delle notti già salvate.</p>
        </div>
      </div>
      ${off ? '<p class="muted small">Non disponibile in modalità demo.</p>' : ''}` : tool.mode === 'prov' ? provPanelHTML(tool) : screenPanelHTML(tool)}
    </section>`;
}

function rangeInputsHTML(tool, prefix) {
  return `<div class="prov-range">
      <label class="prov-field"><span>Dal</span><input type="date" id="${prefix}-from" value="${tool.from}" max="${todayISO()}"></label>
      <label class="prov-field"><span>Al</span><input type="date" id="${prefix}-to" value="${tool.to}" max="${todayISO()}"></label>
    </div>`;
}
function backupHintHTML() {
  return `<p class="muted small">${lastBackupText().trim()} <button type="button" class="link-btn inline" id="prov-backup">Salva prima un backup</button></p>`;
}
function resultHTML(tool) {
  if (!tool.result) return '';
  return `${msgHTML(tool.result.text, tool.result.ok ? 'info' : 'error', 'prov-result')}
    ${tool.undo ? '<button type="button" class="btn-ghost" id="prov-undo">Annulla questa operazione</button>' : ''}`;
}

function provPanelHTML(tool) {
  const fields = fieldsOfGroups(tool.groups);
  const plan = planProvenance(state.entries, { from: tool.from, to: tool.to, fields, target: tool.target, onlyUnknown: tool.onlyUnknown });
  let preview;
  if (plan.error) preview = `<p class="muted small">${plan.error}</p>`;
  else {
    const parts = [];
    if (plan.already) parts.push(`${nValori(plan.already)} ${plan.already === 1 ? 'ha' : 'hanno'} già questa origine`);
    if (plan.kept) parts.push(`${nValori(plan.kept)} con un'origine già indicata ${plan.kept === 1 ? 'resta com\'è' : 'restano come sono'}`);
    const from = Object.entries(plan.byCurrent).filter(([, n]) => n).map(([p, n]) => `${n} da «${PROVENANCE_LABELS[p].toLowerCase()}»`).join(', ');
    preview = plan.values
      ? `<p><strong>${nValori(plan.values)}</strong> in <strong>${nNotti(plan.nights)}</strong> ${plan.values === 1 ? 'diventerà' : 'diventeranno'} «${PROVENANCE_LABELS[tool.target]}»${from ? ` (${from})` : ''}.</p>`
      : '<p>Nessun valore da classificare con queste scelte.</p>';
    if (parts.length) preview += `<p class="muted small">${capitalize(parts.join('; '))}.</p>`;
    if (plan.values) preview += '<p class="muted small">Nessun valore del diario viene modificato.</p>';
  }
  const off = tool.busy || !!plan.error || !plan.values;
  return `<div class="import-panel prov-panel" id="prov-panel" tabindex="-1" role="region" aria-labelledby="prov-panel-title">
    <h4 id="prov-panel-title">Classifica l'origine dei dati</h4>
    ${rangeInputsHTML(tool, 'prov')}
    <fieldset class="import-mode">
      <legend>Campi</legend>
      ${PROVENANCE_GROUPS.map((g) => `<label><input type="checkbox" id="pg-${g.id}" data-group="${g.id}" ${tool.groups.includes(g.id) ? 'checked' : ''}> <span>${g.label}${g.fields.length > 1 ? `<span class="muted small block">${g.fields.map((f) => FIELD_LABELS[f]).join(', ')}</span>` : ''}</span></label>`).join('')}
    </fieldset>
    <fieldset class="import-mode">
      <legend>Origine</legend>
      ${['transcribed', 'retrospective', 'prospective', 'unknown'].map((p) => `<label><input type="radio" name="prov-target" id="pt-${p}" value="${p}" ${tool.target === p ? 'checked' : ''}> <span>${PROVENANCE_LABELS[p]}${p === 'prospective' ? '<span class="muted small block">Inseriti nell\'app entro un giorno e mezzo dalla notte</span>' : ''}</span></label>`).join('')}
    </fieldset>
    <label class="check-row"><input type="checkbox" id="prov-only-unknown" ${tool.onlyUnknown ? 'checked' : ''}> <span>Solo i valori con origine ancora non nota</span></label>
    <div class="prov-preview" id="prov-preview" aria-live="polite">${preview}</div>
    ${backupHintHTML()}
    ${resultHTML(tool)}
    <div class="import-actions">
      <button type="button" class="btn-primary" id="prov-apply" aria-disabled="${off}">${tool.busy ? 'Scrittura…' : plan.values ? `Classifica ${nValori(plan.values)}` : 'Classifica'}</button>
      <button type="button" class="btn-ghost" id="prov-close" ${tool.busy ? 'disabled' : ''}>Chiudi</button>
    </div>
  </div>`;
}

function screenPlan(tool) {
  if (tool.scope === 'range') return planScreenDate(state.entries, { from: tool.from, to: tool.to, action: tool.action });
  const r = state.entries[tool.night];
  if (!r || screenTimeReference(r) == null) return { error: 'Questa notte non ha uno Screen Time.', records: [] };
  if (!tool.choice) return { error: 'Scegli che cosa indicare.', records: [] };
  const out = manualScreenDate(r, tool.choice === 'date' ? { kind: 'date', date: tool.day } : { kind: tool.choice });
  if (out.error) return { error: out.error, records: [] };
  const same = ['screenTimeDate', 'screenTimeDateStatus', 'screenTimeDateRule'].every((f) => (out.record[f] ?? null) === (r[f] ?? null));
  return same ? { error: null, records: [], already: 1 } : { error: null, records: [out.record] };
}
function screenRefText(r) {
  const ref = screenTimeReference(r);
  if (!ref) return 'nessuno Screen Time in questa notte';
  const how = { entry_label: 'indicato al momento dell\'inserimento', manual_correction: 'corretto a mano', historic_convention_confirmed: 'confermato da te' }[ref.rule] || '';
  return `Screen time ${formatDuration(r.screenTimeTotal)} · giorno ${SCREEN_STATUS_LABELS[ref.status].toLowerCase()}${ref.date ? `: ${fmtDayLong(ref.date)}` : ''}${ref.status === 'presumed' ? ' (giorno prima del risveglio, non controllato)' : how ? ` (${how})` : ''}`;
}

function screenPanelHTML(tool) {
  const plan = screenPlan(tool);
  let preview;
  if (plan.error) preview = `<p class="muted small">${plan.error}</p>`;
  else if (tool.scope === 'range') {
    const PL = { verified: ['verificata', 'verificate'], presumed: ['presunta', 'presunte'], unknown: ['sconosciuta', 'sconosciute'] };
    const from = Object.entries(plan.byCurrent).filter(([, n]) => n).map(([st, n]) => `${n} ${PL[st][n === 1 ? 0 : 1]}`).join(', ');
    const target = { confirm: 'verificato, giorno prima del risveglio', unknown: 'sconosciuto', presumed: 'presunto' }[tool.action];
    preview = plan.nights ? `<p><strong>${nNotti(plan.nights)}</strong>: il giorno dello Screen Time diventerà ${target}${from ? ` (ora: ${from})` : ''}.</p>` : '<p>Nessuna notte da cambiare con queste scelte.</p>';
    const notes = [];
    if (plan.already) notes.push(`${nNotti(plan.already)} già in questo stato`);
    if (plan.entryLabel) notes.push(`${nNotti(plan.entryLabel)} con il giorno indicato al momento dell'inserimento, ${plan.entryLabel === 1 ? 'esclusa' : 'escluse'}`);
    if (plan.manual) notes.push(`${nNotti(plan.manual)} ${plan.manual === 1 ? 'corretta a mano, esclusa' : 'corrette a mano, escluse'} (si cambiano una alla volta)`);
    if (notes.length) preview += `<p class="muted small">${capitalize(notes.join('; '))}.</p>`;
    if (plan.nights) preview += '<p class="muted small">Il valore dello Screen Time non cambia: cambia solo il giorno a cui è attribuito.</p>';
  } else {
    preview = plan.already ? '<p>La notte è già in questo stato.</p>' : `<p>La notte del ${fmtDayLong(tool.night)} verrà aggiornata.</p>`;
  }
  const count = plan.records.length;
  const off = tool.busy || !!plan.error || !count;
  const r = state.entries[tool.night];
  let minDay = tool.night;
  for (let i = 0; i < MANUAL_MAX_DAYS_BEFORE; i++) minDay = addDays(minDay, -1);
  return `<div class="import-panel prov-panel" id="prov-panel" tabindex="-1" role="region" aria-labelledby="prov-panel-title">
    <h4 id="prov-panel-title">Giorno dello Screen Time</h4>
    <p class="muted small">Il totale di Tempo di utilizzo si riferisce a un giorno di calendario. Per le notti inserite prima di questa versione si presume il giorno prima del risveglio, ma non è stato controllato.</p>
    <div class="segmented seg-2" role="group" aria-label="Notti da modificare">
      <button type="button" id="scope-range" class="${tool.scope === 'range' ? 'active' : ''}" aria-pressed="${tool.scope === 'range'}">Più notti</button>
      <button type="button" id="scope-single" class="${tool.scope === 'single' ? 'active' : ''}" aria-pressed="${tool.scope === 'single'}">Una notte</button>
    </div>
    ${tool.scope === 'range' ? `
    ${rangeInputsHTML(tool, 'scr')}
    <fieldset class="import-mode">
      <legend>Per queste notti</legend>
      <label><input type="radio" name="scr-action" id="sa-confirm" value="confirm" ${tool.action === 'confirm' ? 'checked' : ''}> <span>Confermo: è il giorno prima del risveglio</span></label>
      <label><input type="radio" name="scr-action" id="sa-unknown" value="unknown" ${tool.action === 'unknown' ? 'checked' : ''}> <span>Non so a che giorno si riferisce</span></label>
      <label><input type="radio" name="scr-action" id="sa-presumed" value="presumed" ${tool.action === 'presumed' ? 'checked' : ''}> <span>Torna a «presunto»</span></label>
    </fieldset>` : `
    <label class="prov-field wide"><span>Notte (giorno del risveglio)</span><input type="date" id="scr-night" value="${tool.night}" max="${todayISO()}"></label>
    <p class="muted small" id="scr-current">${r ? screenRefText(r) : 'Nessun dato salvato per questa notte'}</p>
    <fieldset class="import-mode">
      <legend>Lo Screen Time di questa notte si riferisce a</legend>
      <label><input type="radio" name="scr-choice" id="sc-date" value="date" ${tool.choice === 'date' ? 'checked' : ''}> <span>Questo giorno:</span></label>
      <label class="prov-field wide indent"><span class="visually-hidden">Giorno dello Screen Time</span><input type="date" id="scr-day" value="${tool.day}" min="${minDay}" max="${tool.night}" ${tool.choice === 'date' ? '' : 'disabled'}></label>
      <label><input type="radio" name="scr-choice" id="sc-unknown" value="unknown" ${tool.choice === 'unknown' ? 'checked' : ''}> <span>Non lo so</span></label>
      <label><input type="radio" name="scr-choice" id="sc-presumed" value="presumed" ${tool.choice === 'presumed' ? 'checked' : ''}> <span>Torna a «presunto»</span></label>
    </fieldset>`}
    <div class="prov-preview" id="prov-preview" aria-live="polite">${preview}</div>
    ${backupHintHTML()}
    ${resultHTML(tool)}
    <div class="import-actions">
      <button type="button" class="btn-primary" id="prov-apply" aria-disabled="${off}">${tool.busy ? 'Scrittura…' : count > 1 ? `Aggiorna ${nNotti(count)}` : 'Aggiorna'}</button>
      <button type="button" class="btn-ghost" id="prov-close" ${tool.busy ? 'disabled' : ''}>Chiudi</button>
    </div>
  </div>`;
}

function attachProvenanceListeners() {
  const $ = (id) => document.getElementById(id);
  const open = (mode) => { if (state.demo) return; openProvTool(mode); renderSettings(); const p = $('prov-panel'); if (p) { p.focus({ preventScroll: true }); p.scrollIntoView({ block: 'nearest' }); } };
  if ($('prov-open')) $('prov-open').addEventListener('click', () => open('prov'));
  if ($('screen-open')) $('screen-open').addEventListener('click', () => open('screen'));
  const tool = state.provTool;
  if (!tool) return;
  // Ogni nuova scelta toglie l'esito precedente (l'annullamento resta).
  const update = (fn) => { fn(); tool.result = tool.undo ? tool.result : null; renderSettings(); };
  const onDate = (id, k) => { const el = $(id); if (el) el.addEventListener('change', () => update(() => { tool[k] = el.value; })); };
  onDate('prov-from', 'from'); onDate('prov-to', 'to'); onDate('scr-from', 'from'); onDate('scr-to', 'to'); onDate('scr-day', 'day');
  if ($('scr-night')) $('scr-night').addEventListener('change', (e) => update(() => { tool.night = e.target.value; tool.choice = null; tool.day = ''; }));
  root.querySelectorAll('[data-group]').forEach((c) => c.addEventListener('change', () => update(() => {
    tool.groups = c.checked ? [...tool.groups, c.dataset.group] : tool.groups.filter((g) => g !== c.dataset.group);
  })));
  root.querySelectorAll('input[name="prov-target"]').forEach((c) => c.addEventListener('change', () => update(() => { tool.target = c.value; })));
  root.querySelectorAll('input[name="scr-action"]').forEach((c) => c.addEventListener('change', () => update(() => { tool.action = c.value; })));
  root.querySelectorAll('input[name="scr-choice"]').forEach((c) => c.addEventListener('change', () => update(() => {
    tool.choice = c.value;
    if (c.value === 'date' && !tool.day && state.entries[tool.night]) tool.day = (screenTimeReference(state.entries[tool.night]) || {}).date || addDays(tool.night, -1);
  })));
  if ($('prov-only-unknown')) $('prov-only-unknown').addEventListener('change', (e) => update(() => { tool.onlyUnknown = e.target.checked; }));
  ['scope-range', 'scope-single'].forEach((id) => { if ($(id)) $(id).addEventListener('click', () => update(() => { tool.scope = id === 'scope-range' ? 'range' : 'single'; })); });
  if ($('prov-backup')) $('prov-backup').addEventListener('click', () => { saveBackup(); renderSettings(); });
  $('prov-close').addEventListener('click', () => { state.provTool = null; renderSettings(); const b = $(tool.mode === 'prov' ? 'prov-open' : 'screen-open'); if (b) b.focus({ preventScroll: true }); });
  $('prov-apply').addEventListener('click', applyProvTool);
  if ($('prov-undo')) $('prov-undo').addEventListener('click', undoProvTool);
}

// Scrive i record in un'unica transazione, rilegge e verifica.
async function writeVerified(records, allowed) {
  const before = state.entries;
  const ok = await importEntries(records);
  let fresh = null;
  try { fresh = await getAllEntries(); } catch (e) { fresh = null; }
  if (fresh) state.entries = fresh;
  if (!ok) return { ok: false, written: false };
  if (!fresh) return { ok: false, written: true, problems: ['database non rileggibile'] };
  const v = verifyOperation(before, fresh, records, allowed);
  return { ok: v.ok, written: true, problems: v.problems };
}

async function applyProvTool() {
  const tool = state.provTool;
  if (!tool || tool.busy || state.demo) return;
  // Il piano si ricalcola sui dati attuali al momento della conferma.
  const plan = tool.mode === 'prov'
    ? planProvenance(state.entries, { from: tool.from, to: tool.to, fields: fieldsOfGroups(tool.groups), target: tool.target, onlyUnknown: tool.onlyUnknown })
    : screenPlan(tool);
  if (plan.error || !plan.records.length) return;
  const allowed = tool.mode === 'prov' ? 'meta' : 'screen';
  const previous = plan.records.map((r) => state.entries[r.date]);
  tool.busy = true; tool.result = null; tool.undo = null;
  renderSettings();
  const res = await writeVerified(plan.records, allowed);
  tool.busy = false;
  if (res.ok) {
    const what = tool.mode === 'prov'
      ? `${nValori(plan.values)} in ${nNotti(plan.nights)} ${plan.values === 1 ? 'classificato' : 'classificati'} come «${PROVENANCE_LABELS[tool.target]}»`
      : `${nNotti(plan.records.length)} ${plan.records.length === 1 ? 'aggiornata' : 'aggiornate'}`;
    tool.result = { ok: true, text: `Fatto: ${what}. Il database è stato riletto: ogni notte corrisponde all'anteprima e nessun valore del diario è cambiato.` };
    tool.undo = { allowed, written: plan.records, previous };
  } else {
    tool.result = { ok: false, text: !res.written
      ? 'Scrittura non riuscita: nessun dato è stato modificato. Riprova.'
      : `La verifica dopo la scrittura ha trovato differenze (${res.problems.slice(0, 3).join('; ')}). Salva un backup e controlla le notti indicate.` };
  }
  renderSettings();
  restoreFocus('#prov-result');
}

async function undoProvTool() {
  const tool = state.provTool;
  if (!tool || !tool.undo || tool.busy || state.demo) return;
  const { allowed, written, previous } = tool.undo;
  // Si annulla solo se le notti sono ancora come le ha lasciate l'operazione.
  const changed = written.filter((r) => !state.entries[r.date] || !sameRecord(state.entries[r.date], r));
  if (changed.length) {
    tool.undo = null;
    tool.result = { ok: false, text: `Non è più possibile annullare: ${nNotti(changed.length)} ${changed.length === 1 ? 'è stata modificata' : 'sono state modificate'} dopo l'operazione. Puoi comunque riclassificarle.` };
    renderSettings();
    return;
  }
  tool.busy = true;
  renderSettings();
  const res = await writeVerified(previous, allowed);
  tool.busy = false;
  tool.undo = null;
  tool.result = res.ok
    ? { ok: true, text: `Operazione annullata: ${nNotti(previous.length)} ${previous.length === 1 ? 'è tornata' : 'sono tornate'} esattamente com'erano. Verificato rileggendo il database.` }
    : { ok: false, text: !res.written ? 'Annullamento non riuscito: nessun dato è stato modificato. Riprova.' : `La verifica dell'annullamento ha trovato differenze (${res.problems.slice(0, 3).join('; ')}).` };
  renderSettings();
  restoreFocus('#prov-result');
}

// ---------- Aggiornamento del database (schermata obbligatoria) ----------
// Prima di aggiornare lo schema: 1) backup dei dati così come sono, creato
// e verificato rileggendolo; 2) conferma di averlo salvato; 3) aggiornamento;
// 4) confronto di ogni record prima/dopo con quello atteso dalla migrazione
// (per v3 → v4: identico). Nessun dato viene modificato prima del punto 3.
const recordsKey = (records) => JSON.stringify([...records].sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]]))));
function migrationBackup() {
  const mg = state.migration;
  const now = new Date();
  const map = Object.fromEntries(mg.before.map((r) => [r.date, r]));
  const text = JSON.stringify(buildBackup(map, { schemaVersion: mg.fromVersion, now }), null, 2);
  // Verifica: il file deve essere un backup valido e restituire esattamente
  // i record attesi (gli stessi, convertiti dalle regole di migrazione).
  const parsed = parseBackup(text, { schemaVersion: SCHEMA_VERSION, migrate: migrateRecords });
  const expected = migrateRecords(mg.before.map((r) => ({ ...r })), mg.fromVersion);
  mg.backupOk = parsed.ok && recordsKey(parsed.records) === recordsKey(expected);
  mg.backupCount = parsed.ok ? parsed.records.length : 0;
  if (!mg.backupOk) { mg.error = 'Il backup creato non corrisponde ai dati: aggiornamento sospeso. I tuoi dati non sono stati toccati.'; return; }
  downloadFile(text, backupFilename(now).replace('.json', `-prima-aggiornamento-v${mg.fromVersion}.json`), 'application/json');
  setPref('last_backup', now.toISOString());
}

async function runMigration() {
  const mg = state.migration;
  if (!mg.backupOk || !mg.saved || mg.step !== 'backup') return;
  mg.step = 'running';
  renderMigration();
  const expected = migrateRecords(mg.before.map((r) => ({ ...r })), mg.fromVersion);
  let after = null;
  try { after = await getAllEntries(); } catch (e) { after = null; }
  if (!after) { mg.step = 'failed'; mg.error = 'Non è stato possibile aprire il database aggiornato. Chiudi e riapri l\'app: i dati sono ancora quelli di prima.'; renderMigration(); return; }
  const afterList = Object.values(after);
  mg.same = recordsKey(afterList) === recordsKey(expected);
  mg.countAfter = afterList.length;
  mg.countExpected = expected.length;
  mg.step = mg.same ? 'done' : 'mismatch';
  renderMigration();
}

function renderMigration() {
  const mg = state.migration;
  const n = mg.before.length;
  let body;
  if (mg.step === 'backup') {
    body = `
      <p>Questa versione dell'app aggiunge nuove informazioni facoltative al diario (ora in cui provi a dormire, tipo di giorno, origine dei dati). Il database va aggiornato dalla versione ${mg.fromVersion} alla ${SCHEMA_VERSION}.</p>
      <p><strong>Le tue ${n} notti non verranno modificate.</strong> Prima dell'aggiornamento serve comunque un backup.</p>
      <ol class="mig-steps">
        <li>
          <button type="button" class="btn-ghost" id="mig-backup">${ICONS.download}<span>${mg.backupOk ? 'Scarica di nuovo il backup' : 'Crea e scarica il backup'}</span></button>
          ${mg.backupOk ? `<p class="muted small">Backup creato e verificato: ${mg.backupCount} notti, identiche a quelle del dispositivo. Salvalo in File o in iCloud Drive.</p>` : ''}
        </li>
        <li>
          <label class="aw-check"><input type="checkbox" id="mig-saved" ${mg.saved ? 'checked' : ''} ${mg.backupOk ? '' : 'disabled'}><span>Ho salvato il file del backup fuori dall'app</span></label>
        </li>
        <li>
          <button type="button" class="btn-primary" id="mig-run" aria-disabled="${!(mg.backupOk && mg.saved)}">Aggiorna il database</button>
        </li>
      </ol>
      ${mg.error ? msgHTML(mg.error, 'error') : ''}`;
  } else if (mg.step === 'running') {
    body = '<p role="status">Aggiornamento e verifica in corso…</p>';
  } else if (mg.step === 'done') {
    body = `
      ${msgHTML(`Aggiornamento completato e verificato: ${mg.countAfter} notti, ognuna identica a prima. Nessun valore è stato modificato; le informazioni nuove restano "non indicate" finché non le compili.`, 'info')}
      <button type="button" class="btn-primary" id="mig-continue">Apri il diario</button>`;
  } else {
    body = `
      ${msgHTML(mg.step === 'mismatch'
    ? `La verifica dopo l'aggiornamento ha trovato differenze (${mg.countAfter} notti trovate, ${mg.countExpected} attese). Non inserire nuovi dati: conserva il backup appena scaricato e contatta chi ti ha fornito l'app.`
    : mg.error, 'error')}
      <button type="button" class="btn-ghost" id="mig-backup">${ICONS.download}<span>Scarica di nuovo il backup di prima</span></button>`;
  }
  tabContent().innerHTML = `<section class="card card-pad migration" aria-labelledby="mig-title"><h2 class="section-h serif" id="mig-title" tabindex="-1">Aggiornamento dei dati</h2>${body}</section>`;
  const $ = (id) => document.getElementById(id);
  if ($('mig-backup')) $('mig-backup').addEventListener('click', () => { migrationBackup(); renderMigration(); $('mig-backup').focus(); });
  if ($('mig-saved')) $('mig-saved').addEventListener('change', (e) => { mg.saved = e.target.checked; renderMigration(); $('mig-saved').focus(); });
  if ($('mig-run')) $('mig-run').addEventListener('click', runMigration);
  if ($('mig-continue')) $('mig-continue').addEventListener('click', async () => { state.migration = null; state.loaded = false; await startApp(); });
}

function setTheme(theme) {
  state.theme = theme;
  applyTheme(theme);
  setPref('theme', theme);
  render();
}

// ---------- Promemoria (locale, controllato all'apertura dell'app) ----------
// Limite noto: senza un server le app web su iPhone non possono mostrare
// notifiche ad app chiusa; questa notifica compare solo quando l'app viene
// aperta o torna in primo piano, al massimo una volta per notte.
async function checkReminder() {
  if (state.demo || !state.remindersEnabled || !reminderDue()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = reminderNight();
  if (getPref('reminder_notified_night', '') === n) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Diario del sonno', { body: `La notte appena trascorsa (${nightTitle(n).replace('Notte tra ', 'tra ')}) non ha ancora dati.`, icon: 'icons/icon-192.png', tag: `reminder-${n}` });
    setPref('reminder_notified_night', n); // segnata solo se mostrata davvero
  } catch (e) { /* ambiente senza SW pronto, si ignora */ }
}

// ---------- Profilo e contesto (ui-profile.js) ----------
function profileDeps() {
  return { root, tabContent, msgHTML, escapeHTML, ICONS, render, todayISO, downloadFile, CFG };
}
function renderProfile() { renderProfileScreen(profileDeps()); }

// ---------- Root render ----------
function setTab(tab) {
  state.tab = tab;
  render();
  window.scrollTo(0, 0);
}

function setDemo(on) {
  if (on === state.demo) return;
  // Le bozze reali vengono messe da parte e ritrovate all'uscita: prima
  // entrare in demo le cancellava.
  if (on) {
    state.realEntries = state.entries;
    state.realDrafts = state.drafts;
    state.entries = generateDemoEntries(todayISO());
    state.drafts = {};
  } else {
    state.entries = state.realEntries || {};
    state.drafts = state.realDrafts || {};
    state.realEntries = null;
    state.realDrafts = null;
  }
  state.demo = on;
  state.importState = null; // un ripristino non deve mai mescolarsi con la demo
  state.provTool = null; // né una classificazione dell'origine
  state.confirmPending = false;
  state.saveMsg = { type: '', text: '' };
  state.selectedDate = defaultNight();
}

function render() {
  const key = focusKey();
  state.renderedDay = todayISO();
  const demoBanner = state.demo
    ? `<div class="demo-banner" role="note">${ICONS.info}<span><strong>Modalità demo</strong>: dati di esempio, non salvati. I tuoi dati sono al sicuro.</span><button type="button" class="link-btn" id="demo-exit" aria-label="Esci dalla modalità demo">Esci</button></div>`
    : '';
  const updateBanner = state.updateReady
    ? `<div class="demo-banner" role="status">${ICONS.info}<span>È pronta una versione aggiornata dell'app. Le modifiche non salvate verranno conservate.</span><button type="button" class="link-btn" id="update-now">Aggiorna</button></div>`
    : '';
  root.innerHTML = `${renderHeader()}${prefErrorBannerHTML()}${updateBanner}${demoBanner}<main id="tab-content"></main>${renderNav()}`;
  const exitBtn = root.querySelector('#demo-exit');
  if (exitBtn) exitBtn.addEventListener('click', () => { setDemo(false); render(); });
  const updBtn = root.querySelector('#update-now');
  if (updBtn) updBtn.addEventListener('click', applyUpdate);
  if (state.migration) {
    root.innerHTML = `${renderHeader({ profileButton: false })}<main id="tab-content"></main>`;
    document.getElementById('theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
    renderMigration();
    return;
  }
  if (!state.loaded) {
    tabContent().innerHTML = '<p class="muted">Caricamento…</p>';
  } else if (state.loadError) {
    tabContent().innerHTML = `<section class="card card-pad">${msgHTML('Non riesco a leggere i dati salvati su questo dispositivo. Non inserire nuovi dati finché non riapri l\'app: chiudila del tutto e riaprila.', 'error')}</section>`;
  } else if (state.tab === 'today') renderToday();
  else if (state.tab === 'trend') renderTrend();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'settings') renderSettings();
  else if (state.tab === 'profile') renderProfile();

  document.getElementById('theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  root.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  const profBtn = root.querySelector('#profile-btn');
  if (profBtn) profBtn.addEventListener('click', () => setTab('profile'));
  restoreFocus(key, '.night-title');
}

init();
