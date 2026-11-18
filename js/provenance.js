// provenance.js — strumento "Origine dei dati" (Fase 3). Funzioni pure:
// nessun accesso a DOM o database. Modello: docs/DATA_MODEL.md §2b–2c, §8.
//
// Due operazioni, entrambe su un intervallo di notti scelto dall'utente,
// con anteprima prima della conferma:
// 1. Provenienza: scrive SOLO meta.fields[campo] = { provenance,
//    provenanceSetBy: 'user', provenanceSetAt } (enteredAt resta com'era,
//    se c'era). Valori del diario, date tecniche e campi accessori non
//    cambiano. Si classificano solo i campi che hanno un valore.
// 2. Giorno dello Screen Time: per le notti con un totale di Screen Time
//    scrive solo screenTimeDate / screenTimeDateStatus / screenTimeDateRule.
//    I giorni salvati con l'etichetta al momento dell'inserimento
//    (regola 'entry_label') non vengono toccati dalle operazioni su
//    intervallo: si correggono solo una notte alla volta.
// Ogni operazione restituisce i record nuovi; verifyOperation controlla,
// dopo la rilettura del database, che sia cambiato solo ciò che doveva.
import {
  PROVENANCE_FIELDS, PROVENANCE_VALUES, SCREEN_DATE_FIELDS, provenanceOf, screenTimeReference,
} from './record.js';

