# Changelog

Formato: data, versione della cache del service worker, modifiche. Le notti salvate non sono mai state modificate da un aggiornamento senza un backup verificato.

## 23/11/2026 — Rilascio finale (cache `sleep-screen-lab-v18`)

### Integrità e affidabilità
- `setPref` restituisce l'esito (riuscita, valore non valido, archivio non disponibile, spazio esaurito, errore). Se una preferenza non si salva compare l'avviso "Impostazioni non salvate"; prima l'errore era ignorato in silenzio.
- La lettura di un profilo con struttura sconosciuta o versione più recente non lo tratta più come vuoto: nessuna sovrascrittura possibile.

### Profilo e contesto (nuovo archivio `sleep-screen-context` v1)
- Profilo in IndexedDB, separato dalle notti; ogni salvataggio è riletto e confrontato prima di dire "salvato e verificato".
- Nuovi campi facoltativi:
  - fabbisogno di sonno percepito;
  - obiettivo sull'orario in cui provare a dormire;
  - obiettivo sul tempo senza schermo.
- Professione e turni non sono più valori unici, ma periodi con date.
- Storico dei periodi `[validFrom, validTo)` per lavoro o studio (tipo di orario, giorni, inizio, fine, sveglia) e routine particolari:
  - provenienza obbligatoria;
  - nessuna sovrapposizione nella stessa categoria;
  - periodi passati ammessi;
  - modifica, termine, eliminazione con conferma e annullamento.
- Migrazione una tantum del Profilo del 18/11 da `localStorage`:
  - verificata e ripetibile senza duplicati;
  - originale conservato;
  - gestione dei casi rovinato, versione sconosciuta, interrotta e in conflitto.
- Backup e ripristino del contesto in un file separato e versionato:
  - validazione completa;
  - riepilogo;
  - "aggiungi i nuovi" senza sovrascritture;
  - "sostituisci" con conferma;
  - verifica e annullamento.
- Personalizzazione (disattivabile):
  - contesto della notte nel Diario;
  - confronti tra periodi in Andamento, con numero di notti e criterio di "differenza chiara";
  - spunti legati agli obiettivi dichiarati, con motivo e dati, solo con dati sufficienti.
- Se l'archivio contestuale non è disponibile, Diario, statistiche e P1–P3 funzionano normalmente.

### Analisi descrittive (soglie già approvate nei documenti di ricerca)
- SRI da diario nella Regolarità.
- "Andamento di una misura":
  - media mobile a 7 notti;
  - pendenza di Theil–Sen;
  - notti molto diverse dalle 28 precedenti (MAD, solo visive);
  - confronto con la variabilità abituale.
- Navigazione nel tempo del riepilogo, del grafico degli orari e dell'andamento ("‹ Precedenti", "Torna a oggi").
- P1–P3, H, filtri, regolarità, riepilogo e CSV invariati (test di equivalenza).

### Privacy e sicurezza
- Caratteri tipografici locali (Inter e Fraunces, licenza OFL) al posto di Google Fonts: nessuna connessione esterna all'avvio, stessi caratteri offline.
- Content Security Policy: script solo dall'app (lo script di avvio è autorizzato tramite hash), nessuna connessione verso altri domini, niente `eval`.

### Interfaccia e accessibilità
- Schede di "Schermo e sonno" più corte: definizione completa e dettaglio delle notti in sezioni espandibili, sempre nell'ordine dei sette elementi.
- Bersagli toccabili di almeno 44 px ("Esci" dalla demo, "+ Aggiungi l'ora in cui sei andato/a a letto", sezioni espandibili).
- Tabelle dei confronti leggibili su iPhone (nome del gruppo su una riga, valori su colonne strette).

### Codice e test
- Nuovi moduli:
  - `profile.js` (v2), `context.js`, `context-db.js`, `personalize.js`, `ui-profile.js`;
  - `trends.js`, `ui-trends.js`.

  `app.js` cresce solo per gli agganci.
- Nuove suite:
  - logica: `context`, `personalize`, `trends`, `preferences`, `security`;
  - browser: `context`, `e2e`.
- Suite riscritte: `unit/profile` e `browser/profile`, per i nuovi requisiti, con i controlli ancora validi mantenuti.
- `browser/backup`: aggiunta l'opzione `bypassCSP`, necessaria all'aiutante di test con `new Function`; asserzioni invariate.

### Documentazione
- Nuovi documenti:
  - `FINAL_PROJECT_AUDIT.md`, `FINAL_ROADMAP.md`, `WORK_SESSION_STATE.md`;
  - `ARCHITECTURE.md` (con il registro delle decisioni);
  - `PROFILE_AND_CONTEXT.md` (sostituisce `PROFILE.md`);
  - `BACKUP_AND_RESTORE.md`, `TEST_STRATEGY.md`, `FINAL_RELEASE_REPORT.md`, questo file.
- Aggiornati:
  - `DATA_MODEL.md`;
  - `ANALYTICS_METHODOLOGY.md` (§9, §12, §15, §16, storico);
  - `MANUAL_TEST_CHECKLIST.md` (E8, E9);
  - `README.md`, `tests/README.md`.

## 18/11/2026 — Profilo (cache v15)
- Profilo in `localStorage` (`ssl_profile`): nome, età, saluto. Sostituito dalla versione del 23/11.

## 18/11/2026 — Consolidamento della Fase 5 (cache v14)
- habitualShare su set filtrato, simbolo delle notti insolite, tratto "a letto", tabella con stati "incoerente" e "fuori grafico", conteggi sequenziali dei filtri. Dettagli: `docs/PHASE_5_CONSOLIDATION_REPORT.md`.

## 17–18/11/2026 — Fasi 0–5
- Configurazione delle soglie, rimozione delle analisi fuorvianti, schema 4 con provenienza per campo, strumento "Origine dei dati", P1–P3, filtri, actogramma, Fondamento scientifico. Dettagli: `docs/PHASE_4_1_REPORT.md`, `docs/PHASE_5_REPORT.md`, `docs/ANALYTICS_METHODOLOGY.md` §11.
