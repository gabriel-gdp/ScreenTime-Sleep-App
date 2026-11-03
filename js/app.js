import { getAllEntries, saveEntry, getPref, setPref } from './db.js';
import {
  pad, todayISO, addDays, computeNightMetrics, dataConfidence, dayStatus,
  daysInMonth, firstWeekdayOfMonth, WEEKDAY_LABELS, downloadCSV, formatDuration,
  minutesToHHMM, hhmmToMinutes, formatDayLabel, circularStdMinutes, consistencyScore,
  pearsonR, correlationSignal, cohensD, effectLabel,
  bedtimeRangeWarning, wakeTimeRangeWarning, screenTimeTotalWarning,
} from './analytics.js';

const ICONS = {
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  sunrise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v7M4.22 10.22l1.42 1.42M1 18h2M21 18h2M18.36 11.64l1.42-1.42M23 22H1M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/></svg>',
  smartphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>',
  trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

const EMPTY_ENTRY = { bedtime: '', wakeTime: '', quality: null, screenTimeTotal: '', lastScreenUse: '' };

const state = {
  theme: getPref('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  tab: 'today',
  entries: {},
  loaded: false,
  selectedDate: todayISO(),
  draft: { ...EMPTY_ENTRY },
  calendarMonth: (() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; })(),
  saveMsg: { type: '', text: '' },
  remindersEnabled: getPref('reminders_enabled', '0') === '1',
  reminderDismissed: getPref('reminder_dismissed_date', ''),
  // Armati dal primo tap su "Salva…" quando sono presenti valori insoliti
  // (non bloccanti): il secondo tap confermA e salva davvero. Si riazzerano
  // non appena l'utente cambia giorno o modifica un campo, per evitare che
  // una conferma data per un valore venga applicata a un valore diverso
  // modificato subito dopo.
  morningConfirmPending: false,
  eveningConfirmPending: false,
};

const root = document.getElementById('app');
document.documentElement.setAttribute('data-theme', state.theme);

async function init() {
  state.entries = await getAllEntries();
  state.loaded = true;
  loadDraftFromEntries();
  render();
  checkReminder();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => console.error('SW registration failed', e));
  }
}

function loadDraftFromEntries() {
  const existing = state.entries[state.selectedDate];
  state.draft = existing ? { ...EMPTY_ENTRY, ...existing } : { ...EMPTY_ENTRY };
  state.morningConfirmPending = false;
  state.eveningConfirmPending = false;
}

// Riepiloga in un'unica stringa (o null) gli avvisi non bloccanti rilevanti
// per il check-in mattutino di stato corrente — riusata sia per decidere se
// serve una conferma prima di salvare, sia per mostrare il motivo all'utente.
function morningWarnings(metrics) {
  return [
    metrics.durationWarning,
    metrics.screenFreeWarning,
    bedtimeRangeWarning(state.draft.bedtime),
    wakeTimeRangeWarning(state.draft.wakeTime),
  ].filter(Boolean);
}

function setTab(tab) { state.tab = tab; render(); }

// Il messaggio "salvato" resta leggibile qualche secondo poi si ritira da
// solo, invece di restare fisso finché l'utente non cambia schermata — ma
// solo se nel frattempo non si è già cambiato giorno/schermata o non è già
// arrivato un messaggio più recente, per non far scomparire qualcosa che
// l'utente non ha ancora avuto modo di leggere.
function fadeSaveMsgAfter(dateAtSaveTime) {
  const msgAtSaveTime = state.saveMsg;
  setTimeout(() => {
    if (state.tab === 'today' && state.selectedDate === dateAtSaveTime && state.saveMsg === msgAtSaveTime) {
      state.saveMsg = { type: '', text: '' };
      renderToday();
    }
  }, 4000);
}

// Ritorna true/false in base al reale esito della scrittura su IndexedDB.
// Lo stato in memoria (state.entries) viene aggiornato SOLO se il salvataggio
// è realmente riuscito, altrimenti la UI non deve mai dichiarare "salvato".
async function persistEntry(patch) {
  const prev = state.entries[state.selectedDate];
  const next = { ...(prev || {}), date: state.selectedDate, ...patch };
  const ok = await saveEntry(next);
  if (ok) state.entries = { ...state.entries, [state.selectedDate]: next };
  return ok;
}

