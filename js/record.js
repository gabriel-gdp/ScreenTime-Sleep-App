// record.js — un'unica definizione del record di una notte, condivisa da
// interfaccia (bozze, salvataggio), backup e test. Funzioni pure: nessun
// accesso a DOM o database. Modello completo: docs/DATA_MODEL.md.
//
// Risvegli notturni (schema 3): nella bozza la casella "Ho avuto risvegli"
// è `awakeningsOn` con tre stati:
//   true  → risvegli indicati: `awakenings` (1–20) e `awakeMinutes` (1–600);
//   false → nessun risveglio, salvato esplicitamente come 0 / 0;
//   null  → non indicato. Per una notte il cui mattino viene compilato ora
//           equivale a "casella non selezionata" e si salva 0 / 0; per una
//           notte il cui mattino era già salvato prima di questa funzione
//           (notte storica) resta NON indicato: modificare altri campi non
//           trasforma mai un dato sconosciuto in zero.
//
// Schema 4 (tutti facoltativi; assente = non indicato, mai "no"):
//   inBedTime, sleepAttempt      coricamento e tentativo di dormire (HH:MM);
//   dayType (+ dayTypeSource)    mattino vincolato/libero, confermato o dallo
//                                schema settimanale;
//   lateCaffeine, alcohol,       indicatori a tre stati (assente/false/true),
//   stress, unusualNight         con le definizioni in vigore in contextDefs;
//   screenTimeDate (+ Status,    giorno di calendario del totale di Screen
//   Rule)                        Time, salvato esplicitamente per i dati nuovi;
//   lastScreenUseSource          'button' (pulsante "Adesso") o 'manual';
//   meta                         date tecniche e provenienza per campo.
// Nessuno di questi campi viene aggiunto alle notti esistenti dalla
// migrazione: compaiono solo quando la notte viene compilata o classificata.
import { ANALYSIS_CONFIG as CFG } from './config.js';

export const BASE_FIELDS = ['screenTimeTotal', 'lastScreenUse', 'bedtime', 'wakeTime', 'quality'];
export const AWAKENING_FIELDS = ['awakenings', 'awakeMinutes'];
export const SLEEP_TIME_FIELDS = ['inBedTime', 'sleepAttempt'];
export const CONTEXT_FIELDS = ['lateCaffeine', 'alcohol', 'stress', 'unusualNight'];
// Campi che portano un valore della notte e hanno una provenienza.
export const DATA_FIELDS = [...BASE_FIELDS, ...AWAKENING_FIELDS, ...SLEEP_TIME_FIELDS, 'dayType', ...CONTEXT_FIELDS];
export const PROVENANCE_FIELDS = DATA_FIELDS;
// Informazioni accessorie sui valori (non sono dati della notte).
export const SCREEN_DATE_FIELDS = ['screenTimeDate', 'screenTimeDateStatus', 'screenTimeDateRule'];
export const AUX_FIELDS = ['dayTypeSource', ...SCREEN_DATE_FIELDS, 'lastScreenUseSource', 'contextDefs'];
// Un record esiste se ha almeno uno di questi valori.
export const CORE_FIELDS = [...BASE_FIELDS, ...SLEEP_TIME_FIELDS];
export const SLEEP_FIELDS = ['bedtime', 'wakeTime', 'quality'];
// Dati del mattino: risvegli, tipo di giorno e indicatori si salvano solo
// insieme ad almeno uno di questi (si compilano nella parte del mattino).
export const MORNING_FIELDS = [...SLEEP_FIELDS, ...SLEEP_TIME_FIELDS];
export const FLAG_FIELDS = ['is_outlier_bedtime', 'outlier_acknowledged_bedtime', 'is_outlier_screen_time', 'outlier_acknowledged_screen_time'];
export const AWAKENINGS_MAX = 20;
export const AWAKE_MINUTES_MAX = 600;

