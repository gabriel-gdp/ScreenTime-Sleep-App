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

import { ANALYSIS_CONFIG as CFG, hhmmToMin } from './config.js';
import { screenTimeReference, provenanceOf, PROVENANCE_FIELDS } from './record.js';

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

// Come nearestClockDiff, ma sul tempo REALE: tra le occorrenze di timeStr
// nel giorno di referenceInstant e in quelli adiacenti sceglie la più
// vicina (a parità, quella precedente). Serve quando l'istante di
// riferimento è noto: nelle notti del cambio d'ora l'intervallo reale
// differisce di un'ora da quello letto sulle lancette (29/03/2026:
// 01:50 → 03:10 = 20 minuti reali; 25/10/2026: 140 minuti reali).
export function nearestInstant(referenceInstant, timeStr) {
  const day = todayISO(referenceInstant);
  let best = null;
  for (const delta of [-1, 0, 1]) {
    const c = combineDateTime(addDays(day, delta), timeStr, false);
    const dist = Math.abs(c - referenceInstant);
    if (!best || dist < best.dist || (dist === best.dist && c < best.c)) best = { c, dist };
  }
  return best.c;
}

export function minutesBetween(a, b) { return Math.round((b - a) / 60000); }

export function formatDuration(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${pad(m)}m`;
}

// "2 ore", "14" (unit=false) o "1h 30m" per soglie non intere.
function hoursText(mins, unit = true) {
  if (mins % 60) return formatDuration(mins);
  return unit ? `${mins / 60} ore` : String(mins / 60);
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

// Risvegli notturni: `awakenings` (numero) e `awakeMinutes` (minuti svegli
// in totale, escluso il risveglio finale). Due interi presenti insieme:
// 0/0 = nessun risveglio dichiarato; assenti = informazione non raccolta
// (notti precedenti alla funzione o senza compilazione del mattino). Una
// notte "non raccolta" non vale mai come zero.
export function awakeningsKnown(e) {
  return !!e && Number.isInteger(e.awakenings) && Number.isInteger(e.awakeMinutes) && e.awakenings >= 0 && e.awakeMinutes >= 0;
}

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
    // Intervallo di sonno (durationMin) e sonno effettivo stimato restano
    // distinti: il secondo esiste solo se i risvegli sono stati indicati.
    effectiveSleepMin: null, effectiveError: null,
    // Schema 4: coerenza tra coricamento, tentativo e addormentamento.
    latencyMin: null, attemptError: null, latencyWarning: null, inBedError: null,
  };

  let bedInstant = null;
  if (e.bedtime && e.wakeTime) {
    const wakeInstant = combineDateTime(date, e.wakeTime, false);
    bedInstant = resolveBefore(wakeInstant, e.bedtime);
    const dur = minutesBetween(bedInstant, wakeInstant);
    if (dur <= 0) {
      result.durationError = "L'orario di risveglio deve essere successivo a quello in cui ti sei addormentato/a.";
    } else {
      result.durationMin = dur;
      if (dur < CFG.DURATION_WARN_BELOW_MIN || dur > CFG.DURATION_WARN_ABOVE_MIN) result.durationWarning = `Durata insolita (meno di ${hoursText(CFG.DURATION_WARN_BELOW_MIN)} o più di ${hoursText(CFG.DURATION_WARN_ABOVE_MIN, false)}): controlla gli orari.`;
    }
  }

  if (e.bedtime && e.lastScreenUse) {
    // Con il risveglio noto l'addormentamento ha una data precisa e il
    // confronto avviene sul tempo reale (corretto anche al cambio d'ora);
    // senza, si confrontano le lancette sull'istante più vicino.
    const diff = bedInstant
      ? minutesBetween(nearestInstant(bedInstant, e.lastScreenUse), bedInstant)
      : nearestClockDiff(e.lastScreenUse, e.bedtime);
    if (diff < 0) {
      result.screenFreeError = `L'ultimo utilizzo dello schermo (${e.lastScreenUse}) non può essere dopo l'orario in cui ti sei addormentato/a (${e.bedtime}). Correggi uno dei due orari.`;
    } else {
      result.screenFreeMin = diff;
      if (diff === 0) result.screenFreeWarning = "Zero minuti senza schermo: hai smesso di usarlo proprio quando ti sei addormentato/a? Se sì, va bene così.";
      else if (diff > CFG.SCREEN_FREE_WARN_ABOVE_MIN) result.screenFreeWarning = `Più di ${hoursText(CFG.SCREEN_FREE_WARN_ABOVE_MIN)} senza schermo prima di dormire: controlla gli orari.`;
    }
  }

  // Tentativo di dormire ≤ addormentamento (bloccante); latenza molto
  // lunga → conferma. Con il risveglio noto il confronto è in tempo reale.
  const before = (aHHMM, bHHMM, bInstant) => (bInstant
    ? minutesBetween(nearestInstant(bInstant, aHHMM), bInstant)
    : nearestClockDiff(aHHMM, bHHMM));
  let attemptInstant = null;
  if (e.sleepAttempt && e.bedtime) {
    const lat = before(e.sleepAttempt, e.bedtime, bedInstant);
    if (lat < 0) result.attemptError = `Hai indicato di aver provato a dormire (${e.sleepAttempt}) dopo l'orario in cui ti sei addormentato/a (${e.bedtime}). Correggi uno dei due orari.`;
    else {
      result.latencyMin = lat;
      if (bedInstant) attemptInstant = new Date(bedInstant.getTime() - lat * 60000);
      if (lat > CFG.LATENCY_CONFIRM_ABOVE_MIN) result.latencyWarning = `Tra il momento in cui hai provato a dormire e l'addormentamento passano più di ${hoursText(CFG.LATENCY_CONFIRM_ABOVE_MIN)}: è corretto?`;
    }
  }
  if (e.inBedTime) {
    const ref = e.sleepAttempt && !result.attemptError ? e.sleepAttempt : e.bedtime;
    const refInstant = ref === e.sleepAttempt ? attemptInstant : bedInstant;
    if (ref && before(e.inBedTime, ref, refInstant) < 0) {
      result.inBedError = ref === e.sleepAttempt
        ? `L'ora in cui sei andato/a a letto (${e.inBedTime}) non può essere dopo quella in cui hai provato a dormire (${e.sleepAttempt}).`
        : `L'ora in cui sei andato/a a letto (${e.inBedTime}) non può essere dopo l'addormentamento (${e.bedtime}).`;
    }
  }

  if (result.durationMin != null && awakeningsKnown(e)) {
    const eff = result.durationMin - e.awakeMinutes;
    if (eff <= 0) result.effectiveError = `I minuti svegli (${e.awakeMinutes}) non possono essere pari o superiori all'intervallo di sonno (${formatDuration(result.durationMin)}).`;
    else result.effectiveSleepMin = eff;
  }

  return result;
}