// ---------- Header + Nav ----------
function renderHeader() {
  const dateLabel = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const nextTheme = state.theme === 'light' ? 'scuro' : 'chiaro';
  return `
    <header class="header">
      <div>
        <p class="serif" style="font-size:22px;font-weight:500;margin:0;">Diario del sonno</p>
        <p class="date">${dateLabel}</p>
      </div>
      <button class="icon-btn" id="theme-toggle" aria-label="Passa al tema ${nextTheme}">${state.theme === 'light' ? ICONS.moon : ICONS.sun}</button>
    </header>`;
}

function renderNav() {
  const tabs = [
    { id: 'today', icon: ICONS.sunrise, label: 'Oggi' },
    { id: 'trend', icon: ICONS.trending, label: 'Andamento' },
    { id: 'calendar', icon: ICONS.calendar, label: 'Calendario' },
    { id: 'settings', icon: ICONS.moon, label: 'Impostazioni' },
  ];
  return `
    <nav class="bottom-nav" aria-label="Navigazione principale"><div class="inner">
      ${tabs.map((t) => `
        <button data-tab="${t.id}" class="${state.tab === t.id ? 'active' : ''}" aria-current="${state.tab === t.id ? 'page' : 'false'}">
          ${t.icon}<span>${t.label}</span>
        </button>`).join('')}
    </div></nav>`;
}

// ---------- Today tab ----------
function last7Dates() {
  const arr = [];
  for (let i = 6; i >= 0; i--) arr.push(addDays(todayISO(), -i));
  return arr;
}

function renderReminderBanner() {
  const yesterday = addDays(todayISO(), -1);
  const yStatus = dayStatus(state.entries[yesterday]);
  if (yStatus !== 'missing' || state.reminderDismissed === todayISO()) return '';
  return `
    <div class="reminder-banner">
      ${ICONS.alert}
      <span>Ieri non risulta alcun dato registrato.</span>
      <button id="dismiss-reminder">Ok, ho capito</button>
    </div>`;
}

