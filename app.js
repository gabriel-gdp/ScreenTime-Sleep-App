import { getAllEntries, saveEntry, deleteEntry, getPref, setPref } from './db.js';
import {
  pad, todayISO, addDays, nowHHMM, computeNightMetrics, dataConfidence, dayStatus,
  daysInMonth, firstWeekdayOfMonth, WEEKDAY_LABELS, downloadCSV, formatDuration,
  minutesToHHMM, hhmmToMinutes, consistencyScore,
  pearsonR, correlationSignal, cohensD, effectLabel,
  bedtimeRangeWarning, wakeTimeRangeWarning, screenTimeTotalWarning,
  eveningComplete, sleepComplete, eveningStarted, sleepStarted,
} from './analytics.js';

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
};

// Campi che l'utente compila per una notte (vedi modello in analytics.js).
const FIELDS = ['screenTimeTotal', 'lastScreenUse', 'bedtime', 'wakeTime', 'quality'];
const EMPTY_DRAFT = { screenTimeTotal: '', lastScreenUse: '', bedtime: '', wakeTime: '', quality: null };
const isEmpty = (v) => v === '' || v == null;
const same = (a, b) => (isEmpty(a) && isEmpty(b)) || a === b;
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
  reminderDismissed: getPref('reminder_dismissed_date', ''),
};

const root = document.getElementById('app');
applyTheme(state.theme);

async function init() {
  try {
    state.entries = await getAllEntries();
  } catch (e) {
    console.error('Errore lettura IndexedDB', e);
    state.loadError = true;
  }
  state.loaded = true;
  state.selectedDate = defaultNight();
  render();
  if (!state.loadError) checkReminder();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Quando una nuova versione dell'app prende il controllo, ricarichiamo
  // una volta per usare subito i file aggiornati (mai al primo avvio).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (Object.keys(state.drafts).some(isDirty)) return; // non perdere bozze in corso
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
    .catch((e) => console.error('SW registration failed', e));
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
  if (!state.drafts[date]) {
    const saved = state.entries[date] || {};
    const d = { ...EMPTY_DRAFT };
    FIELDS.forEach((f) => { if (!isEmpty(saved[f])) d[f] = saved[f]; });
    state.drafts[date] = d;
  }
  return state.drafts[date];
}
function isDirty(date) {
  const d = state.drafts[date];
  if (!d) return false;
  const saved = state.entries[date] || {};
  return FIELDS.some((f) => !same(d[f], saved[f]));
}

