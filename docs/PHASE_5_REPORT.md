# Fase 5 — Andamento e Fondamento scientifico: report

Data: 18/11/2026. Perimetro: roadmap 5.1–5.4 (`docs/research/IMPLEMENTATION_ROADMAP.md`), specifica in `docs/research/FINAL_ANALYTICS_SPEC.md` §8–9 e regole d'uso delle fonti in `docs/research/SCIENTIFIC_AUDIT.md` §8. Punto di partenza: la versione della Fase 4.1.

## Che cosa è stato fatto

| # | Intervento | Dove | Verifica |
|---|---|---|---|
| 5.1 | **Filtri delle descrizioni.** Tipo di giorno; notti insolite (escluse di default, come da specifica); origine (tutte / solo registrate all'epoca). Valgono per panoramica e orari, non per regolarità e P1–P3. Mostrano sempre che cosa escludono; la scelta resta sul dispositivo; lavorano su copie, quindi i dati salvati non cambiano | `analytics.js` (`applyDescriptiveFilters`), `app.js` | `unit/phase5`, `browser/phase5` |
| 5.2 | **Grafico degli orari (actogramma).** Una riga per notte (7/28/90) con: tratto a letto → tentativo, tentativo → addormentamento, sonno fino al risveglio, punto dell'ultimo utilizzo, segno di H (come in P1–P3). Pieno se il dato è registrato all'epoca, vuoto se no. Fascia per i mattini liberi, segno per le notti insolite. Titolo e descrizione accessibili e tabella completa | `app.js` (`actogramHTML`), `styles.css` | `browser/phase5` |
| 5.3 | **Schede a sette elementi** per P1–P3: che cosa si analizza, quali dati, periodo e numeri, come è calcolato (con la formula), nei tuoi dati, limiti e spiegazioni alternative, Fondamento scientifico. "Evidenza generale" separata dal risultato personale; Fondamento anche per la regolarità | `app.js` | `browser/phase5` (ordine dei sette elementi, risultato senza citazioni) |
| 5.4 | **Fondamento scientifico offline.** 38 fonti con stato e data di verifica, identificativi e collegamento all'originale; sezione nelle Impostazioni con i gruppi per stato; incluso nella cache della PWA | `bibliography.js`, `app.js`, `service-worker.js` (cache v14) | `unit/phase5` (regole 1–6, ogni numero confrontato con l'audit) |

## Correzioni emerse durante il lavoro
- **Etichette delle soglie.** Nella tabella della metodologia `ROLLING_*`, `MAD_*` e `VARIABILITY_HISTORY_WEEKS` erano indicate come "Fase 5". Nella roadmap sono interventi consigliati (C2/C3) o non pianificati: ora sono indicate come non attive. I valori non cambiano.
- **Bibliografia.** Durante la trascrizione avevo completato quattro titoli che l'audit riporta troncati con "…" e le iniziali di autori citati nell'audit solo per cognome. Ho ripristinato la forma dell'audit: nessun dato non verificato.
- **Tema scuro.** I tratti chiari del grafico avevano poco contrasto. Ho aumentato l'opacità e ridisegnato la legenda con la stessa tecnica del grafico, senza `color-mix`.
- **Accessibilità.** La casella "Includi le notti insolite" ora usa un'etichetta esplicita (`for`), come richiede il controllo di accessibilità esistente.

## Test

| Suite | Prima (Fase 4.1) | Dopo |
|---|---|---|
| Logica (12 suite) | 503/503 | **538/538** (+35 nella nuova suite `unit/phase5`) |
| Browser (8 suite) | 257/257 | **294/294** (+37 nella nuova suite `browser/phase5`) |
| Safari / WebKit | non eseguibile qui | checklist E7 (V1–V10) |

`npm test`: codice di uscita 0. Nessun test esistente modificato.

## Conservazione [verificato]
- **Invariati byte per byte:** `db.js`, `backup.js`, `record.js`, `provenance.js`, `demo.js`, `config.js` e `inference.js` (P1–P3).
- **Uscite identiche:** su demo e fixture, il backup e il CSV del codice nuovo coincidono byte per byte con quelli della Fase 4.1.
- **Nessuna modifica** a schema 4, migrazioni, dati, provenienze, date dello Screen Time, soglie.

## Limiti e scelte da conoscere
1. **Notti insolite escluse di default dalla panoramica.** È ciò che prevede la specifica ("includi notti insolite" come filtro). Prima della Fase 5 erano incluse: chi ne ha segnate vedrà numeri leggermente diversi nei riquadri, con la riga che lo dichiara.
2. **Grafico sull'orologio.** Nelle notti del cambio d'ora le barre possono differire di un'ora dal tempo reale (dichiarato nel grafico).
3. **Fonti V2 senza numeri** finché la verifica non sarà completata con accesso diretto agli articoli (o ai PDF che vorrai fornire).
4. **Non implementati**: andamento di una singola variabile (L3), notti insolite evidenziate con la MAD (L4), pendenza di Theil–Sen: consigliati nella roadmap (C2–C3), fuori dalla Fase 5.
5. **Ancora da verificare su iPhone**: le checklist E6 (Fase 4.1) ed E7 (Fase 5).