function renderToday() {
  const metrics = computeNightMetrics(state.entries, state.selectedDate, { bedtime: state.draft.bedtime, wakeTime: state.draft.wakeTime });
  const morningComplete = state.draft.bedtime && state.draft.wakeTime && state.draft.quality != null;
  const eveningComplete = state.draft.screenTimeTotal !== '' && state.draft.screenTimeTotal != null && state.draft.lastScreenUse;

  root.querySelector('#tab-content').innerHTML = `
    ${renderReminderBanner()}
    <div class="day-strip" role="tablist" aria-label="Seleziona giorno">
      ${last7Dates().map((date) => `
        <button class="day-chip ${date === state.selectedDate ? 'active' : ''}" data-date="${date}" role="tab" aria-selected="${date === state.selectedDate}">
          ${date === todayISO() ? 'Oggi' : formatDayLabel(date)}
        </button>`).join('')}
    </div>

    <section class="card">
      <div class="card-head">
        ${ICONS.sunrise}<span class="title">Al risveglio</span>
        <span class="status" aria-label="${morningComplete ? 'completo' : 'da completare'}">${morningComplete ? ICONS.check : ICONS.circle}</span>
      </div>
      <div class="field-grid">
        <div class="field"><label for="f-bedtime">Ti sei addormentato/a</label><input type="time" id="f-bedtime" value="${state.draft.bedtime}"></div>
        <div class="field"><label for="f-waketime">Ti sei svegliato/a</label><input type="time" id="f-waketime" value="${state.draft.wakeTime}"></div>
      </div>
      <label id="quality-label" style="font-size:12px;color:var(--ink-soft);display:block;margin-bottom:6px;">Qualità percepita del sonno</label>
      <div class="quality-row" id="quality-row" role="radiogroup" aria-labelledby="quality-label">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
          <button class="quality-btn ${state.draft.quality === n ? 'active' : ''}" data-q="${n}" role="radio" aria-checked="${state.draft.quality === n}" aria-label="Qualità ${n} su 10">${n}</button>`).join('')}
      </div>
      <p id="duration-hint" class="hint">${todayHintHTML(metrics)}</p>
      <button class="btn ${state.morningConfirmPending ? 'btn-confirm' : ''}" id="save-morning" ${!state.draft.bedtime || !state.draft.wakeTime || state.draft.quality == null ? 'disabled' : ''}>${state.morningConfirmPending ? 'Conferma e salva comunque' : 'Salva mattina'}</button>
    </section>

    <section class="card">
      <div class="card-head">
        ${ICONS.smartphone}<span class="title">A fine giornata</span>
        <span class="status" aria-label="${eveningComplete ? 'completo' : 'da completare'}">${eveningComplete ? ICONS.check : ICONS.circle}</span>
      </div>
      <div class="field-grid">
        <div class="field"><label for="f-screentime">Screen time totale (hh:mm)</label><input type="time" id="f-screentime" value="${minutesToHHMM(state.draft.screenTimeTotal)}"></div>
        <div class="field"><label for="f-lastuse">Ultimo utilizzo schermo</label><input type="time" id="f-lastuse" value="${state.draft.lastScreenUse}"></div>
      </div>
      <p class="hint">Formato ore e minuti di utilizzo, non un orario — es. 3:45 per 3 ore e 45 minuti di schermo. Il tempo senza schermo prima di dormire si calcola automaticamente domani mattina, una volta inserito l'orario in cui ti sei addormentato/a.</p>
      <p id="evening-hint" class="hint">${eveningHintHTML()}</p>
      <button class="btn ${state.eveningConfirmPending ? 'btn-confirm' : ''}" id="save-evening" ${state.draft.screenTimeTotal === '' || !state.draft.lastScreenUse ? 'disabled' : ''}>${state.eveningConfirmPending ? 'Conferma e salva comunque' : 'Salva sera'}</button>
    </section>

    <p class="save-msg ${state.saveMsg.type === 'error' ? 'error' : ''}" role="status">${state.saveMsg.text}</p>
  `;
  attachTodayListeners();
}

function todayHintHTML(metrics) {
  if (!state.draft.bedtime || !state.draft.wakeTime) return '';
  if (metrics.durationError) return `<span class="error">${ICONS.alert} ${metrics.durationError}</span>`;
  let html = `Durata calcolata: <strong>${formatDuration(metrics.durationMin)}</strong>${metrics.durationWarning ? ' — ' + metrics.durationWarning : ''}`;
  if (metrics.screenFreeMin != null) {
    html += `<br>Screen-free prima di dormire (da ieri sera): <strong>${formatDuration(metrics.screenFreeMin)}</strong>${metrics.screenFreeWarning ? ' — ' + metrics.screenFreeWarning : ''}`;
  }
  const rangeWarnings = [bedtimeRangeWarning(state.draft.bedtime), wakeTimeRangeWarning(state.draft.wakeTime)].filter(Boolean);
  rangeWarnings.forEach((w) => { html += `<br><span class="error">${ICONS.alert} ${w}</span>`; });
  if (state.morningConfirmPending) html += `<br><span class="error">${ICONS.alert} Valori insoliti rilevati — tocca di nuovo "Conferma e salva comunque" per salvare lo stesso.</span>`;
  return html;
}

function eveningHintHTML() {
  const warning = screenTimeTotalWarning(state.draft.screenTimeTotal);
  if (!warning) return '';
  let html = `<span class="error">${ICONS.alert} ${warning}</span>`;
  if (state.eveningConfirmPending) html += `<br><span class="error">${ICONS.alert} Tocca di nuovo "Conferma e salva comunque" per salvare lo stesso.</span>`;
  return html;
}

function updateTodayComputed() {
  const metrics = computeNightMetrics(state.entries, state.selectedDate, { bedtime: state.draft.bedtime, wakeTime: state.draft.wakeTime });
  const durationHint = document.getElementById('duration-hint');
  if (durationHint) durationHint.innerHTML = todayHintHTML(metrics);
  const eveningHint = document.getElementById('evening-hint');
  if (eveningHint) eveningHint.innerHTML = eveningHintHTML();

  const morningComplete = state.draft.bedtime && state.draft.wakeTime && state.draft.quality != null;
  const eveningComplete = state.draft.screenTimeTotal !== '' && state.draft.screenTimeTotal != null && state.draft.lastScreenUse;
  const saveMorningBtn = document.getElementById('save-morning');
  if (saveMorningBtn) {
    saveMorningBtn.disabled = !morningComplete;
    saveMorningBtn.textContent = state.morningConfirmPending ? 'Conferma e salva comunque' : 'Salva mattina';
    saveMorningBtn.classList.toggle('btn-confirm', state.morningConfirmPending);
  }
  const saveEveningBtn = document.getElementById('save-evening');
  if (saveEveningBtn) {
    saveEveningBtn.disabled = !eveningComplete;
    saveEveningBtn.textContent = state.eveningConfirmPending ? 'Conferma e salva comunque' : 'Salva sera';
    saveEveningBtn.classList.toggle('btn-confirm', state.eveningConfirmPending);
  }
}

function attachTodayListeners() {
  root.querySelectorAll('.day-chip').forEach((btn) => btn.addEventListener('click', () => {
    state.selectedDate = btn.dataset.date;
    loadDraftFromEntries();
    state.saveMsg = { type: '', text: '' };
    renderToday();
  }));

  // Modificare un campo invalida qualunque conferma già armata (si riferiva
  // ai valori precedenti) e nasconde un messaggio di salvataggio ormai non
  // più attuale rispetto a quello che si sta scrivendo.
  function clearPendingOnEdit(which) {
    if (which === 'morning') state.morningConfirmPending = false;
    else state.eveningConfirmPending = false;
    state.saveMsg = { type: '', text: '' };
  }

  const bedtimeInput = document.getElementById('f-bedtime');
  bedtimeInput.addEventListener('change', (e) => { state.draft.bedtime = e.target.value; clearPendingOnEdit('morning'); updateTodayComputed(); });
  const wakeInput = document.getElementById('f-waketime');
  wakeInput.addEventListener('change', (e) => { state.draft.wakeTime = e.target.value; clearPendingOnEdit('morning'); updateTodayComputed(); });

  root.querySelectorAll('.quality-btn').forEach((btn) => btn.addEventListener('click', () => {
    state.draft.quality = Number(btn.dataset.q);
    root.querySelectorAll('.quality-btn').forEach((b) => {
      const active = Number(b.dataset.q) === state.draft.quality;
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', String(active));
    });
    updateTodayComputed();
  }));

  const screenTimeInput = document.getElementById('f-screentime');
  screenTimeInput.addEventListener('change', (e) => { state.draft.screenTimeTotal = hhmmToMinutes(e.target.value); clearPendingOnEdit('evening'); updateTodayComputed(); });
  const lastUseInput = document.getElementById('f-lastuse');
  lastUseInput.addEventListener('change', (e) => { state.draft.lastScreenUse = e.target.value; clearPendingOnEdit('evening'); updateTodayComputed(); });

  document.getElementById('save-morning').addEventListener('click', async (ev) => {
    const metrics = computeNightMetrics(state.entries, state.selectedDate, { bedtime: state.draft.bedtime, wakeTime: state.draft.wakeTime });
    if (metrics.durationError) { state.saveMsg = { type: 'error', text: metrics.durationError }; renderToday(); return; }

    const hasWarning = morningWarnings(metrics).length > 0;
    if (hasWarning && !state.morningConfirmPending) {
      // Primo tap su un valore insolito: non salviamo ancora, armiamo la
      // conferma e lasciamo visibile l'avviso (già mostrato da todayHintHTML)
      // perché l'utente possa decidere consapevolmente.
      state.morningConfirmPending = true;
      renderToday();
      return;
    }

    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';
    const ok = await persistEntry({
      bedtime: state.draft.bedtime, wakeTime: state.draft.wakeTime, quality: state.draft.quality,
      is_outlier_bedtime: hasWarning,
      outlier_acknowledged_bedtime: hasWarning,
    });
    state.morningConfirmPending = false;
    state.saveMsg = ok
      ? { type: 'ok', text: 'Check-in mattutino salvato.' }
      : { type: 'error', text: 'Salvataggio non riuscito — i dati non sono stati persi dal form, riprova.' };
    renderToday();
    if (ok) fadeSaveMsgAfter(state.selectedDate);
  });

  document.getElementById('save-evening').addEventListener('click', async (ev) => {
    const hasWarning = !!screenTimeTotalWarning(state.draft.screenTimeTotal);
    if (hasWarning && !state.eveningConfirmPending) {
      state.eveningConfirmPending = true;
      renderToday();
      return;
    }

    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Salvataggio…';
    const ok = await persistEntry({
      screenTimeTotal: state.draft.screenTimeTotal, lastScreenUse: state.draft.lastScreenUse,
      is_outlier_screen_time: hasWarning,
      outlier_acknowledged_screen_time: hasWarning,
    });
    state.eveningConfirmPending = false;
    state.saveMsg = ok
      ? { type: 'ok', text: 'Check-in serale salvato.' }
      : { type: 'error', text: 'Salvataggio non riuscito — i dati non sono stati persi dal form, riprova.' };
    renderToday();
    if (ok) fadeSaveMsgAfter(state.selectedDate);
  });

  const dismissBtn = document.getElementById('dismiss-reminder');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    state.reminderDismissed = todayISO();
    setPref('reminder_dismissed_date', todayISO());
    renderToday();
  });
}

// ---------- Trend tab ----------
function buildAllDays() {
  return Object.keys(state.entries).sort().map((date) => {
    const e = state.entries[date];
    const m = computeNightMetrics(state.entries, date);
    return {
      date, quality: e.quality != null ? e.quality : null, durationMin: m.durationMin,
      screenTimeTotal: m.screenTimeTotal, screenFreeMin: m.screenFreeMin,
      bedtime: e.bedtime || null, wakeTime: e.wakeTime || null,
    };
  });
}

function sparkline(values, opts = {}) {
  const w = 400, h = 90, padTop = 10, padBottom = 10;
  const valid = values.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (valid.length === 0) return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="90"></svg>`;
  const min = opts.min != null ? opts.min : Math.min(...valid.map((p) => p.v));
  const max = opts.max != null ? opts.max : Math.max(...valid.map((p) => p.v));
  const range = max - min || 1;
  const stepX = w / Math.max(values.length - 1, 1);
  const points = valid.map((p) => {
    const x = p.i * stepX;
    const y = h - padBottom - ((p.v - min) / range) * (h - padTop - padBottom);
    return `${x},${y}`;
  });
  const path = points.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(' ');
  const dots = valid.map((p) => {
    const x = p.i * stepX;
    const y = h - padBottom - ((p.v - min) / range) * (h - padTop - padBottom);
    return `<circle cx="${x}" cy="${y}" r="3" fill="${opts.color}" />`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="90" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="${opts.color}" stroke-width="2" vector-effect="non-scaling-stroke" />
    ${dots}
  </svg>`;
}

function renderTrend() {
  const allDays = buildAllDays();
  const last7 = last7Dates();
  const chartData = last7.map((date) => allDays.find((d) => d.date === date) || { date, quality: null, durationMin: null });

  const daysWithData7 = chartData.filter((d) => d.quality != null).length;
  const confidence7 = dataConfidence(daysWithData7, 7);

  const qualVals = chartData.map((d) => d.quality).filter((v) => v != null);
  const avgQuality = qualVals.length ? qualVals.reduce((a, b) => a + b, 0) / qualVals.length : null;
  const durVals = last7.map((date) => (allDays.find((d) => d.date === date) || {}).durationMin).filter((v) => v != null);
  const avgDuration = durVals.length ? Math.round(durVals.reduce((a, b) => a + b, 0) / durVals.length) : null;

  const todayEntry = state.entries[todayISO()];
  const todayMetrics = computeNightMetrics(state.entries, todayISO());

  // Consistency
  const consistencyWindow = allDays.filter((d) => d.bedtime && d.wakeTime).slice(-28);
  const consistency = consistencyWindow.length < 5
    ? { shown: false, n: consistencyWindow.length }
    : { shown: true, n: consistencyWindow.length, score: consistencyScore(consistencyWindow.map((d) => d.bedtime), consistencyWindow.map((d) => d.wakeTime)) };

  // Correlations
  const pairFor = (k1, k2) => allDays.filter((d) => d[k1] != null && d[k2] != null).map((d) => [d[k1], d[k2]]);
  const buildCorr = (pairLabel, k1, k2) => {
    const pairs = pairFor(k1, k2);
    const r = pearsonR(pairs);
    return { pairLabel, ...correlationSignal(pairs.length, r) };
  };
  const correlations = [
    buildCorr('Screen time totale → Durata sonno', 'screenTimeTotal', 'durationMin'),
    buildCorr('Screen time totale → Qualità sonno', 'screenTimeTotal', 'quality'),
    buildCorr('Screen-free time before bed → Durata sonno', 'screenFreeMin', 'durationMin'),
    buildCorr('Screen-free time before bed → Qualità sonno', 'screenFreeMin', 'quality'),
  ];

  // Optimal zone
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
        { key: 'durationMin', label: 'Durata sonno' },
        { key: 'screenFreeMin', label: 'Screen-free time before bed' },
        { key: 'screenTimeTotal', label: 'Screen time totale' },
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

  root.querySelector('#tab-content').innerHTML = `
    <div class="hero">
      <p class="label">Come sto andando</p>
      <div class="hero-row">
        <div><span class="serif hero-num">${todayEntry && todayEntry.quality != null ? todayEntry.quality : '—'}</span><span class="hero-unit">/10 oggi</span></div>
        <div><p class="hero-dur">${formatDuration(todayMetrics.durationMin)}</p><p class="hero-dur-label">durata di stanotte</p></div>
      </div>
    </div>

    <div class="section-title-row">
      <p class="section-title">Cosa sta cambiando — ultimi 7 giorni</p>
      <span class="badge ${confidence7.level}">${confidence7.label}</span>
    </div>

    <div class="chart-card"><p class="chart-label">Qualità del sonno</p>${sparkline(chartData.map((d) => d.quality), { color: 'var(--accent)', min: 0, max: 10 })}</div>
    <div class="chart-card" style="margin-bottom:24px;"><p class="chart-label">Durata del sonno (ore)</p>${sparkline(chartData.map((d) => (d.durationMin != null ? d.durationMin / 60 : null)), { color: 'var(--warm)' })}</div>

    <div class="stat-grid">
      <div class="stat-box"><p class="label">Qualità media</p><p class="serif value">${avgQuality != null ? avgQuality.toFixed(1) : '—'}</p></div>
      <div class="stat-box"><p class="label">Durata media</p><p class="serif value">${formatDuration(avgDuration)}</p></div>
    </div>

    <div class="analysis-block">
      <p class="section-title" style="margin:20px 0 8px;">Regolarità</p>
      <div class="card">
        ${consistency.shown ? `
          <details>
            <summary style="display:flex;align-items:baseline;gap:12px;">
              <span class="serif" style="font-size:28px;font-weight:500;">${consistency.score}</span>
              <span style="font-size:13px;color:var(--ink-soft);">/100 — regolarità di orari negli ultimi ${consistency.n} giorni con dati</span>
            </summary>
            <p class="detail">Calcolato con deviazione standard circolare su bedtime e wake time (n=${consistency.n}). Formula: 100 − (variabilità media / 90 × 100). Nessuna esclusione outlier applicata ancora in questa build iniziale.</p>
          </details>` : `<p class="muted">Servono almeno 5 giorni con orari completi (${consistency.n}/5 raccolti) per calcolare la regolarità.</p>`}
      </div>
    </div>

    <div class="analysis-block">
      <p class="section-title" style="margin:20px 0 8px;">Associazioni osservate <span style="font-style:italic;">(non causali)</span></p>
      <div class="card">
        ${correlations.some((c) => c.shown) ? correlations.filter((c) => c.shown).map((c) => `
          <details>
            <summary><strong>${c.pairLabel}</strong>: ${c.signalLabel} ${c.warn ? '⚠️' : ''}</summary>
            <p class="detail">n=${c.n} · r=${c.r.toFixed(2)} · Pearson misura solo associazioni lineari — un valore basso non esclude relazioni non lineari.${c.warn ? ' Numerosità ancora limitata: interpretare con cautela.' : ''}</p>
          </details>`).join('') : `<p class="muted">Nessuna associazione mostrabile ancora — servono almeno 14 giorni appaiati per coppia di variabili (attualmente: ${Math.max(...correlations.map((c) => c.n), 0)} il massimo disponibile).</p>`}
      </div>
    </div>

    <div class="analysis-block">
      <p class="section-title" style="margin:20px 0 8px;">Condizioni delle notti migliori</p>
      <div class="card">
        ${optimalZone.shown ? `
          <p class="muted">Confronto tra ${optimalZone.bestN} notti migliori (qualità ≥7, top 25% personale) e le altre ${optimalZone.n - optimalZone.bestN}.</p>
          ${optimalZone.results.filter((r) => r.shown).length > 0 ? optimalZone.results.filter((r) => r.shown).map((r) => `
            <details>
              <summary><strong>${r.label}</strong>: ${r.signalLabel}</summary>
              <p class="detail">Notti migliori: ${formatDuration(Math.round(r.m1))} in media — altre notti: ${formatDuration(Math.round(r.m2))} in media (d=${r.d.toFixed(2)}).</p>
            </details>`).join('') : '<p class="muted">Nessuna differenza abbastanza marcata da segnalare ancora.</p>'}
        ` : `<p class="muted">${optimalZone.n < 30 ? `Servono almeno 30 giorni con qualità registrata (${optimalZone.n}/30 raccolti).` : `Servono almeno 8 notti nel gruppo "migliori" (attualmente ${optimalZone.bestN}/8) — continua a registrare la qualità percepita.`}</p>`}
      </div>
    </div>

    <p class="footnote">Sezioni introdotte in anteprima. Il raffinamento delle formule (in particolare l'esclusione outlier nel Consistency Score) arriva dopo un periodo di uso reale, come da roadmap.</p>
  `;
}

// ---------- Calendar tab ----------
function renderCalendar() {
  const { year, month } = state.calendarMonth;
  const total = daysInMonth(year, month);
  const leading = firstWeekdayOfMonth(year, month);
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= total; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    cells.push({ day, dateStr, isFuture: dateStr > todayISO(), status: dayStatus(state.entries[dateStr]) });
  }
  const monthLabel = new Date(year, month, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  root.querySelector('#tab-content').innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" id="cal-prev" aria-label="Mese precedente">${ICONS.chevronLeft}</button>
      <p class="serif month-label">${monthLabel}</p>
      <button class="icon-btn" id="cal-next" aria-label="Mese successivo">${ICONS.chevronRight}</button>
    </div>
    <div class="cal-grid">${WEEKDAY_LABELS.map((w) => `<div class="weekday">${w}</div>`).join('')}</div>
    <div class="cal-days">
      ${cells.map((cell) => {
        if (!cell) return '<div></div>';
        const { day, dateStr, isFuture, status } = cell;
        const cls = ['cal-cell'];
        if (dateStr === todayISO()) cls.push('today');
        if (dateStr === state.selectedDate) cls.push('selected');
        const statusLabel = { complete: 'completo', partial: 'parziale', missing: 'mancante' }[status];
        return `<button class="${cls.join(' ')}" data-date="${dateStr}" ${isFuture ? 'disabled' : ''} aria-label="${day} ${monthLabel}, ${statusLabel}">
          ${day}<span class="cal-dot ${status}"></span>
        </button>`;
      }).join('')}
    </div>
    <div class="cal-legend">
      <span><span class="dot complete" style="background:var(--accent);"></span>Completo</span>
      <span><span class="dot partial" style="background:var(--warm);"></span>Parziale</span>
      <span><span class="dot missing"></span>Mancante</span>
    </div>
    <p class="footnote">Tocca un giorno per aprirlo e completare o correggere i dati.</p>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => { shiftMonth(-1); });
  document.getElementById('cal-next').addEventListener('click', () => { shiftMonth(1); });
  root.querySelectorAll('.cal-cell:not(:disabled)').forEach((btn) => btn.addEventListener('click', () => {
    state.selectedDate = btn.dataset.date;
    loadDraftFromEntries();
    setTab('today');
  }));
}
function shiftMonth(delta) {
  const d = new Date(state.calendarMonth.year, state.calendarMonth.month + delta, 1);
  state.calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderCalendar();
}

// ---------- Settings tab ----------
function renderSettings() {
  root.querySelector('#tab-content').innerHTML = `
    <section class="card">
      <p style="font-size:15px;font-weight:500;margin:0 0 12px;">Aspetto</p>
      <div style="display:flex;gap:8px;">
        <button class="btn-ghost ${state.theme === 'light' ? 'active' : ''}" id="theme-light" aria-pressed="${state.theme === 'light'}">Chiaro</button>
        <button class="btn-ghost ${state.theme === 'dark' ? 'active' : ''}" id="theme-dark" aria-pressed="${state.theme === 'dark'}">Scuro</button>
      </div>
    </section>
    <section class="card">
      <p style="font-size:15px;font-weight:500;margin:0 0 8px;">Promemoria</p>
      <p class="muted" style="margin-bottom:12px;">Un avviso leggero, solo se un giorno risulta completamente senza dati. Mai per check-in parziali.</p>
      <button class="btn-ghost ${state.remindersEnabled ? 'active' : ''}" id="reminder-toggle" aria-pressed="${state.remindersEnabled}">${state.remindersEnabled ? 'Attivo' : 'Disattivato'}</button>
    </section>
    <section class="card">
      <p style="font-size:15px;font-weight:500;margin:0 0 8px;">I tuoi dati</p>
      <p class="muted" style="margin-bottom:12px;">I dati restano sempre tuoi ed esportabili in qualsiasi momento, senza vincoli di formato.</p>
      <button class="btn-ghost" id="export-csv">${ICONS.download} Esporta CSV</button>
    </section>
    <section class="card">
      <p style="font-size:15px;font-weight:500;margin:0 0 8px;">Su questa versione</p>
      <p class="muted">PWA installabile — funziona offline, i dati restano sul dispositivo (IndexedDB). Fase 1–4 completa: raccolta dati, calendario, dashboard, export. Le analisi di Fase 6 sono qui in anteprima: le formule sono le stesse, il loro affinamento (in particolare l'esclusione outlier nel Consistency Score) arriva con l'uso reale.</p>
    </section>
  `;

  document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
  document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
  document.getElementById('export-csv').addEventListener('click', () => downloadCSV(state.entries));
  document.getElementById('reminder-toggle').addEventListener('click', async () => {
    if (!state.remindersEnabled) {
      if ('Notification' in window) {
        const perm = await Notification.requestPermission();
        state.remindersEnabled = perm === 'granted';
      } else {
        state.remindersEnabled = false;
      }
    } else {
      state.remindersEnabled = false;
    }
    setPref('reminders_enabled', state.remindersEnabled ? '1' : '0');
    renderSettings();
  });
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  setPref('theme', theme);
  render();
}

// ---------- Reminder (locale, controllato all'apertura dell'app) ----------
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
    reg.showNotification('Diario del sonno', { body: 'Ieri non risulta alcun dato registrato.', icon: 'icons/icon-192.png' });
  } catch (e) { /* ambiente senza SW pronto, si ignora silenziosamente */ }
}

// ---------- Root render ----------
function render() {
  root.innerHTML = `${renderHeader()}<div id="tab-content"></div>${renderNav()}`;
  if (!state.loaded) {
    root.querySelector('#tab-content').innerHTML = '<p class="muted">Caricamento…</p>';
  } else if (state.tab === 'today') renderToday();
  else if (state.tab === 'trend') renderTrend();
  else if (state.tab === 'calendar') renderCalendar();
  else if (state.tab === 'settings') renderSettings();

  document.getElementById('theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
  root.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
}

init();
