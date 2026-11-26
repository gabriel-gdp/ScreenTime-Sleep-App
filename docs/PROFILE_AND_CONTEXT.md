# Profilo e contesto

Fonte di verità per il Profilo (versione 2), lo storico temporale del contesto e la personalizzazione. Sostituisce `docs/PROFILE.md` (Profilo in `localStorage`, 18/11/2026), che è stato rimosso.

## 1. Principi
- **Facoltativo e separato.** Il contesto vive in un archivio IndexedDB proprio, `sleep-screen-context`, distinto dal database delle notti (`sleep-screen-lab`, schema 4, invariato). Se manca o è danneggiato, il Diario, le statistiche e le analisi P1–P3 funzionano normalmente e la personalizzazione si dichiara non disponibile.
- **Non entra nelle analisi consolidate.** `analytics.js` e `inference.js` non importano né aprono il contesto: lo verificano `tests/unit/profile.test.mjs` e `tests/unit/personalize.test.mjs`, che confronta anche P1–P3, regolarità e riepilogo prima e dopo l'uso del contesto.
- **Nessuna informazione inventata.** I valori senza date del profilo precedente non diventano periodi in automatico. Ogni periodo dichiara come è conosciuto.
- **Tutto facoltativo.** Nessun campo è richiesto per usare l'app.

## 2. Archivio `sleep-screen-context` (versione 1)

| Object store | Chiave | Contenuto |
|---|---|---|
| `profile` | `id` (sempre `'me'`: un solo profilo, nessun duplicato possibile) | `{ id, version: 2, data, createdAt, updatedAt }` |
| `contextPeriods` | `id`, indice `category` | periodi (§4) |
| `contextPreferences` | `key` | `personalization` (§6) e `migration.ssl_profile` (§5) |

Ogni scrittura (`js/context-db.js`) è confermata solo a transazione completata **e** dopo una rilettura identica al valore scritto. Gli esiti possibili sono:
- riuscita;
- archivio non disponibile;
- tempo scaduto (4 s);
- archivio danneggiato o creato da una versione più recente;
- spazio esaurito;
- scrittura fallita o interrotta;
- verifica fallita.

L'interfaccia non mostra mai "salvato" in caso di errore. Un profilo scritto da una versione più recente dell'app non viene letto né sovrascritto.

## 3. Campi del Profilo

Tutti facoltativi. Eliminazione: "Cancella profilo" nel Profilo (due tocchi) li toglie tutti; ogni campo si svuota modificandolo e salvando; il backup del contesto li contiene finché non lo si cancella.

| Campo | Finalità | Validazione | Natura del dato | Utilizzo | Sensibilità |
|---|---|---|---|---|---|
| Nome, Cognome | Riconoscere la scheda, personalizzare | testo, max 60 | dichiarato | saluto (se manca il nome da mostrare), riepilogo del Profilo | personale |
| Come vuoi essere chiamato | Saluto | testo, max 40 | dichiarato | saluto | personale |
| Data di nascita | Età sempre aggiornata, compleanno | data esistente, non futura, ≤ 120 anni | dichiarato | età e saluto di compleanno; **nessuna analisi** | personale |
| Età in anni | Alternativa alla data | intero 1–120 | dichiarato, **non si aggiorna** (detto nell'interfaccia) | solo se manca la data | personale |
| Sesso | Scheda personale | elenco chiuso (non indicato, femmina, maschio, intersex, preferisco non dirlo) | dichiarato | **nessun uso** nelle analisi né nei testi | particolare (salute/identità): mai usato per adattare risultati, perché i dati di popolazione non sono previsioni individuali |
| Genere | Scheda personale | testo, max 60 | dichiarato | nessun uso | particolare |
| Cronotipo percepito | Scheda personale | elenco a 5 gradi | autovalutazione, **non una misura** | nessun uso nei calcoli | personale |
| Fabbisogno di sonno percepito | Confronto con il sonno osservato | 4–12 h a passi di 15 min | **percezione**, distinta dal sonno misurato nel diario | spunti (§6.3) | personale |
| Obiettivo: provare a dormire entro le | Spunti legati agli obiettivi | HH:MM | dichiarato | spunti | personale |
| Obiettivo: schermo spento almeno N min prima | Spunti | 15, 30, 45, 60, 90, 120 | dichiarato | spunti | personale |
| Obiettivo con parole tue | Promemoria | testo, max 200 | dichiarato | **non interpretato** dall'app | personale |
| Note | Promemoria | testo, max 1000 | dichiarato | nessun uso | personale |
| Immagine del profilo (`avatar`, dal 26/11/2026) | Riconoscere la propria scheda, personalizzare l'intestazione | `null` oppure `{id, tone, hair, glasses}`: id fra i nove volti, tono fra quelli di quel volto, capelli solo per le persone, occhiali booleano; un valore sconosciuto è rifiutato, mai corretto (`js/avatars.js`, `validateAvatar`) | scelta estetica; **non è una foto**, non descrive la persona | intestazione e Profilo; **nessun uso** nelle analisi né nei testi | bassa; carnagione e capelli sono solo colori del disegno. Si toglie con "Nessuna immagine" (torna l'iniziale del nome) o con "Cancella profilo" |
| Valori del profilo precedente senza date (professione, turni) | Non perdere dati della versione 1 | conservati come erano | dichiarato **senza date** | mostrati; "Crea un periodo con questi valori" precompila un periodo, con date e provenienza scelte dall'utente; "Togli questi valori" li elimina | personale |