export const DAY_TYPES = ['constrained', 'free'];
export const DAY_TYPE_SOURCES = ['confirmed', 'template'];
export const PROVENANCE_VALUES = ['prospective', 'transcribed', 'retrospective', 'unknown'];
export const PROVENANCE_SET_BY = ['auto', 'user'];
// Giorno di riferimento dello Screen Time:
//   verified  → salvato esplicitamente (inserimento con il giorno indicato
//               nell'etichetta, oppure correzione manuale);
//   unknown   → l'utente ha indicato che non è determinabile;
//   presumed  → MAI salvato: è lo stato dei record storici senza
//               screenTimeDate, a cui si attribuisce per convenzione il
//               giorno precedente al risveglio (regola HISTORIC_RULE).
export const SCREEN_DATE_STORED_STATUS = ['verified', 'unknown'];
export const SCREEN_DATE_RULES = ['entry_label', 'manual_correction', 'historic_convention_confirmed'];
export const HISTORIC_SCREEN_DATE_RULE = 'historic_convention_wake_minus_1';

const isEmpty = (v) => v === '' || v == null;
const hasAny = (r, fields) => !!r && fields.some((f) => !isEmpty(r[f]));
const hasSleep = (r) => hasAny(r, SLEEP_FIELDS);
const hasMorning = (r) => hasAny(r, MORNING_FIELDS);
const pad = (n) => String(n).padStart(2, '0');
// Istante locale di `date` alle `time` (stessa regola di analytics.js;
// duplicata qui per non creare dipendenze circolari tra i moduli).
function localInstant(date, time) {
  const d = new Date(date + 'T00:00:00');
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}
function dayBefore(date) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const EMPTY_DRAFT = Object.freeze({
  screenTimeTotal: '', lastScreenUse: '', bedtime: '', wakeTime: '', quality: null,
  awakeningsOn: null, awakenings: 1, awakeMinutes: '',
  inBedTime: '', sleepAttempt: '',
  dayType: null, dayTypeSource: null,
  lateCaffeine: null, alcohol: null, stress: null, unusualNight: null,
  lastScreenUseSource: null,
});

// Numero da un campo di testo: '' resta '' (non compilato); cifre → intero;
// qualsiasi altra cosa resta testo, così la validazione la segnala invece
// di convertirla in silenzio.
export function parseIntInput(v) {
  if (v === '' || v == null) return '';
  const t = String(v).trim();
  return /^\d+$/.test(t) ? Number(t) : t;
}

// Tipo di giorno proposto dallo schema settimanale per il mattino di `date`.
export function templateDayType(date, template = CFG.DEFAULT_DAYTYPE_TEMPLATE) {
  const v = template[new Date(date + 'T00:00:00').getDay()];
  return DAY_TYPES.includes(v) ? v : null;
}

// `template`: schema settimanale in vigore. Lo si propone solo per un
// mattino ancora da compilare: per una notte con il mattino già salvato
// (anche storica) il tipo di giorno resta quello salvato o non indicato,
// così modificare un altro campo non assegna mai un valore in silenzio.
export function draftFromRecord(saved, date, template) {
  const s = saved || {};
  const d = { ...EMPTY_DRAFT };
  [...BASE_FIELDS, ...SLEEP_TIME_FIELDS].forEach((f) => { if (!isEmpty(s[f])) d[f] = s[f]; });
  if (Number.isInteger(s.awakenings)) {
    d.awakeningsOn = s.awakenings > 0;
    if (s.awakenings > 0) { d.awakenings = s.awakenings; d.awakeMinutes = s.awakeMinutes; }
  }
  CONTEXT_FIELDS.forEach((f) => { if (typeof s[f] === 'boolean') d[f] = s[f]; });
  if (DAY_TYPES.includes(s.dayType)) {
    d.dayType = s.dayType;
    d.dayTypeSource = s.dayTypeSource || 'confirmed';
  } else if (date && !hasMorning(s)) {
    d.dayType = templateDayType(date, template);
    d.dayTypeSource = d.dayType ? 'template' : null;
  }
  if (s.lastScreenUseSource) d.lastScreenUseSource = s.lastScreenUseSource;
  return d;
}

// True se il mattino della notte era salvato ma i risvegli no: dato
// storico sconosciuto, da non sovrascrivere con uno zero.
export function awakeningsUnknownHistoric(saved) {
  return hasSleep(saved) && !Number.isInteger(saved.awakenings);
}

