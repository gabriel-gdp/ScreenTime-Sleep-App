// analytics.js — funzioni pure, testabili indipendentemente dalla UI (vedi ANALYTICS_METHODOLOGY.md)

export function pad(n) { return n.toString().padStart(2, '0'); }

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return todayISO(d);
}

export function combineDateTime(dateStr, timeStr, previousDay) {
  const base = new Date(dateStr + 'T00:00:00');
  if (previousDay) base.setDate(base.getDate() - 1);
  const [h, m] = timeStr.split(':').map(Number);
  base.setHours(h, m, 0, 0);
  return base;
}

// Ancora timeStr al giorno di riferimento; se il risultato cade DOPO
// referenceInstant, lo sposta al giorno precedente. Nessuna soglia oraria
// arbitraria (es. "se >= 12"): la direzione dipende solo dalla relazione
// cronologica tra i due istanti, quindi funziona identicamente vicino a
// mezzanotte, a cambio mese o a cambio anno.
export function resolveBefore(referenceInstant, timeStr) {
  const dateStr = todayISO(referenceInstant);
  let candidate = combineDateTime(dateStr, timeStr, false);
  if (candidate > referenceInstant) candidate = combineDateTime(dateStr, timeStr, true);
  return candidate;
}

export function minutesBetween(a, b) { return Math.round((b - a) / 60000); }

