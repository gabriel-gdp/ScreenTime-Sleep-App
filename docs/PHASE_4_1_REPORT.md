# Fase 4.1 — Revisione e consolidamento: report finale

Data: 18/11/2026. Ambito: correzione delle criticità individuate nella revisione della Fase 4, senza nuove funzionalità e senza avviare la Fase 5. Decisioni dell'utente applicate: finestra P1/P3 [H − 60, H]; H esclude sempre le anomalie; stato "non stimabile" senza differenza tra le medie; documenti di ricerca copiati in `docs/research/`; P3 confermata; esclusione dal solo social jetlag delle notti con ora inesistente o ripetuta.

Piano delle modifiche approvato: `docs/PHASE_4_1_PLAN.md`.

Legenda delle affermazioni: **[verificato]** = controllato eseguendo codice o test in questa fase; **[documentato]** = scritto nei documenti del progetto; **[assunzione/limite]** = non verificabile con i dati disponibili.

---

## A. Sintesi esecutiva

**Stato iniziale** [verificato]
- Cartella di lavoro identica allo zip della Fase 4.
- Test con `npm test` (Playwright 1.63, Chromium): logica 448/448, browser 244/244.
- Cinque criticità segnalate dalla revisione, tutte riprodotte con script prima di modificare il codice.
- Tre test codificavano comportamenti sbagliati.

**Interventi**
- Finestra di esposizione di P1 e P3 ristretta a [H − 60, H] con estremi inclusi.
- P1 esclude le notti con l'ultimo utilizzo dopo il tentativo; P3 no, ma esclude quelle con l'ultimo utilizzo dopo l'addormentamento.
- Criteri di coerenza specifici per domanda, con motivi mutuamente esclusivi.
- "Includi le anomalie" propagato a P1–P3 e alle sensibilità, non a H.
- Stato "non stimabile" per varianza nulla o non finita.
- Punto medio del sonno sulla linea del tempo reale.
- Documenti di ricerca copiati senza modifiche, con i rimandi corretti.
- Due problemi aggiuntivi trovati dai nuovi controlli e corretti (B.6, B.7).

**Stato finale** [verificato]
- Logica 503/503, browser 257/257, `npm test` con codice di uscita 0.
- Schema 4, dati, provenienze, date dello Screen Time, backup, CSV, migrazioni, demo e soglie invariati.

**Problemi aperti**
- Verifica su Safari/iPhone da fare (checklist E6).
- Effetto di selezione piccolo e noto della regola di P1 (F.1).
- Limiti del modello HH:MM nelle notti del cambio d'ora (F.3).
- Granularità per notte dei flag di anomalia (F.2).

---

## B. Registro delle criticità

### B.1 Finestra di esposizione P1/P3
- **Descrizione iniziale**: l'esposizione era `L ≥ H − 60` senza limite superiore. Con H = 23:00 risultavano esposti 23:01, 23:30, 00:30, 02:00 [verificato].
- **File e funzioni**: `js/inference.js` (`screenBeforeHabitual`, sostituita), `js/app.js` (conteggio descrittivo del riepilogo, testo del metodo).
- **Causa**: confronto lineare sulla scala "minuti dopo le 12:00" senza estremo superiore.
- **Correzione**: `inPresleepWindow(L, H)`, esposto ⇔ (H − L) mod 1440 ∈ [0, 60]. Usata da P1, P3 e dal conteggio descrittivo. Eliminato "(o dopo)" dal testo del metodo. Etichette dei gruppi: "con l'ultimo utilizzo in quell'ora" / "prima di quell'ora o dopo il tuo solito orario".
- **Test**: `unit/inference` 9.1. Casi con H = 23:00 (tutti quelli del prompt), H = 00:00 e H = 00:30, entrambi gli estremi, notti reali con H dopo mezzanotte. Il test precedente "00:40 con H = 00:00 → esposto" è stato corretto, con la spiegazione nel commento. `browser/phase4`: testo del metodo.
- **Stato**: **risolta**.

