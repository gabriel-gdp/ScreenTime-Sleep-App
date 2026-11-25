// trends.js — analisi descrittive approvate nei documenti di ricerca e
// attivate il 23/11/2026 (docs/ANALYTICS_METHODOLOGY.md §16):
//   SRI da diario          STATISTICAL_VALIDATION §3 (Phillips 2017)
//   L3 andamento           media mobile centrata a 7 notti, pendenza di Theil–Sen (§13)
//   L4 notti insolite      mediana e MAD delle 28 notti precedenti, k = 3 (§12)
//   variabilità abituale   entro/fuori 1 DS delle medie settimanali, ≥ 8 settimane (§13)
// Solo descrizioni: nessuna esclusione automatica, nessun test, nessun
// punteggio, nessuna soglia "buono/cattivo". Funzioni pure; non toccano
// P1–P3 né le statistiche esistenti.

import {
  computeNightMetrics, combineDateTime, resolveBefore, addDays, circularDiffMinutes, hhmmToMinutes, minutesToHHMM,
  quantile, PROVENANCE_SETS, RECORDED_PROVENANCE,
} from './analytics.js';
import { circularMedianHHMM } from './inference.js';
import { provenanceOf } from './record.js';
import { ANALYSIS_CONFIG as CFG } from './config.js';

const isEmpty = (v) => v === '' || v == null;
const median = (arr) => { const v = [...arr].sort((a, b) => a - b); return quantile(v, 0.5); };

// ---------- SRI da diario ----------
// Per ogni notte valida si ricostruisce lo stato (sonno/veglia) minuto per
// minuto nella giornata che va dalle 12:00 del giorno prima alle 12:00 del
// giorno del risveglio. Per ogni coppia di notti consecutive valide si
// confrontano i 1.440 minuti alla stessa ora dell'orologio:
// P = quota di minuti concordanti, SRI = 200 · (P − ½).
// Notti valide: come la regolarità (addormentamento e risveglio coerenti,
// registrati all'epoca, non anomale né insolite). Senza risvegli notturni né
// sonnellini (non raccolti con un orario).
export function sriFromDiary(entries, endDate, { provenance = 'recorded', includeOutliers = false } = {}) {
  const allowed = PROVENANCE_SETS[provenance] || RECORDED_PROVENANCE;
  const days = CFG.SRI_WINDOW_DAYS;
  const from = addDays(endDate, -(days - 1));
  const valid = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const e = entries[date];
    if (!e || isEmpty(e.bedtime) || isEmpty(e.wakeTime)) continue;
    if (e.unusualNight === true || (e.is_outlier_bedtime && !includeOutliers)) continue;
    if (!allowed.includes(provenanceOf(e, 'bedtime')) || !allowed.includes(provenanceOf(e, 'wakeTime'))) continue;
    const m = computeNightMetrics(e, date);
    if (m.durationError || m.durationMin == null) continue;
    const wake = combineDateTime(date, e.wakeTime, false);
    valid.set(date, { start: resolveBefore(wake, e.bedtime).getTime(), end: wake.getTime() });
  }
  const intervals = [...valid.values()];
  const asleep = (ms) => intervals.some((iv) => ms >= iv.start && ms < iv.end);
  const state = (date) => {
    const [y, mo, d] = date.split('-').map(Number);
    const out = new Uint8Array(1440);
    for (let i = 0; i < 1440; i++) out[i] = asleep(new Date(y, mo - 1, d - 1, 12, i).getTime()) ? 1 : 0;
    return out;
  };
  let pairs = 0, same = 0;
  const cache = new Map();
  const st = (d) => { if (!cache.has(d)) cache.set(d, state(d)); return cache.get(d); };
  for (let i = days - 1; i >= 1; i--) {
    const a = addDays(endDate, -i), b = addDays(endDate, -i + 1);
    if (!valid.has(a) || !valid.has(b)) continue;
    const sa = st(a), sb = st(b);
    for (let k = 0; k < 1440; k++) if (sa[k] === sb[k]) same++;
    pairs++;
  }
  const out = { from, to: endDate, days, nights: valid.size, pairs, min: CFG.SRI_MIN_PAIRS, sri: null };
  if (pairs >= CFG.SRI_MIN_PAIRS) out.sri = Math.round(200 * (same / (pairs * 1440) - 0.5));
  return out;
}

