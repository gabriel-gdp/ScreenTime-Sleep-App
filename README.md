# Diario del sonno — PWA

Personal analytics tool per sonno e screen time. Nessun backend, nessuna dipendenza da build tool: HTML/CSS/JS puri, storage locale via IndexedDB.

## Struttura del progetto

```
index.html              punto di ingresso
manifest.json            metadati PWA (nome, icone, tema)
service-worker.js        cache offline + notifiche locali
css/styles.css           design system (variabili colore, layout, temi chiaro/scuro)
js/analytics.js          tutte le formule (pure, testabili) — vedi docs/ANALYTICS_METHODOLOGY.md
js/record.js             definizione del record di una notte (campi, bozze, risvegli, provenienza, giorno dello Screen Time), condivisa da UI e backup
js/provenance.js         strumento "Origine dei dati": anteprima, classificazione e verifica (funzioni pure)
js/inference.js          le tre domande P1–P3: orario abituale, confronto, astensione, testi (funzioni pure)
js/bibliography.js       Fondamento scientifico: le fonti con lo stato di verifica (dati JSON, offline)
js/config.js             tutte le soglie e gli orari predefiniti, documentati in docs/ANALYTICS_METHODOLOGY.md §12
js/db.js                 layer di storage (IndexedDB + localStorage per le preferenze)
js/app.js                stato dell'app e rendering dell'interfaccia
js/demo.js               dati di esempio per la modalità demo (solo in memoria)
js/backup.js             backup completo in JSON e ripristino validato
icons/                   icone (180 per iOS, 192, 512, 512 maskable, favicon) e sorgente icon.svg
docs/                    ANALYTICS_METHODOLOGY.md (formule e soglie), DATA_MODEL.md (schema, CSV, backup),
                         MANUAL_TEST_CHECKLIST.md (verifiche da fare su iPhone)
tests/                   test automatici — vedi tests/README.md (non servono per usare l'app)
package.json             solo per eseguire i test (nessuna dipendenza per l'app)
```

## Uso in locale

I service worker richiedono HTTPS o `localhost` — aprire il file `index.html` direttamente da filesystem (`file://`) non basta. Da questa cartella:

```bash
npm run serve          # oppure: python3 -m http.server 8080
```

Poi apri l'indirizzo mostrato dal browser del computer. Da un telefono sulla stessa rete l'app si apre via IP, ma senza HTTPS il service worker (offline e notifiche) non si attiva: per provarla davvero su iPhone usa GitHub Pages.

## Compatibilità

Safari su iOS/iPadOS **15.4 o successivo** (usa `:focus-visible` e `:has()`); notifiche solo da **iOS 16.4**, con l'app aggiunta alla schermata Home. Le prove automatiche usano Chromium: la compatibilità con Safari va confermata con `docs/MANUAL_TEST_CHECKLIST.md`.

## Deploy per uso reale

Qualunque hosting statico va bene — non serve un backend. Opzioni semplici e gratuite:

- **GitHub Pages**: pusha questa cartella in un repository, attiva Pages dalle impostazioni.
- **Netlify** o **Vercel**: trascina la cartella nella dashboard, o collega il repository.

Dopo il deploy, apri l'URL da Safari (iOS) o Chrome (Android) e usa "Aggiungi a Home" — a quel punto l'app è installata come le altre, con la propria icona. Su iOS 16.4+ le notifiche funzionano solo con l'app aggiunta alla Home, e il promemoria compare quando apri l'app: senza un server un'app web non può inviare notifiche mentre è chiusa.

Per usare l'app bastano `index.html`, `manifest.json`, `service-worker.js` e le cartelle `css/`, `js/`, `icons/`. `docs/`, `tests/` e `package.json` possono essere caricati o no: l'app non li usa.

## Aggiornare l'app già installata

Il service worker usa una strategia "prima la rete": quando sei online l'app scarica sempre i file più recenti, offline usa l'ultima copia salvata. Dopo aver caricato file nuovi sul repository, chiudi del tutto l'app e riaprila (la prima volta dopo il passaggio da una versione vecchia può servire farlo due volte). Se l'aggiornamento arriva mentre hai modifiche non salvate, l'app non si ricarica da sola: compare l'avviso "Aggiorna", e le bozze vengono conservate.

