# Stato della sessione di lavoro

Serve a riprendere il lavoro senza ripetere operazioni già fatte. Aggiornato a ogni fase.

## Ambiente
- Progetto: questa cartella. Checkpoint: repository Git esterno (fuori dal progetto, nella cartella temporanea della sessione); se non c'è più, la copia di riferimento è lo zip consegnato.
- Test: `npm test` (oppure `--unit` / `--browser`), Node ≥ 18, Playwright 1.63 con Chromium, `TZ=Europe/Rome` impostato dal runner.

## Fasi
| Fase | Stato | Note |
|---|---|---|
| R0 Baseline | Completata (23/11) | 23 suite, 947 controlli PASS, 0 FAIL; Safari BLOCKED |
| R1 Audit e roadmap | Completata (23/11) | `FINAL_PROJECT_AUDIT.md`, `FINAL_ROADMAP.md` |
| R2 Persistenza preferenze | Completata (23/11) | `setPref` con esito; avviso `#pref-error`; test `unit/preferences`, `browser/context` |
| R3 Archivio contestuale, Profilo, migrazione | Completata (23/11) | `context-db.js`, `profile.js` v2, `ui-profile.js`; test `unit/profile`, `browser/profile`, `browser/context` |
| R4 Storico dei periodi | Completata (23/11) | `context.js`; test `unit/context`, `browser/context` |
| R5 Backup del contesto | Completata (23/11) | formato `diario-del-sonno-contesto` v1; test `unit/context`, `browser/context`, `browser/e2e` |
| R6 Resolver e personalizzazione | Completata (23/11) | `personalize.js`; test `unit/personalize`, `browser/context`, `browser/e2e` |
| R7 Privacy (caratteri locali, CSP) | Completata (23/11) | `fonts/`, CSP con hash; test `unit/security`, `browser/ux` |
| R8 Analisi descrittive approvate | Completata (23/11) | `trends.js`, `ui-trends.js`; test `unit/trends`, `browser/ux` |
| R9 UX e accessibilità | Completata (23/11) | schede compatte, bersagli ≥ 44 px, navigazione nel tempo, tabelle mobili; audit automatico mobile/desktop in `browser/ux` |
| R10 Documentazione e rilascio | Completata (23/11) | suite finale: 31 suite, 1.151 controlli PASS; `FINAL_RELEASE_REPORT.md`, `CHANGELOG.md`; zip |
| S1 Schermata iniziale | Completata (26/11) | `js/boot.js`, `icons/logo.svg`, `#splash`; test `browser/splash`; suite completa 32/32, 1.176 controlli PASS |
| S2 Logo A1 e avatar | Completata (26/11) | `icons/*` rigenerate, logo in linea nella schermata iniziale, `js/avatars.js`, campo `avatar` del Profilo; cache v20; suite completa 35/35, 1.268 controlli PASS |

## Prossima attività
Nessuna attività di sviluppo pendente. In attesa della checklist manuale E6–E10 su iPhone (a cura dell'utente). Possibili evoluzioni future: separazione di `app.js` con test di equivalenza, backup combinato, verifica delle fonti V2.

## Problemi incontrati e risolti
- CSP e aiutante di test con `new Function` (backup): opzione `bypassCSP` solo in quel test.
- Classe `act-table` riusata dalla nuova tabella: collisione con i test dell'actogramma; classe propria `tr-table`.
- Anomalie confermate nel grafico dell'andamento: ora escluse come altrove.