export function formatDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${pad(m)}m`;
}

export function minutesToHHMM(mins) {
  if (mins === '' || mins == null || isNaN(mins)) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function hhmmToMinutes(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
}

// --- Metriche di una "notte", identificata dal giorno di risveglio (date) ---
//
// Convenzione: date = giorno del risveglio. bedtime e wakeTime appartengono
// quindi al record di `date`. Ma last_screen_use viene inserito nel check-in
// SERALE del giorno precedente (chi va a dormire stasera lo dichiara prima di
// addormentarsi, e si sveglia solo domani) — quindi lo screen-free time prima
// di dormire va calcolato tra il bedtime di `date` e il last_screen_use del
// record di `date - 1`, non quello dello stesso record. Stesso ragionamento
// per lo screen time totale usato nelle correlazioni.
//
// `override` permette di calcolare un'anteprima live usando valori di bozza
// non ancora salvati (es. mentre si compila il check-in mattutino), senza
// duplicare la logica altrove.
export function computeNightMetrics(entries, date, override) {
  const entry = { ...(entries[date] || {}), ...(override || {}) };
  const prevEntry = entries[addDays(date, -1)] || {};

  const result = {
    durationMin: null, durationError: null, durationWarning: null,
    screenFreeMin: null, screenFreeWarning: null,
    screenTimeTotal: prevEntry.screenTimeTotal != null ? prevEntry.screenTimeTotal : null,
  };

  if (!entry.bedtime || !entry.wakeTime) return result;

  const wakeInstant = combineDateTime(date, entry.wakeTime, false);
  const bedInstant = resolveBefore(wakeInstant, entry.bedtime);
  result.durationMin = minutesBetween(bedInstant, wakeInstant);
  if (result.durationMin <= 0) {
    result.durationError = "L'orario di risveglio deve essere successivo a quello di addormentamento.";
    return result; // con un bedtime incoerente non ha senso derivare anche lo screen-free time
  }
  if (result.durationMin < 120 || result.durationMin > 840) {
    result.durationWarning = 'Valore insolito — verifica gli orari inseriti.';
  }

  if (prevEntry.lastScreenUse) {
    const lastUseInstant = resolveBefore(bedInstant, prevEntry.lastScreenUse);
    result.screenFreeMin = minutesBetween(lastUseInstant, bedInstant);
    // Per costruzione (resolveBefore ancora sempre lastUseInstant a un istante
    // <= bedInstant) uno screen-free negativo non può verificarsi. Ma se
    // last_screen_use era in realtà successivo al bedtime reale (es. inserito
    // per errore, o il bedtime di questo check-in non corrisponde più a quello
    // implicito quando l'utente ha compilato il check-in serale), resolveBefore
    // lo ancora al giorno precedente per rispettare quel vincolo, producendo
    // un intervallo vicino alle 24h anziché un valore negativo: un'incoerenza
    // dei dati mascherata da "tanto tempo senza schermo". La distinguiamo
    // esplicitamente da un valore semplicemente insolito.
    if (result.screenFreeMin > 1200) {
      result.screenFreeWarning = "Intervallo implausibile (vicino alle 24h) — probabile incoerenza tra l'orario di ultimo utilizzo schermo e l'orario di addormentamento inseriti.";
    } else if (result.screenFreeMin > 360) {
      result.screenFreeWarning = 'Valore insolito (oltre 6h) — verifica.';
    }
  }

  return result;
}

// --- Plausibility warning (soft, mai bloccanti) — soglie di ANALYTICS_METHODOLOGY.md §7.1 ---
// Diverse dal caso bloccante (durata <= 0, gestito in computeNightMetrics):
// qui il salvataggio resta sempre possibile, previa conferma esplicita
// dell'utente (vedi attachTodayListeners in app.js, che usa queste funzioni
// per decidere quando richiedere una seconda conferma prima di salvare).
export function bedtimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = mins >= 18 * 60 || mins <= 6 * 60; // 18:00–06:00
  return plausible ? null : "Orario insolito per l'addormentamento — verifica.";
}

export function wakeTimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = mins >= 3 * 60 && mins <= 14 * 60; // 03:00–14:00
  return plausible ? null : 'Orario insolito per il risveglio — verifica.';
}

export function screenTimeTotalWarning(mins) {
  if (mins == null || mins === '' || isNaN(mins)) return null;
  return mins > 960 ? 'Screen time giornaliero molto elevato (oltre 16h) — verifica.' : null;
}

export function dataConfidence(daysWithData, totalDays) {
  const ratio = daysWithData / totalDays;
  if (totalDays === 7) {
    if (daysWithData >= 6) return { label: 'Alta confidenza', level: 'high' };
    if (daysWithData >= 3) return { label: 'Preliminare', level: 'mid' };
    return { label: 'Dati insufficienti', level: 'low' };
  }
  if (ratio >= 0.8) return { label: 'Alta confidenza', level: 'high' };
  if (ratio >= 0.33) return { label: 'Preliminare', level: 'mid' };
  return { label: 'Dati insufficienti', level: 'low' };
}

export function dayStatus(entry) {
  if (!entry) return 'missing';
  const morning = entry.bedtime && entry.wakeTime && entry.quality != null;
  const evening = entry.screenTimeTotal !== undefined && entry.screenTimeTotal !== null && entry.screenTimeTotal !== '' && entry.lastScreenUse;
  if (morning && evening) return 'complete';
  if (morning || evening) return 'partial';
  return 'missing';
}

export function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
export function firstWeekdayOfMonth(year, month) {
  const jsDay = new Date(year, month, 1).getDay();
  return (jsDay + 6) % 7;
}
export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function buildCSV(entries) {
  const header = [
    'date', 'bedtime', 'wake_time', 'sleep_quality',
    'sleep_duration_minutes', 'last_screen_use_prev_evening', 'screen_free_before_bed_minutes',
    'screen_time_total_minutes', 'last_screen_use',
    'is_outlier_bedtime', 'outlier_acknowledged_bedtime',
    'is_outlier_screen_time', 'outlier_acknowledged_screen_time',
  ];
  const rows = Object.keys(entries).sort().map((date) => {
    const e = entries[date];
    const prevEntry = entries[addDays(date, -1)] || {};
    // Attenzione leggendo questa riga: bedtime/wake_time/sleep_quality/
    // sleep_duration_minutes/screen_free_before_bed_minutes descrivono la
    // notte che TERMINA in questa riga (date = giorno di risveglio) — lo
    // screen_free usa last_screen_use_prev_evening, cioè il last_screen_use
    // inserito nel check-in SERALE del giorno precedente (colonna aggiunta
    // per rendere esplicito quale valore è stato usato nel calcolo, invece
    // di lasciarlo implicito). screen_time_total_minutes e last_screen_use
    // (senza suffisso) sono invece i valori grezzi inseriti nel check-in
    // serale di QUESTA riga — riferiti alla notte che inizia stasera e
    // termina nella riga del giorno SUCCESSIVO, non in questa.
    const m = computeNightMetrics(entries, date);
    return [
      date, e.bedtime || '', e.wakeTime || '',
      e.quality != null ? e.quality : '',
      m.durationMin != null ? m.durationMin : '',
      prevEntry.lastScreenUse || '',
      m.screenFreeMin != null ? m.screenFreeMin : '',
      e.screenTimeTotal != null ? e.screenTimeTotal : '',
      e.lastScreenUse || '',
      e.is_outlier_bedtime ? 'true' : 'false',
      e.outlier_acknowledged_bedtime ? 'true' : 'false',
      e.is_outlier_screen_time ? 'true' : 'false',
      e.outlier_acknowledged_screen_time ? 'true' : 'false',
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export function downloadCSV(entries) {
  const csv = buildCSV(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sleep-screen-data-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Sleep Consistency Score: statistica circolare (vedi ANALYTICS_METHODOLOGY.md §4) ---
export function timeToMinutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function circularStdMinutes(times) {
  if (!times || times.length === 0) return null;
  const angles = times.map((t) => (timeToMinutesOfDay(t) / 1440) * 2 * Math.PI);
  const C = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length;
  const S = angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length;
  const R = Math.sqrt(C * C + S * S);
  if (R <= 0.0001) return 720;
  return Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));
}

export function consistencyScore(bedtimes, waketimes) {
  const sBed = circularStdMinutes(bedtimes);
  const sWake = circularStdMinutes(waketimes);
  if (sBed == null || sWake == null) return null;
  const avg = (sBed + sWake) / 2;
  return Math.max(0, Math.round(100 - (avg / 90) * 100));
}

// --- Correlation Analysis: Pearson + soglie n/|r| (vedi ANALYTICS_METHODOLOGY.md §6) ---
export function pearsonR(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

export function correlationSignal(n, r) {
  if (n < 14 || r == null) return { shown: false, n };
  const absR = Math.abs(r);
  if (absR < 0.2) return { shown: false, n };
  let signalLabel, warn = false;
  if (n < 30) {
    if (absR < 0.4) signalLabel = 'Segnale debole';
    else if (absR < 0.6) { signalLabel = 'Segnale moderato'; warn = true; }
    else { signalLabel = 'Segnale forte'; warn = true; }
  } else {
    if (absR < 0.4) signalLabel = 'Segnale debole';
    else if (absR < 0.6) signalLabel = 'Segnale moderato';
    else signalLabel = 'Segnale forte';
  }
  return { shown: true, n, r, signalLabel, warn };
}

// --- Optimal Zone: Cohen's d (vedi ANALYTICS_METHODOLOGY.md §8) ---
export function cohensD(group1, group2) {
  const n1 = group1.length, n2 = group2.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = group1.reduce((a, b) => a + b, 0) / n1, m2 = group2.reduce((a, b) => a + b, 0) / n2;
  const v1 = group1.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const v2 = group2.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);
  const pooledSD = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  if (pooledSD === 0) return null;
  return { d: (m1 - m2) / pooledSD, m1, m2 };
}

export function effectLabel(absD) {
  if (absD < 0.2) return null;
  if (absD < 0.5) return 'Segnale debole';
  if (absD < 0.8) return 'Segnale moderato';
  return 'Segnale forte';
}
