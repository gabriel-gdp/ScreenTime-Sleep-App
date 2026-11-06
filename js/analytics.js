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
      if (dur < 120 || dur > 840) result.durationWarning = 'Durata insolita (meno di 2 ore o più di 14): controlla gli orari.';
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
      else if (diff > 360) result.screenFreeWarning = 'Più di 6 ore senza schermo prima di dormire: controlla gli orari.';
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

// Etichette di NUMEROSITÀ (§0 della metodologia): dicono su quante notti si
// basa un valore, non quanto sia "affidabile" o "stabile". Con una sola
// settimana anche una media su 7 notti può cambiare molto la settimana
// dopo; per questo non si usano più parole come "confidenza".
export function dataConfidence(daysWithData, totalDays) {
  const ratio = daysWithData / totalDays;
  const high = { label: 'Settimana quasi completa', level: 'high' };
  const mid = { label: 'Settimana parziale', level: 'mid' };
  const low = { label: 'Troppo poche notti', level: 'low' };
  if (totalDays === 7) {
    if (daysWithData >= 6) return high;
    if (daysWithData >= 3) return mid;
    return low;
  }
  if (ratio >= 0.8) return high;
  if (ratio >= 0.33) return mid;
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
  const stats = Object.fromEntries(SUMMARY_METRICS.map((k) => {
    const v = values[k];
    return [k, {
      n: v.length,
      mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null,
      // Valori estremi della settimana: rendono visibile quanto variano le
      // singole notti attorno alla media, senza formule aggiuntive.
      min: v.length ? Math.min(...v) : null,
      max: v.length ? Math.max(...v) : null,
      confidence: dataConfidence(v.length, days),
    }];
  }));

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

  return { dates, days, nights, nightsWithData, coverage: dataConfidence(nightsWithData, days), stats, excluded, best, worst };
}

// Confronto tra le ultime 7 notti e le 7 precedenti. La differenza viene
// calcolata solo se entrambe le finestre hanno almeno MIN_N_FOR_DELTA
// valori per quella metrica: con 1–2 notti per parte un "+40 min" sarebbe
// rumore presentato come cambiamento.
export const MIN_N_FOR_DELTA = 3;

