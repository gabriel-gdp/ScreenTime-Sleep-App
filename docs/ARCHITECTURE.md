# Architettura

PWA local-first in JavaScript senza dipendenze in esecuzione e senza passaggi di build: i file in `js/` sono moduli ES caricati direttamente dal browser. Nessun backend, nessun account, nessuna connessione verso servizi esterni (garantito anche dalla Content Security Policy in `index.html`).

## 1. Moduli

```
index.html ─ CSP, script di avvio (messaggio se l'app non parte)
└─ js/app.js            stato, rendering di Diario, Andamento, Calendario, Impostazioni; preferenze (setPref con esito)
   ├─ js/db.js           IndexedDB `sleep-screen-lab` v4 (notti) + localStorage `ssl_*`        [consolidato]
   ├─ js/record.js       campi del record, provenienza per campo, bozze                          [consolidato]
   ├─ js/analytics.js    metriche, riepiloghi, regolarità, filtri, CSV                            [consolidato]
   ├─ js/inference.js    H, P1–P3, BH, sensibilità                                                [consolidato]
   ├─ js/provenance.js   strumento "Origine dei dati"                                             [consolidato]
   ├─ js/backup.js       backup JSON delle notti                                                  [consolidato]
   ├─ js/bibliography.js Fondamento scientifico                                                   [consolidato]
   ├─ js/demo.js · js/config.js
   ├─ js/trends.js       SRI da diario, L3–L4, variabilità abituale (puro)
   ├─ js/ui-trends.js    interfaccia di trends.js
   └─ js/ui-profile.js   schermata Profilo, blocchi di personalizzazione
        ├─ js/profile.js      Profilo v2: validazione, età, lettura rigorosa del profilo v1 (puro)
        ├─ js/context.js      periodi [validFrom, validTo), resolver, formato del backup del contesto (puro)
        ├─ js/context-db.js   IndexedDB `sleep-screen-context` v1, migrazione, scritture verificate
        └─ js/personalize.js  livelli 1–3 della personalizzazione (puro)
service-worker.js       network-first, cache di tutti i file dell'app (anche caratteri)
fonts/                  Inter e Fraunces (latin, 400–600, licenza OFL)
```

Direzione delle dipendenze: i moduli consolidati non importano mai quelli nuovi, come verifica `tests/unit/profile.test.mjs`. Le funzioni di analisi sono pure: ricevono i record e restituiscono risultati, senza leggere archivi.

## 2. Dati
- **Notti**: `sleep-screen-lab` versione 4, store `entries`, chiave `date` (giorno del risveglio). Dettagli in `docs/DATA_MODEL.md`.
- **Contesto**: `sleep-screen-context` versione 1, store `profile`, `contextPeriods`, `contextPreferences`. Dettagli in `docs/PROFILE_AND_CONTEXT.md`.
- **Preferenze di visualizzazione e bozze**: `localStorage` con prefisso `ssl_`.
- **Backup**: due file separati, descritti in `docs/BACKUP_AND_RESTORE.md`.

## 3. Flusso di avvio
1. `inspectDatabase`: se il database delle notti va aggiornato, si apre la schermata di migrazione con backup verificato.
2. Lettura delle notti → primo rendering.
3. `initContext` in parallelo, senza bloccare: apre l'archivio contestuale, esegue la migrazione una tantum del profilo, carica e ridisegna. Se l'archivio non è disponibile, lo stato diventa `unavailable` e la personalizzazione si spegne con un messaggio.
4. Registrazione del service worker, richiesta di archiviazione persistente.

## 4. Prestazioni
Misure in Chromium, 150 notti di esempio:
- primo rendering: 190–410 ms;
- cambio scheda: 80–190 ms;
- Andamento a 7, 28 e 90 notti: circa 100–130 ms;
- SRI: 27 coppie × 1.440 minuti, pochi ms.

