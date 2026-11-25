# Report del rilascio finale — 23/11/2026

Esiti delle verifiche:
- **PASS**: verifica eseguita e superata.
- **FAIL**: verifica eseguita e fallita.
- **BLOCKED**: verifica non eseguibile in questo ambiente.
- **NOT TESTED**: verifica non eseguita.

Punto di partenza: `docs/FINAL_PROJECT_AUDIT.md`. Decisioni: `docs/ARCHITECTURE.md` §5.

## 1. Stato finale del progetto
**Pronto per l'uso quotidiano, con una riserva: la verifica su iPhone.**
- Le funzioni previste sono implementate e verificate in Chromium con la larghezza di un iPhone 16 e su desktop.
- I 1.151 controlli automatici sono superati.
- Le notti salvate, lo schema 4, il backup delle notti, il CSV e le tre domande P1–P3 sono invariati, come dimostrano i test di equivalenza.

Non è possibile dichiarare verificato il comportamento su Safari per iPhone e come app installata dalla Home: qui non c'è un dispositivo né il motore WebKit. La checklist manuale (§13) è pronta.

## 2. Funzionalità completate
- **Diario**: sera e mattino, bozze conservate, mezzanotte, risvegli, provenienza di ogni dato.
- **Calendario**.
- **Andamento**:
  - riepilogo di 7, 28 o 90 notti, ora anche nei **periodi passati**;
  - grafico degli orari;
  - **andamento di una misura**, nuovo;
  - regolarità con **SRI da diario**, nuovo;
  - **Nel tuo contesto**, nuovo;
  - le tre domande P1–P3 con Fondamento scientifico.
- **Impostazioni**: tema, promemoria, settimana tipo, definizioni, backup e ripristino delle notti, CSV, origine dei dati, Fondamento scientifico, modalità demo.
- **Profilo**, nuovo:
  - dati personali facoltativi, fabbisogno di sonno percepito, obiettivi;
  - **storico del lavoro e delle routine** con date e provenienza;
  - personalizzazione disattivabile;
  - **backup del contesto**.

## 3. Problemi corretti
| # | Problema | Correzione | Verifica |
|---|---|---|---|
| D1 | Le preferenze potevano non salvarsi senza che l'app lo dicesse; il Profilo poteva dire "salvato" anche se la scrittura falliva | `setPref` restituisce l'esito; avviso "Impostazioni non salvate"; il Profilo dice "salvato e verificato" solo dopo la rilettura | PASS (`unit/preferences`, `browser/context`) |
| D2 | Un profilo di forma sconosciuta veniva letto come vuoto, e quindi sovrascritto al primo salvataggio | Lettura rigorosa: rovinato o versione sconosciuta vengono segnalati, mai sovrascritti | PASS (`unit/profile`, `browser/context`) |
| D3–D4 | Profilo solo in localStorage, senza backup; lavoro e turni senza date | Archivio separato con backup; periodi con date | PASS |
| S1 | A ogni avvio l'app contattava Google (caratteri) | Caratteri inclusi nell'app | PASS (`browser/ux`: nessuna richiesta esterna) |
| S2 | Nessuna Content Security Policy | CSP con hash dello script di avvio, nessuna connessione esterna, niente eval | PASS (`unit/security`, `browser/ux`: nessuna violazione) |
| U1 | Andamento lunghissimo su iPhone | Spiegazioni delle schede in sezioni espandibili | PASS (`browser/ux`, sette elementi ancora in ordine) |
| U2 | Pulsanti sotto i 44 px | Portati a 44 px | PASS (audit automatico mobile e desktop) |
| U4 | "Su questa versione" non aggiornato | Testo aggiornato | — |
| 4.3 A–E | Correzioni della Fase 5 (habitualShare, simbolo delle notti insolite, tratto a letto, conteggi, H e tabella) | Ricontrollate sul codice: già corrette | PASS (`browser/phase5-consolidation`) |

Problemi trovati durante il lavoro e risolti prima del rilascio:
- una tabella nuova che usava per errore la classe dell'actogramma (trovata dai test esistenti);
- le anomalie confermate visibili nel grafico dell'andamento;
- la tabella dei confronti illeggibile su iPhone;
- i pulsanti dei controlli segmentati a 40 px.

## 4. Nuove funzionalità
1. **Archivio del Profilo e del contesto** (`sleep-screen-context`, versione 1), separato dalle notti.
2. **Migrazione** del Profilo del 18/11:
   - verificata, ripetibile, senza duplicati;
   - originale conservato finché non lo rimuovi tu;
   - casi gestiti: rovinato, versione sconosciuta, interruzione, conflitto.