const isEmpty = (v) => v === '' || v == null;
const pad = (n) => String(n).padStart(2, '0');
function dayBefore(date) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const isRealDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !isNaN(d) && `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === s;
};

export const FIELD_LABELS = {
  screenTimeTotal: 'Screen time', lastScreenUse: 'Ultimo utilizzo',
  inBedTime: 'Coricamento', sleepAttempt: 'Tentativo di dormire', bedtime: 'Addormentamento', wakeTime: 'Risveglio',
  quality: 'Qualità', awakenings: 'Numero di risvegli', awakeMinutes: 'Minuti svegli',
  dayType: 'Tipo di giorno', lateCaffeine: 'Caffeina tardiva', alcohol: 'Alcol', stress: 'Stress', unusualNight: 'Notte insolita',
};
export const PROVENANCE_GROUPS = [
  { id: 'evening', label: 'Sera', fields: ['screenTimeTotal', 'lastScreenUse'] },
  { id: 'times', label: 'Orari del sonno', fields: ['inBedTime', 'sleepAttempt', 'bedtime', 'wakeTime'] },
  { id: 'quality', label: 'Qualità', fields: ['quality'] },
  { id: 'awakenings', label: 'Risvegli notturni', fields: ['awakenings', 'awakeMinutes'] },
  { id: 'context', label: 'Tipo di giorno e indicatori', fields: ['dayType', 'lateCaffeine', 'alcohol', 'stress', 'unusualNight'] },
];
export const PROVENANCE_LABELS = {
  prospective: 'Inseriti al momento',
  transcribed: "Ricopiati da note dell'epoca",
  retrospective: 'Ricostruiti a memoria',
  unknown: 'Origine non nota',
};
export const SCREEN_STATUS_LABELS = { verified: 'Verificato', presumed: 'Presunto', unknown: 'Sconosciuto' };

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);
const emptyCounts = () => Object.fromEntries(PROVENANCE_VALUES.map((p) => [p, 0]));

// ---------- Riepilogo ----------
// Conteggio dei valori presenti per campo e per origine, e dello stato del
// giorno dello Screen Time. `from`/`to` facoltativi.
export function provenanceSummary(entries, { from = null, to = null } = {}) {
  const fields = Object.fromEntries(PROVENANCE_FIELDS.map((f) => [f, emptyCounts()]));
  const totals = emptyCounts();
  const screen = { verified: 0, presumed: 0, unknown: 0 };
  let nights = 0;
  Object.values(entries).forEach((r) => {
    if (!inRange(r.date, from, to)) return;
    nights++;
    PROVENANCE_FIELDS.forEach((f) => {
      if (isEmpty(r[f])) return;
      const p = provenanceOf(r, f);
      fields[f][p]++; totals[p]++;
    });
    const ref = screenTimeReference(r);
    if (ref) screen[ref.status]++;
  });
  return { nights, fields, totals, screen };
}

// ---------- 1. Provenienza ----------
export function fieldsOfGroups(groupIds) {
  return PROVENANCE_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.fields);
}

// Anteprima e record risultanti. `onlyUnknown`: tocca solo i valori la cui
// origine è ancora 'unknown' (implicita o scelta), così una classificazione
// su un intervallo ampio non sovrascrive quelle già fatte.
export function planProvenance(entries, { from, to, fields, target, onlyUnknown = true }, now = new Date()) {
  const plan = { target, values: 0, nights: 0, already: 0, kept: 0, byCurrent: emptyCounts(), changes: [], records: [], error: null };
  if (!fields || !fields.length) { plan.error = 'Scegli almeno un gruppo di campi.'; return plan; }
  if (!PROVENANCE_VALUES.includes(target)) { plan.error = "Scegli un'origine."; return plan; }
  if (!isRealDate(from) || !isRealDate(to)) { plan.error = 'Indica il primo e l\'ultimo giorno.'; return plan; }
  if (from > to) { plan.error = 'Il primo giorno è dopo l\'ultimo.'; return plan; }
  const iso = now.toISOString();
  Object.values(entries).filter((r) => inRange(r.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((r) => {
    const touched = [];
    fields.forEach((f) => {
      if (isEmpty(r[f])) return;
      const cur = provenanceOf(r, f);
      const entry = r.meta && r.meta.fields && r.meta.fields[f];
      if (cur === target && entry && entry.provenanceSetBy === 'user') { plan.already++; return; }
      if (onlyUnknown && cur !== 'unknown') { plan.kept++; return; }
      if (cur === target && cur !== 'unknown') { plan.already++; return; }
      touched.push(f);
      plan.byCurrent[cur]++;
    });
    if (!touched.length) return;
    plan.values += touched.length;
    plan.nights++;
    plan.changes.push({ date: r.date, fields: touched });
    plan.records.push(applyProvenance(r, touched, target, iso));
  });
  return plan;
}

export function applyProvenance(record, fields, target, iso) {
  const oldMeta = record.meta || {};
  const oldFields = oldMeta.fields || {};
  const nextFields = { ...oldFields };
  fields.forEach((f) => {
    // Stesso ordine delle chiavi di withMeta (record.js).
    const entry = { provenance: target };
    if (oldFields[f] && oldFields[f].enteredAt) entry.enteredAt = oldFields[f].enteredAt;
    entry.provenanceSetBy = 'user';
    entry.provenanceSetAt = iso;
    nextFields[f] = entry;
  });
  return { ...record, meta: { ...oldMeta, fields: nextFields } };
}

// ---------- 2. Giorno dello Screen Time ----------
// action: 'confirm'  → verificato, giorno prima del risveglio
//                      (regola 'historic_convention_confirmed');
//         'unknown'  → sconosciuto (nessuna data);
//         'presumed' → torna presunto (i tre campi vengono tolti).
// Le notti con il giorno salvato al momento dell'inserimento
// ('entry_label') sono escluse; le altre già nello stato scelto sono
// contate a parte.
export const SCREEN_ACTIONS = ['confirm', 'unknown', 'presumed'];
const ACTION_STATUS = { confirm: 'verified', unknown: 'unknown', presumed: 'presumed' };

export function planScreenDate(entries, { from, to, action }) {
  const plan = { action, nights: 0, already: 0, entryLabel: 0, manual: 0, byCurrent: { verified: 0, presumed: 0, unknown: 0 }, changes: [], records: [], error: null };
  if (!SCREEN_ACTIONS.includes(action)) { plan.error = "Scegli un'operazione."; return plan; }
  if (!isRealDate(from) || !isRealDate(to)) { plan.error = 'Indica il primo e l\'ultimo giorno.'; return plan; }
  if (from > to) { plan.error = 'Il primo giorno è dopo l\'ultimo.'; return plan; }
  Object.values(entries).filter((r) => inRange(r.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((r) => {
    const ref = screenTimeReference(r);
    if (!ref) return;
    if (r.screenTimeDateRule === 'entry_label') { plan.entryLabel++; return; }
    // Una correzione manuale si cambia solo una notte alla volta.
    if (r.screenTimeDateRule === 'manual_correction') { plan.manual++; return; }
    const next = applyScreenAction(r, action);
    if (ref.status === ACTION_STATUS[action] && sameScreenFields(r, next)) { plan.already++; return; }
    plan.byCurrent[ref.status]++;
    plan.nights++;
    plan.changes.push({ date: r.date, from: ref.status });
    plan.records.push(next);
  });
  return plan;
}

function withoutScreenFields(r) {
  const o = { ...r };
  SCREEN_DATE_FIELDS.forEach((f) => { delete o[f]; });
  return o;
}
const sameScreenFields = (a, b) => SCREEN_DATE_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));

export function applyScreenAction(r, action) {
  const o = withoutScreenFields(r);
  if (action === 'confirm') Object.assign(o, { screenTimeDate: dayBefore(r.date), screenTimeDateStatus: 'verified', screenTimeDateRule: 'historic_convention_confirmed' });
  else if (action === 'unknown') o.screenTimeDateStatus = 'unknown';
  return o;
}

// Correzione di una sola notte. choice: { kind: 'date', date } | { kind:
// 'unknown' } | { kind: 'presumed' }. Il giorno indicato può essere al
// massimo il giorno del risveglio e al più 7 giorni prima.
export const MANUAL_MAX_DAYS_BEFORE = 7;
export function manualScreenDate(r, choice) {
  if (!r || isEmpty(r.screenTimeTotal)) return { error: 'Questa notte non ha uno Screen Time.' };
  if (choice.kind === 'unknown') return { record: applyScreenAction(r, 'unknown') };
  if (choice.kind === 'presumed') return { record: withoutScreenFields(r) };
  if (!isRealDate(choice.date)) return { error: 'Indica un giorno valido.' };
  let min = r.date;
  for (let i = 0; i < MANUAL_MAX_DAYS_BEFORE; i++) min = dayBefore(min);
  if (choice.date > r.date) return { error: 'Lo Screen Time non può riferirsi a un giorno dopo il risveglio.' };
  if (choice.date < min) return { error: `Indica un giorno al massimo ${MANUAL_MAX_DAYS_BEFORE} giorni prima del risveglio.` };
  return { record: { ...withoutScreenFields(r), screenTimeDate: choice.date, screenTimeDateStatus: 'verified', screenTimeDateRule: 'manual_correction' } };
}

// ---------- Verifica dopo la scrittura ----------
// `before`: tutti i record prima; `after`: tutti i record riletti;
// `written`: i record scritti; `allowed`: 'meta' (provenienza) o 'screen'.
// Controlla che: ogni record scritto sia identico a quello atteso; per i
// record scritti sia cambiato solo ciò che è ammesso; tutti gli altri
// record siano identici a prima; nessun record sia comparso o sparito.
const sortKeys = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const key = (r) => JSON.stringify(sortKeys(r));
function strip(r, allowed) {
  const o = { ...r };
  if (allowed === 'meta') { const m = { ...(o.meta || {}) }; delete m.fields; o.meta = m; if (!Object.keys(m).length) delete o.meta; }
  if (allowed === 'screen') SCREEN_DATE_FIELDS.forEach((f) => { delete o[f]; });
  return o;
}
export function verifyOperation(before, after, written, allowed) {
  const problems = [];
  const writtenMap = Object.fromEntries(written.map((r) => [r.date, r]));
  const dates = new Set([...Object.keys(before), ...Object.keys(after)]);
  dates.forEach((d) => {
    const b = before[d], a = after[d];
    if (!b || !a) { problems.push(`${d}: notte ${!a ? 'scomparsa' : 'comparsa'}`); return; }
    if (writtenMap[d]) {
      if (key(a) !== key(writtenMap[d])) problems.push(`${d}: diversa da quanto previsto`);
      if (key(strip(a, allowed)) !== key(strip(b, allowed))) problems.push(`${d}: modificato un dato che non doveva cambiare`);
    } else if (key(a) !== key(b)) problems.push(`${d}: modificata senza motivo`);
  });
  return { ok: problems.length === 0, problems };
}
