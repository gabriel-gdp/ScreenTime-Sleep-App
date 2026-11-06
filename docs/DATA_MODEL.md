# DATA_MODEL.md
### Diario del sonno — Modello dati (fonte di verità)

Questo documento descrive i dati **come sono effettivamente salvati** dall'app (versione dello schema: **3**). Se il codice e questo documento divergono, è un difetto da correggere. Riferimenti: `js/record.js` (campi del record, bozze, regole dei risvegli), `js/db.js` (storage), `js/analytics.js` (calcoli), `js/backup.js` (backup), `js/app.js` (bozze e preferenze).

Principi:
- **Un record = una notte**, identificata dal **giorno del risveglio**.
- **Nessuna imputazione**: un dato non inserito non viene salvato (il campo è assente), non è mai stimato né sostituito da 0. Uno 0 salvato è un valore reale (es. 0 minuti di screen time).
- **Le anomalie vengono segnalate, non corrette**: un valore insolito confermato resta com'è, con un flag.
- **Sconosciuto ≠ zero**: per i risvegli notturni "nessun risveglio" (0) e "non indicato" (campo assente) sono dati diversi e non vengono mai confusi.
- **Nulla di derivato viene salvato**: intervallo di sonno, sonno effettivo stimato, tempo senza schermo, medie e analisi sono ricalcolati a ogni visualizzazione dai dati grezzi.

---

## 1. Archiviazione

| Elemento | Valore |
|---|---|
| Database IndexedDB | `sleep-screen-lab` |
| Versione | `3` (costante `DB_VERSION` / `SCHEMA_VERSION` in `js/db.js`) |
| Object store | `entries`, chiave primaria (`keyPath`) = `date`, nessun indice |
| Scritture | `put` dell'intero record in una transazione; la conferma "Salvato" arriva solo dopo il completamento della transazione. In caso di eccezione la transazione viene annullata esplicitamente |
| Eliminazioni | solo su azione esplicita dell'utente (svuotare tutti i campi di una notte salvata e confermare) |

**Preferenze e bozze (`localStorage`, prefisso `ssl_`)** — non sono dati del diario e non entrano nel backup:

| Chiave | Contenuto |
|---|---|
| `ssl_theme` | `light` / `dark` |
| `ssl_reminders_enabled` | `1` / `0` |
| `ssl_reminder_dismissed_night` | data della notte per cui l'avviso è stato ignorato |
| `ssl_reminder_notified_night` | data della notte per cui la notifica è già stata mostrata |
| `ssl_drafts_v1` | bozze non salvate (JSON `{ data: { campi } }`; per i risvegli anche lo stato della casella `awakeningsOn` = `true` / `false` / `null`), validate alla lettura; non entrano mai nel database né nelle analisi finché non vengono salvate |
| `ssl_last_backup` | data e ora dell'ultimo backup JSON salvato |
| `ssl_reminder_dismissed_date`, `ssl_reminder_notified_date` | chiavi di versioni precedenti, non più lette (innocue) |

---

## 2. Record di una notte (campi salvati)

I nomi sono quelli **reali in IndexedDB**. Tra parentesi il nome della colonna nel CSV.

| Campo IndexedDB (CSV) | Tipo e valori ammessi | Momento | Descrizione |
|---|---|---|---|
| `date` (`wake_date`) | stringa `AAAA-MM-GG`, data di calendario reale | — | **Giorno del risveglio**: la notte tra il 5 e il 6 settembre 2026 è `date = "2026-09-06"`. Chiave del record |
| `screenTimeTotal` (`screen_time_total_minutes`) | intero 0–1439 (minuti) | sera prima | Screen time totale del **giorno di calendario `date − 1`** (00:00–23:59 di quel giorno, come in Tempo di utilizzo di iOS), inserito come ore:minuti. Non include l'uso dopo la mezzanotte, che appartiene al giorno `date`; due giorni non vengono mai sommati |
| `lastScreenUse` (`last_screen_use`) | stringa `HH:MM` (00:00–23:59) | sera prima | Ultimo utilizzo dello schermo prima di addormentarsi in questa notte; può essere dopo mezzanotte (es. 00:30 con addormentamento alle 01:00). È un orario, indipendente dal totale giornaliero |
| `bedtime` (`bedtime`) | stringa `HH:MM` | mattina | Ora in cui ci si è addormentati |
| `wakeTime` (`wake_time`) | stringa `HH:MM` | mattina | Ora del risveglio, sempre nel giorno `date` |
| `quality` (`sleep_quality`) | intero 1–10 | mattina | Qualità percepita |
| `awakenings` (`awakenings`) | intero 0–20 | mattina | Numero di risvegli notturni (schema 3) |
| `awakeMinutes` (`awake_minutes`) | intero 0–600 (minuti) | mattina | Somma approssimativa dei periodi trascorsi svegli dopo il primo addormentamento, **escluso il risveglio finale** |