Non raccolti, perché non servono a nessuna funzione: indirizzo, città, contatti, peso, altezza, diagnosi, farmaci.

## 4. Storico temporale (periodi)

Un periodo vale nell'intervallo semiaperto **[validFrom, validTo)**:
- `validFrom` è incluso;
- `validTo` è escluso;
- `validTo = null` indica un periodo ancora in corso.

Le date sono giorni di calendario, senza ore, quindi il cambio dell'ora non ha effetti. La data di una notte è quella del risveglio, come nel diario. L'interfaccia chiede e mostra l'**ultimo giorno incluso**: `validTo` è quel giorno più uno.

| Categoria | Dati | Esempi |
|---|---|---|
| `work`: lavoro o studio | attività (max 80), tipo di orario (regolare, turni, variabile, non lavoro né studio; obbligatorio), giorni (lun–dom), inizio, fine, sveglia nei giorni di lavoro (facoltativi) | professione, turni, orari e giorni di lavoro, sveglia vincolata |
| `routine`: routine particolare | tipo (vacanza, viaggio, malattia, esami o studio intenso, impegni familiari, altro; obbligatorio), nome breve (max 60), note (max 300) | settimane con routine diverse |

Valori nel record: `id`, `category`, `validFrom`, `validTo`, `provenance`, `data`, `createdAt`, `updatedAt`, `revision`, che parte da 1 e aumenta a ogni modifica.

**Provenienza**, obbligatoria:
- `contemporaneous`: registrato all'epoca. L'app la assegna da sola solo ai periodi che iniziano oggi o in futuro; per un periodo iniziato prima di ieri non è selezionabile.
- `declared_later`: dichiarato in seguito.
- `retrospective`: ricostruito a memoria.
- `unknown`: origine non nota.

L'interfaccia la mostra accanto a ogni periodo e nel contesto della notte.

