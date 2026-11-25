// personalize.js — personalizzazione su tre livelli, a partire dal contesto
// valido in una data (context.js → resolveContext) e dal Profilo.
//   Livello 1  contestualizzazione della singola notte (nightContext)
//   Livello 2  evidenziazione: confronti descrittivi tra periodi (contextHighlights)
//   Livello 3  spunti legati agli obiettivi dichiarati (goalSuggestions)
// Funzioni pure. Legge le notti solo attraverso funzioni di analytics.js e
// inference.js, che a loro volta non conoscono il contesto: P1–P3 e le
// statistiche consolidate non cambiano (tests/unit/personalize.test.mjs).
// Linguaggio: descrittivo, mai causale; nessun consiglio medico; nessuna
// promessa di risultato. Metodologia: docs/ANALYTICS_METHODOLOGY.md §15.

import { computeNightMetrics, describe, circularDiffMinutes, addDays, minutesToHHMM, hhmmToMinutes, RECORDED_PROVENANCE, PROVENANCE_SETS } from './analytics.js';
import { circularMedianHHMM } from './inference.js';
import { provenanceOf } from './record.js';
import { ANALYSIS_CONFIG as CFG } from './config.js';
import { resolveContext, isDeclaredWorkDay, PERIOD_PROVENANCE_LABELS, WORK_SCHEDULE_LABELS, ROUTINE_KIND_LABELS, periodSummaryText } from './context.js';

const isEmpty = (v) => v === '' || v == null;
const recorded = (e, f) => RECORDED_PROVENANCE.includes(provenanceOf(e, f));

// ---------- Livello 1: la singola notte ----------
// entry: record (o bozza) della notte; date: giorno del risveglio.
// Restituisce null se non c'è contesto per quella data.
export function nightContext(entry, date, periods) {
  const ctx = resolveContext(periods, date);
  const lines = [];
  const e = entry || {};
  if (ctx.ambiguous.length) lines.push({ kind: 'warn', text: 'Più periodi della stessa categoria coprono questa data: controlla lo storico nel Profilo.' });
  if (ctx.work) {
    const w = ctx.work;
    const prov = PERIOD_PROVENANCE_LABELS[w.provenance];
    lines.push({ kind: 'period', text: `Periodo di lavoro o studio: ${periodSummaryText(w)} (${prov}).` });
    const workDay = isDeclaredWorkDay(w, date);
    if (workDay != null) {
      lines.push({ kind: 'info', text: workDay ? 'Secondo il periodo, questa mattina era un giorno di lavoro o studio.' : 'Secondo il periodo, questa mattina non era un giorno di lavoro o studio.' });
      if (e.dayType && ((e.dayType === 'constrained') !== workDay)) {
        lines.push({ kind: 'info', text: `Nel diario la mattina è segnata come ${e.dayType === 'constrained' ? 'vincolata' : 'libera'}: vale quanto indicato per la notte.` });
      }
      if (workDay && w.data.alarm && !isEmpty(e.wakeTime)) {
        const d = circularDiffMinutes(w.data.alarm, e.wakeTime);
        const near = Math.abs(d) <= CFG.ALARM_NEAR_MIN;
        const wakeProv = recorded(e, 'wakeTime') ? '' : ' (orario di risveglio non registrato all\'epoca)';
        lines.push({
          kind: 'compare',
          text: near
            ? `Il risveglio (${e.wakeTime}) è vicino all'orario di sveglia dichiarato per i giorni di lavoro (${w.data.alarm})${wakeProv}.`
            : `Il risveglio (${e.wakeTime}) è ${Math.abs(d)} minuti ${d > 0 ? 'dopo l\'' : 'prima dell\''}orario di sveglia dichiarato per i giorni di lavoro (${w.data.alarm})${wakeProv}.`,
        });
      }
    }
  }
  if (ctx.routine) {
    lines.push({ kind: 'period', text: `Periodo particolare: ${periodSummaryText(ctx.routine)} (${PERIOD_PROVENANCE_LABELS[ctx.routine.provenance]}).` });
  }
  return lines.length ? { date, lines } : null;
}

