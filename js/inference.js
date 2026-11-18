// inference.js — le tre domande principali P1–P3 (Fase 4). Funzioni pure.
// Specifica operativa: docs/ANALYTICS_METHODOLOGY.md §13 (fa fede).
// Documenti di ricerca di riferimento (non fonti verificate in automatico):
// docs/research/FINAL_ANALYTICS_SPEC.md §2 e §7,
// docs/research/STATISTICAL_VALIDATION.md §7 e §17.
//
// Ogni domanda confronta le notti con e senza un'esposizione sì/no:
//   P1  ultimo utilizzo in [H − 60 min, H] → orario del tentativo
//       (escluse le notti con l'ultimo utilizzo dopo il tentativo)
//   P2  ultimo utilizzo dopo il tentativo → latenza dopo l'ultimo utilizzo
//   P3  ultimo utilizzo in [H − 60 min, H] → sonno effettivo stimato
//       (ammesso l'utilizzo dopo il tentativo, purché prima dell'addormentamento)
// Criteri di inclusione specifici per domanda (QUESTIONS[].exclusion):
// ogni notte esclusa è contata una sola volta, al primo criterio non
// soddisfatto (ordine in analyzeQuestion).
// Metodo (identico): residui rispetto alla media mobile di ±14 notti
// (almeno 15 valori), centratura per tipo di giorno, differenza tra le
// medie, errore standard corretto per l'autocorrelazione (n_eff), intervallo
// al 95%, correzione di Benjamini–Hochberg sulle tre domande. Il p-value
// serve solo alla correzione e non viene mai mostrato.
// Il risultato è un'ASSOCIAZIONE osservata: nessuna formula causale.
import { ANALYSIS_CONFIG as CFG } from './config.js';
import { computeNightMetrics, addDays, hhmmToMinutes, minutesToHHMM, quantile, PROVENANCE_SETS } from './analytics.js';
import { provenanceOf } from './record.js';

const isEmpty = (v) => v === '' || v == null;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const DAY = 86400000;
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
// Minuti dopo le 12:00 (orari serali e notturni su una scala continua).
export const afterNoon = (hhmm) => (hhmmToMinutes(hhmm) - 720 + 1440) % 1440;
export const round5 = (x) => Math.round(x / 5) * 5;