function validate(date) {
  const d = draftFor(date);
  const m = computeNightMetrics(d, date);
  const bedW = bedtimeRangeWarning(d.bedtime);
  const wakeW = wakeTimeRangeWarning(d.wakeTime);
  const screenW = screenTimeTotalWarning(d.screenTimeTotal);
  const errors = [m.durationError, m.screenFreeError].filter(Boolean);
  const sleepWarnings = [m.durationWarning, m.screenFreeWarning, bedW, wakeW].filter(Boolean);
  const screenWarnings = [screenW].filter(Boolean);
  return { d, m, bedW, wakeW, screenW, errors, sleepWarnings, screenWarnings, warnings: [...screenWarnings, ...sleepWarnings] };
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
function msgHTML(text, kind) {
  return `<p class="msg msg-${kind}">${kind === 'info' ? ICONS.info : ICONS.alert}<span>${text}</span></p>`;
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

function renderReminderBanner() {
  const yesterday = addDays(todayISO(), -1);
  if (dayStatus(state.entries[yesterday]) !== 'missing' || isDirty(yesterday) || state.reminderDismissed === todayISO()) return '';
  return `
    <div class="reminder-banner" role="note">
      ${ICONS.alert}
      <span>Nessun dato per la ${nightTitle(yesterday).charAt(0).toLowerCase() + nightTitle(yesterday).slice(1)}.</span>
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

function timeRow({ id, label, help, value, extra = '' }) {
  return `
    <div class="row">
      <label class="row-label" for="${id}">${label}${help ? `<span class="row-help">${help}</span>` : ''}</label>
      <div class="row-control">${extra}<input type="time" id="${id}" value="${value}"></div>
    </div>
    <div class="row-msg" id="${id}-msg"></div>`;
}

function renderToday() {
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
      <h2 class="night-title serif">${nightTitle(date)}</h2>
      <p class="night-meta" id="night-meta"></p>
    </div>

    <section class="card" aria-labelledby="evening-title">
      <div class="card-head">
        <span class="card-icon">${ICONS.smartphone}</span>
        <div class="card-titles"><h3 id="evening-title">Prima di dormire</h3><p>${capitalize(dayLong(start))}, sera</p></div>
        <span class="part-status" id="evening-status"></span>
      </div>
      ${timeRow({ id: 'f-screentime', label: 'Screen time della giornata', help: 'Ore:minuti, come in Tempo di utilizzo', value: minutesToHHMM(d.screenTimeTotal) })}
      ${timeRow({ id: 'f-lastuse', label: 'Ultimo utilizzo dello schermo', help: 'Prima di addormentarti', value: d.lastScreenUse,
    extra: showNow ? '<button type="button" class="btn-chip" id="lastuse-now">Adesso</button>' : '' })}
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
        <div class="quality-block">
          <p class="quality-label" id="quality-label">Qualità percepita del sonno</p>
          <div class="quality-grid" role="radiogroup" aria-labelledby="quality-label">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
              <button type="button" class="quality-btn" data-q="${n}" role="radio" aria-checked="false" aria-label="${n} su 10">${n}</button>`).join('')}
          </div>
          <div class="quality-scale" aria-hidden="true"><span>1 · pessima</span><span>10 · ottima</span></div>
        </div>`}
    </section>

    <section class="summary" id="summary" aria-live="polite"></section>

    <button type="button" class="btn-primary" id="save-btn"></button>
    <p class="save-status" id="save-status" role="status"></p>
  `;
  attachTodayListeners();
  updateTodayDerived();
  centerActiveChip();
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
  const durationHint = m.durationMin == null && !m.durationError ? 'Con addormentamento e risveglio' : '';
  const freeHint = m.screenFreeMin == null && !m.screenFreeError ? 'Con ultimo utilizzo e addormentamento' : '';
  const msgs = [
    ...v.errors.map((t) => msgHTML(t, 'error')),
    ...[m.durationWarning, m.screenFreeWarning].filter(Boolean).map((t) => msgHTML(t, 'warn')),
  ];
  if (state.confirmPending && v.warnings.length && !v.errors.length) {
    msgs.push(msgHTML('Alcuni valori sembrano insoliti. Se sono corretti, tocca di nuovo il pulsante per salvarli comunque: verranno segnati come anomalie, non modificati.', 'info'));
  }
  return `
    <div class="stat-grid">
      ${stat('Durata del sonno', formatDuration(m.durationMin), durationHint)}
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

  const invalid = {
    'f-lastuse': !!m.screenFreeError,
    'f-bedtime': !!(m.screenFreeError || m.durationError),
    'f-waketime': !!m.durationError,
  };
  Object.entries(invalid).forEach(([id, bad]) => {
    const el = document.getElementById(id);
    if (el) { if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
  });

  root.querySelectorAll('.quality-btn').forEach((b) => {
    const on = Number(b.dataset.q) === d.quality;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });

  $('#evening-status').innerHTML = partStatusHTML(eveningComplete(d), eveningStarted(d));
  $('#sleep-status').innerHTML = partStatusHTML(sleepComplete(d), sleepStarted(d), future ? 'Domani' : '');

  const saved = state.entries[date];
  const dirty = isDirty(date);
  const savedStatus = dayStatus(saved);
  const metaParts = [{ complete: 'Notte completa', partial: 'Salvata in parte', missing: 'Nessun dato salvato' }[savedStatus]];
  if (dirty) metaParts.push('<span class="dirty-text">modifiche non salvate</span>');
  $('#night-meta').innerHTML = metaParts.join(' · ');

  const btn = $('#save-btn');
  btn.className = 'btn-primary';
  btn.disabled = false;
  if (state.saving) { btn.textContent = 'Salvataggio…'; btn.disabled = true; }
  else if (v.errors.length) { btn.textContent = 'Correggi gli orari per salvare'; btn.disabled = true; }
  else if (!dirty) {
    if (saved) { btn.innerHTML = `${ICONS.check}<span>Salvato</span>`; btn.classList.add('is-saved'); }
    else btn.textContent = 'Salva';
    btn.disabled = true;
  } else if (state.confirmPending && v.warnings.length) { btn.textContent = 'Conferma e salva comunque'; btn.classList.add('is-confirm'); }
  else btn.textContent = 'Salva';

  const status = $('#save-status');
  status.textContent = state.saveMsg.text;
  status.className = `save-status ${state.saveMsg.type === 'error' ? 'is-error' : ''}`;
}

function onDraftEdit() {
  state.confirmPending = false;
  state.saveMsg = { type: '', text: '' };
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

  document.getElementById('save-btn').addEventListener('click', onSave);

  const dismissBtn = document.getElementById('dismiss-reminder');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    state.reminderDismissed = todayISO();
    setPref('reminder_dismissed_date', todayISO());
    renderToday();
  });
  const openBtn = document.getElementById('reminder-open');
  if (openBtn) openBtn.addEventListener('click', () => selectNight(addDays(todayISO(), -1)));
}

async function onSave() {
  const date = state.selectedDate;
  const v = validate(date);
  if (state.saving || v.errors.length || !isDirty(date)) return;
  if (v.warnings.length && !state.confirmPending) {
    state.confirmPending = true;
    updateTodayDerived();
    return;
  }

  // Si salva esattamente ciò che è visibile a schermo; i campi vuoti
  // restano assenti (mai convertiti in 0 o stimati).
  const record = { date };
  FIELDS.forEach((f) => { if (!isEmpty(v.d[f])) record[f] = v.d[f]; });
  const hasData = FIELDS.some((f) => record[f] !== undefined);
  if (hasData) {
    record.is_outlier_bedtime = v.sleepWarnings.length > 0;
    record.outlier_acknowledged_bedtime = record.is_outlier_bedtime;
    record.is_outlier_screen_time = v.screenWarnings.length > 0;
    record.outlier_acknowledged_screen_time = record.is_outlier_screen_time;
  }

  state.saving = true;
  updateTodayDerived();
  const ok = hasData ? await saveEntry(record) : await deleteEntry(date);
  state.saving = false;
  state.confirmPending = false;

  if (ok) {
    const next = { ...state.entries };
    if (hasData) next[date] = record; else delete next[date];
    state.entries = next;
    delete state.drafts[date];
    state.saveMsg = { type: 'ok', text: hasData ? 'Salvato sul dispositivo.' : 'Dati della notte eliminati.' };
  } else {
    state.saveMsg = { type: 'error', text: 'Salvataggio non riuscito: i dati inseriti sono ancora qui, riprova.' };
  }
  if (state.tab === 'today' && state.selectedDate === date) {
    renderToday();
    if (ok) fadeSaveMsgAfter(date);
  }
}

// ---------- Andamento ----------
function buildAllDays() {
  return Object.keys(state.entries).sort().map((date) => {
    const e = state.entries[date];
    const m = computeNightMetrics(e, date);
    return {
      date, quality: e.quality != null ? e.quality : null, durationMin: m.durationMin,
      screenTimeTotal: isEmpty(e.screenTimeTotal) ? null : e.screenTimeTotal, screenFreeMin: m.screenFreeMin,
      bedtime: e.bedtime || null, wakeTime: e.wakeTime || null,
    };
  });
}

function last7WakeDates() {
  const arr = [];
  for (let i = 6; i >= 0; i--) arr.push(addDays(todayISO(), -i));
  return arr;
}

function sparkline(values, opts = {}) {
  const w = 400, h = 90, padTop = 10, padBottom = 10, padX = 6;
  const valid = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (valid.length === 0) return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="90" aria-hidden="true"></svg>`;
  const min = opts.min != null ? opts.min : Math.min(...valid.map((p) => p.v));
  const max = opts.max != null ? opts.max : Math.max(...valid.map((p) => p.v));
  const range = max - min || 1;
  const stepX = (w - padX * 2) / Math.max(values.length - 1, 1);
  const xy = (p) => [padX + p.i * stepX, h - padBottom - ((p.v - min) / range) * (h - padTop - padBottom)];
  const path = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p).join(',')}`).join(' ');
  const dots = valid.map((p) => { const [x, y] = xy(p); return `<circle cx="${x}" cy="${y}" r="3" fill="${opts.color}" />`; }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="90" preserveAspectRatio="none" aria-hidden="true">
    <path d="${path}" fill="none" stroke="${opts.color}" stroke-width="2" vector-effect="non-scaling-stroke" />
    ${dots}
  </svg>`;
}