### B.2 P1: ultimo utilizzo dopo il tentativo
- **Descrizione iniziale**: con tentativo 23:20 e ultimo utilizzo 23:35 la notte entrava in P1 [verificato].
- **File e funzioni**: `js/inference.js` (`QUESTIONS[P1].exclusion`); `js/analytics.js` (`computeNightMetrics`, nuovo valore derivato `screenToAttemptMin`, non salvato).
- **Causa**: nessun controllo dell'ordine tra L e T. Il valore esistente `screenAfterAttempt` richiede l'addormentamento, che P1 non usa.
- **Correzione**: `screenToAttemptMin` = T − L, in tempo reale se la notte è collocabile, altrimenti con la regola dell'istante più vicino già in uso. Se è negativo, la notte è esclusa da P1 con il motivo `screenAfterAttempt`, contato e mostrato. Un valore uguale è ammesso. Per P3 il vincolo non si applica; si esclude invece l'ultimo utilizzo dopo l'addormentamento (`screenAfterOnset`).
- **Test**: `unit/inference` 9.2 (prima, uguale, dopo, dopo la mezzanotte, senza addormentamento, conteggio del motivo) e 9.3 (P3: prima del tentativo; dopo il tentativo ma prima dell'addormentamento; dopo l'addormentamento; sonno effettivo non calcolabile; risvegli mancanti mai trattati come 0).
- **Stato**: **risolta**.

### B.3 Criteri di coerenza specifici per domanda
- **Descrizione iniziale**: un unico controllo per tutte le domande. Errori su coricamento o minuti svegli escludevano la notte anche da P1 e P2 [verificato].
- **File e funzioni**: `js/inference.js`:
  - `QUESTIONS[].exclusion` per i controlli di ogni domanda;
  - `nightForQuestion` (nuova; estrae la decisione per notte, senza cambiare il comportamento);
  - `analyzeQuestion`, `EXCLUSION_REASONS`.
- **Causa**: controllo generico su `durationError`, `screenFreeError`, `attemptError`, `inBedError` e `effectiveError`.
- **Correzione**: ogni domanda controlla solo le proprie variabili (tabella in `ANALYTICS_METHODOLOGY.md` §13.2). Le esclusioni sono mutuamente esclusive, nell'ordine documentato. Vale sempre considerate = usate + somma dei motivi. La scheda mostra i tre numeri.
- **Test**: `unit/inference` 9.4:
  - P1 senza risvegli;
  - P2 senza risveglio;
  - P3 senza tentativo;
  - errore di coricamento irrilevante per tutte;
  - errore di durata ed errore sui risvegli irrilevanti per P1 e P2.

  9.5 controlla l'invariante dei conteggi su 14 analisi diverse, demo compresa.
- **Stato**: **risolta**.

### B.4 "Includi le anomalie"
- **Descrizione iniziale**: l'opzione non arrivava a P1–P3 [verificato].
- **File e funzioni**: `js/inference.js` (`analyzeAll`, `analyzeQuestion`, `nightForQuestion`, `habitualAttempt`), `js/app.js` (`questionsHTML`, `questionCardHTML`, listener).
- **Causa**: `analyzeAll` non riceveva `state.includeOutliers`.
- **Correzione**:
  - L'opzione arriva a `analyzeAll`, alle tre domande e a tutte le sensibilità.
  - Flag pertinente: `is_outlier_bedtime` per P1–P3. `is_outlier_screen_time` non esclude nulla in P1–P3.
  - H esclude sempre le anomalie (decisione 1). Ogni scheda di P1 e P3 mostra il solito orario attuale con le notti valide, o "non ancora calcolabile… ne servono 14".
  - Nella sezione una riga dichiara se le anomalie sono incluse o escluse.
- **Test**: `unit/inference` 9.5:
  - esclusione e inclusione nelle tre domande;
  - anomalia sullo Screen Time irrilevante;
  - H invariato con l'opzione attiva;
  - propagazione al principale e alle sensibilità.

  `browser/phase4`: il comando aggiorna P3 (notti usate da 100 a 106: le 3 notti e le notti vicine che ora hanno abbastanza notti nella finestra) senza cambiare il solito orario.
