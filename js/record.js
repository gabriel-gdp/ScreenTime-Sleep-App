// record.js — un'unica definizione del record di una notte, condivisa da
// interfaccia (bozze, salvataggio), backup e test. Funzioni pure: nessun
// accesso a DOM o database.
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

export const BASE_FIELDS = ['screenTimeTotal', 'lastScreenUse', 'bedtime', 'wakeTime', 'quality'];
export const AWAKENING_FIELDS = ['awakenings', 'awakeMinutes'];
export const DATA_FIELDS = [...BASE_FIELDS, ...AWAKENING_FIELDS];
export const SLEEP_FIELDS = ['bedtime', 'wakeTime', 'quality'];
export const FLAG_FIELDS = ['is_outlier_bedtime', 'outlier_acknowledged_bedtime', 'is_outlier_screen_time', 'outlier_acknowledged_screen_time'];
export const AWAKENINGS_MAX = 20;
export const AWAKE_MINUTES_MAX = 600;

const isEmpty = (v) => v === '' || v == null;
const hasSleep = (r) => !!r && SLEEP_FIELDS.some((f) => !isEmpty(r[f]));

export const EMPTY_DRAFT = Object.freeze({
  screenTimeTotal: '', lastScreenUse: '', bedtime: '', wakeTime: '', quality: null,
  awakeningsOn: null, awakenings: 1, awakeMinutes: '',
});

// Numero da un campo di testo: '' resta '' (non compilato); cifre → intero;
// qualsiasi altra cosa resta testo, così la validazione la segnala invece
// di convertirla in silenzio.
export function parseIntInput(v) {
  if (v === '' || v == null) return '';
  const t = String(v).trim();
  return /^\d+$/.test(t) ? Number(t) : t;
}

export function draftFromRecord(saved) {
  const s = saved || {};
  const d = { ...EMPTY_DRAFT };
  BASE_FIELDS.forEach((f) => { if (!isEmpty(s[f])) d[f] = s[f]; });
  if (Number.isInteger(s.awakenings)) {
    d.awakeningsOn = s.awakenings > 0;
    if (s.awakenings > 0) { d.awakenings = s.awakenings; d.awakeMinutes = s.awakeMinutes; }
  }
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

// Il record che verrebbe salvato da questa bozza (senza i flag di anomalia,
// aggiunti al salvataggio). I campi vuoti restano assenti.
export function draftToRecord(d, saved, date) {
  const r = { date };
  BASE_FIELDS.forEach((f) => { if (!isEmpty(d[f])) r[f] = d[f]; });
  // I risvegli descrivono il mattino: senza nessun dato del mattino non
  // vengono salvati (es. si compila solo la sera, o si svuota il mattino).
  if (hasSleep(r)) {
    if (d.awakeningsOn === true) {
      r.awakenings = d.awakenings;
      r.awakeMinutes = d.awakeMinutes;
    } else if (d.awakeningsOn === false) {
      r.awakenings = 0; r.awakeMinutes = 0;
    } else if (!hasSleep(saved)) {
      // Mattino compilato ora con la casella non selezionata.
      r.awakenings = 0; r.awakeMinutes = 0;
    } else if (Number.isInteger(saved.awakenings)) {
      r.awakenings = saved.awakenings; r.awakeMinutes = saved.awakeMinutes;
    } // altrimenti: notte storica, i risvegli restano non indicati
  }
  return r;
}

export function hasData(r) { return DATA_FIELDS.some((f) => !isEmpty(r[f])); }

// Confronto dei soli dati (ordine dei campi irrilevante, vuoto = assente).
export function sameData(a, b) {
  const pick = (r) => JSON.stringify(DATA_FIELDS.map((f) => (r && !isEmpty(r[f]) ? r[f] : null)));
  return pick(a) === pick(b);
}