// --- Plausibility warning (soft, mai bloccanti) — soglie di ANALYTICS_METHODOLOGY.md §7.1 ---
// Fascia oraria [from, to] sul ciclo di 24 h, confini inclusi; se from > to
// la fascia attraversa la mezzanotte (es. 18:00–06:00).
function inClockRange(mins, from, to) {
  const a = hhmmToMin(from), b = hhmmToMin(to);
  return a <= b ? mins >= a && mins <= b : mins >= a || mins <= b;
}
export function bedtimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = inClockRange(mins, CFG.ONSET_PLAUSIBLE_FROM, CFG.ONSET_PLAUSIBLE_TO);
  return plausible ? null : `Orario di addormentamento insolito (fuori dalla fascia ${CFG.ONSET_PLAUSIBLE_FROM}–${CFG.ONSET_PLAUSIBLE_TO}).`;
}

export function wakeTimeRangeWarning(hhmm) {
  if (!hhmm) return null;
  const mins = timeToMinutesOfDay(hhmm);
  const plausible = inClockRange(mins, CFG.WAKE_PLAUSIBLE_FROM, CFG.WAKE_PLAUSIBLE_TO);
  return plausible ? null : `Orario di risveglio insolito (fuori dalla fascia ${CFG.WAKE_PLAUSIBLE_FROM}–${CFG.WAKE_PLAUSIBLE_TO}).`;
}

export function screenTimeTotalWarning(mins) {
  if (mins == null || mins === '' || isNaN(mins)) return null;
  return mins > CFG.SCREEN_TIME_WARN_ABOVE_MIN ? `Screen time molto elevato (oltre ${hoursText(CFG.SCREEN_TIME_WARN_ABOVE_MIN)}): controlla il valore.` : null;
}