- **Stato**: **risolta**. Vedi anche B.7.

### B.5 Errore standard nullo
- **Descrizione iniziale**:
  - con valori identici: intervallo [0, 0], p = 1;
  - con varianza nulla e medie diverse: intervallo [Δ, Δ] che esclude lo zero, con p = 1 (contraddittorio) [verificato].
- **File e funzioni**: `js/inference.js` (`compareGroups`, `analyzeQuestion`, `benjaminiHochberg`, `abstentionText`, `sensitivityText`); `js/app.js` (scheda).
- **Causa**: assegnazione `z = 0`, `p = 1` quando SE = 0.
- **Correzione**:
  - varianza combinata o SE nulli o non finiti → stato `degenerate_variance`, con il motivo `zero_variance` o `non_finite`;
  - nessun intervallo, nessun p-value, fuori da BH;
  - BH ignora anche p non finiti;
  - la scheda mostra "Risultato non stimabile", il motivo e le notti per gruppo, senza differenza tra le medie;
  - nessun epsilon.
- **Test**: `unit/inference` 9.6:
  - varianza nulla con medie uguali e con medie diverse;
  - differenza nulla con varianza (risultato ordinario);
  - valori non finiti;
  - P1 non stimabile in un'analisi completa, senza p e senza BH;
  - testo senza numeri;
  - BH con valori null e NaN.

  `browser/phase4`: scheda "Risultato non stimabile" senza differenza né intervallo. Un test esistente sulle notti non consecutive usava dati (y = i) con residui esattamente nulli, che prima producevano p = 1 in silenzio. È stato aggiornato con variazione nei dati, spiegandolo nel commento.
- **Stato**: **risolta**.

### B.6 Punto medio del sonno e cambio dell'ora
- **Descrizione iniziale**: 25/10 00:30 → 09:30 dava 05:30 invece di 04:30; 29/03 23:30 → 07:30 dava 03:00 invece di 04:00 [verificato].
- **File e funzioni**: `js/analytics.js` (`regularityForWindow`; nuove `sleepMidpoint` e `clockReadingStatus`, che riusano `combineDateTime`, `resolveBefore` e `nowHHMM`); `js/app.js` (nota nella regolarità).
- **Causa**: orario d'orologio dell'addormentamento + metà della durata reale.
- **Correzione**:
  - istanti reali, punto medio sulla linea del tempo, rilettura sull'orologio locale;
  - orario inesistente (passaggio all'ora legale) o ripetuto (ritorno all'ora solare) → nessuna stima e notte esclusa dal **solo** social jetlag (`sjl.excluded`), con il motivo mostrato;
  - nessuna occorrenza viene scelta.
- **Test**: `unit/inference` 9.7:
  - notte normale;
  - le due notti del cambio d'ora;
  - a cavallo della mezzanotte e punto medio dopo la mezzanotte;
  - ora ripetuta e inesistente (addormentamento e risveglio);
  - confini 01:59 e 03:00 del 25/10;
  - esclusione dal solo social jetlag;
  - la stessa notte resta ammessa in P1–P3.

  Il test precedente "05:04 / +124" codificava l'errore. È stato corretto a 04:56 / +116 spiegando perché: l'avevo scritto io nella Fase 4 interpretando male il risultato. `browser/phase4`: nota con il motivo.
- **Stato**: **risolta** per le notti con dati non ambigui; per le altre ci si astiene (F.3).

### B.7 Trovati durante la verifica (non nell'elenco iniziale)
1. **"NaN min" nella regolarità** [verificato]:
   - **Problema**: con 28 tentativi alle 23:00 la SD circolare dava NaN. L'errore di arrotondamento portava R appena sopra 1, e la radice di un numero negativo dà NaN. Il difetto c'era già dalla Fase 1/4 ed è emerso con il nuovo controllo "nessun NaN" richiesto dal prompt.
   - **Correzione**: R limitato a 1 in `circularStdMinutes`. Non è un epsilon: R > 1 è impossibile matematicamente.
   - **Test**: `unit/inference` (7, 14, 28 e 40 valori identici; regolarità = 0); `browser/phase4` (nessun NaN).
   - **Stato**: **risolta**.
