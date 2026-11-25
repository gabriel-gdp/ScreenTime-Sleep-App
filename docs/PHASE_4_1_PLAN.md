# Fase 4.1 — Piano delle modifiche aggiornato (18/11/2026, dopo le decisioni 1–5)

Vincoli invariati: nessuna modifica allo schema 4, nessuna migrazione, nessuna modifica a dati storici, provenienze, date dello Screen Time, backup, CSV, demo, soglie. Nessuna nuova funzionalità, nessuna Fase 5.

## A. Finestra di esposizione P1/P3
- `inPresleepWindow(L, H)` in `js/inference.js`: esposto ⇔ (H − L) mod 1440 ∈ [0, 60], estremi inclusi; sostituisce `screenBeforeHabitual` (anche nel conteggio descrittivo del riepilogo, `app.js`).
- Limite documentato: ora d'orologio, non 60 minuti reali nelle notti del cambio d'ora.

## B. Criteri per domanda (motivi mutuamente esclusivi, primo criterio non soddisfatto)
- P1: campi L, T → tentativo ≤ addormentamento (solo se c'è l'addormentamento) → **L ≤ T, altrimenti `screenAfterAttempt`** → provenienza (L, T) → notte insolita → anomalia (se esclusa) → H → [sens. d] → tipo di giorno → finestra dei residui.
- P2: campi L, T, S → T ≤ S e L ≤ S → provenienza → insolita → anomalia → [d] → tipo di giorno → finestra.
- P3: campi L, S, W, risvegli (numero e minuti; mai 0 se mancano) → intervallo valido e minuti svegli < intervallo → **L ≤ S, altrimenti `screenAfterOnset`** → provenienza → insolita → anomalia → H → [d] → tipo di giorno → finestra. Il tentativo della notte non è controllato.
- Invariante verificata dai test: notti considerate = usate + Σ esclusioni.
- Nuovo valore derivato (non salvato) `screenToAttemptMin` = T − L in `computeNightMetrics`, in tempo reale quando la notte è collocabile, altrimenti regola dell'istante più vicino già in uso.

## C. Anomalie (decisione 1)
- `includeOutliers` da `state` → `analyzeAll` → `analyzeQuestion` → sensibilità.
- Flag pertinente: `is_outlier_bedtime` per P1–P3; `is_outlier_screen_time` non esclude nulla in P1–P3 (test).
- **H esclude sempre le notti con anomalie confermate**, qualunque sia l'opzione.
- Scheda: stato dell'opzione (anomalie incluse/escluse); **numero di notti usate per H** (H attuale: orario e notti valide su 28; se < 14, segnalato) e notti escluse perché H non è calcolabile.
- Limite documentato: flag per notte, non per campo.

## D. Stato "non stimabile" (decisione 2)
- `compareGroups`: varianza combinata o errore standard nulli o non finiti → `degenerate_variance`; nessun intervallo, nessun p-value, fuori da BH. Esiti non finiti → notte esclusa.
- Scheda: messaggio esplicito, motivo, notti per gruppo, conteggi descrittivi; **nessuna differenza tra le medie**.
- Sensibilità non stimabile: "non stimabile".

## E. Punto medio del sonno e cambio dell'ora (decisione 5)
- Istanti reali con `combineDateTime`/`resolveBefore`, punto medio sulla linea del tempo, riconversione in ora locale.
- Orario di addormentamento o risveglio **inesistente** (passaggio all'ora legale) o **ripetuto** (ritorno all'ora solare): notte esclusa **solo dal social jetlag**, con motivo registrato e mostrato. Nessun effetto su diario, P1–P3, altre analisi.

## F. Testi ed etichette
- Gruppi P1/P3: "ultimo utilizzo in quell'ora" / "ultimo utilizzo prima di quell'ora o dopo il tuo solito orario".
- Tolto "(o dopo)" dal metodo; tolta da P1 la frase sul legame "quasi inevitabile".
- P3: esplicitato che misura quanto hai dormito (intervallo − minuti svegli), non il tempo per addormentarti.

## G. Documenti di ricerca (decisione 3)
- Copia integrale e senza modifiche da `research-review/` a `docs/research/` (documenti .md e cartella `simulations/`); `docs/research/README.md` nuovo: natura dei documenti, distinti dalle specifiche operative, non fonti scientifiche verificate automaticamente.
- Rimandi corretti nel codice e nei documenti. Documenti non disponibili: segnalati, non ricostruiti.

## H. Test
- Correggere i test che codificano il comportamento sbagliato (esposizione 00:40 con H 00:00; social jetlag 05:04/+124), spiegando perché.
- Aggiungere i casi 9.1–9.7 del prompt, l'invariante dei conteggi, la propagazione dell'opzione (unit e browser), la riproduzione delle simulazioni diagnostiche (P1 decisa e P3 senza effetto: "chiari" ≤ 10%).

## I. Documentazione e report
`ANALYTICS_METHODOLOGY.md`, `DATA_MODEL.md`, `README.md`, `MANUAL_TEST_CHECKLIST.md`, `tests/README.md`; report finale A–G in `docs/PHASE_4_1_REPORT.md`.
