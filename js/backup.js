// backup.js — backup completo in JSON e ripristino sicuro.
//
// JSON e CSV hanno scopi diversi: il CSV serve per analizzare i dati altrove
// (una riga per notte, con i valori derivati); il JSON serve per RIPRISTINARE
// l'app: contiene i record esattamente come sono salvati, più le
// informazioni sullo schema necessarie a importarli in una versione futura.
//
// Regole dell'importazione (vedi docs/DATA_MODEL.md §7):
// - il file viene validato per intero PRIMA di toccare il database: un
//   solo record non valido fa rifiutare tutto il file, con il motivo;
// - si mostra un riepilogo: notti nuove, identiche, in conflitto;
// - di default si aggiungono solo le notti mancanti; sostituire le notti in
//   conflitto è una scelta esplicita, da confermare;
// - le notti presenti sul dispositivo ma non nel backup non vengono mai
//   toccate; le date sono chiavi uniche, quindi non possono nascere doppioni;
// - la scrittura avviene in un'unica transazione (db.js: importEntries):
//   se fallisce, il database resta com'era.
import { computeNightMetrics } from './analytics.js';
import { DATA_FIELDS, FLAG_FIELDS, SLEEP_FIELDS, AWAKENINGS_MAX, AWAKE_MINUTES_MAX } from './record.js';

export const BACKUP_FORMAT = 'diario-del-sonno-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024; // un anno di notti occupa ~100 KB

const ALLOWED = new Set(['date', ...DATA_FIELDS, ...FLAG_FIELDS]);
const pad = (n) => String(n).padStart(2, '0');

export function buildBackup(entries, { schemaVersion, now = new Date() }) {
  const records = Object.keys(entries).sort().map((d) => entries[d]);
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    exportedAt: now.toISOString(),
    recordCount: records.length,
    records,
  };
}

