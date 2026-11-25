# Consolidamento della Fase 5 — Report

Data: 18/11/2026. Intervento di correzione mirata, approvato in due passaggi: il piano (Passaggio 1) e tre decisioni vincolanti dell'utente. Punto di partenza: lo zip della Fase 5, verificato identico alla cartella di lavoro; originali salvati e hash SHA-256 registrati prima di ogni modifica.

Legenda: **[verificato]** = controllato eseguendo test o confronti in questo intervento.

---

## 1. Sintesi dell'intervento

**Corretto**
- **habitualShare.** Calcola anche il solito orario H sul set filtrato, con tutti i filtri, compreso il tipo di giorno. Quando H non è calcolabile mostra un messaggio esplicito con il numero di notti valide.
- **Simbolo delle notti insolite.** È letto solo dal record filtrato.
- **Tratto "a letto" del grafico degli orari.**
  - La provenienza considera entrambi gli estremi usati.
  - Nessun ripiego silenzioso sull'addormentamento quando il tentativo c'è ma è incoerente o fuori fascia.
- **Tabella accessibile.** Distingue "dato assente", "incoerente" e "fuori grafico".
- **Conteggi delle esclusioni.** Una frase esplicita dice che sono sequenziali e da non sommare.
- **Segno di H nel grafico.** Una precisazione nella legenda e in "Come leggerlo" dice che è il riferimento di P1–P3, indipendente dai filtri (decisione 2).

**Lasciato invariato** [verificato]
- **File:** tutti tranne `js/app.js` sono identici byte per byte. Tra questi `analytics.js` (con `applyDescriptiveFilters`, ordine e logica dei filtri), `inference.js` (P1–P3 e H), `db.js`, `record.js`, `provenance.js`, `backup.js`, `config.js`, `demo.js`, `bibliography.js`, `service-worker.js`, `index.html` e `manifest.json`.
- **Uscite:** backup JSON e CSV identici byte per byte.
- **Test esistenti:** nessuno modificato o rimosso.
- **Service worker:** non serve cambiare la versione della cache. La strategia è network-first: online la PWA installata riceve subito i file corretti.

## 2. Analisi delle criticità

| # | Esito | Causa | Soluzione |
|---|---|---|---|
| C1 habitualShare | **Confermata in parte**. L'ultimo utilizzo era già letto dal set filtrato: la chiamata passava `filt.entries`, a differenza di quanto descritto nella segnalazione. H invece era calcolato su `state.entries` | `habitualAttempt(state.entries, …)` dentro `habitualShareHTML`; valore predefinito `ents = state.entries` | H calcolato con `habitualAttempt(ents, …, { provenance: 'all' })` sul set filtrato; argomento `ents` obbligatorio; messaggio "Solito orario non calcolabile con questi filtri (servono almeno 14 notti valide nelle 28 precedenti)" con il numero effettivo (es. 8/14). La funzione `habitualAttempt` non è stata toccata |
| C2 simbolo delle notti insolite | **Confermata**. Si manifestava con "Includi le notti insolite" attivo: le notti escluse uscivano prima | `full = state.entries[date]` nel grafico | Il simbolo legge `e.unusualNight` del record filtrato; `full` eliminato |
| C3A provenienza del tratto | **Confermata** | La classe pieno/vuoto controllava solo `inBedTime` | Pieno solo se `inBedTime` e l'estremo effettivamente usato (`sleepAttempt` oppure `bedtime`) sono registrati all'epoca |
| C3B ripiego ambiguo | **Confermata** | `xs.attempt = null` sia per tentativo assente sia per incoerente o fuori fascia; in tutti i casi ripiego su `bedtime` | Stati distinti: presente e utilizzabile → tentativo; davvero assente → addormentamento (comportamento previsto); presente ma non utilizzabile → nessun tratto, valore segnato in tabella |
| C4 conteggi | **Comportamento corretto, testo ambiguo** | Conteggi sequenziali e mutuamente esclusivi (tipo di giorno → insolite → origine), presentati come elenco | Comportamento e ordine invariati; frase esplicativa aggiunta sotto la riga esistente; documentazione aggiornata |
| 5A altri accessi a `state.entries` | **Nessuna ulteriore violazione** | Panoramica, riquadri, notti migliori e peggiori, nota anomalie, grafico notte per notte usano già il set filtrato. L'unico accesso rimasto nel grafico è il segno di H, volutamente indipendente (decisione 2). "Notte scorsa" e regolarità sono fuori dai filtri per progetto | — |
| 5B tabella | **Incoerenza trovata (decisione 3)** | Il segno "incoerente" era preparato ma mai mostrato; un tentativo incoerente o un orario fuori fascia non era segnato | Stati "incoerente" e "fuori grafico" in tabella, presi solo da errori e stati già esistenti (`durationError`, `attemptError`, `inBedError`, `screenFreeError`, posizione fuori fascia) |
| 5C cambio dell'ora | Invariato | Limite già documentato | — |

