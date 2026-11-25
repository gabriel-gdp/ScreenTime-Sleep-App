// ui-trends.js — interfaccia delle analisi descrittive di trends.js:
// SRI da diario (nella Regolarità) e "Andamento di una misura" (L3–L4,
// variabilità abituale). Separato da app.js; riceve gli strumenti comuni.

import { sriFromDiary, trendSeries, TREND_VARIABLES, yToLabel, dayIndex } from './trends.js';
import { hhmmToMinutes } from './analytics.js';

const fmtDur = (m) => { const a = Math.abs(Math.round(m)); const h = Math.floor(a / 60), mm = a % 60; return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm} min`; };
const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

export function sriHTML(entries, endDate, includeOutliers) {
  const r = sriFromDiary(entries, endDate, { includeOutliers });
  const body = r.sri != null
    ? `<p><strong>SRI da diario: ${r.sri}</strong> <span class="muted small">(${r.pairs} coppie di notti consecutive, dal ${fmtDay(r.from)} al ${fmtDay(r.to)})</span></p>
       <p class="muted small">Quanto spesso, alla stessa ora di due giorni consecutivi, eri nello stesso stato (sonno o veglia): 100 = sempre, 0 = per metà del tempo come per caso. Non è un voto e non c'è un valore "giusto" per una persona.</p>`
    : `<p class="muted small">SRI da diario: servono almeno ${r.min} coppie di notti consecutive con orari registrati all'epoca negli ultimi ${r.days} giorni (${r.pairs}/${r.min} finora).</p>`;
  return `<div class="reg-sri" id="reg-sri">${body}
    <details><summary>Come è calcolato l'SRI e limiti</summary>
      <p class="detail"><strong>Metodo</strong> (Sleep Regularity Index, Phillips 2017). Per ogni notte si ricostruisce, minuto per minuto, quando dormivi tra le 12:00 del giorno prima e le 12:00 del risveglio; poi si confrontano le stesse ore di due giorni consecutivi. SRI = 200 × (quota di minuti nello stesso stato − ½). Periodo: 4 settimane intere.</p>
      <p class="detail"><strong>Dati usati.</strong> Come per la deviazione standard: addormentamento e risveglio registrati all'epoca, coerenti; escluse le notti insolite e le anomalie confermate. Una notte mancante elimina due coppie.</p>
      <p class="detail"><strong>Limiti.</strong> Versione "da diario": senza risvegli notturni né sonnellini, che non hanno un orario. Le soglie di popolazione non sono valide per una singola persona e non sono mostrate.</p>
    </details></div>`;
}

const W = 340, H = 190, PAD_L = 46, PAD_R = 8, PAD_T = 10, PAD_B = 24;