3. **Periodi con date** per lavoro o studio e routine particolari:
   - provenienza: registrato all'epoca, dichiarato in seguito, ricostruito a memoria, non nota;
   - nessuna sovrapposizione nella stessa categoria;
   - periodi passati ammessi;
   - modifica, termine, eliminazione e "Annulla".
4. **Personalizzazione** su tre livelli:
   - contesto della notte;
   - confronti tra periodi, con numero di notti;
   - spunti legati ai tuoi obiettivi, solo con dati sufficienti e sempre con il motivo.

   Non cambia le statistiche né P1–P3.
5. **Backup del contesto**: file separato e versionato; ripristino con riepilogo, senza sovrascritture silenziose, verificato e annullabile.
6. **SRI da diario**, **andamento di una misura** (media mobile, pendenza, notti molto diverse dal solito), **variabilità abituale**, **navigazione nel tempo**. Sono analisi già approvate nei documenti di ricerca, solo descrittive.

## 5. Miglioramenti UX
- Schede di "Schermo e sonno" compatte: il risultato si vede prima.
- Bersagli toccabili di almeno 44 px.
- Tabelle dei confronti leggibili su iPhone.
- Grafico dell'andamento con etichette a passi regolari, punti pieni o vuoti secondo l'origine e tabella alternativa.
- Messaggi di successo ("salvato e verificato") e di errore (con il motivo) per ogni operazione sul Profilo.
- Sezioni del Profilo nell'ordine d'uso: dati, periodi, personalizzazione, backup, cancellazione.

Verificato automaticamente:
- nessuna sovrapposizione né scorrimento orizzontale in tutte le schermate, a 393 e a 1280 px;
- campi sempre con l'etichetta;
- nessun "NaN" o "undefined" nei testi.

## 6. Miglioramenti prestazionali
- Nessuna richiesta di rete esterna all'avvio, e quindi niente attesa dei caratteri da Google.
- Le nuove parti sono in moduli separati, senza appesantire `app.js`.
- Misure: primo rendering 190–410 ms, cambio scheda 80–190 ms, Andamento a 90 notti circa 130 ms. Lo SRI costa pochi millisecondi.
- Nessun collo di bottiglia trovato sui dataset normali.

## 7. Risultati dei test (comando `npm test`, Chromium, `TZ=Europe/Rome`)
| Tipo | Suite | Controlli | Esito |
|---|---|---|---|
| Logica (unità e regressione) | 18 | 692 | **PASS** |
| Browser: integrazione, regressione, interfaccia | 12 | 440 | **PASS** |
| Browser: end-to-end (14 passi, offline compreso) | 1 | 19 | **PASS** |
| **Totale** | **31** | **1.151** | **PASS**, 0 FAIL |
| Safari / WebKit, PWA su iOS | — | — | **BLOCKED** |

Rispetto all'inizio: da 23 suite e 947 controlli a 31 suite e 1.151 controlli.

Test esistenti modificati, con motivazione scritta nel file:
- `unit/profile` e `browser/profile`: riscritti per i nuovi requisiti, perché verificavano il salvataggio in localStorage, ora sostituito. I controlli ancora validi sono stati mantenuti.
- `browser/backup`: aggiunta l'opzione che permette al suo strumento di prova di funzionare con la nuova CSP. Le asserzioni sono invariate.

Nessun test eliminato per farlo passare, nessuna soglia statistica cambiata.

## 8. Verifiche non eseguibili qui (BLOCKED)
- Safari su iPhone e app installata dalla Home:
  - selettori di data e ora, tastiera;
  - persistenza di entrambi gli archivi dopo riavvio e aggiornamento;
  - VoiceOver;
  - notifiche.
- Tempo reale di compilazione di una notte (obiettivo: meno di un minuto).

## 9. Compatibilità
| Ambiente | Stato |
|---|---|
| Chromium, viewport iPhone 16 (393 px) e desktop (1280 px) | PASS |
| Safari iOS ≥ 15.4 (16.4 per le notifiche), PWA dalla Home | BLOCKED: checklist E6–E9 |
| Offline (service worker, cache `sleep-screen-lab-v18`) | PASS in Chromium |
| Backup delle notti degli schemi 1–4 | PASS |
| Profilo della versione del 18/11 | PASS (migrazione) |

## 10. Stato della persistenza
- **Notti**: IndexedDB `sleep-screen-lab` versione 4, invariato. Scritture confermate solo a transazione completata.
- **Contesto**: IndexedDB `sleep-screen-context` versione 1. Ogni scrittura è riletta e confrontata.
- **Preferenze**: localStorage, con esito delle scritture e avviso in caso di errore.
- Archiviazione persistente richiesta al browser.
- Se l'archivio del contesto non è disponibile, l'app funziona senza personalizzazione (PASS, simulato).

