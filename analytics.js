// analytics.js — funzioni pure, testabili indipendentemente dalla UI (vedi ANALYTICS_METHODOLOGY.md)
//
// MODELLO DEI DATI (v2): un record = una notte, identificata da `date` =
// giorno del risveglio. Lo stesso record contiene TUTTO ciò che riguarda
// quella notte, nell'ordine in cui accade:
//   - check-in serale del giorno prima (date − 1): screenTimeTotal (screen
//     time della giornata appena conclusa) e lastScreenUse (ultimo utilizzo
//     dello schermo prima di addormentarsi);
//   - check-in mattutino (date): bedtime, wakeTime, quality.
// Nessuna metrica di una notte dipende più dal record di un altro giorno,
// e il vincolo "ultimo utilizzo ≤ addormentamento" si verifica dentro lo
// stesso record, esattamente come l'utente lo vede a schermo.

export function pad(n) { return n.toString().padStart(2, '0'); }

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return todayISO(d);
}

export function nowHHMM(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

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
// cronologica tra i due istanti. Usata per l'addormentamento rispetto al
// risveglio (il sonno può durare fino a 24h, sempre "prima" del risveglio).
export function resolveBefore(referenceInstant, timeStr) {
  const dateStr = todayISO(referenceInstant);
  let candidate = combineDateTime(dateStr, timeStr, false);
  if (candidate > referenceInstant) candidate = combineDateTime(dateStr, timeStr, true);
  return candidate;
}

export function timeToMinutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Distanza con segno, in minuti, da `fromHHMM` a `toHHMM`, prendendo
// l'istante più vicino sul ciclo di 24h: risultato in (−720, 720].
// > 0 → from precede to; < 0 → from viene DOPO to.
// Serve per confrontare ultimo utilizzo schermo e addormentamento: due
// orari della stessa sera. Il confine (12h in entrambe le direzioni) non è
// una soglia scelta a mano ma il semiciclo simmetrico: un "tempo senza
// schermo" oltre le 12h non è comunque plausibile (warning già oltre le 6h).
// Esempi: 23:30 → 22:29 = −61 (dopo: incoerente); 23:45 → 00:30 = +45.
export function nearestClockDiff(fromHHMM, toHHMM) {
  const d = (((timeToMinutesOfDay(toHHMM) - timeToMinutesOfDay(fromHHMM)) % 1440) + 1440) % 1440;
  return d > 720 ? d - 1440 : d;
}

export function minutesBetween(a, b) { return Math.round((b - a) / 60000); }

export function formatDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m} min`;
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

function isEmpty(v) { return v === '' || v == null; }

export function eveningComplete(e) { return !!e && !isEmpty(e.screenTimeTotal) && !isEmpty(e.lastScreenUse); }
export function sleepComplete(e) { return !!e && !isEmpty(e.bedtime) && !isEmpty(e.wakeTime) && e.quality != null; }
export function eveningStarted(e) { return !!e && (!isEmpty(e.screenTimeTotal) || !isEmpty(e.lastScreenUse)); }
export function sleepStarted(e) { return !!e && (!isEmpty(e.bedtime) || !isEmpty(e.wakeTime) || e.quality != null); }

// --- Metriche di una notte (record `entry`, risveglio il giorno `date`) ---
// Validazione bloccante (ANALYTICS_METHODOLOGY.md §7.1):
//   - durata ≤ 0 (risveglio non successivo all'addormentamento);
//   - ultimo utilizzo schermo successivo all'addormentamento.
// Warning non bloccanti (salvabili previa conferma): durata < 2h o > 14h,
// screen-free = 0 o > 6h.
export function computeNightMetrics(entry, date) {
  const e = entry || {};
  const result = {
    durationMin: null, durationError: null, durationWarning: null,
    screenFreeMin: null, screenFreeError: null, screenFreeWarning: null,
  };

  if (e.bedtime && e.wakeTime) {
    const wakeInstant = combineDateTime(date, e.wakeTime, false);
    const bedInstant = resolveBefore(wakeInstant, e.bedtime);
    const dur = minutesBetween(bedInstant, wakeInstant);
    if (dur <= 0) {
      result.durationError = "L'orario di risveglio deve essere successivo a quello in cui ti sei addormentato/a.";
    } else {
      result.durationMin = dur;
      if (dur < 120 || dur > 840) result.durationWarning = 'Durata insolita (meno di 2 ore o più di 14): controlla gli orari.';
    }
  }

  if (e.bedtime && e.lastScreenUse) {
    const diff = nearestClockDiff(e.lastScreenUse, e.bedtime);
    if (diff < 0) {
      result.screenFreeError = `L'ultimo utilizzo dello schermo (${e.lastScreenUse}) non può essere dopo l'orario in cui ti sei addormentato/a (${e.bedtime}). Correggi uno dei due orari.`;
    } else {
      result.screenFreeMin = diff;
      if (diff === 0) result.screenFreeWarning = "Zero minuti senza schermo: hai smesso di usarlo proprio quando ti sei addormentato/a? Se sì, va bene così.";
      else if (diff > 360) result.screenFreeWarning = 'Più di 6 ore senza schermo prima di dormire: controlla gli orari.';
    }
  }

  return result;
}

// --- Plausibility warning (soft, mai bloccanti) — soglie di ANALYTICS_METHODOLOGY.md §7.1 ---
export function bedtimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = mins >= 18 * 60 || mins <= 6 * 60; // 18:00–06:00
  return plausible ? null : "Orario di addormentamento insolito (fuori dalla fascia 18:00–06:00).";
}

export function wakeTimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = mins >= 3 * 60 && mins <= 14 * 60; // 03:00–14:00
  return plausible ? null : 'Orario di risveglio insolito (fuori dalla fascia 03:00–14:00).';
}

export function screenTimeTotalWarning(mins) {
  if (mins == null || mins === '' || isNaN(mins)) return null;
  return mins > 960 ? 'Screen time molto elevato (oltre 16 ore): controlla il valore.' : null;
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
  const ev = eveningComplete(entry), sl = sleepComplete(entry);
  if (ev && sl) return 'complete';
  if (eveningStarted(entry) || sleepStarted(entry)) return 'partial';
  return 'missing';
}

export function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
export function firstWeekdayOfMonth(year, month) {
  const jsDay = new Date(year, month, 1).getDay();
  return (jsDay + 6) % 7;
}
export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Una riga = una notte. night_start_date è la sera in cui sono stati
// registrati screen time e ultimo utilizzo; wake_date è il giorno del
// risveglio (chiave del record). Celle vuote = dato non inserito (mai 0).
export function buildCSV(entries) {
  const header = [
    'night_start_date', 'wake_date',
    'screen_time_total_minutes', 'last_screen_use',
    'bedtime', 'wake_time', 'sleep_quality',
    'sleep_duration_minutes', 'screen_free_before_bed_minutes',
    'is_outlier_bedtime', 'outlier_acknowledged_bedtime',
    'is_outlier_screen_time', 'outlier_acknowledged_screen_time',
  ];
  const val = (v) => (v == null ? '' : v);
  const flag = (v) => (v ? 'true' : 'false');
  const rows = Object.keys(entries).sort().map((date) => {
    const e = entries[date];
    const m = computeNightMetrics(e, date);
    return [
      addDays(date, -1), date,
      val(e.screenTimeTotal), val(e.lastScreenUse),
      val(e.bedtime), val(e.wakeTime), val(e.quality),
      val(m.durationMin), val(m.screenFreeMin),
      flag(e.is_outlier_bedtime), flag(e.outlier_acknowledged_bedtime),
      flag(e.is_outlier_screen_time), flag(e.outlier_acknowledged_screen_time),
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Sleep Consistency Score: statistica circolare (vedi ANALYTICS_METHODOLOGY.md §4) ---
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
