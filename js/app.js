import { getAllEntries, saveEntry, deleteEntry, importEntries, getPref, setPref, SCHEMA_VERSION, migrateRecords } from './db.js';
import { buildBackup, backupFilename, parseBackup, planImport, sameRecord, downloadFile, MAX_BACKUP_BYTES } from './backup.js';
import {
  pad, todayISO, addDays, nowHHMM, computeNightMetrics, dayStatus,
  daysInMonth, firstWeekdayOfMonth, WEEKDAY_LABELS, downloadCSV, formatDuration,
  minutesToHHMM, hhmmToMinutes,
  analysisNights, consistencyForWindow, correlationResults, optimalZone,
  CONSISTENCY_MIN_NIGHTS, OPTIMAL_MIN_TOTAL, OPTIMAL_MIN_GROUP,
  bedtimeRangeWarning, wakeTimeRangeWarning, screenTimeTotalWarning,
  eveningComplete, sleepComplete, eveningStarted, sleepStarted, weeklyComparison, MIN_N_FOR_DELTA,
} from './analytics.js';
import { generateDemoEntries } from './demo.js';
import {
  EMPTY_DRAFT, draftFromRecord, draftToRecord, sameData, hasData, parseIntInput,
  awakeningsDraftError, awakeningsUnknownHistoric, AWAKENINGS_MAX, AWAKE_MINUTES_MAX,
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
  // Ripristino da backup in corso: null, { error }, { records, meta, mode,
  // confirm, busy } oppure { done, ok, text }.
  importState: null,
};

const root = document.getElementById('app');
applyTheme(state.theme);

