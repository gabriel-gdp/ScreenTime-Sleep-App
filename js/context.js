// context.js — storico temporale del contesto (periodi con date), resolver
// del contesto valido in una data e formato del backup del contesto.
// Solo funzioni pure: nessun accesso agli archivi (vedi context-db.js).
//
// Un periodo vale nell'intervallo semiaperto [validFrom, validTo):
// validFrom incluso, validTo escluso, validTo = null per un periodo ancora
// in corso. Le date sono giorni di calendario (YYYY-MM-DD) e la data di una
// notte è quella del risveglio, come nel diario. Nell'interfaccia il periodo
// si mostra con l'ultimo giorno incluso (validTo − 1 giorno).

import { isRealDate, isHHMM, validateProfile, PROFILE_VERSION } from './profile.js';

export const CONTEXT_DB_NAME = 'sleep-screen-context';
export const CONTEXT_DB_VERSION = 1;
export const CONTEXT_STORES = ['profile', 'contextPeriods', 'contextPreferences'];

export const CATEGORIES = ['work', 'routine'];
export const CATEGORY_LABELS = { work: 'Lavoro o studio', routine: 'Routine particolare' };

// Provenienza del periodo (come per i campi delle notti: le informazioni
// ricostruite restano distinguibili da quelle registrate all'epoca).
export const PERIOD_PROVENANCE = ['contemporaneous', 'declared_later', 'retrospective', 'unknown'];
export const PERIOD_PROVENANCE_LABELS = {
  contemporaneous: 'registrato all\'epoca',
  declared_later: 'dichiarato in seguito',
  retrospective: 'ricostruito a memoria',
  unknown: 'origine non nota',
};

export const WORK_SCHEDULES = ['regular', 'shift', 'irregular', 'none'];
export const WORK_SCHEDULE_LABELS = {
  regular: 'orario regolare', shift: 'turni', irregular: 'orari variabili', none: 'non lavoro né studio',
};
export const ROUTINE_KINDS = ['vacation', 'travel', 'illness', 'study', 'family', 'other'];
export const ROUTINE_KIND_LABELS = {
  vacation: 'Vacanza', travel: 'Viaggio', illness: 'Malattia', study: 'Esami o studio intenso', family: 'Impegni familiari', other: 'Altro',
};
export const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
export const PERIOD_TEXT_LIMITS = { occupation: 80, label: 60, note: 300 };

// Preferenze della personalizzazione (store contextPreferences).
export const DEFAULT_PERSONALIZATION = Object.freeze({ contextNotes: true, highlights: true, suggestions: true });
export const MIGRATION_PREF_KEY = 'migration.ssl_profile';

const pad = (n) => String(n).padStart(2, '0');
export function addDaysISO(d, k) {
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, dd + k));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
export function weekdayOf(d) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
}

export function emptyPeriodData(category) {
  if (category === 'work') return { occupation: '', schedule: '', workDays: [], start: '', end: '', alarm: '' };
  return { kind: '', label: '', note: '' };
}

// Contiene la data? [validFrom, validTo)
export const covers = (p, date) => p.validFrom <= date && (p.validTo == null || date < p.validTo);
// Due intervalli semiaperti si sovrappongono se ciascuno inizia prima della fine dell'altro.
export function overlaps(a, b) {
  const aEnd = a.validTo == null ? '9999-12-31' : a.validTo;
  const bEnd = b.validTo == null ? '9999-12-31' : b.validTo;
  return a.validFrom < bEnd && b.validFrom < aEnd;
}