// Etichette di NUMEROSITÀ (§0 della metodologia): dicono su quante notti si
// basa un valore, non quanto sia "affidabile" o "stabile". Con una sola
// settimana anche una media su 7 notti può cambiare molto la settimana
// dopo; per questo non si usano più parole come "confidenza".
export function dataConfidence(daysWithData, totalDays) {
  const ratio = daysWithData / totalDays;
  const week = totalDays === 7;
  const high = { label: week ? 'Settimana quasi completa' : 'Periodo quasi completo', level: 'high' };
  const mid = { label: week ? 'Settimana parziale' : 'Periodo parziale', level: 'mid' };
  const low = { label: 'Troppo poche notti', level: 'low' };
  if (week) {
    if (daysWithData >= CFG.COVERAGE_WEEK_HIGH_NIGHTS) return high;
    if (daysWithData >= CFG.COVERAGE_WEEK_MID_NIGHTS) return mid;
    return low;
  }
  if (ratio >= CFG.COVERAGE_HIGH_SHARE) return high;
  if (ratio >= CFG.COVERAGE_MID_SHARE) return mid;
  return low;
}

export function dayStatus(entry) {
  if (!entry) return 'missing';
  const ev = eveningComplete(entry), sl = sleepComplete(entry);
  if (ev && sl) return 'complete';
  if (eveningStarted(entry) || sleepStarted(entry)) return 'partial';
  return 'missing';
}

// --- Riepilogo di un periodo di notti (ANALYTICS_METHODOLOGY.md §0, §5, §7.2) ---
// Finestra = le `days` notti che terminano con il risveglio di `endDate`
// (incluso). Le anomalie confermate sono escluse di default dalle medie
// (§7.2), ma restano elencate in `excluded` perché l'utente veda cosa è
// stato escluso e perché; con includeOutliers: true rientrano nel calcolo.
// L'esclusione è per campo: una notte con orari anomali esclude durata e
// tempo senza schermo, ma la sua qualità percepita e il suo screen time
// (se non anomalo) restano nelle medie.
export const SUMMARY_METRICS = ['durationMin', 'effectiveSleepMin', 'quality', 'awakenings', 'awakeMinutes', 'screenTimeTotal', 'screenFreeMin'];

export function periodSummary(entries, endDate, days = 7, { includeOutliers = false } = {}) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(addDays(endDate, -i));
  const values = Object.fromEntries(SUMMARY_METRICS.map((k) => [k, []]));
  const excluded = [];
  const nights = [];
  let nightsWithData = 0;

  dates.forEach((date) => {
    const e = entries[date];
    const status = dayStatus(e);
    if (status !== 'missing') nightsWithData++;
    const m = computeNightMetrics(e, date);
    const night = {
      date, status,
      durationMin: m.durationMin,
      quality: e && e.quality != null ? e.quality : null,
      screenTimeTotal: e && !isEmpty(e.screenTimeTotal) ? e.screenTimeTotal : null,
      screenFreeMin: m.screenFreeMin,
      effectiveSleepMin: m.effectiveSleepMin,
      awakenings: awakeningsKnown(e) ? e.awakenings : null,
      awakeMinutes: awakeningsKnown(e) ? e.awakeMinutes : null,
      sleepOutlier: !!(e && e.is_outlier_bedtime),
      screenOutlier: !!(e && e.is_outlier_screen_time),
    };
    nights.push(night);
    // Il numero e i minuti dei risvegli non dipendono dagli orari: restano
    // anche nelle notti con orari anomali; il sonno effettivo, che dipende
    // dall'intervallo, segue invece la sorte della durata.
    const skip = { durationMin: night.sleepOutlier, effectiveSleepMin: night.sleepOutlier, screenFreeMin: night.sleepOutlier, screenTimeTotal: night.screenOutlier, quality: false, awakenings: false, awakeMinutes: false };
    const skippedFields = [];
    SUMMARY_METRICS.forEach((k) => {
      if (night[k] == null) return;
      if (skip[k] && !includeOutliers) { skippedFields.push(k); return; }
      values[k].push(night[k]);
    });
    if (skippedFields.length) excluded.push({ date, fields: skippedFields });
  });

  // Due misure diverse, da non confondere:
  // - coverage (sotto): quante notti della finestra hanno almeno un dato;
  // - stats[k].confidence: affidabilità di QUELLA media, dalle notti
  //   effettivamente usate (senza mancanti e anomalie escluse). Con 6/7
  //   notti compilate ma 2 sole qualità, la qualità media è "Dati
  //   insufficienti" anche se la copertura è alta.
  const stats = Object.fromEntries(SUMMARY_METRICS.map((k) => [k, describe(values[k], days)]));

  // Notte migliore/peggiore per qualità percepita: solo con almeno 3 notti
  // valutate e qualità non tutte uguali (altrimenti non c'è nulla da
  // distinguere). A parità, vince la più recente.
  const rated = nights.filter((n) => n.quality != null);
  let best = null, worst = null;
  if (rated.length >= 3) {
    const maxQ = Math.max(...rated.map((n) => n.quality));
    const minQ = Math.min(...rated.map((n) => n.quality));
    if (maxQ > minQ) {
      best = [...rated].reverse().find((n) => n.quality === maxQ);
      worst = [...rated].reverse().find((n) => n.quality === minQ);
    }
  }

  // Distribuzione della qualità (scala ordinale 1–10): conteggi per valore.
  const qualityCounts = Array.from({ length: 10 }, (_, i) => values.quality.filter((q) => q === i + 1).length);
  return { dates, days, nights, nightsWithData, coverage: dataConfidence(nightsWithData, days), stats, excluded, best, worst, qualityCounts };
}