## 3. File modificati

| File | Motivo |
|---|---|
| `js/app.js` | `habitualShareHTML` (C1); `actogramHTML` (C2, C3, D2, D3, attributi `data-date` per i test); `filtersHTML` (C4, solo una frase aggiunta). 76 righe di differenza |
| `css/styles.css` | Una regola per il segno degli stati in tabella (`.cell-flag`) |
| `docs/ANALYTICS_METHODOLOGY.md` | §14.1 (conteggi, set filtrato, H di habitualShare), §14.2 (provenienza dei tratti, ripiego, H del grafico, tabella), storico |
| `tests/README.md` | Nuova suite |
| `tests/unit/phase5.test.mjs` | **Solo aggiunte** (17 righe, 0 rimosse): test C4 |
| `tests/browser/phase5-consolidation.test.mjs` | Nuovo |
| `docs/PHASE_5_CONSOLIDATION_REPORT.md` | Questo report |

## 4. Test introdotti

Tutti verificano ciò che l'interfaccia mostra, su database preparati apposta. Esito di ciascuno: **superato**.

| Test | Anomalia | Atteso |
|---|---|---|
| C1.1 ultimo utilizzo ricostruito | C1 | "tutte": 6 su 6; "registrate all'epoca": 5 su 5 |
| C1.2 H spostato solo da tentativi ricostruiti | C1 | "tutte": 0 su 6 (H 22:10); "registrate": 6 su 6 (H 23:00) |
| C1.2 H solo da tentativi ricostruiti | C1 | "registrate": nessuna metrica calcolata, messaggio con 0/14; "tutte": metrica di nuovo presente |
| C1 tipo di giorno "liberi" / "vincolati" | C1 (decisione 1) | "liberi": messaggio con 8/14, nessuna metrica; "vincolati": metrica calcolata |
| C1.3 coerenza con il set filtrato | C1 | Notti contate = notti con l'ultimo utilizzo dopo il filtro |
| C1.4 filtri predefiniti, demo a 7, 28 e 90 notti | C1 (non regressione) | Risultato identico alla regola precedente, calcolata indipendentemente |
| D2 H del grafico al variare di quattro combinazioni di filtri | Decisione 2 | Stessa posizione per ogni notte disegnata; notti che compaiono solo con un filtro: H uguale ai criteri consolidati |
| D2 H del grafico = H di P1 | Decisione 2 | Uguale a `habitualAttempt(…, 'recorded')` e a `nightForQuestion(…, 'P1').habitual` |
| D2 precisazione nella legenda e in "Come leggerlo" | Decisione 2 | Testo esatto presente in entrambi |
| C2.1–C2.4 simbolo delle notti insolite | C2 | "tutte": simbolo per ricostruito, non noto e registrato; "registrate": solo registrato; insolite escluse: nessun simbolo e notti non disegnate; no o assente: mai |
| C3.1–C3.6 tratto "a letto" | C3 | Pieno (entrambi registrati); vuoto (tentativo ricostruito); vuoto (coricamento ricostruito); ripiego sull'addormentamento solo se il tentativo manca, pieno o vuoto secondo l'addormentamento; nessun tratto con tentativo incoerente o fuori fascia |
| C3.7 / D3 coerenza grafico e tabella | C3, decisione 3 | "23:50 · incoerente", "16:30 · fuori grafico", "—" per l'assente, "23:00°" per la provenienza; durata incoerente e ultimo utilizzo dopo l'addormentamento segnati "incoerente"; i valori segnati non sono disegnati |
| C4 notte esclusa da tre filtri (browser e unit) | C4 | Contata una volta come "dell'altro tipo di giorno"; somma dei motivi = notti escluse; frase esplicativa presente |