// Validazione dei soli campi dei risvegli (obbligatori solo con la casella
// selezionata). Ritorna null oppure { missing: bool, text }.
export function awakeningsDraftError(d) {
  if (d.awakeningsOn !== true) return null;
  if (!(Number.isInteger(d.awakenings) && d.awakenings >= 1 && d.awakenings <= AWAKENINGS_MAX)) {
    return { missing: isEmpty(d.awakenings), text: `Indica il numero di risvegli (da 1 a ${AWAKENINGS_MAX}).` };
  }
  if (isEmpty(d.awakeMinutes)) return { missing: true, text: 'Indica quanti minuti sei rimasto/a sveglio/a in totale durante la notte.' };
  if (!(Number.isInteger(d.awakeMinutes) && d.awakeMinutes >= 1 && d.awakeMinutes <= AWAKE_MINUTES_MAX)) {
    return { missing: false, text: `I minuti svegli devono essere un numero intero tra 1 e ${AWAKE_MINUTES_MAX}.` };
  }
  return null;
}

// Il record che verrebbe salvato da questa bozza (senza flag di anomalia e
// senza metadati, aggiunti al salvataggio). I campi vuoti restano assenti.
// `defs`: definizioni dei chip in vigore ({ lateCaffeineFrom, alcoholFrom }).
export function draftToRecord(d, saved, date, defs = {}) {
  const r = { date };
  [...BASE_FIELDS, ...SLEEP_TIME_FIELDS].forEach((f) => { if (!isEmpty(d[f])) r[f] = d[f]; });
  const s = saved || {};
  // Risvegli, tipo di giorno e indicatori descrivono il mattino: senza
  // nessun dato del mattino non vengono salvati (es. solo la sera).
  if (hasMorning(r)) {
    if (d.awakeningsOn === true) {
      r.awakenings = d.awakenings;
      r.awakeMinutes = d.awakeMinutes;
    } else if (d.awakeningsOn === false) {
      r.awakenings = 0; r.awakeMinutes = 0;
    } else if (!hasMorning(saved)) {
      // Mattino compilato ora con la casella non selezionata.
      r.awakenings = 0; r.awakeMinutes = 0;
    } else if (Number.isInteger(s.awakenings)) {
      r.awakenings = s.awakenings; r.awakeMinutes = s.awakeMinutes;
    } // altrimenti: notte storica, i risvegli restano non indicati
    if (DAY_TYPES.includes(d.dayType)) {
      r.dayType = d.dayType;
      r.dayTypeSource = d.dayTypeSource === 'template' ? 'template' : 'confirmed';
    }
    const contextDefs = {};
    CONTEXT_FIELDS.forEach((f) => {
      if (typeof d[f] !== 'boolean') return;
      r[f] = d[f];
      const defKey = CONTEXT_DEF_KEY[f];
      if (!defKey) return;
      // La definizione salvata con la risposta resta quella dell'epoca,
      // anche se nel frattempo l'orario è stato cambiato nelle Impostazioni.
      const old = s[f] === d[f] && s.contextDefs && s.contextDefs[defKey];
      contextDefs[defKey] = old || defs[defKey] || CFG[DEF_DEFAULT[defKey]];
    });
    if (Object.keys(contextDefs).length) r.contextDefs = contextDefs;
  }
  if (r.lastScreenUse) {
    if (d.lastScreenUseSource === 'button' || d.lastScreenUseSource === 'manual') r.lastScreenUseSource = d.lastScreenUseSource;
  }
  if (r.screenTimeTotal != null) {
    if (s.screenTimeTotal === r.screenTimeTotal) {
      // Valore invariato: si conserva com'era il giorno di riferimento
      // (anche assente = presunto, per i dati storici).
      SCREEN_DATE_FIELDS.forEach((f) => { if (s[f] != null) r[f] = s[f]; });
    } else {
      // Nuovo valore inserito con l'etichetta "Screen time di <giorno>":
      // il giorno è quello mostrato, salvato in modo esplicito.
      r.screenTimeDate = dayBefore(date);
      r.screenTimeDateStatus = 'verified';
      r.screenTimeDateRule = 'entry_label';
    }
  }
  return r;
}
const CONTEXT_DEF_KEY = { lateCaffeine: 'lateCaffeineFrom', alcohol: 'alcoholFrom' };
const DEF_DEFAULT = { lateCaffeineFrom: 'LATE_CAFFEINE_FROM', alcoholFrom: 'ALCOHOL_FROM' };