2. **Comando "Includi le anomalie" non raggiungibile per P1–P3** [verificato]:
   - **Problema**: il pulsante compariva solo nel riepilogo e solo se il periodo scelto (7/28/90 notti) conteneva anomalie, mentre P1–P3 usano tutto lo storico.
   - **Correzione**: lo stesso comando (stessa preferenza, stesso gestore) appare anche nella sezione "Schermo e sonno" quando P1–P3 hanno anomalie da escludere o l'opzione è attiva. Non è una funzionalità nuova: è l'esposizione coerente dell'impostazione esistente.
   - **Test**: `browser/phase4`.
   - **Stato**: **risolta**.

### B.8 Riferimenti documentali
- **Descrizione iniziale**: codice e documenti citavano `FINAL_ANALYTICS_SPEC.md`, `STATISTICAL_VALIDATION.md`, `IMPLEMENTATION_ROADMAP.md` e `FINAL_DATA_MODEL.md`, che non erano nella cartella del progetto.
- **Correzione**:
  - i documenti erano disponibili nel pacchetto `research-review` consegnato separatamente l'11/11/2026;
  - copiati integralmente in `docs/research/`, con identità verificata byte per byte su 18 file; non copiato l'archivio superato `v1-2026-11-10/`;
  - rimandi corretti in codice e documenti (tutti i percorsi puntano a file esistenti);
  - nuovo `docs/research/README.md`: natura dei documenti, priorità delle specifiche operative, non fonti verificate automaticamente, elenco delle differenze note rispetto alle decisioni successive. Per esempio la vecchia definizione `L ≥ H − 60` è ancora presente in quei documenti, che non sono stati modificati.
- **Stato**: **risolta**. Nessun documento mancante.

---

## C. File modificati