I calcoli costosi di P1–P3 usano una cache per singolo calcolo. Nessuna risorsa viene caricata da reti esterne. I caratteri (circa 125 KB) sono in cache dopo la prima apertura.

## 5. Registro delle decisioni architetturali

| # | Problema | Alternative | Decisione | Motivazione | Conseguenze |
|---|---|---|---|---|---|
| ADR-1 | Dove salvare il Profilo evoluto | (a) nuovo store nel database delle notti; (b) localStorage; (c) archivio IndexedDB separato | (c) `sleep-screen-context` v1 | Nessuna migrazione del database consolidato; transazioni e riletture; versionamento indipendente | Secondo archivio da salvare con un backup proprio |
| ADR-2 | Informazioni che cambiano nel tempo | campi unici; cronologia di modifiche; periodi con date | periodi `[validFrom, validTo)` con provenienza, non sovrapposti per categoria | Permette di descrivere notti passate; le date di calendario evitano problemi di cambio d'ora | Il valore precedente "senza date" non diventa periodo da solo |
| ADR-3 | Migrazione del profilo v1 | spostamento con cancellazione; copia con verifica | copia, rilettura, confronto, registrazione; originale conservato finché l'utente non lo rimuove | Integrità: nessuna perdita, ripetibile, senza duplicati | Una copia ridondante finché l'utente non la toglie |
| ADR-4 | Lettura di strutture sconosciute | trattarle come vuote; rifiutarle | rifiutarle con stato esplicito (`corrupt`, `unknown_version`) | Una versione futura non deve essere sovrascritta | Serve una scelta dell'utente per ripartire |
| ADR-5 | Backup del contesto | file unico con le notti; file separato | file separato e versionato | Il formato del backup delle notti è consolidato | Due file da conservare (detto nell'interfaccia) |
| ADR-6 | Uso del contesto nelle analisi | dentro P1–P3; modulo separato | modulo separato (`personalize.js`); P1–P3 non leggono il contesto | Le analisi consolidate restano riproducibili | La personalizzazione è descrittiva |
| ADR-7 | Esito delle preferenze | ignorare gli errori; restituire l'esito | `setPref` restituisce `{ ok, reason }`; avviso persistente | Mai "salvato" senza scrittura | Le chiamate esistenti restano compatibili |
| ADR-8 | Caratteri tipografici | Google Fonts; caratteri di sistema; caratteri locali | locali (Fontsource, OFL), in cache | Nessuna connessione esterna all'avvio (privacy), funzionamento offline identico | +125 KB nel pacchetto |
| ADR-9 | Content Security Policy | nessuna; con `unsafe-inline` per gli script; con hash | hash dello script di avvio, `connect-src 'self'`, niente eval | Seconda barriera contro errori di escape; garanzia tecnica del local-first | Modificare lo script di avvio richiede di aggiornare l'hash (lo controlla un test) |
| ADR-10 | Crescita di `app.js` | rifattorizzazione completa; nuovi moduli per le nuove parti | nuove parti in moduli propri (`ui-profile.js`, `ui-trends.js`); `app.js` invariato nella logica esistente | Nessun refactoring rischioso di parti testate | `app.js` resta grande (≈2.600 righe): separarlo è un'attività futura con test di equivalenza |
| ADR-11 | Analisi L3/L4, SRI, variabilità | non implementarle; implementarle | implementate come descrittive, con le soglie già approvate | Approvate in STATISTICAL_VALIDATION; aggiungono capacità interpretativa senza toccare P1–P3 | Più testo in Andamento, compensato da sezioni espandibili |
| ADR-12 | Spunti comportamentali | consigli generali; spunti legati agli obiettivi | solo dagli obiettivi dichiarati, con motivo, dati e soglie | Evita consigli prescrittivi e causalità (FINAL_ANALYTICS_SPEC: niente consigli prescrittivi) | Senza obiettivi, nessuno spunto |