function renderTrend() {
  const allDays = buildAllDays();
  const last7 = last7WakeDates();
  const byDate = Object.fromEntries(allDays.map((d) => [d.date, d]));
  const chartData = last7.map((date) => byDate[date] || { date, quality: null, durationMin: null });

  const daysWithData7 = chartData.filter((d) => d.quality != null).length;
  const confidence7 = dataConfidence(daysWithData7, 7);
  const qualVals = chartData.map((d) => d.quality).filter((v) => v != null);
  const avgQuality = qualVals.length ? qualVals.reduce((a, b) => a + b, 0) / qualVals.length : null;
  const durVals = chartData.map((d) => d.durationMin).filter((v) => v != null);
  const avgDuration = durVals.length ? Math.round(durVals.reduce((a, b) => a + b, 0) / durVals.length) : null;

  const lastNight = byDate[todayISO()] || {};

  const consistencyWindow = allDays.filter((d) => d.bedtime && d.wakeTime).slice(-28);
  const consistency = consistencyWindow.length < 5
    ? { shown: false, n: consistencyWindow.length }
    : { shown: true, n: consistencyWindow.length, score: consistencyScore(consistencyWindow.map((d) => d.bedtime), consistencyWindow.map((d) => d.wakeTime)) };

  const pairFor = (k1, k2) => allDays.filter((d) => d[k1] != null && d[k2] != null).map((d) => [d[k1], d[k2]]);
  const buildCorr = (pairLabel, k1, k2) => {
    const pairs = pairFor(k1, k2);
    return { pairLabel, ...correlationSignal(pairs.length, pearsonR(pairs)) };
  };
  const correlations = [
    buildCorr('Screen time della giornata → Durata del sonno', 'screenTimeTotal', 'durationMin'),
    buildCorr('Screen time della giornata → Qualità del sonno', 'screenTimeTotal', 'quality'),
    buildCorr('Tempo senza schermo → Durata del sonno', 'screenFreeMin', 'durationMin'),
    buildCorr('Tempo senza schermo → Qualità del sonno', 'screenFreeMin', 'quality'),
  ];

  const qualityDays = allDays.filter((d) => d.quality != null);
  let optimalZone = { shown: false, n: qualityDays.length };
  if (qualityDays.length >= 30) {
    const sortedDesc = [...qualityDays].sort((a, b) => b.quality - a.quality);
    const top25 = sortedDesc.slice(0, Math.ceil(qualityDays.length * 0.25));
    const bestGroup = top25.filter((d) => d.quality >= 7);
    if (bestGroup.length < 8) {
      optimalZone = { shown: false, n: qualityDays.length, bestN: bestGroup.length };
    } else {
      const bestDates = new Set(bestGroup.map((d) => d.date));
      const restGroup = qualityDays.filter((d) => !bestDates.has(d.date));
      const metrics = [
        { key: 'durationMin', label: 'Durata del sonno' },
        { key: 'screenFreeMin', label: 'Tempo senza schermo prima di dormire' },
        { key: 'screenTimeTotal', label: 'Screen time della giornata' },
      ];
      const results = metrics.map((m) => {
        const g1 = bestGroup.map((d) => d[m.key]).filter((v) => v != null);
        const g2 = restGroup.map((d) => d[m.key]).filter((v) => v != null);
        const res = cohensD(g1, g2);
        if (!res) return { ...m, shown: false };
        const signalLabel = effectLabel(Math.abs(res.d));
        return { ...m, shown: !!signalLabel, signalLabel, m1: res.m1, m2: res.m2, d: res.d };
      });
      optimalZone = { shown: true, n: qualityDays.length, bestN: bestGroup.length, results };
    }
  }

  tabContent().innerHTML = `
    <div class="hero">
      <p class="label">Notte scorsa</p>
      <div class="hero-row">
        <div><span class="serif hero-num">${lastNight.quality != null ? lastNight.quality : '—'}</span><span class="hero-unit">/10 qualità</span></div>
        <div><p class="hero-dur">${formatDuration(lastNight.durationMin != null ? lastNight.durationMin : null)}</p><p class="hero-dur-label">di sonno</p></div>
      </div>
    </div>

    <div class="section-title-row">
      <p class="section-title">Ultime 7 notti</p>
      <span class="badge ${confidence7.level}">${confidence7.label}</span>
    </div>

    <div class="chart-card"><p class="chart-label">Qualità del sonno</p>${sparkline(chartData.map((d) => d.quality), { color: 'var(--accent)', min: 0, max: 10 })}</div>
    <div class="chart-card"><p class="chart-label">Durata del sonno (ore)</p>${sparkline(chartData.map((d) => (d.durationMin != null ? d.durationMin / 60 : null)), { color: 'var(--warm)' })}</div>

    <div class="stat-grid">
      <div class="stat-box"><p class="label">Qualità media</p><p class="serif value">${avgQuality != null ? avgQuality.toFixed(1) : '—'}</p></div>
      <div class="stat-box"><p class="label">Durata media</p><p class="serif value">${formatDuration(avgDuration)}</p></div>
    </div>

    <div class="analysis-block">
      <p class="section-title">Regolarità</p>
      <div class="card card-pad">
        ${consistency.shown ? `
          <details>
            <summary><span class="serif big-num">${consistency.score}</span><span class="muted">/100 — regolarità degli orari nelle ultime ${consistency.n} notti con dati</span></summary>
            <p class="detail">Deviazione standard circolare di addormentamento e risveglio (n=${consistency.n}). Formula: 100 − (variabilità media / 90 × 100). Le notti segnate come anomalie non sono ancora escluse dal calcolo in questa versione.</p>
          </details>` : `<p class="muted">Servono almeno 5 notti con orari completi (${consistency.n}/5 finora) per calcolare la regolarità.</p>`}
      </div>
    </div>

    <div class="analysis-block">
      <p class="section-title">Associazioni osservate <em>(non causali)</em></p>
      <div class="card card-pad">
        ${correlations.some((c) => c.shown) ? correlations.filter((c) => c.shown).map((c) => `
          <details>
            <summary><strong>${c.pairLabel}</strong>: ${c.signalLabel}${c.warn ? ' ⚠️' : ''}</summary>
            <p class="detail">n=${c.n} · r=${c.r.toFixed(2)} · Pearson misura solo associazioni lineari: un valore basso non esclude relazioni non lineari.${c.warn ? ' Numerosità ancora limitata: interpretare con cautela.' : ''}</p>
          </details>`).join('') : `<p class="muted">Nessuna associazione mostrabile ancora: servono almeno 14 notti con entrambi i dati (al momento al massimo ${Math.max(...correlations.map((c) => c.n), 0)}).</p>`}
      </div>
    </div>

    <div class="analysis-block">
      <p class="section-title">Condizioni delle notti migliori</p>
      <div class="card card-pad">
        ${optimalZone.shown ? `
          <p class="muted">Confronto tra ${optimalZone.bestN} notti migliori (qualità ≥7, top 25% personale) e le altre ${optimalZone.n - optimalZone.bestN}.</p>
          ${optimalZone.results.filter((r) => r.shown).length > 0 ? optimalZone.results.filter((r) => r.shown).map((r) => `
            <details>
              <summary><strong>${r.label}</strong>: ${r.signalLabel}</summary>
              <p class="detail">Notti migliori: ${formatDuration(Math.round(r.m1))} in media — altre notti: ${formatDuration(Math.round(r.m2))} in media (d=${r.d.toFixed(2)}).</p>
            </details>`).join('') : '<p class="muted">Nessuna differenza abbastanza marcata da segnalare ancora.</p>'}
        ` : `<p class="muted">${optimalZone.n < 30 ? `Servono almeno 30 notti con la qualità registrata (${optimalZone.n}/30 finora).` : `Servono almeno 8 notti nel gruppo "migliori" (${optimalZone.bestN}/8 finora).`}</p>`}
      </div>
    </div>

    <p class="footnote">Analisi in anteprima: il loro affinamento (in particolare l'esclusione delle anomalie dalla regolarità) arriva dopo un periodo di uso reale.</p>
  `;
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
  const d = new Date(state.calendarMonth.year, state.calendarMonth.month + delta, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
}

// ---------- Impostazioni ----------
function renderSettings() {
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
      <p class="muted">Un avviso leggero, solo se una notte risulta completamente senza dati. Mai per notti compilate in parte.</p>
      <button type="button" class="btn-ghost ${state.remindersEnabled ? 'active' : ''}" id="reminder-toggle" aria-pressed="${state.remindersEnabled}">${state.remindersEnabled ? 'Attivo' : 'Disattivato'}</button>
      <p class="muted small" id="reminder-note"></p>
    </section>
    <section class="card card-pad">
      <h3 class="settings-title">I tuoi dati</h3>
      <p class="muted">Restano solo su questo dispositivo. Puoi esportarli quando vuoi: una riga per notte, leggibile da qualsiasi foglio di calcolo.</p>
      <button type="button" class="btn-ghost" id="export-csv">${ICONS.download}<span>Esporta CSV</span></button>
    </section>
    <section class="card card-pad">
      <h3 class="settings-title">Su questa versione</h3>
      <p class="muted">App installabile, funziona anche offline. Raccolta dati, calendario, andamento ed export completi; le analisi avanzate sono in anteprima.</p>
    </section>
  `;

  document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
  document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
  document.getElementById('export-csv').addEventListener('click', () => downloadCSV(state.entries));
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
}

function setTheme(theme) {
  state.theme = theme;
  applyTheme(theme);
  setPref('theme', theme);
  render();
}

// ---------- Promemoria (locale, controllato all'apertura dell'app) ----------
async function checkReminder() {
  if (!state.remindersEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const yesterday = addDays(todayISO(), -1);
  if (dayStatus(state.entries[yesterday]) !== 'missing') return;
  if (state.reminderDismissed === todayISO()) return;
  if (getPref('reminder_notified_date', '') === todayISO()) return;
  setPref('reminder_notified_date', todayISO());
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Diario del sonno', { body: `Nessun dato per la ${nightTitle(yesterday).toLowerCase()}.`, icon: 'icons/icon-192.png' });
  } catch (e) { /* ambiente senza SW pronto, si ignora */ }
}

// ---------- Root render ----------
function setTab(tab) {
  state.tab = tab;
  render();
  window.scrollTo(0, 0);
}

function render() {
  root.innerHTML = `${renderHeader()}<main id="tab-content"></main>${renderNav()}`;
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
}

init();