export function weeklyComparison(entries, endDate, opts = {}) {
  const current = periodSummary(entries, endDate, 7, opts);
  const previous = periodSummary(entries, addDays(endDate, -7), 7, opts);
  const deltas = Object.fromEntries(SUMMARY_METRICS.map((k) => {
    const c = current.stats[k], p = previous.stats[k];
    const ok = c.n >= MIN_N_FOR_DELTA && p.n >= MIN_N_FOR_DELTA;
    return [k, ok ? c.mean - p.mean : null];
  }));
  return { current, previous, deltas };
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

// Regolarità su una finestra di CALENDARIO (le notti con risveglio negli
// ultimi `days` giorni, oggi incluso), non sulle ultime N notti registrate:
// con dati radi, "ultime 28 notti" poteva mescolare notti lontane mesi.
export const CONSISTENCY_MIN_NIGHTS = 5;
export function consistencyForWindow(nights, endDate, days = 28) {
  const start = addDays(endDate, -(days - 1));
  const inWindow = nights.filter((n) => n.date >= start && n.date <= endDate);
  const usable = inWindow.filter((n) => n.bedtime && n.wakeTime);
  const excluded = inWindow.filter((n) => n.excludedSleep).length;
  if (usable.length < CONSISTENCY_MIN_NIGHTS) return { shown: false, n: usable.length, excluded, days };
  return {
    shown: true, n: usable.length, excluded, days,
    score: consistencyScore(usable.map((n) => n.bedtime), usable.map((n) => n.wakeTime)),
  };
}

// Associazioni (§6). `direction` dice se a valori più alti della prima
// variabile corrispondono in media valori più alti (+) o più bassi (−)
// della seconda: senza, l'etichetta "Segnale moderato" non si interpreta.
export const CORRELATION_PAIRS = [
  { x: 'screenTimeTotal', y: 'durationMin' },
  { x: 'screenTimeTotal', y: 'quality' },
  { x: 'screenFreeMin', y: 'durationMin' },
  { x: 'screenFreeMin', y: 'quality' },
  // Risvegli (solo notti in cui sono stati indicati). Coppie scelte per non
  // essere legate per costruzione: "minuti svegli e sonno effettivo"
  // sarebbe negativa per definizione e non è inclusa.
  { x: 'awakenings', y: 'quality' },
  { x: 'awakeMinutes', y: 'quality' },
  { x: 'awakenings', y: 'durationMin' },
  { x: 'effectiveSleepMin', y: 'quality' },
];
// Per le coppie NON mostrate, `reason` dice perché: 'n' (meno di 14 notti),
// 'variance' (una delle due variabili non varia mai), 'weak' (|r| < 0,2:
// nessuna associazione LINEARE rilevabile, che non esclude altri tipi di
// relazione). `from`/`to`: periodo delle notti usate.
export function correlationResults(nights) {
  return CORRELATION_PAIRS.map(({ x, y }) => {
    const used = nights.filter((n) => n[x] != null && n[y] != null);
    const pairs = used.map((n) => [n[x], n[y]]);
    const r = pearsonR(pairs);
    const sig = correlationSignal(pairs.length, r);
    let reason = null;
    if (!sig.shown) reason = pairs.length < 14 ? 'n' : r == null ? 'variance' : 'weak';
    return {
      x, y, ...sig, reason,
      direction: sig.shown ? (sig.r > 0 ? 'positive' : 'negative') : null,
      from: used.length ? used[0].date : null,
      to: used.length ? used[used.length - 1].date : null,
    };
  });
}

// Notti migliori (§8). Soglia = 75° percentile della qualità personale
// (rango più vicino) E almeno 7/10; le notti a pari merito con la soglia
// entrano TUTTE nel gruppo, così il risultato non dipende dall'ordine dei
// dati. Minimo 8 notti per gruppo — anche per "le altre" e per ciascuna
// metrica confrontata: con 2–3 valori per parte Cohen's d sarebbe rumore.
export const OPTIMAL_MIN_TOTAL = 30;
export const OPTIMAL_MIN_GROUP = 8;
export function optimalZone(nights) {
  const rated = nights.filter((n) => n.quality != null);
  if (rated.length < OPTIMAL_MIN_TOTAL) return { shown: false, reason: 'total', n: rated.length };
  const asc = rated.map((n) => n.quality).sort((a, b) => a - b);
  const p75 = asc[Math.ceil(0.75 * asc.length) - 1];
  const threshold = Math.max(p75, 7);
  const best = rated.filter((n) => n.quality >= threshold);
  const rest = rated.filter((n) => n.quality < threshold);
  const base = { n: rated.length, threshold, bestN: best.length, restN: rest.length };
  if (best.length < OPTIMAL_MIN_GROUP) return { shown: false, reason: 'best', ...base };
  if (rest.length < OPTIMAL_MIN_GROUP) return { shown: false, reason: 'rest', ...base };
  const results = ['durationMin', 'effectiveSleepMin', 'awakeMinutes', 'screenFreeMin', 'screenTimeTotal'].map((key) => {
    const g1 = best.map((n) => n[key]).filter((v) => v != null);
    const g2 = rest.map((n) => n[key]).filter((v) => v != null);
    if (g1.length < OPTIMAL_MIN_GROUP || g2.length < OPTIMAL_MIN_GROUP) return { key, shown: false, reason: 'n', n1: g1.length, n2: g2.length };
    const res = cohensD(g1, g2);
    if (!res) return { key, shown: false, reason: 'variance', n1: g1.length, n2: g2.length };
    const signalLabel = effectLabel(Math.abs(res.d));
    return { key, shown: !!signalLabel, reason: signalLabel ? null : 'small', signalLabel, m1: res.m1, m2: res.m2, d: res.d, n1: g1.length, n2: g2.length };
  });
  return { shown: true, ...base, results };
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
      awakeningsKnown(e) ? e.awakenings : '', awakeningsKnown(e) ? e.awakeMinutes : '', val(m.effectiveSleepMin),
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