Totale: 36 controlli nel nuovo test browser, 3 nel test unitario.

## 5. Test eseguiti [verificato]

Node 22, Playwright 1.63.0, Chromium, `TZ=Europe/Rome`.

| Comando | Superati | Falliti | Non eseguiti |
|---|---|---|---|
| `npm run test:unit` | 541/541 (12 suite), codice di uscita 0 | 0 | 0 |
| `npm run test:browser` | 330/330 (9 suite), codice di uscita 0 | 0 | 0 |
| `npm test` | 21/21 suite, codice di uscita 0 | 0 | 0 |
| Safari / WebKit | — | — | Tutti: WebKit non è disponibile in questo ambiente. Restano le checklist manuali E6 ed E7 |

Rispetto a prima dell'intervento: logica da 538 a 541 controlli (+3), browser da 294 a 330 (+36). Nessun test preesistente modificato, indebolito o rimosso.

## 6. Non regressione [verificato]

- **Hash SHA-256 prima e dopo:** invariati tutti i file del codice tranne `js/app.js`, cioè `analytics.js`, `backup.js`, `bibliography.js`, `config.js`, `db.js`, `demo.js`, `inference.js`, `provenance.js`, `record.js`, `service-worker.js`, `index.html`, `manifest.json`.
- **Schema 4:** `DB_VERSION` invariato (`db.js` identico); nessuna migrazione.
- **Dati:** i filtri lavorano su copie. Sulla demo e sul fixture di riferimento i dati in ingresso non cambiano, e backup JSON e CSV del codice nuovo sono identici byte per byte a quelli della versione precedente.
- **Analisi e criteri invariati:** P1–P3, formule, criteri di H, regole delle anomalie, criteri di provenienza e soglie stanno tutti in file con hash invariato.

## 7. Limitazioni residue

1. **Due valori di H diversi con i filtri attivi** (decisioni 1 e 2):
   - il conteggio habitualShare usa H calcolato sul set filtrato;
   - il segno del grafico e le schede usano l'H di P1–P3, indipendente dai filtri.

   È voluto e dichiarato nella documentazione e nella legenda, ma può sorprendere chi confronta i due.
2. **Filtro "liberi":** il conteggio habitualShare è di norma non calcolabile, perché in 28 giorni i mattini liberi sono circa 8, meno dei 14 necessari. L'app lo dice con il messaggio e il numero effettivo.
3. **Notti insolite escluse anche se il dato non è registrato all'epoca.** L'esclusione usa il valore salvato, indipendentemente dalla sua origine, come la regolarità e P1–P3. Non è cambiata perché è una regola consolidata.
4. **Cambio dell'ora:** limite già documentato (orari sull'orologio nel grafico).
5. **Safari su iPhone non verificato** in questo ambiente.

## 8. Verdetto

**Consolidamento completato con riserve.**
- **Completato:** tutte le criticità confermate sono corrette, ciascuna con test di regressione specifici superati. Le parti protette sono invariate (hash, backup e CSV identici) e i test preesistenti passano tutti.
- **Riserva:** la verifica su Safari per iPhone (checklist E6 ed E7), che non è stato possibile eseguire qui.