// Validazione completa di un periodo rispetto agli altri. Restituisce
// { period, errors }: con errori il periodo non va salvato.
export function validatePeriod(input, others, todayISO) {
  const errors = {};
  const src = input && typeof input === 'object' ? input : {};
  const category = CATEGORIES.includes(src.category) ? src.category : null;
  if (!category) errors.category = 'Categoria non valida.';
  const p = {
    id: typeof src.id === 'string' && src.id ? src.id : '',
    category,
    validFrom: typeof src.validFrom === 'string' ? src.validFrom : '',
    validTo: src.validTo == null || src.validTo === '' ? null : src.validTo,
    provenance: src.provenance,
    data: emptyPeriodData(category || 'routine'),
    createdAt: typeof src.createdAt === 'string' ? src.createdAt : '',
    updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : '',
    revision: Number.isInteger(src.revision) && src.revision > 0 ? src.revision : 1,
  };
  if (!isRealDate(p.validFrom)) errors.validFrom = 'Indica il primo giorno del periodo.';
  if (p.validTo != null) {
    if (!isRealDate(p.validTo)) errors.validTo = 'Data di fine non valida.';
    else if (isRealDate(p.validFrom) && p.validTo <= p.validFrom) errors.validTo = 'L\'ultimo giorno non può essere prima del primo.';
  }
  if (isRealDate(p.validFrom) && todayISO && p.validFrom > addDaysISO(todayISO, 366)) errors.validFrom = 'Il periodo inizia troppo lontano nel futuro (oltre un anno).';
  if (!PERIOD_PROVENANCE.includes(p.provenance)) errors.provenance = 'Indica come conosci questo periodo.';
  const d = src.data && typeof src.data === 'object' ? src.data : {};
  if (category === 'work') {
    const occ = typeof d.occupation === 'string' ? d.occupation.trim() : '';
    if (occ.length > PERIOD_TEXT_LIMITS.occupation) errors.occupation = `Al massimo ${PERIOD_TEXT_LIMITS.occupation} caratteri.`;
    p.data.occupation = occ;
    if (!WORK_SCHEDULES.includes(d.schedule)) errors.schedule = 'Scegli il tipo di orario.';
    else p.data.schedule = d.schedule;
    const days = Array.isArray(d.workDays) ? [...new Set(d.workDays.map(Number))].sort() : [];
    if (days.some((x) => !Number.isInteger(x) || x < 0 || x > 6)) errors.workDays = 'Giorni non validi.';
    else p.data.workDays = d.schedule === 'none' ? [] : days;
    ['start', 'end', 'alarm'].forEach((k) => {
      const v = typeof d[k] === 'string' ? d[k].trim() : '';
      if (v && !isHHMM(v)) errors[k] = 'Orario non valido.';
      else p.data[k] = d.schedule === 'none' ? '' : v;
    });
  } else if (category === 'routine') {
    if (!ROUTINE_KINDS.includes(d.kind)) errors.kind = 'Scegli il tipo di routine.';
    else p.data.kind = d.kind;
    ['label', 'note'].forEach((k) => {
      const v = typeof d[k] === 'string' ? d[k].trim() : '';
      if (v.length > PERIOD_TEXT_LIMITS[k]) errors[k] = `Al massimo ${PERIOD_TEXT_LIMITS[k]} caratteri.`;
      p.data[k] = v;
    });
  }
  if (!errors.validFrom && !errors.validTo && category) {
    const clash = (others || []).filter((o) => o.category === category && o.id !== p.id && overlaps(o, p));
    if (clash.length) errors.overlap = clash.map((o) => o.id);
  }
  return { period: p, errors };
}

// Il contesto valido in una data: per ogni categoria il periodo che la
// contiene (al massimo uno, perché le sovrapposizioni sono rifiutate; se un
// archivio importato ne contenesse, si segnala l'ambiguità invece di
// sceglierne uno a caso).
export function resolveContext(periods, date) {
  const out = { date, work: null, routine: null, ambiguous: [] };
  if (!isRealDate(date)) return out;
  CATEGORIES.forEach((c) => {
    const hits = (periods || []).filter((p) => p.category === c && covers(p, date));
    if (hits.length === 1) out[c] = hits[0];
    else if (hits.length > 1) out.ambiguous.push(c);
  });
  return out;
}

