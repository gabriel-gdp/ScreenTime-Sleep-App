// config.js — tutte le soglie dell'app in un unico punto.
//
// Le formule leggono i valori da qui: per cambiare una soglia si modifica
// solo questo file, senza toccare le formule. Ogni voce è documentata in
// docs/ANALYTICS_METHODOLOGY.md (sezione "Configurazione delle soglie"),
// con finalità, motivazione, limiti, analisi interessate e condizioni di
// astensione; un test verifica che documento e file restino allineati.
//
// Nessuna di queste soglie è uno standard scientifico universale. Sono
// scelte progettuali (approvate in via provvisoria il 17/11/2026, salvo
// gli avvisi d'inserimento già in uso). Una numerosità minima è una
// condizione necessaria, non sufficiente: superarla non garantisce un
// risultato affidabile.

export const ANALYSIS_CONFIG = Object.freeze({
  // --- Avvisi d'inserimento (non bloccanti; in uso dallo schema 2) ---
  DURATION_WARN_BELOW_MIN: 120,        // intervallo di sonno < 2 h
  DURATION_WARN_ABOVE_MIN: 840,        // intervallo di sonno > 14 h
  SCREEN_FREE_WARN_ABOVE_MIN: 360,     // tempo senza schermo > 6 h
  SCREEN_TIME_WARN_ABOVE_MIN: 960,     // screen time giornaliero > 16 h
  ONSET_PLAUSIBLE_FROM: '18:00',       // fascia plausibile dell'addormentamento
  ONSET_PLAUSIBLE_TO: '06:00',
  WAKE_PLAUSIBLE_FROM: '03:00',        // fascia plausibile del risveglio
  WAKE_PLAUSIBLE_TO: '14:00',
  LATENCY_CONFIRM_ABOVE_MIN: 180,      // tentativo → addormentamento oltre 3 h: conferma

  // --- Etichette di copertura del riepilogo (in uso) ---
  COVERAGE_WEEK_HIGH_NIGHTS: 6,        // su 7: "quasi completa"
  COVERAGE_WEEK_MID_NIGHTS: 3,         // su 7: "parziale"
  COVERAGE_HIGH_SHARE: 0.8,            // altri periodi
  COVERAGE_MID_SHARE: 0.33,

  // --- Statistiche descrittive (riepilogo di periodo, andamento) ---
  MEDIAN_MIN_NIGHTS: 3,
  IQR_MIN_NIGHTS: 5,
  ROLLING_WINDOW_NIGHTS: 7,
  ROLLING_MIN_VALUES: 4,
  VARIABILITY_HISTORY_WEEKS: 8,
  VARIABILITY_WINDOW_WEEKS: 12,       // settimane precedenti considerate (al massimo)
  THEIL_SEN_MIN_NIGHTS: 28,            // pendenza descrittiva solo da 28 notti

  // --- Regolarità ---
  REGULARITY_WINDOW_DAYS: 28,
  REGULARITY_MIN_NIGHTS: 14,
  SJL_MIN_NIGHTS_PER_TYPE: 4,
  SRI_WINDOW_DAYS: 28,                 // SRI da diario: 4 settimane intere
  SRI_MIN_PAIRS: 14,                   // coppie di notti consecutive valide
  REGULARITY_MIN_NIGHTS_PER_TYPE: 7,

  // --- Notti insolite (indicazione visiva) ---
  MAD_K: 3,
  MAD_WINDOW_NIGHTS: 28,
  MAD_MIN_VALUES: 14,

  // --- Provenienza ---
  PROSPECTIVE_WINDOW_HOURS: 36,

  // --- Domande principali P1–P3 ---
  N_EFF_MIN: 30,
  GROUP_MIN_NIGHTS: 10,
  MINORITY_SHARE_MIN: 0.15,
  DAYTYPE_KNOWN_MIN_SHARE: 0.8,
  RESIDUAL_HALF_WINDOW_NIGHTS: 14,
  RESIDUAL_MIN_VALUES: 15,
  HABITUAL_WINDOW_NIGHTS: 28,
  HABITUAL_MIN_VALUES: 14,
  PRESLEEP_WINDOW_MIN: 60,
  BH_Q: 0.10,

  // --- Personalizzazione (Profilo e contesto, §15) ---
  ALARM_NEAR_MIN: 15,                  // risveglio "vicino" alla sveglia dichiarata: entro ±15 min
  CONTEXT_WINDOW_DAYS: 365,            // notti considerate nei confronti tra periodi
  CONTEXT_GROUP_MIN_NIGHTS: 7,         // notti minime per mostrare un gruppo
  CONTEXT_HIGHLIGHT_MIN_NIGHTS: 14,    // notti minime per parlare di "differenza chiara"
  SUGGESTION_WINDOW_DAYS: 14,          // finestra degli spunti legati agli obiettivi
  SUGGESTION_MIN_NIGHTS: 7,            // notti valide minime per uno spunto
  SUGGESTION_MISS_SHARE: 0.5,          // spunto se l'obiettivo manca in almeno metà delle notti
  SLEEP_NEED_GAP_MIN: 30,              // differenza minima dal fabbisogno percepito

  // --- Definizioni operative dei chip (valori iniziali, modificabili) ---
  LATE_CAFFEINE_FROM: '15:00',
  ALCOHOL_FROM: '18:00',

  // --- Schema settimanale iniziale del tipo di giorno (0 = domenica) ---
  // Vincolato dal lunedì al venerdì, libero sabato e domenica. Proposta
  // modificabile nelle Impostazioni; il valore della singola notte prevale.
  DEFAULT_DAYTYPE_TEMPLATE: Object.freeze(['free', 'constrained', 'constrained', 'constrained', 'constrained', 'constrained', 'free']),
});

export const hhmmToMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