export function hasData(r) { return hasAny(r, CORE_FIELDS); }

// Confronto dei dati (valori e informazioni accessorie; ordine dei campi
// irrilevante, vuoto = assente). Esclusi metadati e flag di anomalia.
const COMPARED = [...DATA_FIELDS, ...AUX_FIELDS];
export function sameData(a, b) {
  const pick = (r) => JSON.stringify(COMPARED.map((f) => (r && !isEmpty(r[f]) ? r[f] : null)));
  return pick(a) === pick(b);
}

// ---------- Giorno di riferimento dello Screen Time ----------
// { date, status: 'verified' | 'presumed' | 'unknown', rule } oppure null
// se la notte non ha un totale di Screen Time.
export function screenTimeReference(r) {
  if (!r || r.screenTimeTotal == null || r.screenTimeTotal === '') return null;
  if (r.screenTimeDateStatus === 'unknown') return { date: null, status: 'unknown', rule: r.screenTimeDateRule || null };
  if (r.screenTimeDate) return { date: r.screenTimeDate, status: 'verified', rule: r.screenTimeDateRule || null };
  return { date: dayBefore(r.date), status: 'presumed', rule: HISTORIC_SCREEN_DATE_RULE };
}

// ---------- Provenienza per campo ----------
export function provenanceOf(r, field) {
  const m = r && r.meta && r.meta.fields && r.meta.fields[field];
  return m && PROVENANCE_VALUES.includes(m.provenance) ? m.provenance : 'unknown';
}

// Istante di riferimento per la tempestività: il risveglio finale della
// notte; se manca, le 12:00 del giorno del risveglio.
export function timelinessReference(r) {
  return localInstant(r.date, r && r.wakeTime ? r.wakeTime : '12:00');
}

const valueKey = (v) => (v == null || v === '' ? null : JSON.stringify(v));
// Campi il cui valore è nuovo o diverso da quello salvato.
export function changedFields(next, saved) {
  return PROVENANCE_FIELDS.filter((f) => valueKey(next[f]) !== null && valueKey(next[f]) !== valueKey(saved && saved[f]));
}
// Campi nuovi o modificati inseriti oltre PROSPECTIVE_WINDOW_HOURS dal
// risveglio: per questi l'app chiede da dove vengono.
export function lateChangedFields(next, saved, now = new Date()) {
  const limit = timelinessReference(next).getTime() + CFG.PROSPECTIVE_WINDOW_HOURS * 3600000;
  return now.getTime() > limit ? changedFields(next, saved) : [];
}

// Aggiunge al record i metadati: date tecniche e provenienza dei campi.
// - campo invariato: conserva la provenienza che aveva (anche nessuna =
//   unknown per i dati storici);
// - campo nuovo o modificato: 'prospective' se inserito entro la finestra,
//   altrimenti la risposta dell'utente (`lateAnswer`), o 'unknown';
// - campo rimosso: la sua provenienza viene tolta.
// createdAt non viene mai inventato per le notti salvate senza metadati.
export function withMeta(next, saved, now = new Date(), lateAnswer = null) {
  const iso = now.toISOString();
  const late = new Set(lateChangedFields(next, saved, now));
  const changed = new Set(changedFields(next, saved));
  const oldFields = (saved && saved.meta && saved.meta.fields) || {};
  const fields = {};
  PROVENANCE_FIELDS.forEach((f) => {
    if (valueKey(next[f]) === null) return;
    if (!changed.has(f)) { if (oldFields[f]) fields[f] = { ...oldFields[f] }; return; }
    if (!late.has(f)) fields[f] = { provenance: 'prospective', enteredAt: iso, provenanceSetBy: 'auto', provenanceSetAt: iso };
    else {
      const p = PROVENANCE_VALUES.includes(lateAnswer) ? lateAnswer : 'unknown';
      fields[f] = { provenance: p, enteredAt: iso, provenanceSetBy: lateAnswer ? 'user' : 'auto', provenanceSetAt: iso };
    }
  });
  const meta = { updatedAt: iso, fields };
  if (saved && saved.meta && saved.meta.createdAt) meta.createdAt = saved.meta.createdAt;
  else if (!saved) meta.createdAt = iso;
  return { ...next, meta };
}