// ---------- L3–L4: andamento di una misura ----------
export const TREND_VARIABLES = {
  duration: { label: 'Intervallo di sonno', kind: 'duration', fields: ['bedtime', 'wakeTime'], get: (e, m) => m.durationMin },
  effective: { label: 'Sonno effettivo stimato', kind: 'duration', fields: ['bedtime', 'wakeTime', 'awakenings'], get: (e, m) => m.effectiveSleepMin },
  onset: { label: 'Addormentamento', kind: 'clock', fields: ['bedtime'], get: (e) => e.bedtime },
  attempt: { label: 'Tentativo di dormire', kind: 'clock', fields: ['sleepAttempt'], get: (e, m) => (m.attemptError ? null : e.sleepAttempt) },
  wake: { label: 'Risveglio', kind: 'clock', fields: ['wakeTime'], get: (e) => e.wakeTime },
  latency: { label: 'Tempo per addormentarsi', kind: 'duration', fields: ['sleepAttempt', 'bedtime'], get: (e, m) => m.latencyMin },
};

function rawSeries(entries, variable, from, to, includeOutliers = false) {
  const def = TREND_VARIABLES[variable];
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const e = entries[d];
    if (!e) continue;
    // Come nel resto dell'app: le anomalie confermate sugli orari sono escluse,
    // salvo "Includi le anomalie". Le notti insolite le toglie il filtro delle descrizioni.
    if (e.is_outlier_bedtime && !includeOutliers) continue;
    const m = computeNightMetrics(e, d);
    if (def.fields.some((f) => isEmpty(e[f]))) continue;
    if (m.durationError && ['duration', 'effective', 'onset', 'wake'].includes(variable)) continue;
    const v = def.get(e, m);
    if (v == null || v === '') continue;
    const recorded = def.fields.every((f) => RECORDED_PROVENANCE.includes(provenanceOf(e, f)));
    out.push({ date: d, raw: v, recorded });
  }
  return out;
}

// Valori numerici confrontabili: per gli orari, minuti con segno rispetto
// alla mediana circolare del periodo (gestisce la mezzanotte).
function numeric(points, kind) {
  if (kind !== 'clock') return { center: null, pts: points.map((p) => ({ ...p, y: p.raw })) };
  const center = circularMedianHHMM(points.map((p) => p.raw));
  return { center, pts: points.map((p) => ({ ...p, y: circularDiffMinutes(center, p.raw) })) };
}
export const yToLabel = (y, kind, center) => (kind === 'clock' ? minutesToHHMM(((hhmmToMinutes(center) + Math.round(y)) % 1440 + 1440) % 1440) : Math.round(y));

export const dayIndex = (d) => Math.round(Date.UTC(...d.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))) / 86400000);

// Pendenza di Theil–Sen: mediana delle pendenze tra tutte le coppie di punti.
export function theilSen(points) {
  const s = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const dx = points[j].x - points[i].x;
    if (dx !== 0) s.push((points[j].y - points[i].y) / dx);
  }
  return s.length ? median(s) : null;
}

// MAD delle notti precedenti (finestra di calendario di MAD_WINDOW_NIGHTS
// giorni prima della notte, almeno MAD_MIN_VALUES valori). Per gli orari la
// distanza è circolare rispetto alla mediana circolare della finestra.
function madFlag(history, value, kind) {
  if (history.length < CFG.MAD_MIN_VALUES) return null;
  let center, dev;
  if (kind === 'clock') {
    const c = circularMedianHHMM(history);
    const offs = history.map((h) => circularDiffMinutes(c, h));
    const madv = median(offs.map((o) => Math.abs(o - median(offs))));
    center = median(offs);
    dev = circularDiffMinutes(c, value) - center;
    if (!madv) return { flag: false, mad: 0 };
    return { flag: Math.abs(dev) > CFG.MAD_K * 1.4826 * madv, mad: madv };
  }
  center = median(history);
  const madv = median(history.map((h) => Math.abs(h - center)));
  if (!madv) return { flag: false, mad: 0 };
  dev = value - center;
  return { flag: Math.abs(dev) > CFG.MAD_K * 1.4826 * madv, mad: madv };
}