// ---------- Orario abituale del tentativo H ----------
// Mediana circolare dei tentativi delle HABITUAL_WINDOW_NIGHTS notti
// PRECEDENTI (esclusa quella in esame), con almeno HABITUAL_MIN_VALUES
// valori. Notti usate: tentativo presente e coerente, provenienza ammessa,
// nessuna anomalia confermata, notte non insolita. Le anomalie confermate
// sono escluse SEMPRE, anche con "Includi le anomalie" (decisione del
// 18/11/2026: H è un riferimento abituale robusto). Mediana circolare: il
// valore osservato che minimizza la somma delle distanze sul cerchio (a
// parità, il più precoce dopo le 12:00).
export function circularMedianHHMM(times) {
  if (!times.length) return null;
  const mins = times.map(hhmmToMinutes);
  const arc = (a, b) => { const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d); };
  let best = null, bestCost = Infinity;
  [...new Set(mins)].sort((a, b) => ((a - 720 + 1440) % 1440) - ((b - 720 + 1440) % 1440)).forEach((c) => {
    const cost = mins.reduce((s, m) => s + arc(c, m), 0);
    if (cost < bestCost - 1e-9) { bestCost = cost; best = c; }
  });
  return minutesToHHMM(best);
}
// Cache facoltativa per un singolo calcolo (analyzeAll): metriche delle
// notti e H per data e provenienza. Non cambia i risultati.
export function newCache() { return { metrics: new Map(), habitual: new Map() }; }
function metricsOf(cache, e, date) {
  if (!cache) return computeNightMetrics(e, date);
  if (!cache.metrics.has(date)) cache.metrics.set(date, computeNightMetrics(e, date));
  return cache.metrics.get(date);
}
export function habitualAttempt(entries, date, { provenance = 'recorded', cache = null } = {}) {
  const key = `${date}|${provenance}`;
  if (cache && cache.habitual.has(key)) return cache.habitual.get(key);
  const allowed = PROVENANCE_SETS[provenance];
  const times = [];
  for (let i = 1; i <= CFG.HABITUAL_WINDOW_NIGHTS; i++) {
    const d = addDays(date, -i);
    const e = entries[d];
    if (!e || isEmpty(e.sleepAttempt) || e.is_outlier_bedtime || e.unusualNight === true) continue;
    if (!allowed.includes(provenanceOf(e, 'sleepAttempt'))) continue;
    if (metricsOf(cache, e, d).attemptError) continue;
    times.push(e.sleepAttempt);
  }
  const out = { time: times.length >= CFG.HABITUAL_MIN_VALUES ? circularMedianHHMM(times) : null, n: times.length, min: CFG.HABITUAL_MIN_VALUES };
  if (cache) cache.habitual.set(key, out);
  return out;
}
// Esposizione di P1 e P3 (Fase 4.1): ultimo utilizzo L nell'intervallo
// circolare [H − 60 min, H], ESTREMI INCLUSI. d = minuti da L a H sul
// cerchio di 24 ore, (H − L) mod 1440: esposto ⇔ 0 ≤ d ≤ 60. Un utilizzo
// dopo H ha d vicino a 1440 e non è esposto. Funziona attraverso la
// mezzanotte (H = 00:00 → 23:00…00:00). È un'ora sull'orologio, non 60
// minuti reali: nelle notti del cambio d'ora la durata reale differisce.
// Indicatore sì/no basato sull'orario dell'ultimo utilizzo: non misura i
// minuti di utilizzo.
export function inPresleepWindow(lastUse, H) {
  const d = ((hhmmToMinutes(H) - hhmmToMinutes(lastUse)) % 1440 + 1440) % 1440;
  return d <= CFG.PRESLEEP_WINDOW_MIN;
}