Ogni campo può mancare (notte parziale). Un record senza nessuno dei cinque campi di base non viene salvato: salvare una notte con tutti i campi vuoti la elimina.

**Risvegli notturni** (`js/record.js`). I due campi sono sempre presenti insieme o assenti insieme:

| Valori salvati | Significato | Quando |
|---|---|---|
| assenti | **non indicato** (dato sconosciuto) | notti con il mattino salvato prima di questa funzione (storiche); notti con la sola sera; notti importate da backup precedenti |
| `0` / `0` | **nessun risveglio**, registrato esplicitamente | si salva il mattino di una notte con la casella "Ho avuto risvegli durante la notte" non selezionata; oppure, per una notte storica, si tocca "Segna: nessun risveglio" o si deseleziona la casella |
| `N ≥ 1` / `M ≥ 1` | N risvegli, M minuti svegli in tutto | casella selezionata: numero (1–20) e minuti (1–600) diventano obbligatori e il salvataggio è bloccato finché non sono validi |

Regole: i risvegli si salvano solo insieme ad almeno un dato del mattino (svuotando il mattino spariscono anche loro); modificare un altro campo di una notte storica **non** la trasforma in "0 risvegli"; i minuti svegli non possono essere pari o superiori all'intervallo di sonno (salvataggio bloccato).