// --- Notti pronte per le analisi, con la stessa politica anomalie del
// riepilogo settimanale (§7.2): esclusione di default, per campo. Una notte
// con orari anomali non entra in durata, tempo senza schermo e regolarità;
// uno screen time anomalo non entra nelle analisi sullo screen time; la
// qualità percepita resta sempre (non è mai un'anomalia).
export function analysisNights(entries, { includeOutliers = false } = {}) {
  return Object.keys(entries).sort().map((date) => {
    const e = entries[date] || {};
    const m = computeNightMetrics(e, date);
    const sleepOut = !includeOutliers && !!e.is_outlier_bedtime;
    const screenOut = !includeOutliers && !!e.is_outlier_screen_time;
    return {
      date,
      quality: e.quality != null ? e.quality : null,
      durationMin: sleepOut ? null : m.durationMin,
      screenFreeMin: sleepOut ? null : m.screenFreeMin,
      screenTimeTotal: screenOut || isEmpty(e.screenTimeTotal) ? null : e.screenTimeTotal,
      effectiveSleepMin: sleepOut ? null : m.effectiveSleepMin,
      awakenings: awakeningsKnown(e) ? e.awakenings : null,
      awakeMinutes: awakeningsKnown(e) ? e.awakeMinutes : null,
      bedtime: sleepOut ? null : (e.bedtime || null),
      wakeTime: sleepOut ? null : (e.wakeTime || null),
      excludedSleep: sleepOut,
      excludedScreen: screenOut,
    };
  });
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
    // Aggiunte nello schema 3, in coda per non spostare le colonne esistenti.
    'awakenings', 'awake_minutes', 'estimated_sleep_minutes',
    // Schema 4, sempre in coda. sleep_onset ripete bedtime (= addormentamento)
    // con un nome non ambiguo; screen_time_date_status: verified / presumed /
    // unknown; prov_<campo>: provenienza (unknown se non classificata).
    'sleep_onset', 'screen_time_date', 'screen_time_date_status',
    'in_bed_time', 'sleep_attempt', 'day_type', 'day_type_source',
    'late_caffeine', 'alcohol', 'stress', 'unusual_night', 'last_screen_use_source',
    ...PROVENANCE_FIELDS.map((f) => `prov_${f}`),
  ];
  const val = (v) => (v == null ? '' : v);
  const flag = (v) => (v ? 'true' : 'false');
  const tri = (v) => (typeof v === 'boolean' ? String(v) : '');
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
      awakeningsKnown(e) ? e.awakenings : '', awakeningsKnown(e) ? e.awakeMinutes : '', val(m.effectiveSleepMin),
      val(e.bedtime), ...(() => { const ref = screenTimeReference(e); return ref ? [val(ref.date), ref.status] : ['', '']; })(),
      val(e.inBedTime), val(e.sleepAttempt), val(e.dayType), val(e.dayType ? e.dayTypeSource : null),
      tri(e.lateCaffeine), tri(e.alcohol), tri(e.stress), tri(e.unusualNight), val(e.lastScreenUseSource),
      ...PROVENANCE_FIELDS.map((f) => (e[f] == null || e[f] === '' ? '' : provenanceOf(e, f))),
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