export function backupFilename(now = new Date()) {
  return `diario-del-sonno-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// Controlla un record con le stesse regole dell'inserimento manuale.
// Ritorna un messaggio d'errore leggibile o null.
export function recordError(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'non è un record valido';
  if (!isRealDate(r.date)) return `data non valida (${JSON.stringify(r.date)})`;
  const unknown = Object.keys(r).filter((k) => !ALLOWED.has(k));
  if (unknown.length) return `${r.date}: campi sconosciuti (${unknown.join(', ')})`;
  if ('screenTimeTotal' in r && !(Number.isInteger(r.screenTimeTotal) && r.screenTimeTotal >= 0 && r.screenTimeTotal < 1440)) return `${r.date}: screen time non valido`;
  for (const f of ['lastScreenUse', 'bedtime', 'wakeTime']) if (f in r && !isTime(r[f])) return `${r.date}: orario non valido in ${f}`;
  if ('quality' in r && !(Number.isInteger(r.quality) && r.quality >= 1 && r.quality <= 10)) return `${r.date}: qualità non valida`;
  for (const f of FLAG_FIELDS) if (f in r && typeof r[f] !== 'boolean') return `${r.date}: ${f} non è vero/falso`;
  // Risvegli: entrambi presenti o entrambi assenti; 0 ↔ 0; con almeno un
  // risveglio, almeno un minuto; solo insieme a dati del mattino.
  const hasA = 'awakenings' in r, hasM = 'awakeMinutes' in r;
  if (hasA !== hasM) return `${r.date}: numero e minuti dei risvegli devono essere presenti insieme`;
  if (hasA) {
    if (!(Number.isInteger(r.awakenings) && r.awakenings >= 0 && r.awakenings <= AWAKENINGS_MAX)) return `${r.date}: numero di risvegli non valido`;
    if (!(Number.isInteger(r.awakeMinutes) && r.awakeMinutes >= 0 && r.awakeMinutes <= AWAKE_MINUTES_MAX)) return `${r.date}: minuti svegli non validi`;
    if ((r.awakenings === 0) !== (r.awakeMinutes === 0)) return `${r.date}: numero e minuti dei risvegli incoerenti`;
    if (!SLEEP_FIELDS.some((f) => f in r)) return `${r.date}: risvegli indicati senza dati del mattino`;
  }
  if (!DATA_FIELDS.some((f) => f in r)) return `${r.date}: nessun dato`;
  return null;
}

// Orari incoerenti (es. ultimo utilizzo dopo l'addormentamento): NON fanno
// rifiutare il file. Notti così possono esistere già sul dispositivo (dati
// migrati dalla v1, quando il controllo non c'era) e un backup creato
// dall'app deve essere sempre ripristinabile. Vengono importate come sono,
// segnalate nel riepilogo, e il diario le mostra con l'errore da correggere.
export function recordIncoherent(r) {
  const m = computeNightMetrics(r, r.date);
  return !!(m.durationError || m.screenFreeError || m.effectiveError);
}

// Legge e valida un file di backup. `migrate(records, fromVersion)` porta
// record di schemi precedenti a quello attuale (db.js: migrateRecords).
export function parseBackup(text, { schemaVersion, migrate }) {
  const fail = (error) => ({ ok: false, error });
  if (typeof text !== 'string' || !text.trim()) return fail('Il file è vuoto.');
  if (text.length > MAX_BACKUP_BYTES) return fail('Il file è troppo grande per essere un backup di questa app.');
  let data;
  try { data = JSON.parse(text); } catch (e) { return fail('Il file non è un JSON leggibile (forse è danneggiato o non è un backup).'); }
  if (!data || data.format !== BACKUP_FORMAT) return fail('Il file non è un backup del Diario del sonno.');
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) return fail(`Formato di backup ${data.formatVersion} non supportato da questa versione dell'app.`);
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) return fail('Versione dello schema mancante o non valida.');
  if (data.schemaVersion > schemaVersion) return fail("Il backup è stato creato da una versione più recente dell'app: aggiorna l'app prima di importarlo.");
  if (!Array.isArray(data.records)) return fail("Il file non contiene l'elenco delle notti.");
  if (Number.isInteger(data.recordCount) && data.recordCount !== data.records.length) return fail(`Il file dichiara ${data.recordCount} notti ma ne contiene ${data.records.length}: potrebbe essere incompleto.`);

  let records = data.records;
  // Gli errori di forma (date, tipi) si controllano anche sui record di
  // schemi precedenti, prima della migrazione.
  for (const r of records) {
    if (!r || typeof r !== 'object' || !isRealDate(r.date)) return fail(`Notte non valida nel backup: ${r && typeof r === 'object' ? `data non valida (${JSON.stringify(r.date)})` : 'record non leggibile'}.`);
  }
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.date)) return fail(`La notte ${r.date} compare due volte nel backup.`);
    seen.add(r.date);
  }
  const migrated = data.schemaVersion < schemaVersion;
  if (migrated) records = migrate(records, data.schemaVersion);
  for (const r of records) {
    const err = recordError(r);
    if (err) return fail(`Notte non valida nel backup: ${err}. Nessun dato è stato importato.`);
  }
  const dates = records.map((r) => r.date).sort();
  return {
    ok: true,
    records: records.map((r) => ({ ...r })),
    meta: {
      exportedAt: data.exportedAt || null, schemaVersion: data.schemaVersion, migrated,
      count: records.length, firstDate: dates[0] || null, lastDate: dates[dates.length - 1] || null,
      incoherent: records.filter(recordIncoherent).map((r) => r.date),
    },
  };
}

// Forma canonica per confrontare due record (ordine dei campi irrilevante,
// flag assenti = falsi).
function canonical(r) {
  const o = { date: r.date };
  DATA_FIELDS.forEach((f) => { if (r[f] !== undefined && r[f] !== null && r[f] !== '') o[f] = r[f]; });
  FLAG_FIELDS.forEach((f) => { o[f] = !!r[f]; });
  return JSON.stringify(o);
}
export const sameRecord = (a, b) => canonical(a) === canonical(b);

// Confronta il backup con i dati del dispositivo e decide cosa scrivere.
// mode 'add': solo notti nuove (le notti in conflitto restano come sono).
// mode 'replace': notti nuove + notti in conflitto sostituite dal backup.
export function planImport(records, existing, mode = 'add') {
  const add = [], identical = [], conflicts = [];
  records.forEach((r) => {
    const cur = existing[r.date];
    if (!cur) add.push(r);
    else if (sameRecord(cur, r)) identical.push(r);
    else conflicts.push(r);
  });
  const toWrite = mode === 'replace' ? [...add, ...conflicts] : [...add];
  return { add, identical, conflicts, toWrite, mode };
}

export function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