// ---------- Le tre domande ----------
// exclusion(e, m): motivo di esclusione per coerenza, specifico della
// domanda (solo le variabili che la domanda usa), oppure null.
export const QUESTIONS = [
  {
    id: 'P1', habitual: true,
    fields: ['lastScreenUse', 'sleepAttempt'],
    title: "Ultimo utilizzo nell'ora prima del solito e ora in cui provi a dormire",
    question: "Nelle notti in cui l'ultimo utilizzo dello schermo cade nell'ora prima del tuo solito orario di riposo, provi a dormire a un orario diverso?",
    exposure: "l'ultimo utilizzo dello schermo nell'ora prima del tuo solito orario di riposo",
    groupYes: "con l'ultimo utilizzo in quell'ora", groupNo: "con l'ultimo utilizzo prima di quell'ora o dopo il tuo solito orario",
    fieldsText: "ultimo utilizzo dello schermo e ora in cui hai provato a dormire",
    // Tentativo coerente con l'addormentamento (solo se c'è); ultimo
    // utilizzo non dopo il tentativo (uguale = ammesso).
    exclusion: (e, m) => (m.attemptError ? 'incoherent' : m.screenToAttemptMin == null ? 'incoherent' : m.screenToAttemptMin < 0 ? 'screenAfterAttempt' : null),
    outcome: (e) => afterNoon(e.sleepAttempt),
    outcomeText: "l'orario in cui hai iniziato a provare a dormire (minuti)",
  },
  {
    id: 'P2', habitual: false,
    fields: ['lastScreenUse', 'sleepAttempt', 'bedtime'],
    title: 'Schermo dopo aver provato a dormire e tempo per addormentarti',
    question: 'Nelle notti in cui usi lo schermo dopo aver provato a dormire, ci metti più tempo ad addormentarti dopo averlo lasciato?',
    exposure: "l'uso dello schermo dopo aver provato a dormire",
    groupYes: 'con uso dopo il tentativo', groupNo: 'senza uso dopo il tentativo',
    fieldsText: "ultimo utilizzo, ora in cui hai provato a dormire e addormentamento",
    // Tentativo ≤ addormentamento e ultimo utilizzo ≤ addormentamento.
    exclusion: (e, m) => (m.attemptError || m.screenFreeError || m.latencyAfterUseMin == null ? 'incoherent' : null),
    outcome: (e, m) => m.latencyAfterUseMin,
    outcomeText: "il tempo per addormentarti dopo l'ultimo utilizzo (minuti, stima soggettiva)",
  },
  {
    id: 'P3', habitual: true,
    fields: ['lastScreenUse', 'bedtime', 'wakeTime', 'awakenings', 'awakeMinutes'],
    title: "Ultimo utilizzo nell'ora prima del solito e sonno effettivo",
    question: "Nelle notti in cui l'ultimo utilizzo dello schermo cade nell'ora prima del tuo solito orario di riposo, quanto hai dormito è diverso? (Sonno effettivo stimato: dall'addormentamento al risveglio, meno i minuti svegli. Non è il tempo per addormentarti.)",
    exposure: "l'ultimo utilizzo dello schermo nell'ora prima del tuo solito orario di riposo",
    groupYes: "con l'ultimo utilizzo in quell'ora", groupNo: "con l'ultimo utilizzo prima di quell'ora o dopo il tuo solito orario",
    fieldsText: 'ultimo utilizzo, addormentamento, risveglio e risvegli notturni',
    // Intervallo valido e minuti svegli < intervallo; ultimo utilizzo non
    // dopo l'addormentamento. Il tentativo della notte non è usato.
    exclusion: (e, m) => (m.durationError || m.effectiveError || m.effectiveSleepMin == null ? 'incoherent' : m.screenFreeError ? 'screenAfterOnset' : null),
    outcome: (e, m) => m.effectiveSleepMin,
    outcomeText: "il sonno effettivo stimato (minuti: dall'addormentamento al risveglio, meno i minuti svegli)",
  },
];
const Q = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// ---------- Metodo del confronto (docs/research/STATISTICAL_VALIDATION.md §7) ----------
// rows: [{ date, y, e (bool), type }] in ordine di data.
function lag1(values, days) {
  const n = values.length;
  const m = mean(values);
  const den = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  let num = 0, pairs = 0;
  for (let i = 1; i < n; i++) if (days[i] - days[i - 1] === 1) { num += (values[i] - m) * (values[i - 1] - m); pairs++; }
  if (pairs < 3 || den <= 0) return { rho: 0, pairs };
  return { rho: Math.max(-1, Math.min(1, (num / pairs) / den)), pairs };
}
function normalCdf(x) {
  // Abramowitz–Stegun 7.1.26 (errore < 1,5·10⁻⁷).
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
export function compareGroups(rows) {
  const H = CFG.RESIDUAL_HALF_WINDOW_NIGHTS;
  // 1. Residui rispetto alla media delle notti incluse entro ±H giorni.
  const kept = [];
  const dayIdx = rows.map((r) => dayDiff('2000-01-01', r.date));
  rows.forEach((r, i) => {
    const win = rows.filter((o, j) => Math.abs(dayIdx[j] - dayIdx[i]) <= H);
    if (win.length < CFG.RESIDUAL_MIN_VALUES) return;
    kept.push({ ...r, ry: r.y - mean(win.map((o) => o.y)), re: (r.e ? 1 : 0) - mean(win.map((o) => (o.e ? 1 : 0))), i });
  });
  const droppedWindow = rows.length - kept.length;
  // 2. Centratura per tipo di giorno.
  const center = (k) => {
    const byType = {};
    kept.forEach((r) => { (byType[r.type] = byType[r.type] || []).push(r[k]); });
    const mt = Object.fromEntries(Object.entries(byType).map(([t, v]) => [t, mean(v)]));
    return kept.map((r) => r[k] - mt[r.type]);
  };
  const ry = center('ry'), re = center('re');
  const n = kept.length;
  const g1 = ry.filter((_, i) => kept[i].e), g0 = ry.filter((_, i) => !kept[i].e);
  const out = { n, n1: g1.length, n0: g0.length, droppedWindow, dates: kept.map((r) => r.date) };
  if (g1.length < 2 || g0.length < 2) return out;
  // 3–4. Differenza e errore standard con varianza combinata.
  const v = (a) => { const m = mean(a); return a.reduce((s, u) => s + (u - m) ** 2, 0) / (a.length - 1); };
  const delta = mean(g1) - mean(g0);
  const sp = Math.sqrt(((g1.length - 1) * v(g1) + (g0.length - 1) * v(g0)) / (n - 2));
  const se0 = sp * Math.sqrt(1 / g1.length + 1 / g0.length);
  // Varianza nulla o non finita (Fase 4.1): l'incertezza non è stimabile.
  // Nessun intervallo, nessun p-value, nessuna correzione: stato esplicito.
  // Nessun epsilon: una varianza piccola ma reale resta inferenza ordinaria.
  if (!Number.isFinite(delta) || !Number.isFinite(sp) || sp === 0 || !(se0 > 0)) {
    return { ...out, degenerate: !Number.isFinite(delta) || !Number.isFinite(sp) ? 'non_finite' : 'zero_variance' };
  }
  // 5–7. Autocorrelazione lag-1 su coppie di notti consecutive, n_eff.
  const days = kept.map((r) => dayIdx[r.i]);
  const rE = lag1(re, days), rR = lag1(ry, days);
  const prod = rE.rho * rR.rho;
  const neff = prod <= -1 ? n : Math.max(3, Math.min(n, (n * (1 - prod)) / (1 + prod)));
  const se = se0 * Math.sqrt(n / neff);
  if (!Number.isFinite(se) || se <= 0) return { ...out, degenerate: 'non_finite' };
  // 8. Intervallo al 95% e p (solo per la correzione).
  const z = delta / se;
  return { ...out, delta, se0, se, neff, rhoE: rE.rho, rhoR: rR.rho, pairs: rE.pairs, lo: delta - 1.96 * se, hi: delta + 1.96 * se, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

// ---------- Una domanda sui dati del diario ----------
// opts.provenance: 'recorded' (principale) | 'prospective' | 'all';
// opts.includeOutliers: notti con anomalie confermate sugli orari
//   (is_outlier_bedtime) incluse, come scelto nell'interfaccia. Non vale
//   per H. L'anomalia sul totale di Screen Time (is_outlier_screen_time)
//   non riguarda P1–P3 e non esclude mai la notte;
// opts.includeUnusual: notti insolite incluse (sensibilità c);
// opts.confoundersFalse: solo notti con caffeina, alcol e stress = no (d).
// Esclusioni mutuamente esclusive, nell'ordine: missing → incoherent /
// screenAfterAttempt (P1) / screenAfterOnset (P3) → provenance → unusual →
// outlier → noH (P1, P3) → confounder (d) → noDayType → noWindow.
// counts.considered = counts.eligible + somma dei motivi.
export const EXCLUSION_REASONS = ['missing', 'incoherent', 'screenAfterAttempt', 'screenAfterOnset', 'provenance', 'unusual', 'outlier', 'noH', 'confounder', 'noDayType', 'noWindow'];
// Decisione per una singola notte: { reason } (motivo di esclusione) oppure
// { reason: null, y, exposed, type, m }. 'noDayType' arriva dopo che la
// notte è contata tra le candidate (serve alla quota del tipo di giorno).
export function nightForQuestion(entries, qid, date, { provenance = 'recorded', includeOutliers = false, includeUnusual = false, confoundersFalse = false, cache = null } = {}) {
  const q = Q[qid];
  const allowed = PROVENANCE_SETS[provenance];
  const e = entries[date];
  if (!e || q.fields.some((f) => isEmpty(e[f]))) return { reason: 'missing' };
  const m = metricsOf(cache, e, date);
  const why = q.exclusion(e, m);
  if (why) return { reason: why };
  const y = q.outcome(e, m);
  if (y == null || !Number.isFinite(y)) return { reason: 'incoherent' };
  if (q.fields.some((f) => !allowed.includes(provenanceOf(e, f)))) return { reason: 'provenance' };
  if (e.unusualNight === true && !includeUnusual) return { reason: 'unusual' };
  if (e.is_outlier_bedtime && !includeOutliers) return { reason: 'outlier' };
  let exposed, habitual = null;
  if (q.habitual) {
    habitual = habitualAttempt(entries, date, { provenance, cache });
    if (!habitual.time) return { reason: 'noH', habitual };
    exposed = inPresleepWindow(e.lastScreenUse, habitual.time);
  } else exposed = m.screenAfterAttempt;
  if (confoundersFalse && !(e.lateCaffeine === false && e.alcohol === false && e.stress === false)) return { reason: 'confounder' };
  if (!e.dayType) return { reason: 'noDayType', candidate: true };
  return { reason: null, y, exposed, type: e.dayType, m, habitual };
}
export function analyzeQuestion(entries, qid, { endDate = null, provenance = 'recorded', includeOutliers = false, includeUnusual = false, confoundersFalse = false, cache = null } = {}) {
  const q = Q[qid];
  const dates = Object.keys(entries).sort().filter((d) => !endDate || d <= endDate);
  const counts = Object.fromEntries(EXCLUSION_REASONS.map((k) => [k, 0]));
  counts.considered = dates.length;
  counts.candidates = 0;
  const rows = [];
  const extra = [];
  const opts = { provenance, includeOutliers, includeUnusual, confoundersFalse, cache };
  dates.forEach((date) => {
    const x = nightForQuestion(entries, qid, date, opts);
    if (x.reason === 'noDayType') { counts.candidates++; counts.noDayType++; return; }
    if (x.reason) { counts[x.reason]++; return; }
    counts.candidates++;
    rows.push({ date, y: x.y, e: x.exposed, type: x.type });
    if (qid === 'P2') extra.push({ date, e: x.exposed, total: x.m.latencyMin });
  });
  const kept = rows.length;
  counts.eligible = kept;
  const dayTypeShare = counts.candidates ? kept / counts.candidates : null;
  // H attuale (per la notte dopo endDate): orario e notti valide usate.
  const last = endDate || dates[dates.length - 1];
  const habitualNow = q.habitual && last ? habitualAttempt(entries, addDays(last, 1), { provenance, cache }) : null;
  const base = { id: qid, provenance, includeOutliers, counts, kept, dayTypeShare, min: CFG.N_EFF_MIN, habitualNow };
  const shareOk = dayTypeShare != null && dayTypeShare >= CFG.DAYTYPE_KNOWN_MIN_SHARE;
  if (counts.candidates >= CFG.N_EFF_MIN && !shareOk) return { ...base, status: 'daytype' };
  if (kept < CFG.N_EFF_MIN) return { ...base, status: 'few', n: kept };
  if (!shareOk) return { ...base, status: 'daytype' };
  const c = compareGroups(rows);
  counts.noWindow = c.droppedWindow;
  counts.eligible = c.n;
  const usedDates = new Set(c.dates);
  const res = { ...base, ...c, from: c.dates[0], to: c.dates[c.dates.length - 1] };
  delete res.dates;
  if (c.n < CFG.N_EFF_MIN) return { ...res, status: 'few' };
  const minority = Math.min(c.n1, c.n0) / c.n;
  res.majorityShare = 1 - minority;
  res.majorityExposed = c.n1 > c.n0;
  if (minority < CFG.MINORITY_SHARE_MIN) return { ...res, status: 'constant' };
  if (Math.min(c.n1, c.n0) < CFG.GROUP_MIN_NIGHTS) return { ...res, status: 'groups' };
  if (c.degenerate) return { ...res, status: 'degenerate_variance' };
  if (c.neff < CFG.N_EFF_MIN) return { ...res, status: 'neff' };
  if (qid === 'P2') {
    const med = (list) => { const v = list.map((x) => x.total).sort((a, b) => a - b); return v.length >= CFG.MEDIAN_MIN_NIGHTS ? quantile(v, 0.5) : null; };
    const used = extra.filter((x) => usedDates.has(x.date));
    res.totalLatency = { yes: med(used.filter((x) => x.e)), no: med(used.filter((x) => !x.e)) };
  }
  return { ...res, status: 'ok' };
}

// Benjamini–Hochberg al livello BH_Q sulla famiglia delle tre domande
// (m = 3 anche se alcune non hanno un risultato: correzione prudente).
// Entrano solo i p-value finiti dei risultati 'ok': gli stati non stimabili
// (null) non entrano mai.
export function benjaminiHochberg(pvalues, m = QUESTIONS.length, q = CFG.BH_Q) {
  const order = pvalues.map((p, i) => ({ p, i })).filter((x) => x.p != null && Number.isFinite(x.p)).sort((a, b) => a.p - b.p);
  let k = 0;
  order.forEach((x, j) => { if (x.p <= ((j + 1) / m) * q) k = j + 1; });
  const pass = pvalues.map(() => false);
  order.slice(0, k).forEach((x) => { pass[x.i] = true; });
  return pass;
}

// Tutte le domande con correzione e analisi di sensibilità (solo per le
// domande con un risultato principale; mai al posto del principale).
export const SENSITIVITY = [
  { id: 'a', label: 'Solo dati inseriti al momento', opts: { provenance: 'prospective' } },
  { id: 'b', label: 'Tutte le origini, anche ricostruite o non note', opts: { provenance: 'all' } },
  { id: 'c', label: 'Notti insolite incluse', opts: { includeUnusual: true } },
  { id: 'd', label: 'Solo notti senza caffeina tardiva, alcol e stress', opts: { confoundersFalse: true }, onlyIfOk: true },
];
// includeOutliers: l'opzione "Includi le anomalie" dell'interfaccia; vale
// per il risultato principale e per tutte le analisi di sensibilità.
export function analyzeAll(entries, { endDate = null, includeOutliers = false } = {}) {
  const cache = newCache();
  const main = QUESTIONS.map((q) => analyzeQuestion(entries, q.id, { endDate, includeOutliers, cache }));
  const pass = benjaminiHochberg(main.map((r) => (r.status === 'ok' ? r.p : null)));
  return main.map((r, i) => {
    if (r.status !== 'ok') return r;
    const sensitivity = SENSITIVITY.map((s) => {
      const x = analyzeQuestion(entries, r.id, { endDate, includeOutliers, cache, ...s.opts });
      return { id: s.id, label: s.label, status: x.status, delta: x.delta, lo: x.lo, hi: x.hi, n: x.n, n1: x.n1, neff: x.neff, includeOutliers: x.includeOutliers, counts: x.counts, onlyIfOk: !!s.onlyIfOk };
    }).filter((s) => !(s.onlyIfOk && s.status !== 'ok'));
    return { ...r, passesBH: pass[i], sensitivity };
  });
}

// ---------- Testi (docs/research/FINAL_ANALYTICS_SPEC.md §2.5 e §7) ----------
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const monthYear = (d) => { const [y, m] = d.split('-').map(Number); return { y, m: MONTHS[m - 1] }; };
export function periodText(from, to) {
  const a = monthYear(from), b = monthYear(to);
  if (a.y === b.y && a.m === b.m) return `${a.m} ${a.y}`;
  return a.y === b.y ? `${a.m}–${b.m} ${b.y}` : `${a.m} ${a.y} – ${b.m} ${b.y}`;
}
const signed = (x) => { const v = round5(x); return v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : '0'; };
export const intervalText = (r) => `da ${signed(r.lo)} a ${signed(r.hi)} min`;
const about = (x) => { const v = Math.abs(round5(x)); return v === 0 ? 'meno di 5 minuti' : `circa ${v} minuti`; };
const notti = (n) => `${n} ${n === 1 ? 'notte' : 'notti'}`;

export function abstentionText(r) {
  const q = Q[r.id];
  const c = r.counts;
  const parts = [];
  if (r.status === 'few') {
    parts.push(`Per questa analisi servono almeno ${CFG.N_EFF_MIN} notti con ${q.fieldsText} registrati all'epoca e il tipo di giorno indicato${q.habitual ? `, più almeno ${CFG.HABITUAL_MIN_VALUES} notti precedenti con l'ora in cui hai provato a dormire, per stimare il tuo solito orario` : ''}. Finora: ${r.n != null ? r.n : r.kept}.`);
    if (c.noWindow) parts.push(`${notti(c.noWindow)} non ${c.noWindow === 1 ? 'ha' : 'hanno'} abbastanza notti vicine (almeno ${CFG.RESIDUAL_MIN_VALUES} entro ${CFG.RESIDUAL_HALF_WINDOW_NIGHTS} giorni) per il confronto con il periodo.`);
  } else if (r.status === 'daytype') {
    parts.push(`Il tipo di giorno è indicato solo nel ${Math.round(100 * (r.dayTypeShare || 0))}% delle notti: indicarlo evita di confondere le differenze tra giorni liberi e vincolati con l'effetto dello schermo.`);
  } else if (r.status === 'constant') {
    parts.push(`Quasi tutte le tue notti (${Math.round(100 * r.majorityShare)}%) ${r.majorityExposed ? 'hanno' : 'non hanno'} ${q.exposure}: senza notti diverse non c'è un confronto possibile.`);
  } else if (r.status === 'groups') {
    parts.push(`Servono almeno ${CFG.GROUP_MIN_NIGHTS} notti in ciascun gruppo. Finora: ${r.n1} ${q.groupYes}, ${r.n0} ${q.groupNo}.`);
  } else if (r.status === 'degenerate_variance') {
    parts.push(r.degenerate === 'zero_variance'
      ? "Risultato non stimabile: dopo il confronto con il periodo e con il tipo di giorno, i valori non variano all'interno dei gruppi, quindi non è possibile stimare l'incertezza. Per questo non viene mostrato alcun confronto."
      : "Risultato non stimabile: il calcolo dell'incertezza non ha prodotto un valore valido. Per questo non viene mostrato alcun confronto.");
    parts.push(`Notti per gruppo: ${r.n1} ${q.groupYes}, ${r.n0} ${q.groupNo}.`);
  } else if (r.status === 'neff') {
    parts.push(`Le notti vicine si somigliano molto: è come se ne avessi ${Math.floor(r.neff)} indipendenti, troppo poche per un confronto affidabile (ne servono ${CFG.N_EFF_MIN}).`);
  }
  return parts;
}
export function provenanceNote(r) {
  const k = r.counts.provenance;
  return k ? `${notti(k)} non ${k === 1 ? 'è considerata' : 'sono considerate'} perché i loro dati sono ricostruiti a memoria o di origine sconosciuta. Puoi classificarne l'origine in Impostazioni → Origine dei dati.` : null;
}

// Testo del risultato principale: frase, interpretazione possibile,
// spiegazioni alternative, nota sulla correzione. Mai formule causali.
export function resultTexts(r) {
  const q = Q[r.id];
  const clear = r.lo > 0 || r.hi < 0;
  const facts = `intervallo: ${intervalText(r)}; ${notti(r.n)}, di cui ${r.n1} ${q.groupYes}; ${periodText(r.from, r.to)}`;
  let headline;
  if (!clear) headline = `Nei tuoi dati non emerge una differenza chiara (${facts}). Questo non esclude un effetto piccolo: con questo numero di notti si possono notare solo differenze ampie.`;
  else if (r.id === 'P1') headline = `Nelle tue notti con l'ultimo utilizzo dello schermo nell'ora prima del tuo solito orario di riposo, hai iniziato a provare a dormire in media ${about(r.delta)} ${r.delta > 0 ? 'più tardi' : 'prima'} (${facts}). È un'associazione osservata nei tuoi dati, non una prova che lo schermo abbia spostato l'orario.`;
  else if (r.id === 'P2') headline = `Nelle notti in cui hai usato lo schermo dopo aver provato a dormire, dopo l'ultimo utilizzo ci hai messo in media ${about(r.delta)} ${r.delta > 0 ? 'in più' : 'in meno'} ad addormentarti (${facts}). È un'associazione osservata nei tuoi dati, non una prova che lo schermo abbia allungato o accorciato l'addormentamento.`;
  else headline = `Nelle tue notti con l'ultimo utilizzo dello schermo nell'ora prima del tuo solito orario di riposo, il sonno effettivo stimato (quanto hai dormito) è stato in media ${about(r.delta)} ${r.delta > 0 ? 'più lungo' : 'più breve'} (${facts}). È un'associazione osservata nei tuoi dati, non una prova che lo schermo abbia cambiato la durata del sonno.`;
  const interpretation = {
    P1: "l'uso dello schermo può ritardare il momento in cui si smette di fare altro.",
    P2: "usare lo schermo a letto può tenere svegli e rendere più lento l'addormentamento dopo averlo lasciato.",
    P3: "un uso serale dello schermo può accompagnarsi a un addormentamento più tardo e, con la sveglia fissa, a meno sonno.",
  }[r.id];
  const alternatives = {
    P1: ["nelle sere in cui non hai sonno o sei sotto pressione potresti usare lo schermo più vicino al tuo solito orario e anche andare a dormire più tardi;", 'impegni serali possono influire su entrambe le cose;', "il confronto è con tutte le altre notti, comprese quelle in cui hai smesso dopo il tuo solito orario (ma non dopo aver provato a dormire): non è un confronto tra \"schermo\" e \"nessuno schermo\"."],
    P2: ['nelle notti in cui non riesci a dormire potresti prendere il telefono proprio perché sei sveglio/a (il legame potrebbe andare al contrario);', "gli orari sono stimati al mattino: un errore sull'ultimo utilizzo si trasferisce direttamente sul risultato."],
    P3: ["nelle giornate più impegnative potresti usare di più lo schermo la sera e dormire meno per altri motivi;", 'il sonno effettivo dipende anche da quando suona la sveglia: il confronto tiene conto del tipo di giorno, ma non degli orari di ogni singolo impegno;', "il confronto è con tutte le altre notti, comprese quelle in cui hai usato lo schermo dopo il tuo solito orario: se l'uso più tardo accorcia il sonno, le notti \"in quell'ora\" possono risultare più lunghe senza che quell'ora abbia un ruolo."],
  }[r.id];
  const bh = r.passesBH === false && clear ? 'Su tre domande analizzate insieme, questo risultato non supera la correzione per confronti multipli: trattalo come indicazione da riverificare con più notti.' : null;
  let descriptive = null;
  if (r.id === 'P2' && r.totalLatency && (r.totalLatency.yes != null || r.totalLatency.no != null)) {
    const f = (v) => (v == null ? 'non calcolabile' : `${Math.round(v)} min`);
    descriptive = `Tempo totale dal tentativo all'addormentamento (solo descrittivo: comprende il tempo passato sullo schermo): mediana ${f(r.totalLatency.yes)} nelle notti con uso dopo il tentativo, ${f(r.totalLatency.no)} nelle altre.`;
  }
  return { headline, interpretation, alternatives, bh, descriptive, clear };
}
export function sensitivityText(s) {
  if (s.status === 'degenerate_variance') return 'non stimabile (varianza nulla)';
  if (s.status !== 'ok') return 'non calcolabile con queste notti';
  return `${signed(s.delta)} min (${intervalText(s)}; ${notti(s.n)})`;
}