Le bozze non salvate restano anche se chiudi l'app (copia in localStorage), ma entrano nel database e nelle analisi solo quando premi "Salva". Se un file dell'app manca (es. non caricato su GitHub), dopo qualche secondo compare un messaggio con "Riprova" invece di "Caricamento…" fisso.

## Dati

Tutto resta sul dispositivo (IndexedDB, nessun server né sincronizzazione). Nelle Impostazioni:

- **Salva backup completo (JSON)** — per ripristinare l'app, anche su un altro dispositivo. Conservalo fuori dal telefono.
- **Ripristina da backup** — valida il file prima di toccare qualsiasi dato, mostra un riepilogo (notti nuove, identiche, in conflitto) e chiede conferma. Di default aggiunge solo le notti mancanti; sostituire quelle in conflitto è una scelta esplicita. La scrittura avviene in un'unica transazione: se fallisce, i dati restano com'erano.
- **Esporta CSV** — una riga per notte, per l'analisi in un foglio di calcolo. Non serve per il ripristino.

Dettagli del formato e delle regole di importazione: `docs/DATA_MODEL.md` §6–7.

## Stato del progetto

In evoluzione secondo la roadmap approvata il 17/11/2026 (`docs/research/IMPLEMENTATION_ROADMAP.md`). Oggi l'app copre raccolta dati, calendario, riepilogo di periodo (mediana e intervallo interquartile su 7, 28 o 90 notti), regolarità degli orari (deviazione standard circolare in minuti), export e backup. Consistency Score, associazioni e "notti migliori" sono stati rimossi nella Fase 1, perché la validazione statistica li ha mostrati fuorvianti. Le formule sono in `docs/ANALYTICS_METHODOLOGY.md`, che in apertura riporta lo stato di ogni analisi; tutte le soglie sono in `js/config.js`.