// Per la notte: è un giorno di lavoro secondo il periodo valido?
export function isDeclaredWorkDay(workPeriod, date) {
  if (!workPeriod || workPeriod.data.schedule === 'none' || !workPeriod.data.workDays.length) return null;
  return workPeriod.data.workDays.includes(weekdayOf(date));
}

export function periodSummaryText(p) {
  if (p.category === 'work') {
    const d = p.data;
    const parts = [d.occupation || 'Lavoro o studio', WORK_SCHEDULE_LABELS[d.schedule] || ''];
    if (d.workDays.length) parts.push(d.workDays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((i) => WEEKDAY_SHORT[i]).join(' '));
    if (d.start && d.end) parts.push(`${d.start}–${d.end}`);
    if (d.alarm) parts.push(`sveglia ${d.alarm}`);
    return parts.filter(Boolean).join(' · ');
  }
  return [ROUTINE_KIND_LABELS[p.data.kind] || 'Routine', p.data.label].filter(Boolean).join(' · ');
}

export const lastIncludedDay = (p) => (p.validTo == null ? null : addDaysISO(p.validTo, -1));

// ---------- Backup del contesto ----------
// Formato separato dal backup delle notti (backup.js resta invariato).
export const CONTEXT_BACKUP_FORMAT = 'diario-del-sonno-contesto';
export const CONTEXT_BACKUP_VERSION = 1;
export const MAX_CONTEXT_BACKUP_BYTES = 1024 * 1024;