**Regole:**
- **Sovrapposizioni.** Due periodi della stessa categoria non possono sovrapporsi: il salvataggio è rifiutato e il messaggio indica il periodo in conflitto. Periodi contigui sono ammessi, per esempio uno che termina il 31/8 e uno che inizia l'1/9. Un archivio importato con sovrapposizioni viene rifiutato. Se comunque se ne trovasse una, il resolver lo segnala come ambiguo senza scegliere.
- **Operazioni.** Si possono creare periodi, anche passati, modificarli (correzione retroattiva: stesso `id`, revisione +1), terminarli ("Termina", con l'ultimo giorno) ed eliminarli con conferma. "Annulla" annulla l'ultima operazione e ripristina il periodo com'era.
- **Assenza di contesto.** Nessun periodo per una data equivale a nessun contesto: l'app non mostra né presume nulla.

## 5. Migrazione del Profilo della versione 1

Una tantum all'avvio, in `migrateLegacyProfile`, attraverso questi passi:
1. legge `localStorage.ssl_profile`;
2. lo valida in modo rigoroso (`parseLegacyProfile`);
3. lo scrive nell'archivio;
4. lo rilegge;
5. lo confronta con l'originale;
6. registra `migration.ssl_profile = { status: 'migrated', at, source: impronta dell'originale, dropped: campi non validi }`;
7. conserva l'originale in `localStorage`.

L'originale si rimuove solo con "Rimuovi la vecchia copia" nel Profilo, con due tocchi.

| Caso | Comportamento |
|---|---|
| Nessun profilo precedente | registrato `empty` |
| Profilo valido | trasferito. Professione e turni diventano valori **senza date**, mai periodi |
| Campi non validi | non trasferiti ed elencati all'utente; restano nella copia originale |
| JSON rovinato o forma inattesa | **non** letto come profilo vuoto. Non si scrive nulla e si segnala. Le opzioni sono "Riprova" e "Inizia un profilo nuovo", che registra `skipped`; l'originale resta |
| Versione sconosciuta (più recente o assente) | come sopra, con la versione indicata |
| Migrazione interrotta (profilo scritto, completamento non registrato) | all'avvio successivo il profilo identico viene riconosciuto e si registra il completamento, senza duplicati |
| Profilo diverso già presente nel nuovo archivio | nessuna sovrascrittura. L'utente sceglie "Tieni il profilo attuale" oppure "Usa quello precedente" |
| Archivio non disponibile | nessuna scrittura; la migrazione si ripete al prossimo avvio |

## 6. Personalizzazione (`js/personalize.js`, metodologia §15)

Flusso: data della notte → `resolveContext` (periodo valido per categoria) → validazione e provenienza → testo descrittivo → eventuale spunto. Ogni livello si può disattivare in "Personalizzazione" (preferenza `personalization` nell'archivio contestuale).

1. **Contesto della notte**, nel Diario. Mostra:
   - il periodo valido, con la provenienza;
   - se, secondo il periodo, era un giorno di lavoro;
   - l'eventuale differenza con il tipo di giorno segnato nella notte (prevale la notte);
   - se il risveglio è vicino all'orario di sveglia dichiarato (entro ±15 min) o quanti minuti prima o dopo, segnalando se il risveglio non è registrato all'epoca.

   Sempre con la frase "Descrive, non spiega".
2. **Confronti tra periodi**, in Andamento, sezione "Nel tuo contesto". Confronta tre cose:
   - giorni di lavoro dichiarati e altri giorni;
   - periodi con orari di lavoro diversi;
   - ogni tipo di routine rispetto al resto.

   Per ciascuno mostra intervallo di sonno, addormentamento e risveglio, con mediana, metà centrale delle notti e numero di notti. "Differenza chiara" solo con almeno 14 notti per gruppo e metà centrali che non si sovrappongono.
3. **Spunti legati agli obiettivi**, in Andamento. Valgono queste regole:
   - Gli spunti nascono solo dagli obiettivi dichiarati e dalle ultime 2 settimane di dati registrati all'epoca, con almeno 7 notti valide.
   - Compaiono solo se l'obiettivo manca in almeno metà delle notti, o se il sonno è almeno 30 minuti sotto il fabbisogno percepito.
   - Ogni spunto indica il perché, quante notti e quali date.
   - Formula "una possibilità è…", senza promesse né linguaggio medico.
   - Con dati insufficienti, nessuno spunto: l'app dice quante notti servono.

## 7. Backup e cancellazione
Il backup del contesto ha un formato separato da quello delle notti: `docs/BACKUP_AND_RESTORE.md` §3. La cancellazione dei dati del sito o del browser, o la disinstallazione della PWA su iOS, elimina **entrambi** gli archivi: per questo l'app invita a salvare i due backup fuori dal telefono.