**Ancoraggio degli orari** (nessuna data viene chiesta all'utente):
- il risveglio è nel giorno `date`;
- l'addormentamento è l'istante precedente più vicino al risveglio (`resolveBefore`): 23:30 → giorno prima, 00:40 → stesso giorno. Gestisce mezzanotte, fine mese/anno e cambi d'ora (la notte del 25/10/2026, 23:00 → 07:00 dura 9 ore reali);
- ultimo utilizzo e addormentamento si confrontano sull'istante reale più vicino all'addormentamento (`nearestInstant`, confine simmetrico di ±12 ore): 23:45 → 00:30 = 45 minuti; 00:30 → 01:00 dello stesso giorno = 30 minuti; 23:30 con addormentamento alle 22:29 = ultimo utilizzo *dopo* l'addormentamento → salvataggio bloccato. Il confronto usa istanti reali, quindi anche attraverso mezzanotte, fine mese/anno e cambi d'ora (29/03/2026: 01:50 → 03:10 = 20 minuti reali; 25/10/2026: 140 minuti). Limite: se manca l'ora del risveglio l'addormentamento non ha ancora una data, e il confronto usa la differenza d'orologio (`nearestClockDiff`), che solo nelle due notti del cambio d'ora può differire di un'ora.

**Stato di una notte** (`dayStatus`, calcolato): `complete` (serata e mattina complete), `partial` (almeno un campo), `missing` (nessun record).

---

## 3. Flag di anomalia (salvati)

Scritti a ogni salvataggio di una notte con dati. Un valore insolito si salva solo dopo una conferma esplicita ("Conferma e salva comunque"), quindi in questa versione ogni flag di anomalia vero è anche confermato.

| Campo | Vero quando |
|---|---|
| `is_outlier_bedtime` | al salvataggio almeno uno tra durata (< 2 h o > 14 h), tempo senza schermo (= 0 o > 6 h), ora di addormentamento (fuori 18:00–06:00) o di risveglio (fuori 03:00–14:00) era insolito |
| `outlier_acknowledged_bedtime` | l'utente ha confermato l'anomalia sopra |
| `is_outlier_screen_time` | screen time > 16 h |
| `outlier_acknowledged_screen_time` | l'utente ha confermato l'anomalia sopra |

Effetto nelle analisi (escluse di default, per campo): vedi `ANALYTICS_METHODOLOGY.md` §7.

---

## 4. Dati derivati (mai salvati)

| Nome (CSV) | Calcolo |
|---|---|
| `sleep_duration_minutes` | **Intervallo di sonno**: `wakeTime − bedtime` con l'ancoraggio del §2; assente se manca un orario o se la durata non è positiva |
| `estimated_sleep_minutes` | **Sonno effettivo stimato**: intervallo di sonno − `awakeMinutes`; assente se manca l'intervallo, se i risvegli non sono indicati o se il risultato non sarebbe positivo |
| `screen_free_before_bed_minutes` | `bedtime − lastScreenUse`; assente se manca un orario o se l'ultimo utilizzo è dopo l'addormentamento |
| `night_start_date` | `date − 1` (la sera della notte) |
| Riepilogo settimanale, regolarità, associazioni, notti migliori | Vedi `ANALYTICS_METHODOLOGY.md` |

Non implementati: sleep efficiency (richiederebbe il tempo passato a letto, che non viene raccolto), regolarità settimanale, riepilogo mensile, insight testuali, Personal Recovery Score.

---

## 5. Migrazioni

| Da → a | Cosa cambia | Implementazione |
|---|---|---|
| v1 → v2 | Nella v1 i campi serali (`screenTimeTotal`, `lastScreenUse`, `is_outlier_screen_time`, `outlier_acknowledged_screen_time`) erano salvati nel record del giorno in cui si compilava la sera, cioè nella notte *precedente*. La migrazione li sposta nel record del giorno successivo; i campi del mattino restano dove sono; i valori non vengono modificati; i campi vuoti vengono scartati | `migrateRecordsV1toV2` in `js/db.js`, eseguita dentro la transazione di upgrade (se fallisce, i dati v1 restano intatti). La stessa funzione converte i backup creati con lo schema 1 |

| v2 → v3 | Nuovi campi facoltativi `awakenings` e `awakeMinutes`. **Nessuna trasformazione**: le notti già salvate restano identiche, con i risvegli non indicati (mai uno 0 assegnato d'ufficio) | `DB_VERSION = 3` in `js/db.js`; l'upgrade non tocca i record; `migrateRecords(records, 2)` è l'identità |

Dopo la migrazione possono esistere notti con ultimo utilizzo successivo all'addormentamento (nella v1 questo controllo non c'era): restano come sono e il diario le mostra con l'errore da correggere.

---

## 6. Export CSV (analisi esterna)

Una riga per notte salvata, ordinate per data, separatore virgola, codifica UTF-8. Colonne, in ordine:

`night_start_date, wake_date, screen_time_total_minutes, last_screen_use, bedtime, wake_time, sleep_quality, sleep_duration_minutes, screen_free_before_bed_minutes, is_outlier_bedtime, outlier_acknowledged_bedtime, is_outlier_screen_time, outlier_acknowledged_screen_time, awakenings, awake_minutes, estimated_sleep_minutes`

Le tre colonne dei risvegli sono in fondo, così chi legge le colonne precedenti per posizione non deve cambiare nulla. `screen_time_total_minutes` si riferisce al giorno `night_start_date`. Celle vuote = dato non inserito o non calcolabile (mai 0): per i risvegli, cella vuota = non indicato, `0` = nessun risveglio. Flag: `true` / `false`. Il CSV non contiene medie o analisi e **non serve per il ripristino**: per quello c'è il backup JSON.

---

## 7. Backup JSON (ripristino)

```json
{
  "format": "diario-del-sonno-backup",
  "formatVersion": 1,
  "schemaVersion": 3,
  "exportedAt": "2026-11-04T17:44:00.000Z",
  "recordCount": 2,
  "records": [ { "date": "2026-11-03", "bedtime": "23:10", "...": "..." } ]
}
```

I record sono copiati esattamente come sono in IndexedDB. Bozze e preferenze non sono incluse.

**Importazione** (`js/backup.js`, `importEntries` in `js/db.js`):
1. **Validazione completa prima di qualsiasi scrittura**: formato e versione riconosciuti; `schemaVersion` non più recente di quella dell'app; `recordCount` coerente; ogni record con data reale, solo campi noti, tipi e intervalli del §2–3, almeno un dato; risvegli presenti in coppia, `0` ↔ `0`, solo con dati del mattino; nessuna data ripetuta. Un solo errore fa rifiutare l'intero file, con il motivo. Limite: 5 MB.
2. **Conversione**: un backup con `schemaVersion` precedente viene migrato con le funzioni del §5 (backup v1 e v2 restano importabili; le loro notti arrivano con i risvegli non indicati). Un backup creato da una versione più recente viene rifiutato.
3. **Riepilogo**: notti nuove, già presenti e identiche, già presenti con dati diversi (anche solo nei risvegli: "0 risvegli" e "non indicato" sono dati diversi, quindi una notte storica non viene sovrascritta in silenzio); notti con orari incoerenti (importate come sono e segnalate, perché possono provenire da dati v1 legittimi); bozze aperte sulle stesse notti (restano bozze).
4. **Protezione**: di default si aggiungono solo le notti nuove. Sostituire le notti in conflitto è una scelta esplicita che richiede un secondo tocco di conferma. Le notti presenti solo sul dispositivo non vengono mai toccate. Le date sono chiavi uniche: non possono nascere doppioni.
5. **Scrittura atomica**: tutte le notti in un'unica transazione; se fallisce, il database resta com'era.
6. **Verifica**: dopo l'importazione il database viene riletto e ogni notte importata viene confrontata con il backup.
