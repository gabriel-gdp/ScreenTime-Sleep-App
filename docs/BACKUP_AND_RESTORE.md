# Backup e ripristino

L'app conserva i dati solo sul dispositivo, in due archivi indipendenti. Ogni archivio ha il suo backup e il suo ripristino, perché il primo è consolidato e non è stato toccato.

| Archivio | Contenuto | Backup | Dove |
|---|---|---|---|
| `sleep-screen-lab` (IndexedDB, versione 4) | le notti del diario | **Backup delle notti** (JSON) + **CSV** (solo analisi) | Impostazioni → I tuoi dati |
| `sleep-screen-context` (IndexedDB, versione 1) | Profilo, periodi, preferenze della personalizzazione | **Backup del contesto** (JSON) | Profilo → Backup del profilo e del contesto |
| `localStorage` (`ssl_*`) | preferenze di visualizzazione, bozze non salvate | nessuno (si reimpostano in pochi tocchi) | — |

> **Importante.** Cancellare i dati del sito o del browser, o rimuovere l'app dalla schermata Home su iPhone, elimina **tutti** gli archivi locali. Salva periodicamente **entrambi** i backup e conservali fuori dal telefono (iCloud Drive, email, computer).

## 1. Backup delle notti (invariato)
Formato `diario-del-sonno-backup`, versione 1, schema 4: `docs/DATA_MODEL.md` §7. In sintesi, il ripristino:
1. valida tutto il file prima di scrivere;
2. converte gli schemi 1–3;
3. mostra un riepilogo delle notti nuove, identiche e in conflitto;
4. di default aggiunge solo le notti nuove; la sostituzione richiede una conferma;
5. scrive in un'unica transazione;
6. rilegge il database e confronta.

Il formato e il comportamento non sono cambiati il 23/11/2026, come verificano i test `unit/backup`, `browser/backup` e `browser/profile` (nessun dato del Profilo nel file).

## 2. CSV (invariato)
Una riga per notte, colonne documentate in `docs/DATA_MODEL.md` §6. Serve all'analisi in un foglio di calcolo, non al ripristino. Non contiene Profilo né contesto (verificato byte per byte da `browser/profile`).

## 3. Backup del contesto (nuovo, 23/11/2026)

### 3.1 Formato
```json
{
  "format": "diario-del-sonno-contesto",
  "formatVersion": 1,
  "exportedAt": "2026-11-23T10:00:00.000Z",
  "profileVersion": 2,
  "profile": { "firstName": "…", "sleepNeedMin": 480, "goalAttemptTime": "23:00", "legacy": null, "…": "…" },
  "periods": [
    { "id": "p-…", "category": "work", "validFrom": "2025-09-01", "validTo": null, "provenance": "declared_later",
      "data": { "occupation": "…", "schedule": "regular", "workDays": [1,2,3,4,5], "start": "08:00", "end": "14:00", "alarm": "07:00" },
      "createdAt": "…", "updatedAt": "…", "revision": 1 }
  ],
  "preferences": [ { "key": "personalization", "value": { "contextNotes": true, "highlights": true, "suggestions": true } } ]
}
```
- `profile` può essere `null`.
- I periodi sono ordinati per data d'inizio.
- Lo stato della migrazione dal vecchio profilo non è esportato: riguarda il singolo dispositivo.
- Nome del file: `diario-del-sonno-contesto-AAAA-MM-GG.json`.

### 3.2 Ripristino (`parseContextBackup`, `planContextImport`, `writeContextBatch`)
1. **Validazione completa prima di scrivere.** Il ripristino rifiuta, con un messaggio chiaro, questi casi:
   - file vuoto, troppo grande (oltre 1 MB) o JSON non valido;
   - un **backup delle notti** scelto per errore: il messaggio indica dove ripristinarlo;
   - formato diverso;
   - versione assente, non valida o **più recente** dell'app;
   - profilo con campi non validi;
   - periodi non validi, con identificativi ripetuti o che si sovrappongono nella stessa categoria;
   - preferenze malformate.

   Le preferenze sconosciute sono ignorate e contate nel riepilogo.
2. **Riepilogo**: periodi nuovi, identici, diversi da quelli salvati, sovrapposti a quelli salvati; stato del profilo (aggiunto, identico, diverso, assente).
3. **"Aggiungi i nuovi"** (predefinito):
   - scrive solo i periodi nuovi che non si sovrappongono;
   - i periodi diversi e quelli sovrapposti restano come sono sul dispositivo, ed è detto nel riepilogo;
   - il profilo del file si scrive solo se il dispositivo non ne ha uno;
   - le preferenze si scrivono solo se mancano.

   **Nessuna sovrascrittura silenziosa.**
4. **"Sostituisci tutto il contesto"**: richiede un secondo tocco. Svuota profilo, periodi e preferenze e scrive il contenuto del file. Lo stato della migrazione resta.
5. **Scrittura atomica**: un'unica transazione su tutti gli object store; se fallisce, il contesto resta com'era.
6. **Verifica**: rilettura e confronto di ogni periodo scritto e del profilo. Il messaggio dice "verificato" solo se coincidono.
7. **Annullamento**: prima di scrivere si conserva una copia del contesto; "Annulla il ripristino" la riscrive con una sostituzione completa, anch'essa verificata.

Le notti non sono mai toccate dal ripristino del contesto, come verificano i test `browser/context` ed `e2e`.

## 4. Procedura consigliata
- **Ogni settimana**:
  1. Impostazioni → "Salva backup completo";
  2. Profilo → "Salva backup del contesto";
  3. sposta entrambi i file fuori dal telefono.
- **Su un nuovo dispositivo**:
  1. apri l'app;
  2. Impostazioni → "Ripristina da backup" con il file delle notti;
  3. Profilo → "Ripristina il contesto" con il file del contesto;
  4. controlla i riepiloghi e conferma.
- **Prova di ripristino**: il flusso completo esportazione → cancellazione → ripristino → confronto è automatizzato in `tests/browser/e2e.test.mjs`, passi 10–13.

## 5. Backup combinato
Non implementato: un file unico con notti e contesto richiederebbe di modificare il formato del backup delle notti, che è consolidato. È valutato come funzionalità opzionale futura, con un formato nuovo e un'importazione che accetti entrambi i file separati.
