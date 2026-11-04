// demo.js — dati di esempio per vedere le analisi prima di avere abbastanza
// notti reali. Vivono SOLO in memoria: non vengono mai scritti su IndexedDB
// né esportati, e spariscono alla chiusura dell'app.
//
// Generati in modo deterministico (stesso seme → stessi dati), così una
// sessione demo è ripetibile. Contengono di proposito: una relazione
// positiva tra tempo senza schermo e qualità, weekend più tardivi, qualche
// notte mancante o parziale e due anomalie confermate, per mostrare come il
// tool le tratta. Non rappresentano dati reali di nessuno.
import { addDays, pad, sleepComplete } from './analytics.js';

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toHHMM = (mins) => { const m = ((Math.round(mins) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function generateDemoEntries(today, nights = 60, seed = 20261103) {
  const rand = mulberry32(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15; // ≈ N(0,1), limitata
  const entries = {};

  for (let i = nights - 1; i >= 0; i--) {
    const date = addDays(today, -i); // giorno di risveglio
    const r = rand();
    if (r < 0.07) continue; // notte mancante

    const startDow = new Date(addDays(date, -1) + 'T00:00:00').getDay(); // sera della notte
    const weekendEvening = startDow === 5 || startDow === 6; // ven, sab
    const bedMin = 23 * 60 + 15 + (weekendEvening ? 50 : 0) + gauss() * 35;
    const screenFree = clamp(Math.round(35 + gauss() * 30 + (rand() < 0.2 ? 60 : 0)), 2, 200);
    const screenTime = clamp(Math.round(260 + gauss() * 70 + (weekendEvening ? 50 : 0)), 60, 720);
    const duration = clamp(Math.round(445 + (weekendEvening ? 25 : 0) + screenFree * 0.25 + gauss() * 35), 280, 640);
    const quality = clamp(Math.round(5.6 + screenFree / 45 - (screenTime - 260) / 160 + gauss() * 1.0), 1, 10);

    const e = {
      date,
      screenTimeTotal: screenTime,
      lastScreenUse: toHHMM(bedMin - screenFree),
      bedtime: toHHMM(bedMin),
      wakeTime: toHHMM(bedMin + duration),
      quality,
      is_outlier_bedtime: false, outlier_acknowledged_bedtime: false,
      is_outlier_screen_time: false, outlier_acknowledged_screen_time: false,
    };
    if (r > 0.95) { delete e.bedtime; delete e.wakeTime; delete e.quality; } // solo sera
    else if (r > 0.92) { delete e.screenTimeTotal; delete e.lastScreenUse; } // solo mattina
    entries[date] = e;
  }

  // Due anomalie confermate dall'utente (es. una notte molto tardiva e una
  // giornata con screen time eccezionale).
  const lateNight = addDays(today, -4);
  entries[lateNight] = {
    date: lateNight, screenTimeTotal: 340, lastScreenUse: '06:50', bedtime: '07:10', wakeTime: '11:40', quality: 3,
    is_outlier_bedtime: true, outlier_acknowledged_bedtime: true, is_outlier_screen_time: false, outlier_acknowledged_screen_time: false,
  };
  const heavyDay = addDays(today, -17);
  if (entries[heavyDay]) {
    entries[heavyDay].screenTimeTotal = 1010;
    entries[heavyDay].is_outlier_screen_time = true;
    entries[heavyDay].outlier_acknowledged_screen_time = true;
  }

  // La notte appena trascorsa resta da completare, per provare l'inserimento.
  const last = entries[today];
  if (last && sleepComplete(last)) { delete last.bedtime; delete last.wakeTime; delete last.quality; }
  return entries;
}
