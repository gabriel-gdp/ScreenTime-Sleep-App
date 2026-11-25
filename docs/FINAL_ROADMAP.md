# Roadmap operativa finale

Derivata da `docs/FINAL_PROJECT_AUDIT.md`. Ogni fase si chiude con: test nuovi scritti ed eseguiti, suite completa verde, documentazione aggiornata, checkpoint Git esterno. Regole sempre valide: schema 4 delle notti invariato, P1–P3 invariate, nessun dato dell'utente modificato senza conferma, local-first.

| Fase | Contenuto | Criterio di completamento | Rischi e mitigazioni | Deliverable |
|---|---|---|---|---|
| R0 | Baseline | Test eseguiti e registrati; checkpoint | — | log, commit `baseline` |
| R1 | Audit e roadmap | Documenti scritti dal codice | — | `FINAL_PROJECT_AUDIT.md`, questo file |
| R2 | Persistenza affidabile delle preferenze (D1) | `setPref` restituisce l'esito (riuscita, fallita, archivio non disponibile, valore non valido); nessun messaggio di successo senza scrittura verificata; avviso visibile se le preferenze non si salvano | Cambio di firma: i chiamanti attuali ignorano il valore restituito → compatibile | `db.js`, test errori |
| R3 | Archivio contestuale `sleep-screen-context` v1 (profile, contextPeriods, contextPreferences), Profilo evoluto, migrazione da `ssl_profile` (D2–D4) | Migrazione: lettura, validazione, scrittura, rilettura, confronto, registrazione; originale conservato; versioni sconosciute non sovrascritte; ripetibile senza duplicati | Archivio nuovo e separato: nessun rischio per le notti. Interruzione simulata nei test | `context-db.js`, `context.js`, `ui-profile.js` |
| R4 | Storico temporale (periodi `[validFrom, validTo)`) con provenienza | Creazione, modifica, chiusura, eliminazione, annullamento, sovrapposizioni rifiutate, periodi aperti, periodi passati | Le date sono semplici giorni di calendario: nessun problema di cambio dell'ora | come R3 |
| R5 | Backup e ripristino del contesto | Formato versionato; validazione completa prima di scrivere; riepilogo; conflitti; annullamento; verifica dopo la scrittura | Transazione unica; copia dello stato precedente per l'annullamento | `context.js`, `ui-profile.js` |
| R6 | Resolver e personalizzazione L1–L3 | Contesto valido per data; contestualizzazione della notte; confronti tra periodi con n e limiti; suggerimenti solo con dati sufficienti e legati agli obiettivi dichiarati; app funzionante con archivio assente | Linguaggio: nessuna causalità, nessun consiglio medico. Le analisi consolidate non leggono il contesto (test di isolamento) | `personalize.js` |
| R7 | Privacy e sicurezza (S1, S2) | Nessuna connessione esterna all'avvio; caratteri locali; CSP | Rischio estetico se i caratteri non si caricano: ripiego sui caratteri di sistema | `fonts/`, `index.html` |
| R8 | Analisi descrittive approvate (A1): SRI da diario, L3 andamento con media mobile e Theil–Sen, L4 notti insolite con la MAD, confronto con la variabilità abituale | Formule verificate con esempi numerici dei documenti; astensione sotto le soglie | Solo descrittive; nessuna esclusione automatica; nessuna modifica a P1–P3 | `trends.js` |
| R9 | UX e accessibilità (U1–U4) | Andamento più corto senza perdere contenuti; bersagli ≥ 44 px; screenshot automatici senza sovrapposizioni in mobile e desktop | I test sull'ordine dei sette elementi restano validi | `app.js`, CSS |
| R10 | Documentazione, verifica finale, rilascio | Documenti allineati; suite completa; verifica indipendente; checklist manuale; zip | Safari non verificabile qui: dichiarato | `FINAL_RELEASE_REPORT.md`, `CHANGELOG.md` |

Ordine: R2 → R3 → R4 → R5 → R6 (dipendenze); R7, R8, R9 indipendenti, dopo R6; R10 per ultima. Le priorità possono cambiare se emergono problemi, con motivazione registrata in `docs/WORK_SESSION_STATE.md`.

**Fuori perimetro** (motivazione in `docs/ARCHITECTURE.md`, registro delle decisioni): backup combinato notti + contesto (opzionale futuro); sincronizzazione; punteggi compositi; consigli medici; importazione da Salute o Screen Time (non accessibili da una PWA).