function chartSVG(s) {
  const pts = s.points;
  const ys = [...pts.map((p) => p.y), ...s.rolling.filter((r) => r.y != null).map((r) => r.y)];
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 30) { const mid = (hi + lo) / 2; lo = mid - 15; hi = mid + 15; }
  const padY = (hi - lo) * 0.08; lo -= padY; hi += padY;
  const span = Math.max(1, s.days - 1);
  const fromX = dayIndex(s.from);
  const X = (x) => PAD_L + ((x - fromX) / span) * (W - PAD_L - PAD_R);
  // Per gli orari un valore più alto è più tardi: si disegna verso il basso, come sull'orologio dell'actogramma.
  const Y = (y) => (s.kind === 'clock' ? PAD_T + ((y - lo) / (hi - lo)) * (H - PAD_T - PAD_B) : H - PAD_B - ((y - lo) / (hi - lo)) * (H - PAD_T - PAD_B));
  // Etichette a passi regolari (15, 30, 60, 120 o 180 minuti), sugli orari dell'orologio.
  const step = [15, 30, 60, 120, 180, 240].find((st) => (hi - lo) / st <= 4) || 360;
  const base = s.kind === 'clock' ? hhmmToMinutes(s.center) : 0;
  const ticks = [];
  for (let k = Math.ceil((lo + base) / step) * step; k <= hi + base; k += step) ticks.push(k - base);
  const tickLabel = (y) => (s.kind === 'clock' ? yToLabel(y, 'clock', s.center) : fmtDur(y));
  const grid = ticks.map((y) => `<line class="tr-grid" x1="${PAD_L}" x2="${W - PAD_R}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}"/><text class="tr-tick" x="${PAD_L - 4}" y="${(Y(y) + 4).toFixed(1)}" text-anchor="end">${tickLabel(y)}</text>`).join('');
  let path = '', pen = false;
  s.rolling.forEach((r) => { if (r.y == null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(r.x).toFixed(1)},${Y(r.y).toFixed(1)}`; pen = true; });
  const dots = pts.map((p) => `<circle class="tr-pt${p.recorded ? '' : ' hollow'}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.4" data-date="${p.date}"/>${p.unusual ? `<circle class="tr-unusual" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="7" data-date="${p.date}"/>` : ''}`).join('');
  const xl = `<text class="tr-tick" x="${PAD_L}" y="${H - 6}">${fmtDay(s.from)}</text><text class="tr-tick" x="${W - PAD_R}" y="${H - 6}" text-anchor="end">${fmtDay(s.to)}</text>`;
  return `<svg class="trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="tr-svg-title tr-svg-desc">
    <title id="tr-svg-title">${s.label}, ${s.days} notti</title>
    <desc id="tr-svg-desc">${s.n} notti con il valore; linea: media mobile a 7 notti; cerchi larghi: notti molto diverse dalle 28 precedenti. La tabella sotto riporta tutti i valori.</desc>
    ${grid}${path ? `<path class="tr-line" d="${path}"/>` : ''}${dots}${xl}</svg>`;
}

export function trendSectionHTML(entries, { endDate, days, variable, includeOutliers = false }) {
  const v = TREND_VARIABLES[variable] ? variable : 'duration';
  const s = trendSeries(entries, v, endDate, days, { includeOutliers });
  const def = TREND_VARIABLES[v];
  const opts = Object.entries(TREND_VARIABLES).map(([k, d]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${d.label}</option>`).join('');
  const val = (y) => (s.kind === 'clock' ? yToLabel(y, 'clock', s.center) : fmtDur(y));
  let body;
  if (s.n < 2) {
    body = `<p class="muted" id="trend-empty">Troppo pochi valori in questo periodo per un andamento (${s.n}).</p>`;
  } else {
    const slope = s.slopePer30 == null
      ? `<p class="muted small" id="trend-slope">Pendenza: servono almeno ${s.slopeMin} notti con il valore nel periodo (${s.n} ora).</p>`
      : `<p class="small" id="trend-slope">Nel periodo ${s.kind === 'clock' ? `l'orario (${def.label.toLowerCase()}) si è spostato` : `il valore (${def.label.toLowerCase()}) è cambiato`} di circa <strong>${s.slopePer30 >= 0 ? '+' : '−'}${Math.abs(Math.round(s.slopePer30))} minuti al mese</strong>${s.kind === 'clock' ? (s.slopePer30 >= 0 ? ' (più tardi)' : ' (prima)') : ''}. Descrizione della tendenza (pendenza di Theil–Sen), non una previsione né un risultato significativo.</p>`;
    const vb = s.variability;
    const variab = vb.status === 'within' || vb.status === 'outside'
      ? `<p class="small" id="trend-variability">Ultime 7 notti: media ${val(vb.current)}, <strong>${vb.status === 'within' ? 'entro' : 'fuori dalla'} tua variabilità abituale</strong> (medie settimanali delle ${vb.weeks} settimane precedenti: ${val(vb.mean)} ± ${fmtDur(vb.sd)}). Non dice se è meglio o peggio.</p>`
      : `<p class="muted small" id="trend-variability">Confronto con la tua variabilità abituale: ${vb.status === 'few_current' ? `servono almeno 4 valori nelle ultime 7 notti (${vb.currentN} ora)` : `servono almeno ${vb.min} settimane precedenti con almeno 4 valori (${vb.weeks} ora)`}.</p>`;
    const unusual = s.madAvailable
      ? `<p class="small">${s.nUnusual ? `${s.nUnusual} ${s.nUnusual === 1 ? 'notte molto diversa' : 'notti molto diverse'} dalle 28 precedenti (cerchio largo)` : 'Nessuna notte molto diversa dalle 28 precedenti'}: è solo un'indicazione visiva, le notti restano in tutte le statistiche.</p>`
      : '<p class="muted small">Notti molto diverse dal solito: servono almeno 14 valori nelle 28 notti precedenti.</p>';
    const rows = s.points.map((p) => { const r = s.rolling.find((q) => q.date === p.date); return `<tr><td>${fmtDay(p.date)}</td><td>${val(p.y)}${p.recorded ? '' : '°'}</td><td>${r && r.y != null ? val(r.y) : '—'}</td><td>${p.unusual ? 'sì' : ''}</td></tr>`; }).join('');
    body = `${chartSVG(s)}
      <p class="muted small">${s.n} notti con il valore, ${s.nRecorded} registrate all'epoca (punti pieni; vuoti se ricostruite o di origine non nota). Linea: media mobile su 7 notti, se ci sono almeno 4 valori. ${s.kind === 'clock' ? 'Più in basso = più tardi.' : ''}</p>
      ${slope}${variab}${unusual}
      <details><summary>Vedi come tabella</summary><div class="table-scroll"><table class="tr-table"><caption class="visually-hidden">${def.label} notte per notte</caption><thead><tr><th scope="col">Notte</th><th scope="col">Valore</th><th scope="col">Media mobile</th><th scope="col">Molto diversa</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted small">° = non registrato all'epoca.</p></details>
      <details><summary>Come è calcolato e limiti</summary>
        <p class="detail"><strong>Media mobile.</strong> Media dei valori nelle 7 notti centrate su ogni notte (3 prima, 3 dopo); ai bordi del periodo la finestra si accorcia. Per gli orari i valori sono letti attorno alla mediana del periodo, così la mezzanotte non crea salti.</p>
        <p class="detail"><strong>Pendenza.</strong> Mediana delle pendenze tra tutte le coppie di notti (Theil–Sen): poco influenzata da singole notti estreme. Da almeno 28 notti. Nessun intervallo né p-value: le notti vicine si somigliano e i test classici non sono validi.</p>
        <p class="detail"><strong>Notti molto diverse.</strong> Distanza dalla mediana delle 28 notti precedenti superiore a 3 × 1,4826 × MAD (deviazione assoluta mediana). Non si usa per qualità e risvegli. Nessuna notte viene esclusa: l'esclusione resta una tua scelta, con la conferma delle anomalie.</p>
        <p class="detail"><strong>Variabilità abituale.</strong> Media delle ultime 7 notti confrontata con le medie delle settimane precedenti (fino a 12, almeno 8): "entro" se la differenza non supera una deviazione standard di quelle medie.</p>
        <p class="detail"><strong>Notti usate.</strong> Valgono i filtri delle descrizioni scelti sopra. Le anomalie confermate sugli orari sono escluse, come nelle altre statistiche, salvo "Includi le anomalie".</p>
      </details>`;
  }
  return `
    <section class="analysis-block" aria-labelledby="trend-title" id="trend-section">
      <h2 class="section-h serif" id="trend-title">Andamento di una misura</h2>
      <div class="card card-pad">
        <div class="pf-field trend-pick"><label for="trend-var">Misura</label><select class="pf-input" id="trend-var">${opts}</select></div>
        ${body}
      </div>
    </section>`;
}
