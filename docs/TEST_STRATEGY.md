# Strategia di test

## 1. Come si eseguono
```
npm install           # una volta: installa Playwright 1.63 (solo per i test)
npx playwright install chromium   # se il browser non è presente
npm test              # tutte le suite (logica + browser), TZ=Europe/Rome impostato dal runner
npm run test:unit     # solo logica (basta Node ≥ 18, nessun browser)
npm run test:browser  # solo browser
```
Ogni suite è uno script in `tests/unit` o `tests/browser`. Stampa `OK` o `FAIL` per ogni controllo, ha codice d'uscita 1 se qualcosa fallisce, e `tests/run-all.mjs` stampa un riepilogo finale. Gli screenshot vanno in `tests/output/`, che non fa parte del pacchetto.

## 2. Livelli

| Livello | Dove | Che cosa garantisce |
|---|---|---|
| Unità | `tests/unit/*.test.mjs` | formule (confronto con esempi numerici dei documenti), soglie, validazioni, migrazioni pure, backup, provenienza, filtri, P1–P3, profilo, periodi, resolver, personalizzazione, trend, preferenze, sicurezza statica |
| Regressione | `config-baseline` (istantanea di metriche e CSV dello schema 3), `inference` (P1–P3), `profile`/`personalize`/`trends` (isolamento ed equivalenza di P1–P3 su dati fissi), `browser/profile` (Andamento, Calendario, CSV e backup identici con e senza profilo) | P1–P3 invariate, schema 4 invariato, backup storico compatibile, CSV identico, notti non modificate dal Profilo |
| Integrazione | `browser/context` (archivi, migrazione, resolver, backup, resilienza), `browser/backup`, `browser/schema4`, `browser/provenance` | interazione tra Diario, database principale, archivio contestuale, statistiche, backup e importazione |
| End-to-end | `browser/e2e` | i 14 passi del mandato: primo avvio → profilo → riapertura → notte → statistiche → periodo retrospettivo → contesto → modifica → esportazione → cancellazione → ripristino → integrità → offline |
| Errori e casi limite | `unit/preferences` (spazio pieno, archivio bloccato), `browser/context` (archivio non disponibile, JSON corrotto, versione sconosciuta, migrazione interrotta, conflitto, doppio tocco, periodi sovrapposti, intervalli aperti, date non valide), `unit/context` (cambio dell'ora nelle date), `unit/trends` (SRI al cambio d'ora), `browser/reliability` (service worker, aggiornamenti, offline, file mancante) | gestione corretta degli errori |
| Visivi e usabilità | screenshot in `browser/profile`, `browser/context`, `browser/phase5`; controllo automatico di sovrapposizioni e scorrimento orizzontale a 393 px; script di audit (mobile 393 px e desktop 1280 px: bersagli, etichette, overflow) | layout senza sovrapposizioni, campi etichettati |
| Manuale | `docs/MANUAL_TEST_CHECKLIST.md` | Safari su iPhone e PWA installata: non automatizzabili qui |

## 3. Regole
- Un test non si modifica per farlo passare senza aver dimostrato che è sbagliato. Le modifiche ai test esistenti sono documentate nel file stesso e in `docs/FINAL_RELEASE_REPORT.md` §7.
- Le soglie statistiche non si cambiano per ottenere risultati più favorevoli.
- Esiti dichiarati come PASS solo se il test è stato eseguito e superato. BLOCKED se non è eseguibile nell'ambiente (Safari/WebKit qui), NOT TESTED se non è stato eseguito.

## 4. Limiti noti
- Nessun motore WebKit nell'ambiente di sviluppo: Safari e PWA su iOS si verificano con la checklist manuale (sezioni E6–E9).
- I test browser usano un orologio fissato (`page.clock`); il fuso è `Europe/Rome`.