async function init() {
  window.__sslBooted = true; // vedi controllo di avvio in index.html
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
    ['lastScreenUse', 'bedtime', 'wakeTime'].forEach((f) => { if (typeof d[f] === 'string' && /^\d{2}:\d{2}$/.test(d[f])) draft[f] = d[f]; });
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
  // (le bozze sono comunque al sicuro in localStorage).
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
  if (!state.drafts[date]) state.drafts[date] = draftFromRecord(state.entries[date]);
  return state.drafts[date];
}
// Il record che si salverebbe ora: è anche quello usato per i calcoli
// mostrati a schermo, così anteprima e dato salvato coincidono.
const draftRecord = (date) => draftToRecord(draftFor(date), state.entries[date], date);
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
  const errors = [m.durationError, m.screenFreeError, m.effectiveError, awErr && awErr.text].filter(Boolean);
  const sleepWarnings = [m.durationWarning, m.screenFreeWarning, bedW, wakeW].filter(Boolean);
  const screenWarnings = [screenW].filter(Boolean);
  return { d, record, m, awErr, bedW, wakeW, screenW, errors, sleepWarnings, screenWarnings, warnings: [...screenWarnings, ...sleepWarnings] };
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
function renderHeader() {
  const dateLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const nextTheme = state.theme === 'light' ? 'scuro' : 'chiaro';
  return `
    <header class="header">
      <div>
        <h1 class="app-title serif">Diario del sonno</h1>
        <p class="date">${dateLabel}</p>
      </div>
      <button type="button" class="icon-btn" id="theme-toggle" aria-label="Passa al tema ${nextTheme}">${state.theme === 'light' ? ICONS.moon : ICONS.sun}</button>
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
        </div>`}
    </section>

    <section class="summary" id="summary"></section>

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
    m.effectiveError && msgHTML(m.effectiveError, 'error', 'err-effective'),
    m.durationWarning && msgHTML(m.durationWarning, 'warn', 'warn-duration'),
    m.screenFreeWarning && msgHTML(m.screenFreeWarning, 'warn', 'warn-screenfree'),
  ].filter(Boolean);
  if (state.confirmPending && isDeletion(state.selectedDate)) {
    msgs.push(msgHTML('Hai svuotato tutti i campi. Confermando, i dati salvati di questa notte vengono eliminati dal dispositivo.', 'warn'));
  } else if (state.confirmPending && v.warnings.length && !v.errors.length) {
    msgs.push(msgHTML('Alcuni valori sembrano insoliti. Se sono corretti, tocca di nuovo il pulsante per salvarli comunque: verranno segnati come anomalie, non modificati.', 'info'));
  }
  return `
    <div class="stat-grid">
      ${stat('Intervallo di sonno', formatDuration(m.durationMin), durationHint)}
      ${stat('Sonno effettivo stimato', formatDuration(m.effectiveSleepMin), effHint)}
      ${stat('Senza schermo prima di dormire', formatDuration(m.screenFreeMin), freeHint)}
    </div>
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
    'f-bedtime': !!(m.screenFreeError || m.durationError),
    'f-waketime': !!m.durationError,
  };
  Object.entries(invalid).forEach(([id, bad]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    document.getElementById(`${id}-field`).classList.toggle('is-invalid', bad);
  });
  [['f-screentime', 'duration', d.screenTimeTotal], ['f-lastuse', 'clock', d.lastScreenUse],
    ['f-bedtime', 'clock', d.bedtime], ['f-waketime', 'clock', d.wakeTime]].forEach(([id, kind, value]) => {
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
    'f-bedtime': ['f-bedtime-msg', 'err-duration', 'err-screenfree', 'warn-duration', 'warn-screenfree'],
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
  else if (v.errors.length) { btn.textContent = v.awErr && !m.durationError && !m.screenFreeError ? (v.awErr.missing ? 'Completa i risvegli per salvare' : 'Correggi i risvegli per salvare') : 'Correggi i dati per salvare'; off = true; }
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
  state.saveMsg = { type: '', text: '' };
  persistDrafts();
  updateTodayDerived();
  const chip = root.querySelector(`.night-chip[data-date="${state.selectedDate}"] .chip-dot`);
  if (chip) chip.className = `chip-dot ${isDirty(state.selectedDate) ? 'dirty' : dayStatus(state.entries[state.selectedDate])}`;
}

function selectNight(date) {
  state.selectedDate = date;
  state.confirmPending = false;
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
  bind('f-lastuse', (v) => { d.lastScreenUse = v; });
  bind('f-bedtime', (v) => { d.bedtime = v; });
  bind('f-waketime', (v) => { d.wakeTime = v; });

  const nowBtn = document.getElementById('lastuse-now');
  if (nowBtn) nowBtn.addEventListener('click', () => {
    d.lastScreenUse = nowHHMM();
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
  const record = { ...v.record };
  const withData = hasData(record);
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
  if (ok) state.confirmPending = false;

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

const METRIC_UI = {
  durationMin: { label: 'Intervallo di sonno medio', fmt: (v) => formatDuration(Math.round(v)), range: (v) => formatDuration(v), delta: (d) => signedDuration(d) },
  effectiveSleepMin: { label: 'Sonno effettivo stimato', fmt: (v) => formatDuration(Math.round(v)), range: (v) => formatDuration(v), delta: (d) => signedDuration(d) },
  awakenings: { label: 'Risvegli per notte', fmt: (v) => v.toFixed(1), range: (v) => String(v), delta: (d) => (Math.abs(d) < 0.05 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`) },
  quality: { label: 'Qualità media', fmt: (v) => `${v.toFixed(1)}<small>/10</small>`, range: (v) => String(v), delta: (d) => (Math.abs(d) < 0.05 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`) },
  screenTimeTotal: { label: 'Screen time medio', fmt: (v) => formatDuration(Math.round(v)), range: (v) => formatDuration(v), delta: (d) => signedDuration(d) },
  screenFreeMin: { label: 'Senza schermo prima di dormire', fmt: (v) => formatDuration(Math.round(v)), range: (v) => formatDuration(v), delta: (d) => signedDuration(d) },
};
function signedDuration(d) {
  const r = Math.round(d);
  if (r === 0) return null;
  return `${r > 0 ? '+' : '−'}${formatDuration(Math.abs(r))}`;
}
const FIELD_WORD = { durationMin: 'intervallo di sonno', effectiveSleepMin: 'sonno effettivo stimato', screenFreeMin: 'tempo senza schermo', screenTimeTotal: 'screen time' };

function metricTile(key, cur, delta) {
  const ui = METRIC_UI[key];
  const s = cur.stats[key];
  let deltaLine;
  if (s.n === 0) deltaLine = '';
  else if (delta == null) deltaLine = `<span class="delta muted-delta">Confronto da ${MIN_N_FOR_DELTA} notti per settimana</span>`;
  else {
    const txt = ui.delta(delta);
    deltaLine = txt
      ? `<span class="delta"><span aria-hidden="true">${delta > 0 ? '↑' : '↓'}</span> ${txt} <span class="muted-delta">vs 7 notti prima</span></span>`
      : '<span class="delta">= <span class="muted-delta">come le 7 notti prima</span></span>';
  }
  return `
    <div class="metric-tile">
      <p class="label">${ui.label}</p>
      <p class="value serif">${s.mean == null ? '—' : ui.fmt(s.mean)}</p>
      <p class="n">${s.n === 0 ? 'Nessun dato' : `su ${s.n} ${s.n === 1 ? 'notte' : 'notti'}`}</p>
      ${s.n >= 2 ? `<p class="n">tra ${ui.range(s.min)} e ${ui.range(s.max)}</p>` : ''}
      ${key === 'awakenings' && s.n > 0 && cur.stats.awakeMinutes.mean != null ? `<p class="n">≈ ${formatDuration(Math.round(cur.stats.awakeMinutes.mean))} svegli per notte</p>` : ''}
      ${s.n === 0 ? '' : `<span class="conf conf-${s.confidence.level}">${s.confidence.label}</span>`}
      ${deltaLine}
    </div>`;
}

function barsHTML(summary) {
  const durs = summary.nights.map((n) => (summary.excluded.some((x) => x.date === n.date && x.fields.includes('durationMin')) ? null : n.durationMin));
  const maxH = Math.max(600, ...durs.filter((v) => v != null));
  const desc = summary.nights.map((n) => `${nightShort(n.date)}: ${n.durationMin != null ? formatDuration(n.durationMin) : 'nessun dato'}${n.awakeMinutes > 0 ? `, di cui ${formatDuration(n.awakeMinutes)} svegli` : ''}${n.quality != null ? `, qualità ${n.quality}` : ''}`).join('; ');
  return `
    <div class="bars" role="img" aria-label="Notte per notte. ${desc}">
      ${summary.nights.map((n, i) => {
    const dur = n.durationMin;
    const isOut = durs[i] == null && dur != null;
    const h = dur != null ? Math.max(6, Math.round((dur / maxH) * 100)) : 0;
    // Parte superiore della barra: minuti svegli, solo se indicati.
    const awakePct = dur != null && n.awakeMinutes > 0 ? Math.min(100, Math.round((n.awakeMinutes / dur) * 100)) : 0;
    return `
        <div class="bar-col">
          <span class="bar-value">${dur != null ? `${Math.floor(dur / 60)}h${pad(dur % 60)}` : ''}</span>
          <div class="bar-track">${dur != null ? `<div class="bar ${isOut ? 'is-outlier' : ''}" style="height:${h}%">${awakePct ? `<div class="bar-awake" style="height:${Math.max(4, awakePct)}%"></div>` : ''}</div>` : '<div class="bar-empty"></div>'}</div>
          <span class="bar-q ${n.quality == null ? 'is-empty' : ''}">${n.quality != null ? n.quality : '·'}</span>
          <span class="bar-day">${weekdayShort(n.date)}</span>
        </div>`;
  }).join('')}
    </div>
    <div class="bars-legend"><span><span class="key key-bar"></span>Intervallo di sonno</span>${summary.nights.some((n) => n.awakeMinutes > 0) ? '<span><span class="key key-awake"></span>Minuti svegli</span>' : ''}<span><span class="key key-q">7</span>Qualità</span>${summary.excluded.length ? '<span><span class="key key-out"></span>Anomalia</span>' : ''}</div>`;
}

function weeklyHTML() {
  const { current: cur, previous: prev, deltas } = weeklyComparison(state.entries, todayISO(), { includeOutliers: state.includeOutliers });
  const anyData = cur.nightsWithData > 0;
  const bestWorst = cur.best ? `
    <div class="best-worst">
      <button type="button" class="night-link" data-open="${cur.best.date}">
        <span class="bw-label">Notte migliore</span>
        <span class="bw-main">${nightShort(cur.best.date)}</span>
        <span class="bw-sub">Qualità ${cur.best.quality}${cur.best.durationMin != null ? ` · ${formatDuration(cur.best.durationMin)}` : ''}</span>
      </button>
      <button type="button" class="night-link" data-open="${cur.worst.date}">
        <span class="bw-label">Notte peggiore</span>
        <span class="bw-main">${nightShort(cur.worst.date)}</span>
        <span class="bw-sub">Qualità ${cur.worst.quality}${cur.worst.durationMin != null ? ` · ${formatDuration(cur.worst.durationMin)}` : ''}</span>
      </button>
    </div>` : '';

  const allExcluded = state.includeOutliers
    ? weeklyComparison(state.entries, todayISO()).current.excluded
    : cur.excluded;
  const outlierNote = allExcluded.length ? `
    <details class="outlier-note">
      <summary>${ICONS.info}<span>${state.includeOutliers
    ? `Le anomalie confermate (${allExcluded.length} ${allExcluded.length === 1 ? 'notte' : 'notti'}) sono incluse nelle medie.`
    : `${allExcluded.length} ${allExcluded.length === 1 ? 'notte con valori segnati come anomali è esclusa' : 'notti con valori segnati come anomali sono escluse'} dalle medie.`}</span></summary>
      <ul>${allExcluded.map((x) => `<li>${nightShort(x.date)}: ${x.fields.map((f) => FIELD_WORD[f]).join(', ')}</li>`).join('')}</ul>
      <button type="button" class="btn-ghost" id="toggle-outliers">${state.includeOutliers ? 'Escludi le anomalie dalle medie' : 'Includi le anomalie nelle medie'}</button>
    </details>` : '';

  return `
    <section class="week" aria-labelledby="week-title">
      <div class="section-title-row">
        <div>
          <h2 class="section-h serif" id="week-title">Ultime 7 notti</h2>
          <p class="section-sub">${shortRange(cur.dates)}</p>
        </div>
        <span class="badge ${cur.coverage.level}" title="Notti con almeno un dato">Copertura ${cur.nightsWithData}/7</span>
      </div>
      ${anyData ? `
        <div class="metric-grid">${['durationMin', 'effectiveSleepMin', 'quality', 'awakenings', 'screenTimeTotal', 'screenFreeMin'].map((k) => metricTile(k, cur, deltas[k])).join('')}</div>
        <p class="compare-note"><strong>Come leggere questi numeri.</strong> La copertura conta le notti con almeno un dato; ogni media dice su quante notti è calcolata e tra quali valori variano: medie con un numero di notti diverso non descrivono le stesse notti. Risvegli e sonno effettivo stimato contano solo le notti in cui i risvegli sono indicati; il sonno effettivo stimato è l'intervallo di sonno meno i minuti svegli. Le etichette descrivono quante notti ci sono (6–7 = settimana quasi completa, 3–5 = parziale), non quanto il risultato sia stabile: con una sola settimana, una media può cambiare molto la settimana dopo, e differenze di pochi minuti o di qualche decimo rientrano spesso nella normale variazione da una notte all'altra. Confronto con le 7 notti precedenti (${shortRange(prev.dates)}, copertura ${prev.nightsWithData}/7): descrive cosa è cambiato, non perché.</p>
        ${bestWorst}
        ${outlierNote}
        <div class="card card-pad chart-block">
          <p class="chart-label">Notte per notte</p>
          ${barsHTML(cur)}
        </div>` : '<div class="card card-pad"><p class="muted">Nessuna notte registrata negli ultimi 7 giorni. Il riepilogo compare dalla prima notte salvata.</p></div>'}
    </section>`;
}

const VAR_NAME = {
  screenTimeTotal: 'screen time della giornata', screenFreeMin: 'tempo senza schermo prima di dormire', durationMin: 'intervallo di sonno', quality: 'qualità del sonno',
  awakenings: 'numero di risvegli', awakeMinutes: 'minuti svegli durante la notte', effectiveSleepMin: 'sonno effettivo stimato',
};
const MORE_X = {
  screenTimeTotal: 'a uno screen time più alto', screenFreeMin: 'a più tempo senza schermo',
  awakenings: 'a più risvegli', awakeMinutes: 'a più minuti svegli', effectiveSleepMin: 'a più sonno effettivo stimato',
};
const Y_DIR = { durationMin: ['un intervallo di sonno più lungo', 'un intervallo di sonno più breve'], quality: ['una qualità più alta', 'una qualità più bassa'] };
// Coppie che usano i risvegli: il campione è più piccolo (solo notti con i
// risvegli indicati) e molte notti hanno 0 risvegli.
const AWAKENING_KEYS = ['awakenings', 'awakeMinutes', 'effectiveSleepMin'];
const OZ_LABEL = { durationMin: 'Intervallo di sonno', effectiveSleepMin: 'Sonno effettivo stimato', awakeMinutes: 'Minuti svegli durante la notte', screenFreeMin: 'Tempo senza schermo prima di dormire', screenTimeTotal: 'Screen time della giornata' };

// Coppie non mostrate, con il motivo: senza questa riga l'assenza di una
// coppia poteva essere letta come "nessun legame" (§6 della metodologia).
function hiddenPairsHTML(correlations) {
  const hidden = correlations.filter((c) => !c.shown);
  if (!hidden.length) return '';
  const why = { n: (c) => `${c.n}/14 notti con entrambi i dati`, variance: () => 'uno dei due valori non varia mai', weak: () => "nessuna associazione lineare rilevabile (non esclude relazioni di altro tipo)" };
  return `<p class="muted small">Non mostrate: ${hidden.map((c) => `${VAR_NAME[c.x]} e ${VAR_NAME[c.y]} — ${why[c.reason](c)}`).join('; ')}.</p>`;
}

function excludedNote(count) {
  if (!count) return '';
  return state.includeOutliers
    ? ` Le anomalie confermate sono incluse (impostazione scelta nel riepilogo settimanale).`
    : ` ${count} ${count === 1 ? 'notte segnata come anomala è esclusa' : 'notti segnate come anomale sono escluse'}.`;
}

function renderTrend() {
  const key = focusKey();
  const t = todayISO();
  const nights = analysisNights(state.entries, { includeOutliers: state.includeOutliers });
  const allNights = analysisNights(state.entries, { includeOutliers: true });
  const lastNightEntry = state.entries[t];
  const lastNightMetrics = computeNightMetrics(lastNightEntry, t);
  const lastNight = { quality: lastNightEntry && lastNightEntry.quality != null ? lastNightEntry.quality : null, durationMin: lastNightMetrics.durationMin };

  const consistency = consistencyForWindow(nights, t, 28);
  const correlations = correlationResults(nights);
  const excludedForPair = (c) => allNights.filter((n) => (n.excludedSleep && ['durationMin', 'effectiveSleepMin', 'screenFreeMin'].some((k) => k === c.x || k === c.y)) || (n.excludedScreen && c.x === 'screenTimeTotal')).length;
  const nightsExcludedAny = nights.filter((n) => n.excludedSleep || n.excludedScreen).length;
  const oz = optimalZone(nights);

  const lastNightFilled = lastNight.quality != null || lastNight.durationMin != null;
  const ozMessage = () => {
    if (oz.reason === 'total') return `Servono almeno ${OPTIMAL_MIN_TOTAL} notti con la qualità registrata (${oz.n}/${OPTIMAL_MIN_TOTAL} finora).`;
    if (oz.reason === 'best') return `Servono almeno ${OPTIMAL_MIN_GROUP} notti nel gruppo "migliori" (${oz.bestN}/${OPTIMAL_MIN_GROUP} finora, qualità ≥ ${oz.threshold}).`;
    return `Servono almeno ${OPTIMAL_MIN_GROUP} notti da confrontare con le migliori (${oz.restN}/${OPTIMAL_MIN_GROUP} finora): quasi tutte le notti hanno qualità ≥ ${oz.threshold}.`;
  };

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

    ${weeklyHTML()}

    <h2 class="section-h serif preview-h">Analisi in anteprima</h2>
    <p class="section-sub">Si attivano con più notti raccolte. Descrivono associazioni nei tuoi dati, non cause.</p>

    <div class="analysis-block">
      <h3 class="section-title">Regolarità degli orari</h3>
      <div class="card card-pad">
        ${consistency.shown ? `
          <details>
            <summary><span class="serif big-num">${consistency.score}</span><span class="muted">/100 negli ultimi ${consistency.days} giorni (${consistency.n} notti con orari completi)</span></summary>
            <p class="detail">Deviazione standard circolare degli orari di addormentamento e risveglio. Formula: 100 − (variabilità media / 90 × 100): 100 = orari identici ogni notte.${excludedNote(consistency.excluded)}</p>
          </details>` : `<p class="muted">Servono almeno ${CONSISTENCY_MIN_NIGHTS} notti con orari completi negli ultimi 28 giorni (${consistency.n}/${CONSISTENCY_MIN_NIGHTS} finora).${excludedNote(consistency.excluded)}</p>`}
      </div>
    </div>

    <div class="analysis-block">
      <h3 class="section-title">Associazioni osservate <em>(non causali)</em></h3>
      <div class="card card-pad">
        ${correlations.some((c) => c.shown) ? correlations.filter((c) => c.shown).map((c) => `
          <details>
            <summary><strong>${capitalize(VAR_NAME[c.x])} e ${VAR_NAME[c.y]}</strong>: ${c.signalLabel.toLowerCase()}, ${c.direction === 'positive' ? 'positivo' : 'negativo'} · ${c.n} notti${c.warn ? ' <span class="warn-tag">pochi dati</span>' : ''}</summary>
            <p class="detail">Nelle tue notti, ${MORE_X[c.x]} corrisponde in media ${Y_DIR[c.y][c.direction === 'positive' ? 0 : 1]}. Non dice che una cosa causi l'altra: entrambe potrebbero dipendere da altro (stress, orari, attività).${AWAKENING_KEYS.includes(c.x) ? ' Calcolata solo sulle notti con i risvegli indicati; molte notti senza risvegli rendono il valore di r meno informativo.' : ''}
            <br>n=${c.n} notti dal ${fmtDate(c.from)} al ${fmtDate(c.to)} · r=${c.r.toFixed(2)} (Pearson: misura solo relazioni lineari). "${c.signalLabel}" descrive quanto è marcata l'associazione in queste notti, non quanto sia certa: ${c.warn ? 'con meno di 30 notti può cambiare molto con nuovi dati.' : 'anche con più di 30 notti può indebolirsi o sparire nel tempo.'}${excludedNote(excludedForPair(c))}</p>
          </details>`).join('') : `<p class="muted">Nessuna associazione da mostrare.${excludedNote(nightsExcludedAny)}</p>`}
        ${hiddenPairsHTML(correlations)}
      </div>
    </div>

    <div class="analysis-block">
      <h3 class="section-title">Condizioni delle notti migliori</h3>
      <div class="card card-pad">
        ${oz.shown ? `
          <p class="muted">Confronto tra le ${oz.bestN} notti con qualità ≥ ${oz.threshold} (${Math.round((oz.bestN / oz.n) * 100)}% delle notti valutate) e le altre ${oz.restN}. La soglia è il tuo 75° percentile di qualità, con un minimo di 7; le notti a pari merito con la soglia sono tutte incluse, per questo il gruppo può superare il 25%. Confrontando più aspetti su un numero limitato di notti, qualche differenza può comparire per caso: è un'indicazione da osservare nel tempo, non una regola.${excludedNote(nightsExcludedAny)}</p>
          ${oz.results.filter((r) => r.shown).length ? oz.results.filter((r) => r.shown).map((r) => `
            <details>
              <summary><strong>${OZ_LABEL[r.key]}</strong>: ${r.signalLabel.toLowerCase()}</summary>
              <p class="detail">Notti migliori: ${formatDuration(Math.round(r.m1))} in media (n=${r.n1}) — altre notti: ${formatDuration(Math.round(r.m2))} (n=${r.n2}). Differenza standardizzata d=${r.d.toFixed(2)}. È un confronto tra gruppi di notti, non una regola da seguire.</p>
            </details>`).join('') : '<p class="muted">Nessuna differenza abbastanza marcata da segnalare.</p>'}
          ${oz.results.some((r) => r.reason === 'n') ? `<p class="muted small">Non confrontate per dati insufficienti (meno di ${OPTIMAL_MIN_GROUP} notti per gruppo): ${oz.results.filter((r) => r.reason === 'n').map((r) => OZ_LABEL[r.key].toLowerCase()).join(', ')}.</p>` : ''}
        ` : `<p class="muted">${ozMessage()}</p>`}
      </div>
    </div>
  `;

  root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => selectNight(b.dataset.open)));
  const tog = document.getElementById('toggle-outliers');
  if (tog) tog.addEventListener('click', () => {
    state.includeOutliers = !state.includeOutliers;
    renderTrend();
    const det = root.querySelector('.outlier-note');
    if (det) det.open = true;
    const again = document.getElementById('toggle-outliers');
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
    <section class="card card-pad">
      <h3 class="settings-title">Modalità demo</h3>
      <p class="muted">Mostra l'app con 60 notti di dati di esempio, per vedere come appaiono le analisi. I dati finti restano solo in memoria: non si mescolano ai tuoi, non vengono esportati e spariscono quando chiudi l'app.</p>
      <button type="button" class="btn-ghost ${state.demo ? 'active' : ''}" id="demo-toggle" aria-pressed="${state.demo}">${state.demo ? 'Attiva — tocca per uscire' : 'Disattivata'}</button>
    </section>
    <section class="card card-pad">
      <h3 class="settings-title">Su questa versione</h3>
      <p class="muted">App installabile, funziona anche offline, nessun dato lascia il dispositivo. Raccolta dati, calendario, andamento, export CSV e backup completi; le analisi avanzate sono in anteprima.</p>
    </section>
  `;

  document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
  document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
  document.getElementById('export-csv').addEventListener('click', () => { if (!state.demo) downloadCSV(state.entries); });
  attachBackupListeners();
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
      <li><strong>${plan.conflicts.length}</strong> già ${plan.conflicts.length === 1 ? 'presente' : 'presenti'} con dati diversi${plan.conflicts.length ? ` (${conflictList})` : ''}</li>
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
  root.innerHTML = `${renderHeader()}${updateBanner}${demoBanner}<main id="tab-content"></main>${renderNav()}`;
  const exitBtn = root.querySelector('#demo-exit');
  if (exitBtn) exitBtn.addEventListener('click', () => { setDemo(false); render(); });
  const updBtn = root.querySelector('#update-now');
  if (updBtn) updBtn.addEventListener('click', applyUpdate);
  if (!state.loaded) {
    tabContent().innerHTML = '<p class="muted">Caricamento…</p>';
  } else if (state.loadError) {
    tabContent().innerHTML = `<section class="card card-pad">${msgHTML('Non riesco a leggere i dati salvati su questo dispositivo. Non inserire nuovi dati finché non riapri l\'app: chiudila del tutto e riaprila.', 'error')}</section>`;
  } else if (state.tab === 'today') renderToday();
  else if (state.tab === 'trend') renderTrend();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'settings') renderSettings();

  document.getElementById('theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  root.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  restoreFocus(key, '.night-title');
}

init();