// ---------- Livello 2: confronti descrittivi tra periodi ----------
// Notti ammesse: addormentamento e risveglio presenti e coerenti, non
// segnate come anomale (salvo includeOutliers) né insolite, con la
// provenienza ammessa dal filtro delle descrizioni (`all` o `recorded`).
function eligibleNights(entries, endDate, { provenance = 'all', includeOutliers = false } = {}) {
  const allowed = PROVENANCE_SETS[provenance] || PROVENANCE_SETS.all;
  const out = [];
  for (let i = CFG.CONTEXT_WINDOW_DAYS - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const e = entries[date];
    if (!e || isEmpty(e.bedtime) || isEmpty(e.wakeTime)) continue;
    if (e.unusualNight === true) continue;
    if (e.is_outlier_bedtime && !includeOutliers) continue;
    if (!allowed.includes(provenanceOf(e, 'bedtime')) || !allowed.includes(provenanceOf(e, 'wakeTime'))) continue;
    const m = computeNightMetrics(e, date);
    if (m.durationError || m.durationMin == null) continue;
    out.push({ date, e, m });
  }
  return out;
}

function clockStats(times) {
  const n = times.length;
  if (n < CFG.MEDIAN_MIN_NIGHTS) return { n };
  const c = circularMedianHHMM(times);
  const off = describe(times.map((t) => circularDiffMinutes(c, t)));
  const at = (x) => (x == null ? null : minutesToHHMM(((hhmmToMinutes(c) + Math.round(x)) % 1440 + 1440) % 1440));
  return { n, median: c, q1: at(off.q1), q3: at(off.q3), q1Off: off.q1, q3Off: off.q3, center: c };
}
function durStats(values) {
  const d = describe(values);
  return { n: d.n, median: d.median, q1: d.q1, q3: d.q3 };
}

// "Differenza chiara": entrambi i gruppi con almeno CONTEXT_HIGHLIGHT_MIN_NIGHTS
// notti e intervalli interquartili che non si sovrappongono (metà centrale
// delle notti di un gruppo tutta prima di quella dell'altro). Criterio
// descrittivo e prudente, non un test statistico.
function clearDuration(a, b) {
  if (a.n < CFG.CONTEXT_HIGHLIGHT_MIN_NIGHTS || b.n < CFG.CONTEXT_HIGHLIGHT_MIN_NIGHTS || a.q1 == null || b.q1 == null) return false;
  return a.q3 < b.q1 || b.q3 < a.q1;
}
function clearClock(timesA, timesB) {
  if (timesA.length < CFG.CONTEXT_HIGHLIGHT_MIN_NIGHTS || timesB.length < CFG.CONTEXT_HIGHLIGHT_MIN_NIGHTS) return false;
  const c = circularMedianHHMM([...timesA, ...timesB]);
  const a = describe(timesA.map((t) => circularDiffMinutes(c, t)));
  const b = describe(timesB.map((t) => circularDiffMinutes(c, t)));
  return a.q3 < b.q1 || b.q3 < a.q1;
}

function groupStats(label, nights) {
  return {
    label,
    n: nights.length,
    from: nights.length ? nights[0].date : null,
    to: nights.length ? nights[nights.length - 1].date : null,
    duration: durStats(nights.map((x) => x.m.durationMin)),
    onset: clockStats(nights.map((x) => x.e.bedtime)),
    wake: clockStats(nights.map((x) => x.e.wakeTime)),
    _nights: nights,
  };
}

function compare(id, title, groups, note) {
  const shown = groups.filter((g) => g.n >= CFG.CONTEXT_GROUP_MIN_NIGHTS);
  const hidden = groups.filter((g) => g.n > 0 && g.n < CFG.CONTEXT_GROUP_MIN_NIGHTS).map((g) => ({ label: g.label, n: g.n }));
  if (shown.length < 2) return { id, title, available: false, groups: shown.map(strip), hidden, note };
  const [a, b] = shown;
  const clear = shown.length === 2 ? {
    duration: clearDuration(a.duration, b.duration),
    onset: clearClock(a._nights.map((x) => x.e.bedtime), b._nights.map((x) => x.e.bedtime)),
    wake: clearClock(a._nights.map((x) => x.e.wakeTime), b._nights.map((x) => x.e.wakeTime)),
  } : null;
  return { id, title, available: true, groups: shown.map(strip), hidden, clear, note };
}
const strip = (g) => { const { _nights, ...rest } = g; return rest; };