export function trendSeries(entries, variable, endDate, days, { includeOutliers = false } = {}) {
  const def = TREND_VARIABLES[variable];
  if (!def) return null;
  const from = addDays(endDate, -(days - 1));
  // Storico più lungo per MAD e variabilità abituale.
  const historyFrom = addDays(endDate, -(Math.max(days, CFG.VARIABILITY_WINDOW_WEEKS * 7 + 7, CFG.MAD_WINDOW_NIGHTS + days) - 1));
  const all = rawSeries(entries, variable, historyFrom, endDate, includeOutliers);
  const byDate = new Map(all.map((p) => [p.date, p]));
  const inPeriod = all.filter((p) => p.date >= from);
  const { center, pts } = numeric(inPeriod, def.kind);
  const points = pts.map((p) => ({ ...p, x: dayIndex(p.date) }));
  // L4: notti molto diverse dalle 28 precedenti.
  points.forEach((p) => {
    const hist = [];
    for (let k = 1; k <= CFG.MAD_WINDOW_NIGHTS; k++) { const h = byDate.get(addDays(p.date, -k)); if (h) hist.push(h.raw); }
    const r = madFlag(hist, p.raw, def.kind);
    p.unusual = !!(r && r.flag);
    p.madAvailable = !!r;
  });
  // L3: media mobile centrata (±3 notti di calendario, almeno ROLLING_MIN_VALUES valori).
  const half = Math.floor(CFG.ROLLING_WINDOW_NIGHTS / 2);
  const rolling = points.map((p) => {
    const win = points.filter((q) => Math.abs(q.x - p.x) <= half);
    return { date: p.date, x: p.x, y: win.length >= CFG.ROLLING_MIN_VALUES ? win.reduce((s, q) => s + q.y, 0) / win.length : null, n: win.length };
  });
  // Pendenza descrittiva.
  const slope = points.length >= CFG.THEIL_SEN_MIN_NIGHTS ? theilSen(points) : null;
  return {
    variable, label: def.label, kind: def.kind, from, to: endDate, days, center,
    points, rolling,
    n: points.length,
    nRecorded: points.filter((p) => p.recorded).length,
    nUnusual: points.filter((p) => p.unusual).length,
    madAvailable: points.some((p) => p.madAvailable),
    slopePer30: slope == null ? null : slope * 30,
    slopeMin: CFG.THEIL_SEN_MIN_NIGHTS,
    variability: usualVariability(all, def.kind, endDate),
  };
}

// Confronto con la variabilità abituale: media delle ultime 7 notti
// rispetto alle medie delle settimane precedenti (fino a
// VARIABILITY_WINDOW_WEEKS, almeno VARIABILITY_HISTORY_WEEKS con almeno
// ROLLING_MIN_VALUES valori ciascuna). "Entro" se la differenza dalla media
// delle medie settimanali non supera 1 deviazione standard di quelle medie.
// Mai "migliorato" o "peggiorato".
export function usualVariability(all, kind, endDate) {
  const center = kind === 'clock' && all.length ? circularMedianHHMM(all.map((p) => p.raw)) : null;
  const y = (p) => (kind === 'clock' ? circularDiffMinutes(center, p.raw) : p.raw);
  const weekVals = (k) => {
    const to = addDays(endDate, -7 * k), from = addDays(to, -6);
    return all.filter((p) => p.date >= from && p.date <= to).map(y);
  };
  const cur = weekVals(0);
  const weeks = [];
  for (let k = 1; k <= CFG.VARIABILITY_WINDOW_WEEKS; k++) { const v = weekVals(k); if (v.length >= CFG.ROLLING_MIN_VALUES) weeks.push(v.reduce((s, x) => s + x, 0) / v.length); }
  const res = { weeks: weeks.length, min: CFG.VARIABILITY_HISTORY_WEEKS, currentN: cur.length, status: null };
  if (cur.length < CFG.ROLLING_MIN_VALUES) { res.status = 'few_current'; return res; }
  if (weeks.length < CFG.VARIABILITY_HISTORY_WEEKS) { res.status = 'few_weeks'; return res; }
  const mean = weeks.reduce((s, x) => s + x, 0) / weeks.length;
  const sd = Math.sqrt(weeks.reduce((s, x) => s + (x - mean) ** 2, 0) / (weeks.length - 1));
  const current = cur.reduce((s, x) => s + x, 0) / cur.length;
  res.status = Math.abs(current - mean) <= sd ? 'within' : 'outside';
  res.current = current; res.mean = mean; res.sd = sd; res.diff = current - mean; res.center = center;
  return res;
}