export function buildContextBackup({ profile, periods, preferences }, now = new Date()) {
  return {
    format: CONTEXT_BACKUP_FORMAT,
    formatVersion: CONTEXT_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    profileVersion: PROFILE_VERSION,
    profile: profile || null,
    periods: (periods || []).slice().sort((a, b) => (a.validFrom < b.validFrom ? -1 : a.validFrom > b.validFrom ? 1 : a.id < b.id ? -1 : 1)),
    preferences: (preferences || []).filter((x) => x.key !== MIGRATION_PREF_KEY),
  };
}
export function contextBackupFilename(now = new Date()) {
  return `diario-del-sonno-contesto-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Validazione integrale prima di toccare l'archivio. Restituisce
// { ok: true, data } oppure { ok: false, error } con un messaggio leggibile.
export function parseContextBackup(text, todayISO) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Il file è vuoto.' };
  if (text.length > MAX_CONTEXT_BACKUP_BYTES) return { ok: false, error: 'Il file è troppo grande per essere un backup del contesto.' };
  let o;
  try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'Il file non è leggibile (JSON non valido).' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'Il file non ha la forma di un backup del contesto.' };
  if (o.format === 'diario-del-sonno-backup') return { ok: false, error: 'Questo è un backup delle notti: si ripristina dalle Impostazioni, in "I tuoi dati".' };
  if (o.format !== CONTEXT_BACKUP_FORMAT) return { ok: false, error: 'Il file non è un backup del contesto del Diario del sonno.' };
  if (!Number.isInteger(o.formatVersion)) return { ok: false, error: 'Versione del backup mancante.' };
  if (o.formatVersion > CONTEXT_BACKUP_VERSION) return { ok: false, error: `Il backup è stato creato da una versione più recente dell'app (formato ${o.formatVersion}). Aggiorna l'app e riprova.` };
  if (o.formatVersion < 1) return { ok: false, error: 'Versione del backup non valida.' };
  let profile = null;
  if (o.profile != null) {
    if (typeof o.profile !== 'object' || Array.isArray(o.profile)) return { ok: false, error: 'Profilo non valido nel file.' };
    const { profile: p, errors } = validateProfile(o.profile, todayISO);
    if (Object.keys(errors).length) return { ok: false, error: `Profilo non valido nel file (${Object.keys(errors).join(', ')}).` };
    profile = p;
  }
  if (!Array.isArray(o.periods)) return { ok: false, error: 'Elenco dei periodi mancante.' };
  const periods = [];
  const ids = new Set();
  for (const raw of o.periods) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return { ok: false, error: 'Un periodo non ha un identificativo.' };
    if (ids.has(raw.id)) return { ok: false, error: `Periodo ripetuto nel file (${raw.id}).` };
    ids.add(raw.id);
    const { period, errors } = validatePeriod(raw, [], null);
    if (Object.keys(errors).length) return { ok: false, error: `Periodo non valido nel file (dal ${raw.validFrom || '?'}: ${Object.keys(errors).join(', ')}).` };
    periods.push(period);
  }
  const clash = periods.find((a) => periods.some((b) => b.id !== a.id && b.category === a.category && overlaps(a, b)));
  if (clash) return { ok: false, error: 'Il file contiene periodi della stessa categoria che si sovrappongono.' };
  const preferences = [];
  if (o.preferences != null) {
    if (!Array.isArray(o.preferences)) return { ok: false, error: 'Preferenze non valide nel file.' };
    for (const x of o.preferences) {
      if (!x || typeof x.key !== 'string') return { ok: false, error: 'Preferenza non valida nel file.' };
      if (x.key === 'personalization') {
        const v = x.value;
        if (!v || typeof v !== 'object' || Object.keys(DEFAULT_PERSONALIZATION).some((k) => typeof v[k] !== 'boolean')) return { ok: false, error: 'Preferenze della personalizzazione non valide nel file.' };
        preferences.push({ key: 'personalization', value: Object.fromEntries(Object.keys(DEFAULT_PERSONALIZATION).map((k) => [k, v[k]])) });
      }
      // Altre chiavi sconosciute: ignorate e segnalate nel riepilogo.
    }
  }
  return { ok: true, data: { profile, periods, preferences, exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '' }, ignoredPreferences: (o.preferences || []).filter((x) => x && x.key !== 'personalization').length };
}

const samePeriod = (a, b) => JSON.stringify([a.category, a.validFrom, a.validTo, a.provenance, a.data]) === JSON.stringify([b.category, b.validFrom, b.validTo, b.provenance, b.data]);

// Piano del ripristino: che cosa cambierebbe, senza scrivere nulla.
// mode 'merge': aggiunge i periodi nuovi; i conflitti (stesso periodo con
// valori diversi, o sovrapposizione con un periodo esistente) restano
// com'erano e sono elencati; il profilo si scrive solo se l'archivio non ne
// ha uno. mode 'replace': il contenuto del file sostituisce tutto il contesto.
export function planContextImport(current, incoming, mode = 'merge', sameProfileFn = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
  const cur = current.periods || [];
  const byId = Object.fromEntries(cur.map((p) => [p.id, p]));
  const plan = { mode, add: [], identical: [], conflicts: [], overlaps: [], profile: 'none', writes: null };
  incoming.periods.forEach((p) => {
    const ex = byId[p.id];
    if (ex) { (samePeriod(ex, p) ? plan.identical : plan.conflicts).push(p); return; }
    if (mode === 'merge' && cur.some((o) => o.category === p.category && overlaps(o, p))) { plan.overlaps.push(p); return; }
    plan.add.push(p);
  });
  const hasCur = !!current.profile, hasNew = !!incoming.profile;
  if (hasNew && !hasCur) plan.profile = 'add';
  else if (hasNew && hasCur) plan.profile = sameProfileFn(current.profile, incoming.profile) ? 'identical' : 'conflict';
  else plan.profile = hasCur ? 'keep' : 'none';
  if (mode === 'replace') {
    plan.writes = { profile: incoming.profile, periods: incoming.periods, preferences: incoming.preferences, replaceAll: true };
  } else {
    plan.writes = {
      profile: plan.profile === 'add' ? incoming.profile : undefined,
      periods: plan.add,
      preferences: (current.preferences || []).some((x) => x.key === 'personalization') ? [] : incoming.preferences,
      replaceAll: false,
    };
  }
  return plan;
}

// Identificativo nuovo per un periodo (nessuna dipendenza da crypto).
export function newPeriodId(now = Date.now(), rnd = Math.random) {
  return `p-${now.toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`;
}