export function contextHighlights(entries, periods, { endDate, provenance = 'all', includeOutliers = false } = {}) {
  const nights = eligibleNights(entries, endDate, { provenance, includeOutliers });
  const withCtx = nights.map((x) => ({ ...x, ctx: resolveContext(periods, x.date) }));
  const out = [];
  // A. Giorni di lavoro dichiarati rispetto agli altri giorni, dentro i periodi di lavoro.
  const inWork = withCtx.filter((x) => x.ctx.work && isDeclaredWorkDay(x.ctx.work, x.date) != null);
  if (inWork.length) {
    out.push(compare('workdays', 'Giorni di lavoro o studio dichiarati e altri giorni', [
      groupStats('Giorni di lavoro o studio', inWork.filter((x) => isDeclaredWorkDay(x.ctx.work, x.date))),
      groupStats('Altri giorni', inWork.filter((x) => !isDeclaredWorkDay(x.ctx.work, x.date))),
    ], 'Secondo i giorni indicati nei periodi di lavoro, non il tipo di giorno segnato notte per notte.'));
  }
  // B. Tipi di orario (regolare, turni, …) nei periodi di lavoro.
  const bySchedule = {};
  withCtx.filter((x) => x.ctx.work).forEach((x) => { (bySchedule[x.ctx.work.data.schedule] = bySchedule[x.ctx.work.data.schedule] || []).push(x); });
  if (Object.keys(bySchedule).length >= 2) {
    out.push(compare('schedule', 'Periodi con orari di lavoro diversi', Object.entries(bySchedule).map(([k, v]) => groupStats(`Periodi con ${WORK_SCHEDULE_LABELS[k] || k}`, v))));
  }
  // C. Routine particolari rispetto al resto.
  const inRoutine = withCtx.filter((x) => x.ctx.routine);
  if (inRoutine.length) {
    const byKind = {};
    inRoutine.forEach((x) => { const k = x.ctx.routine.data.kind; (byKind[k] = byKind[k] || []).push(x); });
    const rest = withCtx.filter((x) => !x.ctx.routine);
    Object.entries(byKind).forEach(([k, v]) => {
      out.push(compare(`routine-${k}`, `${ROUTINE_KIND_LABELS[k] || k} e resto del periodo`, [groupStats(ROUTINE_KIND_LABELS[k] || k, v), groupStats('Fuori da routine particolari', rest)]));
    });
  }
  return { endDate, from: addDays(endDate, -(CFG.CONTEXT_WINDOW_DAYS - 1)), nEligible: nights.length, comparisons: out };
}