- **Anomalie**: i valori insoliti richiedono conferma al salvataggio (§7.1); le notti confermate come anomale vengono salvate con un flag, esportate nel CSV ed **escluse di default da tutte le analisi** (riepilogo di periodo e regolarità). L'esclusione è per campo (orari anomali → fuori durata, tempo senza schermo e regolarità; screen time anomalo → fuori solo lo screen time). Ogni analisi dice quante notti ha escluso, e "Includi le anomalie" nella schermata Andamento le riporta nel calcolo.
- **Mezzanotte**: lo screen time è il totale del giorno di calendario della sera (il Diario mostra quale giorno, e dopo mezzanotte ricorda di sceglierlo in Tempo di utilizzo); l'ultimo utilizzo può essere dopo mezzanotte (00:30 con addormentamento alle 01:00). I confronti tra orari usano istanti reali, anche al cambio d'ora.
- **Risvegli notturni** (schema 3): casella "Ho avuto risvegli durante la notte" nel mattino; non selezionata = nessun risveglio, registrato; le notti precedenti restano "non indicate" (mai zero d'ufficio) ed escluse dalle statistiche sui risvegli. "Intervallo di sonno" (addormentamento → risveglio finale) è distinto dal "Sonno effettivo stimato" (intervallo − minuti svegli). Nessuna sleep efficiency: richiederebbe dati non raccolti.
- **Riepilogo di periodo**: per ogni metrica mediana, intervallo interquartile, minimo e massimo e numero di notti; la qualità come distribuzione dei voti. La copertura (notti con almeno un dato) è distinta dalla numerosità di ciascun riquadro. Nessuna freccia di confronto tra periodi.
- **Schema 4** (Fase 2): nel mattino, facoltativi, "Hai provato a dormire alle", l'ora di coricamento (compressa), il tipo di giorno (proposto da uno schema settimanale modificabile nelle Impostazioni) e quattro indicatori a tre stati in "Ieri e stanotte" (risposta mancante ≠ no). Ogni campo registra la propria provenienza (inserito subito, ricopiato da note, ricostruito a memoria, non noto) e lo Screen Time il proprio giorno di calendario (verificato, presunto per i dati storici, sconosciuto). Le notti esistenti non vengono modificate: l'aggiornamento del database avviene solo dopo un backup scaricato e verificato, e viene controllato notte per notte. I nuovi dati non sono ancora usati in nessuna analisi. Dettagli: `docs/DATA_MODEL.md` §2a–2c e §5.
- **Origine dei dati** (Fase 3, Impostazioni): riepilogo dell'origine di tutti i valori; classificazione dei dati storici per intervallo di date e gruppi di campi (ricopiati da note, ricostruiti a memoria, inseriti al momento, origine non nota); conferma, "non so" o correzione del giorno dello Screen Time, per più notti o per una. Ogni operazione mostra un'anteprima, scrive in un'unica transazione, rilegge il database verificando che nessun valore del diario sia cambiato e si può annullare. Dettagli: `docs/DATA_MODEL.md` §8.
- **Schermo e sonno** (Fase 4, Andamento): tre domande, sempre le stesse. P1: ultimo utilizzo dello schermo nell'ora che precede il tuo solito orario di riposo H (finestra [H − 60 min, H], estremi inclusi) e ora in cui provi a dormire; le notti con l'ultimo utilizzo dopo il tentativo non sono usate. P2: schermo dopo aver provato a dormire e tempo per addormentarti dopo averlo lasciato. P3: stessa finestra di P1 e sonno effettivo stimato (quanto hai dormito, non quanto ci hai messo ad addormentarti); ammesso l'utilizzo dopo il tentativo, non dopo l'addormentamento. L'esposizione è sì/no in base all'orario dell'ultimo utilizzo, non una misura dei minuti. Ogni domanda controlla solo i dati che usa; "Includi le anomalie" vale anche qui (non per H). Un numero compare solo con almeno 30 notti di dati registrati all'epoca, tipo di giorno indicato, abbastanza notti in ciascun gruppo, varianza stimabile e abbastanza notti "indipendenti"; prima la scheda dice che cosa manca, o che il risultato non è stimabile. Ogni risultato è un'associazione, con intervallo, interpretazione possibile, spiegazioni alternative e analisi di sensibilità. Nel Diario: tempo per addormentarti, tempo dopo l'ultimo utilizzo, schermo dopo il tentativo e a letto. La regolarità usa solo dati registrati all'epoca e mostra anche il tentativo, i tipi di giorno e la differenza tra giorni liberi e vincolati. Dettagli: `docs/ANALYTICS_METHODOLOGY.md` §3.1, §4.6, §13. Documenti di ricerca da cui vengono le scelte (copiati senza modifiche, non aggiornati): `docs/research/`. Revisione della Fase 4.1: `docs/PHASE_4_1_REPORT.md`.
- **Andamento e Fondamento scientifico** (Fase 5): filtri della panoramica (tipo di giorno, notti insolite, origine dei dati), che non toccano regolarità e domande; grafico degli **orari** notte per notte (a letto, tentativo, sonno, ultimo utilizzo, solito orario; pieno se registrato all'epoca, vuoto se no; leggibile anche come tabella); schede a **sette elementi** (che cosa, quali dati, numeri, come è calcolato, nei tuoi dati, limiti, fondamento); **Fondamento scientifico** consultabile offline (Impostazioni e schede) con lo stato di verifica di ogni fonte: numeri solo da fonti verificate, mai nella stessa frase dei tuoi risultati. Dettagli: `docs/ANALYTICS_METHODOLOGY.md` §14.
- **Non implementati**: riepilogo mensile, insight testuali, Personal Recovery Score; andamento di una singola variabile con le notti insolite evidenziate (consigliato, non pianificato).

## Test

Istruzioni complete in `tests/README.md`. In breve, da questa cartella:

```bash
npm install            # installa Playwright (solo per i test nel browser)
npx playwright install chromium
npm test               # test della logica + test nel browser
npm run test:unit      # solo logica, basta Node 18+ (nessuna installazione)
```