| File | Modifica |
|---|---|
| `js/inference.js` | `inPresleepWindow`; criteri per domanda (`QUESTIONS[].exclusion`), `nightForQuestion`, `EXCLUSION_REASONS`, conteggi `considered`/`eligible`; `includeOutliers` in `analyzeQuestion`/`analyzeAll`/sensibilità; H attuale (`habitualNow`); stato `degenerate_variance`; BH solo su p finiti; etichette e testi di P1/P3; rimandi a `docs/research/` |
| `js/analytics.js` | `screenToAttemptMin` (derivato, non salvato); `clockReadingStatus`, `sleepMidpoint`; social jetlag con esclusioni per il cambio d'ora; `circularStdMinutes` con R ≤ 1; rimando corretto |
| `js/app.js` | Propagazione dell'opzione; riga e comando delle anomalie nella sezione; riga del solito orario; conteggi e motivi leggibili; scheda "non stimabile"; testo del metodo; nota sul cambio d'ora nella regolarità; conteggio descrittivo con la nuova finestra; rimando corretto |
| `css/styles.css` | Una regola per il nuovo comando della sezione (`.qs-toggle`) |
| `service-worker.js` | Versione della cache v12 → v13 (solo il nome, per aggiornare la PWA installata) |
| `tests/unit/inference.test.mjs` | Corretti 2 test che codificavano errori (esposizione, social jetlag) e 5 test con dati, testi o aspettative non più validi con le nuove regole (scenario di esposizione costante, differenza media di P1, prime 14 notti, notti non consecutive, testo dell'esposizione costante), spiegati nei commenti; aggiunti i casi 9.1–9.7, invariante dei conteggi, SD di valori identici, P3 senza effetto |
| `tests/browser/phase4.test.mjs` | Aggiornato il controllo sul testo del metodo; aggiunti: riga di H, conteggi, assenza di NaN/Infinity/undefined, scenario "non stimabile", social jetlag del 25/10, comando delle anomalie |
| `docs/ANALYTICS_METHODOLOGY.md` | §3.1, §4.6, §7.2, §10, §13.1–13.4, §13.6, storico |
| `docs/DATA_MODEL.md` | Derivate `screenToAttemptMin`, `sleepMidpoint`; definizione della finestra |
| `README.md` | Descrizione di P1–P3 aggiornata; rimandi |
| `docs/MANUAL_TEST_CHECKLIST.md` | Nuova sezione E6 (R1–R8) per Safari su iPhone |
| `tests/README.md` | Copertura della Fase 4.1 |
| `docs/research/` (nuovo) | 7 documenti e `simulations/` copiati senza modifiche; `README.md` nuovo |
| `docs/PHASE_4_1_REPORT.md` (nuovo) | Questo report |

**Non modificati** (identici byte per byte agli originali): `js/db.js`, `js/backup.js`, `js/record.js`, `js/provenance.js`, `js/demo.js`, `js/config.js`, `index.html`, `manifest.json`, fixture dei test.

---

## D. Risultati dei test

Eseguiti con `npm run test:unit`, `npm run test:browser` e `npm test` (codice di uscita 0), Node 22, Playwright 1.63.0, Chromium. `TZ=Europe/Rome`.

| Suite | Iniziale (superati/eseguiti) | Finale (superati/eseguiti) | Falliti | Non eseguiti | Note |
|---|---|---|---|---|---|
| Backup JSON, validazione e migrazione | 38/38 | 38/38 | 0 | 0 | invariata |
| Configurazione delle soglie e istantanea | 15/15 | 15/15 | 0 | 0 | soglie invariate |
| Contrasto dei colori | 40/40 | 40/40 | 0 | 0 | |
| Fase 4: P1–P3, metodo, astensione | 67/67 | **122/122** | 0 | 0 | +55 controlli (9.1–9.7 e altri) |
| Metodologia (numeri del documento) | 17/17 | 17/17 | 0 | 0 | |
| Metriche di una notte, CSV | 19/19 | 19/19 | 0 | 0 | |
| Mezzanotte e risvegli notturni | 82/82 | 82/82 | 0 | 0 | |
| Origine dei dati | 58/58 | 58/58 | 0 | 0 | |
| Logica temporale e robustezza | 23/23 | 23/23 | 0 | 0 | |
| Schema 4 | 60/60 | 60/60 | 0 | 0 | |
| Riepilogo di periodo e demo | 29/29 | 29/29 | 0 | 0 | |
| **Totale logica** | **448/448** | **503/503** | 0 | 0 | |
| Browser — mezzanotte e risvegli | 35/35 | 35/35 | 0 | 0 | |
| Browser — backup e ripristino | 24/24 | 24/24 | 0 | 0 | |
| Browser — Fase 4 | 27/27 | **40/40** | 0 | 0 | +13 |
| Browser — origine dei dati | 40/40 | 40/40 | 0 | 0 | |
| Browser — regressione | 50/50 | 50/50 | 0 | 0 | |
| Browser — affidabilità | 36/36 | 36/36 | 0 | 0 | |
| Browser — schema 4 e migrazione | 32/32 | 32/32 | 0 | 0 | |
| **Totale browser** | **244/244** | **257/257** | 0 | 0 | solo Chromium |
| Safari / WebKit | — | — | — | **tutti** | WebKit non disponibile in questo ambiente: non dichiarato superato. Checklist E6 per l'iPhone |

Nessun test è stato cancellato. I test modificati sono elencati in C, con la motivazione scritta nel test stesso.

Simulazioni riprodotte dai test sulle funzioni dell'app (esecuzione del 18/11/2026):
- P1 senza effetto reale: 7,5% di risultati chiari; differenza media +4,1 min (F.1).
- P2: 5,5%.
- Forme letterali di P1 e P2: 100% di falsi risultati.
- P3 senza effetto dello schermo: 3,3%.

---

## E. Verifica della conservazione dei dati [verificato]

- **Schema 4 invariato**: `DB_VERSION = 4`; `db.js` e `record.js` identici agli originali.
- **Nessuna migrazione**: il codice di aggiornamento non è stato toccato; i test di migrazione (unit e browser) passano invariati.
- **Nessuna modifica ai dati storici**: le nuove funzioni sono pure e leggono soltanto. Il confronto tra codice originale e nuovo sulla demo e sul fixture di riferimento mostra dati in ingresso invariati.
- **Nessuna modifica alle provenienze**: `provenance.js` e `record.js` identici; nessuna scrittura di `meta`.
- **Nessuna modifica alle date dello Screen Time**: nessun codice nuovo scrive `screenTimeDate*`.
- **Backup e restore non alterati**: `backup.js` identico. Su demo e fixture il backup generato dal codice nuovo è **identico byte per byte** a quello del codice originale. Lo stesso vale per il **CSV**: il nuovo valore derivato non è esportato.
- **Demo invariata**: `demo.js` identico.
- **Lavoro solo sulla copia**: nessuna pubblicazione e nessun accesso al dispositivo o al database reale.

---

## F. Limiti residui

1. **Effetto di selezione della regola di P1** [verificato in simulazione, documentato]:
   - L'esclusione decisa delle notti con L > T conserva solo le notti con T ≥ L.
   - In uno scenario senza alcun effetto reale sposta la differenza media di circa +3/+4 minuti, con risultati "chiari" nel 6–7,5% dei casi contro il 5% nominale.
   - È piccolo e dichiarato; il test lo limita a 6 minuti. Eliminarlo richiederebbe una diversa definizione di P1, cioè una scelta metodologica che spetta all'utente.
2. **Flag di anomalia per notte, non per campo** [limite]: una notte segnata per un'anomalia su un orario che una domanda non usa esce di default anche da quella domanda. Superarlo richiede una modifica dello schema 4.
3. **Orari HH:MM e cambio dell'ora** [limite]:
   - nell'ora ripetuta non si può sapere quale occorrenza sia stata registrata, e nell'ora inesistente l'orario non è valido;
   - il social jetlag si astiene;
   - le altre misure di quelle notti (intervallo, latenze) usano l'occorrenza scelta da JavaScript e possono essere sbagliate di un'ora. Correggerle o astenersi anche lì è fuori dal perimetro di questa fase;
   - la finestra [H − 60, H] è un'ora d'orologio, non 60 minuti reali, nelle notti del cambio d'ora;
   - servirebbero istanti con fuso nel modello dei dati.
4. **Gruppo "non esposto" eterogeneo in P1 e P3** [documentato]: comprende sia l'ultimo utilizzo prima della finestra sia quello dopo H. In uno scenario in cui l'uso tardo accorcia il sonno, P3 può mostrare un sonno più lungo nelle notti "in quell'ora" (diagnosi: +12 min). Le etichette e le spiegazioni alternative lo dicono. La definizione è quella confermata dall'utente.
5. **Safari/WebKit non verificati** in questo ambiente: checklist E6 (R1–R8), in particolare testo grande, VoiceOver e aggiornamento della PWA installata.
6. **Documenti di ricerca non aggiornati per scelta**: contengono la definizione precedente di P1/P3 e i risultati di simulazione relativi a essa; le differenze sono elencate in `docs/research/README.md`.

---

## G. Prontezza per la Fase 5

**Giudizio: pronto con riserve.**

Motivi:
- Tutti i 12 criteri di accettazione della Fase 4.1 sono soddisfatti nell'ambiente disponibile:
  - criteri 1–8: verificati dai test indicati in B;
  - criterio 9: documentazione allineata;
  - criterio 10: 760/760 controlli superati;
  - criterio 11: suite browser eseguite su Chromium, limite di WebKit documentato;
  - criterio 12: verificato in E.
- Riserve, da sciogliere prima o all'inizio della Fase 5:
  1. eseguire la checklist E6 su iPhone/Safari;
  2. prendere atto, o decidere diversamente, sull'effetto di selezione di P1 (F.1);
  3. decidere se in futuro serve un modello dei dati con istanti con fuso e anomalie per campo (F.2, F.3), che richiederebbe una modifica autorizzata dello schema.

La Fase 5 non è stata avviata.
