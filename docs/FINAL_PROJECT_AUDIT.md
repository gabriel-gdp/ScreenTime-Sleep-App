# Audit finale del progetto — stato iniziale (23/11/2026)

Audit eseguito sul codice, non sui report precedenti. Ogni affermazione marcata **[verificato]** è stata controllata in questa sessione, eseguendo test, script o leggendo il codice. Le verifiche sono distinte in PASS (eseguito e superato), FAIL (eseguito e fallito), BLOCKED (non eseguibile qui), NOT TESTED (non eseguito).

Questo documento fotografa il punto di partenza. Lo stato dopo gli interventi è in `docs/FINAL_RELEASE_REPORT.md`; le decisioni sono registrate in `docs/ARCHITECTURE.md` §Registro delle decisioni.

---

## 1. Fotografia dello stato iniziale

| Voce | Valore [verificato] |
|---|---|
| Punto di partenza | Versione del 18/11/2026: consolidamento della Fase 5 + Profilo in `localStorage` |
| Checkpoint | Repository Git **esterno** alla cartella (nessuna cartella `.git` nel progetto), commit `baseline`; copia integrale di sicurezza |
| Test di partenza | `npm test`: **23 suite, 947 controlli, 0 falliti** (13 di logica: 585; 10 browser: 362). Chromium 1.63 via Playwright, `TZ=Europe/Rome` |
| Test non eseguibili | Safari / WebKit e PWA installata su iOS: **BLOCKED** (nessun dispositivo né WebKit nell'ambiente) |
| Dimensioni | `app.js` 168 KB (2.640 righe), CSS 41 KB, altri moduli 6–37 KB; nessuna dipendenza in esecuzione |
| Tempi misurati (Chromium, 150 notti demo) | Primo rendering 190–410 ms; cambio scheda 80–190 ms; Andamento 7/28/90 notti 95–130 ms |

## 2. Architettura effettiva

```
index.html ── js/app.js (interfaccia, stato, rendering di tutte le schermate)
                 ├── js/db.js           IndexedDB `sleep-screen-lab` v4 (store `entries`, chiave `date` = giorno del risveglio) + preferenze in localStorage (`ssl_*`)
                 ├── js/record.js       campi del record, provenienza per campo, bozze
                 ├── js/analytics.js    metriche della notte, riepiloghi, regolarità, filtri, CSV
                 ├── js/inference.js    H, P1–P3, BH, sensibilità, testi
                 ├── js/provenance.js   strumento "Origine dei dati"
                 ├── js/backup.js       backup JSON delle notti (formato 1, schema 4)
                 ├── js/bibliography.js Fondamento scientifico (38 fonti)
                 ├── js/demo.js         dati di esempio in memoria
                 ├── js/profile.js      Profilo (localStorage `ssl_profile`)
                 └── js/config.js       tutte le soglie
service-worker.js   network-first, cache `sleep-screen-lab-v15`
```

- Dipendenze in esecuzione: **nessuna**, salvo i caratteri tipografici scaricati da Google Fonts (§4, criticità S1).
- Le analisi (`analytics.js`, `inference.js`) sono pure: ricevono i record e non leggono archivi. Il Profilo non è importato da nessun modulo di analisi [verificato da `tests/unit/profile.test.mjs`].

## 3. Inventario delle funzionalità

| Area | Stato | Verifica |
|---|---|---|
| Diario (sera e mattino, bozze, mezzanotte, risvegli, schema 4, provenienza automatica, domanda sugli inserimenti tardivi) | Completata | PASS: unit `schema4`, `midnight-awakenings`, `record`; browser `regression`, `awakenings`, `schema4`, `reliability` |
| Migrazioni del database (v1→v4, con backup verificato prima) | Completata | PASS: browser `schema4`, unit `backup` |
| Provenienza per campo e strumento "Origine dei dati" (anteprima, transazione unica, rilettura, annullamento) | Completata | PASS: unit e browser `provenance` |
| Backup JSON delle notti, ripristino con riepilogo, conflitti, transazione unica | Completata | PASS: unit e browser `backup` |
| CSV | Completata | PASS: `config-baseline` (istantanea), `backup` |
| Riepilogo di periodo L1 (mediana, IQR, copertura) | Completata | PASS: unit `metrics`, `weekly` |
| Regolarità L2 (SD circolare, per tipo di giorno, social jetlag con esclusione DST) | Completata | PASS: unit `inference`, `methodology` |
| P1–P3 (H, finestre, astensione, BH, sensibilità) | Completata | PASS: unit `inference` (122) e browser `phase4` |
| Filtri delle descrizioni, actogramma, schede a sette elementi, Fondamento scientifico | Completata | PASS: unit e browser `phase5`, browser `phase5-consolidation` |
| Profilo (localStorage) | Completata, ma **non conforme ai nuovi requisiti** (§4 D1–D4) | PASS sui test esistenti |
| Promemoria in app e notifica (iOS 16.4+, app dalla Home) | Implementata | PASS in simulazione; dispositivo **BLOCKED** |
| PWA: installazione, aggiornamento, offline | Implementata | PASS in Chromium (`reliability`: SW, aggiornamento con bozza, offline); iOS **BLOCKED** |
| L3 andamento di una variabile, L4 notti insolite con la MAD, SRI da diario, confronto con la variabilità abituale | **Non implementate** (soglie già in `config.js`, approvate nei documenti di ricerca) | — |
| Storico temporale del contesto, personalizzazione, backup del contesto | **Non implementate** (nuovi requisiti) | — |
| Navigazione nel tempo dell'Andamento (periodi passati) | Non implementata | — |

## 4. Criticità individuate

### 4.1 Correzioni già richieste (§4.3 del mandato): ricontrollo sul codice
| # | Esito [verificato] | Dove | Test che la proteggono |
|---|---|---|---|
| A habitualShare | Corretta: H e ultimo utilizzo dal set filtrato (`habitualShareHTML(cur, filt.entries)`, nessun valore predefinito), messaggio con n/14 | `app.js` | browser `phase5-consolidation` C1.1–C1.4 |
| B marker notti insolite | Corretto: legge solo il record filtrato | `actogramHTML` | C2.1–C2.4 |
| C tratto a letto | Corretto: pieno solo se entrambi gli estremi usati sono registrati; nessun ripiego con tentativo incoerente o fuori grafico | `actogramHTML` | C3.1–C3.7 |
| D conteggi sequenziali | Corretto: frase `#filters-order`, documentazione §14.1 | `filtersHTML` | C4 (browser e unit) |
| E decisioni su H e tabella | Corrette: H del grafico = H di P1 (indipendente dai filtri), frase nella legenda e in "Come leggerlo", stati "incoerente" e "fuori grafico" | `actogramHTML` | D2, D3 |

Nessuna nuova correzione necessaria su questi punti.

### 4.2 Nuove criticità

Priorità: **P0** = integrità o privacy; **P1** = requisito della release; **P2** = qualità; **P3** = miglioria.

| # | Pri. | Tipo | Criticità | Evidenza |
|---|---|---|---|---|
| D1 | P0 | Integrità | `setPref()` ingoia gli errori di `localStorage`: il Profilo mostra "Profilo salvato" anche se la scrittura fallisce (spazio pieno, archiviazione bloccata). Lo stesso vale per schema settimanale, definizioni degli indicatori, filtri e bozze ("le bozze sono comunque al sicuro" non è garantito) | `db.js` `setPref` con `catch` vuoto; `app.js` non controlla l'esito |
| D2 | P0 | Integrità | La lettura del Profilo tratta strutture sconosciute (versione futura, forma diversa) come profilo vuoto + "rovinato": un salvataggio successivo **sovrascrive** l'originale | `parseStoredProfile` |
| D3 | P1 | Requisito | Profilo in `localStorage`, senza storico temporale né backup: si perde cambiando dispositivo o cancellando i dati del sito | `profile.js` |
| D4 | P1 | Requisito | Professione e lavoro su turni sono valori unici senza date: non possono contestualizzare notti passate | `profile.js` |
| S1 | P0 | Privacy / offline | `styles.css` importa i caratteri da `fonts.googleapis.com`: **a ogni avvio l'app contatta Google** (indirizzo IP, user agent); offline i caratteri cambiano; l'`@import` ritarda il primo rendering | `css/styles.css` riga 1; errore di rete in console nell'ambiente di test |
| S2 | P2 | Sicurezza | Nessuna Content Security Policy: un eventuale errore di escape non avrebbe una seconda barriera; nulla impedisce connessioni esterne | `index.html` |
| U1 | P2 | Usabilità | **Andamento lungo ~8.800 px su iPhone** (393 px): le tre schede P1–P3 mostrano quasi tutto il testo già aperto; il dato personale ("Nei tuoi dati") è sepolto | screenshot `mobile-andamento` |
| U2 | P2 | Accessibilità | Bersagli sotto i 44 px: "Esci" dalla demo (36×36), "+ Aggiungi l'ora in cui sei andato a letto" (altezza 36), riassunti espandibili (altezza 24) | script di audit |
| U3 | P3 | Usabilità | Nessun modo di vedere periodi passati in Andamento (solo gli ultimi 7/28/90 giorni) | codice |
| U4 | P3 | Usabilità | "Su questa versione" nelle Impostazioni descrive solo le prime funzioni | `renderSettings` |
| M1 | P2 | Debito tecnico | `app.js` concentra tutta l'interfaccia (2.640 righe). Rischio di regressioni crescenti | dimensioni |
| A1 | P3 | Analisi | L3/L4, SRI da diario, confronto con la variabilità abituale: approvati (STATISTICAL_VALIDATION §3, §12, §13; FINAL_ANALYTICS_SPEC L1–L4) ma non implementati; le soglie sono già in configurazione | `config.js` |
| T1 | P1 | Test | Mancano test per: errori di scrittura delle preferenze, versione sconosciuta del profilo, archivio contestuale assente, flussi end-to-end del contesto | inventario test |
| DOC1 | P2 | Documentazione | Mancano `ARCHITECTURE.md`, `TEST_STRATEGY.md`, `BACKUP_AND_RESTORE.md`, `CHANGELOG.md`; `README.md` e `ANALYTICS_METHODOLOGY.md §9` elencano come "non implementate" funzioni che diventeranno disponibili | `docs/` |

### 4.3 Limiti prestazionali
Nessun collo di bottiglia reale sui dataset normali (150 notti demo: rendering sotto i 200 ms). Le analisi P1–P3 usano già una cache per H. Da tenere sotto controllo: ricalcolo completo dell'Andamento a ogni cambio di filtro (accettabile fino a qualche anno di notti); dimensione di `app.js`.

### 4.4 Incoerenze tra documentazione e codice
- `docs/PROFILE.md` descrive il Profilo in `localStorage`: andrà sostituito da `docs/PROFILE_AND_CONTEXT.md`.
- `README.md` "Non implementati" e `ANALYTICS_METHODOLOGY.md` §9: da aggiornare quando L3/L4 e SRI saranno disponibili.
- Nessuna altra incoerenza trovata nelle sezioni lette (soglie: test `config-baseline` e `methodology` le confrontano automaticamente).

## 5. Dipendenze tra gli interventi

```
D1 persistenza affidabile ─┐
                           ├─> archivio contestuale + migrazione del profilo (D2, D3) ─> storico periodi (D4) ─> resolver ─> personalizzazione L1–L3
                           │                                                     └────> backup del contesto
S1/S2 privacy (indipendenti)
A1 analisi descrittive (indipendenti; usano solo analytics.js in lettura)
U1–U4 UX (indipendenti; U1 tocca le schede P1–P3 solo nella presentazione)
```

## 6. Test disponibili e mancanti

**Disponibili** [verificato]: 13 suite di logica (585 controlli), 10 browser (362), checklist manuale per iPhone (sezioni A–H, E6, E7).

**Mancanti** (da aggiungere con gli interventi): errori di scrittura delle preferenze; profilo con versione sconosciuta o struttura inattesa; migrazione interrotta e ripetuta; archivio contestuale assente o bloccato; periodi (sovrapposizioni, intervalli aperti, confini, date non valide, cambio dell'ora); resolver; personalizzazione con dati insufficienti; backup del contesto (file corrotto, versione sconosciuta, conflitti, annullamento); end-to-end completo; equivalenza P1–P3 con e senza contesto; screenshot automatici di tutte le schermate in mobile e desktop.

## 7. Limiti che richiedono verifiche esterne
- Safari su iPhone e PWA installata: IndexedDB del secondo archivio, selettore di data, tastiera, persistenza dopo l'aggiornamento, notifiche. Procedura in `docs/MANUAL_TEST_CHECKLIST.md`.
- Tempo di compilazione reale di una notte (obiettivo < 1 minuto) e ricerca degli errori: solo con l'uso su dispositivo.
- Verifica delle fonti V2 (richiede l'accesso agli articoli).

## 8. Piano di completamento
Roadmap operativa, con criteri di completamento e rischi: `docs/FINAL_ROADMAP.md`. Avanzamento della sessione: `docs/WORK_SESSION_STATE.md`.