// ---------- Livello 3: spunti legati agli obiettivi ----------
// Finestra: gli ultimi SUGGESTION_WINDOW_DAYS giorni; solo valori registrati
// all'epoca; escluse le notti insolite e le anomalie confermate. Uno spunto
// compare solo se gli obiettivi dichiarati non sono raggiunti in almeno
// SUGGESTION_MISS_SHARE delle notti valide (minimo SUGGESTION_MIN_NIGHTS).
export function goalSuggestions(entries, profile, { endDate } = {}) {
  const p = profile || {};
  const goals = { attempt: p.goalAttemptTime || '', screenFree: p.goalScreenFreeMin || '', need: p.sleepNeedMin || '' };
  if (!goals.attempt && !goals.screenFree && !goals.need) return { status: 'no_goals', items: [] };
  const days = CFG.SUGGESTION_WINDOW_DAYS, min = CFG.SUGGESTION_MIN_NIGHTS;
  const from = addDays(endDate, -(days - 1));
  const nights = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i);
    const e = entries[date];
    if (!e || e.unusualNight === true || e.is_outlier_bedtime) continue;
    nights.push({ date, e, m: computeNightMetrics(e, date) });
  }
  const items = [], checks = [];
  const pct = (a, b) => `${a} su ${b}`;
  const basis = (n, what) => ({ n, from, to: endDate, what });
  // 1. Orario in cui provare a dormire.
  if (goals.attempt) {
    const v = nights.filter((x) => !isEmpty(x.e.sleepAttempt) && recorded(x.e, 'sleepAttempt') && !x.m.attemptError);
    if (v.length < min) checks.push({ goal: 'attempt', status: 'insufficient', n: v.length, min });
    else {
      // "Dopo l'obiettivo": entro le 12 ore successive (gestisce la mezzanotte).
      const late = v.filter((x) => circularDiffMinutes(goals.attempt, x.e.sleepAttempt) > 0).length;
      const ok = v.length - late;
      checks.push({ goal: 'attempt', status: 'ok', n: v.length, met: ok });
      if (late / v.length >= CFG.SUGGESTION_MISS_SHARE) {
        items.push({
          id: 'attempt',
          title: 'Orario in cui provi a dormire',
          text: `Il tuo obiettivo è provare a dormire entro le ${goals.attempt}. È successo in ${pct(ok, v.length)} notti. Se vuoi avvicinarti, una possibilità è fissare un promemoria serale da usare come segnale per iniziare a prepararti.`,
          why: `Proposto perché l'obiettivo indicato nel Profilo non è stato raggiunto in ${late} notti su ${v.length}, con l'orario del tentativo registrato all'epoca.`,
          basis: basis(v.length, 'orario del tentativo'),
        });
      }
    }
  }
  // 2. Tempo senza schermo prima di provare a dormire.
  if (goals.screenFree) {
    const v = nights.filter((x) => !isEmpty(x.e.sleepAttempt) && !isEmpty(x.e.lastScreenUse) && recorded(x.e, 'sleepAttempt') && recorded(x.e, 'lastScreenUse') && x.m.screenToAttemptMin != null && !x.m.attemptError);
    if (v.length < min) checks.push({ goal: 'screenFree', status: 'insufficient', n: v.length, min });
    else {
      const ok = v.filter((x) => x.m.screenToAttemptMin >= goals.screenFree).length;
      checks.push({ goal: 'screenFree', status: 'ok', n: v.length, met: ok });
      if ((v.length - ok) / v.length >= CFG.SUGGESTION_MISS_SHARE) {
        items.push({
          id: 'screenFree',
          title: 'Schermo prima di provare a dormire',
          text: `Il tuo obiettivo è smettere di usare lo schermo almeno ${goals.screenFree} minuti prima di provare a dormire. È successo in ${pct(ok, v.length)} notti. Se vuoi avvicinarti, una possibilità è lasciare il telefono in un'altra stanza o fuori portata a un orario fisso.`,
          why: `Proposto perché l'obiettivo indicato nel Profilo non è stato raggiunto in ${v.length - ok} notti su ${v.length}, con ultimo utilizzo e tentativo registrati all'epoca.`,
          basis: basis(v.length, 'ultimo utilizzo e tentativo'),
        });
      }
    }
  }
  // 3. Sonno rispetto al fabbisogno percepito.
  if (goals.need) {
    const eff = nights.filter((x) => x.m.effectiveSleepMin != null && recorded(x.e, 'bedtime') && recorded(x.e, 'wakeTime'));
    const dur = nights.filter((x) => x.m.durationMin != null && !x.m.durationError && recorded(x.e, 'bedtime') && recorded(x.e, 'wakeTime'));
    const useEff = eff.length >= min;
    const v = useEff ? eff : dur;
    const metric = useEff ? 'sonno effettivo stimato' : 'intervallo di sonno (senza togliere i risvegli)';
    if (v.length < min) checks.push({ goal: 'need', status: 'insufficient', n: v.length, min });
    else {
      const med = describe(v.map((x) => (useEff ? x.m.effectiveSleepMin : x.m.durationMin))).median;
      checks.push({ goal: 'need', status: 'ok', n: v.length, median: med, metric });
      const gap = goals.need - med;
      if (gap >= CFG.SLEEP_NEED_GAP_MIN) {
        items.push({
          id: 'need',
          title: 'Sonno rispetto a quanto senti di aver bisogno',
          text: `Hai indicato che ti senti bene con circa ${fmtDur(goals.need)} di sonno. La mediana del ${metric} nelle ultime ${v.length} notti è ${fmtDur(med)}, circa ${fmtDur(Math.round(gap))} in meno. Se vuoi più tempo per dormire, una possibilità è anticipare l'orario in cui provi a dormire nei giorni in cui la sveglia è fissa.`,
          why: `Proposto perché la differenza supera i ${CFG.SLEEP_NEED_GAP_MIN} minuti. Il fabbisogno indicato è una tua percezione, non una misura.`,
          basis: basis(v.length, metric),
        });
      }
    }
  }
  const anyOk = checks.some((c) => c.status === 'ok');
  return { status: anyOk ? 'ok' : 'insufficient', from, to: endDate, min, checks, items };
}

function fmtDur(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}