## 11. Stato dei backup
- **Backup delle notti e CSV**: invariati nel formato e nel contenuto; nessun dato del Profilo vi entra (PASS).
- **Backup del contesto**: nuovo, con ripristino verificato e annullabile (PASS).
- Ciclo completo esportazione → cancellazione → ripristino → confronto: PASS (`browser/e2e`).

## 12. Limiti residui
1. Safari e iOS non verificati qui (§8).
2. Nel grafico degli orari restano gli orari sull'orologio: nelle notti del cambio d'ora le barre possono differire di un'ora dal tempo reale. Il limite è dichiarato nel grafico.
3. I confronti tra periodi sono descrittivi: periodi diversi differiscono anche per stagione e abitudini.
4. Gli spunti si basano solo sugli obiettivi dichiarati e su 2 settimane di dati registrati all'epoca. Non sono consigli medici.
5. Due backup separati da conservare. Il backup combinato è un'opzione futura.
6. `app.js` resta grande (≈2.600 righe). Separarlo è un'attività futura, da fare con test di equivalenza.
7. Le fonti scientifiche V2 attendono la verifica sui testi originali.

## 13. Attività che richiedono te
1. **Prima di aggiornare**: salva il backup delle notti, da Impostazioni → Salva backup completo.
2. Carica la nuova versione su GitHub Pages. Chiudi e riapri l'app, anche due volte.
3. Esegui la checklist manuale su iPhone: sezioni **E6, E7, E8, E9** di `docs/MANUAL_TEST_CHECKLIST.md`.
4. Nel Profilo:
   - controlla che i dati del 18/11 siano stati trasferiti;
   - crea i periodi di lavoro, con le date;
   - se vuoi, indica gli obiettivi;
   - salva il **backup del contesto**.
5. Facoltativo, dopo aver verificato il Profilo: "Rimuovi la vecchia copia".

## 14. Installazione e aggiornamento
- **Prima installazione**: pubblica la cartella su HTTPS (GitHub Pages). Su iPhone, apri l'indirizzo in Safari → Condividi → "Aggiungi alla schermata Home".
- **Aggiornamento**: sostituisci i file sul repository, includendo le cartelle nuove `fonts/` e `docs/` e i file nuovi in `js/`. Chiudi del tutto l'app e riaprila. Il service worker carica prima dalla rete: la nuova versione arriva online; offline resta l'ultima salvata.
- **Avvio in locale**: `npm run serve`, poi apri l'indirizzo indicato.

## 15. Backup e ripristino
Guida completa in `docs/BACKUP_AND_RESTORE.md`.
- **Ogni settimana**: salva i due backup e spostali fuori dal telefono:
  - Impostazioni → "Salva backup completo";
  - Profilo → "Salva backup del contesto".
- **Ripristino**:
  1. Impostazioni → "Ripristina da backup" con il file delle notti;
  2. Profilo → "Ripristina il contesto" con il file del contesto;
  3. controlla i riepiloghi e conferma.

  Nulla viene sovrascritto senza un secondo tocco.
- **Attenzione**: cancellare i dati del sito o togliere l'app dalla Home elimina entrambi gli archivi.

## Allegati
- **Changelog**: `CHANGELOG.md`.
- **File principali modificati**:
  - `js/app.js` (agganci, navigazione, schede compatte, preferenze con esito);
  - `js/db.js` (solo `setPref` e `removePref`);
  - `js/config.js` (solo voci aggiunte);
  - `css/styles.css`, `index.html` (CSP), `service-worker.js`.
- **File nuovi**:
  - codice: `js/profile.js` (v2), `js/context.js`, `js/context-db.js`, `js/personalize.js`, `js/ui-profile.js`, `js/trends.js`, `js/ui-trends.js`;
  - caratteri: `fonts/`.
- **Invariati byte per byte**: `analytics.js`, `inference.js`, `record.js`, `backup.js`, `provenance.js`, `bibliography.js`, `demo.js`, `manifest.json`.
- **Test**: `docs/TEST_STRATEGY.md`, `tests/README.md`.
- **Checklist di rilascio**:
  - [x] suite completa verde;
  - [x] schema 4 invariato;
  - [x] backup delle notti e CSV invariati;
  - [x] P1–P3 invariate;
  - [x] documentazione aggiornata;
  - [x] cache del service worker aggiornata (v18) con tutti i file nuovi;
  - [x] nessuna richiesta esterna;
  - [ ] checklist su iPhone (E6–E9), a cura tua.