// --- Statistica circolare degli orari (ANALYTICS_METHODOLOGY.md §4) ---
// Deviazione standard circolare: θ = 2π·t/1440; R = |media(e^{iθ})|;
// SD = √(−2 ln R) · 1440/2π minuti. Per orari concentrati coincide con la
// SD lineare, ma gestisce la mezzanotte (23:30 e 00:30 → 30 min).
// Se R ≈ 0 (orari sparsi su tutte le 24 ore) la SD non è definita: null.
export function circularStdMinutes(times) {
  if (!times || times.length === 0) return null;
  const { R } = circularMoments(times);
  if (R <= 1e-4) return null;
  return Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));
}
// Orario medio circolare (HH:MM) o null se non definito.
export function circularMeanHHMM(times) {
  if (!times || times.length === 0) return null;
  const { C, S, R } = circularMoments(times);
  if (R <= 1e-4) return null;
  const mins = Math.round((((Math.atan2(S, C) / (2 * Math.PI)) * 1440) % 1440 + 1440) % 1440) % 1440;
  return minutesToHHMM(mins);
}
function circularMoments(times) {
  const angles = times.map((t) => (timeToMinutesOfDay(t) / 1440) * 2 * Math.PI);
  const C = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length;
  const S = angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length;
  return { C, S, R: Math.sqrt(C * C + S * S) };
}

// --- Statistiche descrittive (ANALYTICS_METHODOLOGY.md §5) ---
// Quantile con interpolazione lineare tra i valori ordinati (metodo "tipo 7"
// di Hyndman e Fan, quello predefinito di R e dei fogli di calcolo).
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p, lo = Math.floor(h);
  return lo + 1 < sorted.length ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}
// Mediana da MEDIAN_MIN_NIGHTS valori, IQR da IQR_MIN_NIGHTS: sotto quelle
// soglie si mostrano i singoli valori, non un riassunto.
export function describe(values, days) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  return {
    n,
    values: v,
    median: n >= CFG.MEDIAN_MIN_NIGHTS ? quantile(v, 0.5) : null,
    q1: n >= CFG.IQR_MIN_NIGHTS ? quantile(v, 0.25) : null,
    q3: n >= CFG.IQR_MIN_NIGHTS ? quantile(v, 0.75) : null,
    min: n ? v[0] : null,
    max: n ? v[n - 1] : null,
    confidence: dataConfidence(n, days),
  };
}

// --- Regolarità degli orari (ANALYTICS_METHODOLOGY.md §4) ---
// Finestra di CALENDARIO: le notti con risveglio negli ultimi
// REGULARITY_WINDOW_DAYS giorni, oggi incluso. Notti usate: addormentamento
// e risveglio presenti e coerenti; escluse (con il motivo) le anomalie
// confermate, salvo includeOutliers. Nessun punteggio: due SD in minuti.
export function regularityForWindow(entries, endDate, { includeOutliers = false } = {}) {
  const days = CFG.REGULARITY_WINDOW_DAYS;
  const from = addDays(endDate, -(days - 1));
  const used = [], excluded = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const e = entries[date];
    if (!e || isEmpty(e.bedtime) || isEmpty(e.wakeTime)) continue;
    if (computeNightMetrics(e, date).durationError) { excluded.push({ date, reason: 'incoherent' }); continue; }
    if (e.is_outlier_bedtime && !includeOutliers) { excluded.push({ date, reason: 'outlier' }); continue; }
    used.push(e);
  }
  const n = used.length, min = CFG.REGULARITY_MIN_NIGHTS;
  const base = { from, to: endDate, days, n, min, excluded };
  if (n < min) return { shown: false, ...base };
  const onsets = used.map((e) => e.bedtime), wakes = used.map((e) => e.wakeTime);
  return {
    shown: true, ...base,
    sdOnset: circularStdMinutes(onsets), sdWake: circularStdMinutes(wakes),
    meanOnset: circularMeanHHMM(onsets), meanWake: circularMeanHHMM(wakes),
  };
}
