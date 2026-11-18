# DATA_MODEL.md
### Diario del sonno — Modello dati (fonte di verità)

Questo documento descrive i dati **come sono effettivamente salvati** dall'app (versione dello schema: **4**). Se il codice e questo documento divergono, è un difetto da correggere. Riferimenti: `js/record.js` (campi del record, bozze, regole dei risvegli, provenienza, giorno dello Screen Time), `js/config.js` (soglie e orari predefiniti), `js/db.js` (storage), `js/analytics.js` (calcoli), `js/backup.js` (backup), `js/app.js` (bozze e preferenze).

Principi:
- **Un record = una notte**, identificata dal **giorno del risveglio**.
- **Nessuna imputazione**: un dato non inserito non viene salvato (il campo è assente), non è mai stimato né sostituito da 0. Uno 0 salvato è un valore reale (es. 0 minuti di screen time).
- **Le anomalie vengono segnalate, non corrette**: un valore insolito confermato resta com'è, con un flag.
- **Sconosciuto ≠ zero**: per i risvegli notturni "nessun risveglio" (0) e "non indicato" (campo assente) sono dati diversi e non vengono mai confusi.
- **Nessuna informazione inventata sui dati storici**: la provenienza di un dato e il giorno di calendario dello Screen Time non vengono mai assegnati in silenzio come certi a notti salvate prima dello schema 4 (§2b, §2c).
- **Nulla di derivato viene salvato**: intervallo di sonno, sonno effettivo stimato, tempo senza schermo, medie e analisi sono ricalcolati a ogni visualizzazione dai dati grezzi.

---

## 1. Archiviazione

| Elemento | Valore |
|---|---|
| Database IndexedDB | `sleep-screen-lab` |
| Versione | `4` (costante `DB_VERSION` / `SCHEMA_VERSION` in `js/db.js`) |
| Object store | `entries`, chiave primaria (`keyPath`) = `date`, nessun indice |
| Scritture | `put` dell'intero record in una transazione; la conferma "Salvato" arriva solo dopo il completamento della transazione. In caso di eccezione la transazione viene annullata esplicitamente |
| Eliminazioni | solo su azione esplicita dell'utente (svuotare tutti i campi di una notte salvata e confermare) |
| Aggiornamento di versione | mai automatico in silenzio: se il database esistente ha una versione precedente e contiene notti, l'app mostra la schermata "Aggiornamento dei dati" (§5) |

**Preferenze e bozze (`localStorage`, prefisso `ssl_`)** — non sono dati del diario e non entrano nel backup:

| Chiave | Contenuto |
|---|---|
| `ssl_theme` | `light` / `dark` |
| `ssl_reminders_enabled` | `1` / `0` |
| `ssl_reminder_dismissed_night` | data della notte per cui l'avviso è stato ignorato |
| `ssl_reminder_notified_night` | data della notte per cui la notifica è già stata mostrata |
| `ssl_drafts_v1` | bozze non salvate (JSON `{ data: { campi } }`; per i risvegli anche lo stato della casella `awakeningsOn` = `true` / `false` / `null`), validate alla lettura; non entrano mai nel database né nelle analisi finché non vengono salvate |
| `ssl_last_backup` | data e ora dell'ultimo backup JSON salvato |
| `ssl_trend_period` | periodo scelto in Andamento: `7` / `28` / `90` |
| `ssl_daytype_template` | schema settimanale del tipo di giorno: array JSON di 7 valori `constrained`/`free`, indice = giorno della settimana del risveglio (0 = domenica). Predefinito: lun–ven vincolato, sab–dom libero. **Non è una fonte di verità**: serve solo a proporre il valore nelle notti nuove (§2a) |
| `ssl_late_caffeine_from`, `ssl_alcohol_from` | orari `HH:MM` usati nelle definizioni degli indicatori (predefiniti 15:00 e 18:00) |
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
| `sleepAttempt` (`sleep_attempt`) | stringa `HH:MM` | mattina | Schema 4. Ora in cui si è provato a dormire (smesso di fare altro, telefono compreso). Facoltativo |
| `inBedTime` (`in_bed_time`) | stringa `HH:MM` | mattina | Schema 4. Ora in cui ci si è messi a letto. Facoltativo, campo compresso di default |
| `dayType` (`day_type`) | `constrained` / `free` | mattina | Schema 4. Orario del mattino vincolato (lavoro, studio, appuntamento, sveglia obbligata) o libero |
| `dayTypeSource` (`day_type_source`) | `template` / `confirmed` | mattina | Schema 4. `template` = valore proposto dallo schema settimanale e lasciato com'era; `confirmed` = scelto o toccato dall'utente. Presente solo con `dayType` |
| `lateCaffeine`, `alcohol`, `stress`, `unusualNight` (`late_caffeine`, `alcohol`, `stress`, `unusual_night`) | `true` / `false`; **assente = non indicato** | mattina | Schema 4. Indicatori facoltativi a tre stati (§2a) |
| `contextDefs` | `{ lateCaffeineFrom?, alcoholFrom? }` orari `HH:MM` | mattina | Schema 4. Orari delle definizioni in vigore quando la risposta è stata data |
| `screenTimeDate`, `screenTimeDateStatus`, `screenTimeDateRule` (`screen_time_date`, `screen_time_date_status`) | vedi §2c | sera prima | Schema 4. Giorno di calendario a cui si riferisce `screenTimeTotal` |
| `lastScreenUseSource` (`last_screen_use_source`) | `button` / `manual` | sera prima | Schema 4. `button` = inserito con "Adesso"; `manual` = digitato. Presente solo con `lastScreenUse` |
| `meta` | oggetto, §2b | — | Schema 4. Date tecniche e provenienza per campo. Non è un dato del diario e non entra nelle analisi |

Ogni campo può mancare (notte parziale). Un record senza nessuno dei cinque campi di base né `sleepAttempt` / `inBedTime` non viene salvato: salvare una notte con tutti i campi vuoti la elimina.

**Risvegli notturni** (`js/record.js`). I due campi sono sempre presenti insieme o assenti insieme:

| Valori salvati | Significato | Quando |
|---|---|---|
| assenti | **non indicato** (dato sconosciuto) | notti con il mattino salvato prima di questa funzione (storiche); notti con la sola sera; notti importate da backup precedenti |
| `0` / `0` | **nessun risveglio**, registrato esplicitamente | si salva il mattino di una notte con la casella "Ho avuto risvegli durante la notte" non selezionata; oppure, per una notte storica, si tocca "Segna: nessun risveglio" o si deseleziona la casella |
| `N ≥ 1` / `M ≥ 1` | N risvegli, M minuti svegli in tutto | casella selezionata: numero (1–20) e minuti (1–600) diventano obbligatori e il salvataggio è bloccato finché non sono validi |

Regole: i risvegli si salvano solo insieme ad almeno un dato del mattino (svuotando il mattino spariscono anche loro); modificare un altro campo di una notte storica **non** la trasforma in "0 risvegli"; i minuti svegli non possono essere pari o superiori all'intervallo di sonno (salvataggio bloccato).

### 2a. Campi dello schema 4 nel check-in mattutino

Tutti facoltativi; il check-in resta salvabile con i soli campi di base.

- **Tipo di giorno.** In una notte **senza mattino salvato** la bozza propone il valore dello schema settimanale (`dayTypeSource = template`, con la nota "Proposto dal tuo schema settimanale"). Un tocco lo conferma o lo corregge (`confirmed`); il valore della singola notte prevale sempre sullo schema. In una notte **con il mattino già salvato senza `dayType`** (notti storiche) non viene proposto nulla: resta "Non indicato". Cambiare lo schema nelle Impostazioni non modifica nessuna notte salvata.
- **Indicatori** (sezione "Ieri e stanotte", chiusa di default): caffeina dalle 15:00 in poi; alcol dalle 18:00 fino al tentativo di dormire; giornata più stressante del solito; notte insolita (malattia/sintomi, farmaci insoliti, viaggio/fuso, turno notturno, disturbo esterno, evento eccezionale). Ognuno ha tre stati: `true`, `false`, assente (= non indicato; un secondo tocco sulla stessa risposta torna a "non indicato"). **Una risposta mancante non vale "no".** Gli orari 15:00 e 18:00 sono modificabili e non hanno valore clinico; quello in vigore viene salvato in `contextDefs` con la risposta e resta quello dell'epoca anche se l'impostazione cambia dopo.
- Tipo di giorno, indicatori e risvegli si salvano solo insieme ad almeno un dato del mattino (`bedtime`, `wakeTime`, `quality`, `sleepAttempt`, `inBedTime`).
- **Ordine degli orari**: coricamento ≤ tentativo ≤ addormentamento (istanti reali, §2 sotto). Tentativo dopo l'addormentamento, o coricamento dopo il tentativo (o dopo l'addormentamento se manca il tentativo): salvataggio bloccato. Latenza (addormentamento − tentativo) oltre 3 ore (`LATENCY_CONFIRM_ABOVE_MIN`): chiede conferma ma **non** segna la notte come anomala.

### 2b. Provenienza dei dati (`meta`)

```json
"meta": {
  "createdAt": "2026-11-17T07:05:00.000Z",
  "updatedAt": "2026-11-17T07:05:00.000Z",
  "fields": {
    "bedtime": { "provenance": "prospective", "enteredAt": "…", "provenanceSetBy": "auto", "provenanceSetAt": "…" }
  }
}
```

| Valore | Significato |
|---|---|
| `prospective` | inserito entro 36 ore (`PROSPECTIVE_WINDOW_HOURS`) dal risveglio della notte (o dalle 12:00 del giorno `date` se manca l'ora del risveglio) |
| `transcribed` | ricopiato da note scritte al momento |
| `retrospective` | ricostruito a memoria |
| `unknown` | non noto. **Valore implicito di ogni campo senza voce in `meta.fields`**, quindi di tutti i dati storici |

Regole (`withMeta` in `js/record.js`):
- a ogni salvataggio solo i campi **modificati** ricevono una nuova voce; i campi invariati conservano la loro; i campi svuotati la perdono;
- entro la finestra di 36 ore: `prospective`, `provenanceSetBy = auto`;
- oltre la finestra l'app chiede una volta "Da dove vengono questi dati?" (ricopiati da note / ricostruiti a memoria / non so) e applica la risposta solo ai campi modificati (`provenanceSetBy = user`);
- `createdAt` esiste solo per le notti create con lo schema 4; **non viene mai inventato** per le notti storiche, che ricevono solo `updatedAt` quando vengono modificate;
- la migrazione non scrive nessun `meta`: lo strumento "Origine dei dati" (fase 3) permetterà di classificare i dati storici in modo esplicito e correggibile, senza toccare i valori.

### 2c. Giorno di calendario dello Screen Time

| Stato | Come è salvato | Significato |
|---|---|---|
| **verificato** | `screenTimeDate = AAAA-MM-GG`, `screenTimeDateStatus = verified`, `screenTimeDateRule` = `entry_label` (inserito con l'etichetta "Screen time di <giorno>"), `manual_correction` o `historic_convention_confirmed` | il giorno è noto |
| **presunto** | campi **assenti** | dato storico: si presume il giorno `date − 1` (regola `historic_convention_wake_minus_1`), **non verificato**. Il valore presunto è solo derivato (`screenTimeReference`), mai scritto |
| **sconosciuto** | `screenTimeDateStatus = unknown`, senza `screenTimeDate` | il giorno non è ricostruibile |

Ogni nuovo valore di `screenTimeTotal` salva esplicitamente il giorno verificato (`date − 1`, `entry_label`); un valore invariato conserva lo stato che aveva (anche "presunto"). Le date restano distinte: `date` (risveglio), `night_start_date` (sera, `date − 1`), `screenTimeDate` (riferimento dello Screen Time), `meta.*At` (date tecniche).

**Le analisi che richiedono un'associazione temporale certa tra Screen Time e notte devono usare solo notti con giorno verificato, o mostrare separatamente verificate e presunte.** Nelle analisi descrittive attuali (riepilogo di periodo) le notti presunte sono incluse come sempre.

### 2d. Ancoraggio degli orari

Nessuna data viene chiesta all'utente:
- il risveglio è nel giorno `date`;
- l'addormentamento è l'istante precedente più vicino al risveglio (`resolveBefore`): 23:30 → giorno prima, 00:40 → stesso giorno. Gestisce mezzanotte, fine mese/anno e cambi d'ora (la notte del 25/10/2026, 23:00 → 07:00 dura 9 ore reali);
- tentativo e coricamento si confrontano con l'addormentamento sull'istante reale più vicino (`nearestInstant`), come l'ultimo utilizzo;
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
| Riepilogo di periodo, regolarità | Vedi `ANALYTICS_METHODOLOGY.md` |

Derivati dello schema 4 (`computeNightMetrics`): latenza = addormentamento − tentativo (`latencyMin`), con gli errori di ordine del §2a. Il CSV riporta anche `sleep_onset` (= `bedtime`).

Non implementati: sleep efficiency (l'ora di coricamento è facoltativa e non basta a stimarla), regolarità settimanale, riepilogo mensile, insight testuali, Personal Recovery Score.

---

## 5. Migrazioni

| Da → a | Cosa cambia | Implementazione |
|---|---|---|
| v1 → v2 | Nella v1 i campi serali (`screenTimeTotal`, `lastScreenUse`, `is_outlier_screen_time`, `outlier_acknowledged_screen_time`) erano salvati nel record del giorno in cui si compilava la sera, cioè nella notte *precedente*. La migrazione li sposta nel record del giorno successivo; i campi del mattino restano dove sono; i valori non vengono modificati; i campi vuoti vengono scartati | `migrateRecordsV1toV2` in `js/db.js`, eseguita dentro la transazione di upgrade (se fallisce, i dati v1 restano intatti). La stessa funzione converte i backup creati con lo schema 1 |

| v2 → v3 | Nuovi campi facoltativi `awakenings` e `awakeMinutes`. **Nessuna trasformazione**: le notti già salvate restano identiche, con i risvegli non indicati (mai uno 0 assegnato d'ufficio) | `DB_VERSION = 3` in `js/db.js`; l'upgrade non tocca i record; `migrateRecords(records, 2)` è l'identità |
| v3 → v4 | Nuovi campi facoltativi del §2 (schema 4) e `meta`. **Nessuna trasformazione**: nessun campo aggiunto alle notti esistenti; tipo di giorno e indicatori non indicati, provenienza `unknown`, giorno dello Screen Time presunto (tutti impliciti) | `DB_VERSION = 4`; `migrateRecords(records, 3)` è l'identità |

**Aggiornamento con backup obbligatorio (dalla v4).** All'avvio `inspectDatabase()` legge il database senza aggiornarlo. Se la versione è precedente e ci sono notti:
1. la schermata "Aggiornamento dei dati" sostituisce il diario;
2. "Crea e scarica il backup" genera il backup con lo schema di partenza (`…-prima-aggiornamento-vN.json`) e lo **verifica** rileggendolo con `parseBackup`: il risultato deve coincidere notte per notte con la conversione attesa dei record letti;
3. solo dopo la casella "Ho salvato il file del backup fuori dall'app" si attiva "Aggiorna il database";
4. dopo l'aggiornamento il database viene riletto e confrontato con l'atteso (`migrateRecords` dei record di prima); l'esito "verificato" riporta il numero di notti identiche. In caso di differenza l'app lo segnala e non prosegue.

Un database vuoto o nuovo viene creato direttamente alla versione 4.

Dopo la migrazione possono esistere notti con ultimo utilizzo successivo all'addormentamento (nella v1 questo controllo non c'era): restano come sono e il diario le mostra con l'errore da correggere.

---

## 6. Export CSV (analisi esterna)

Una riga per notte salvata, ordinate per data, separatore virgola, codifica UTF-8. Colonne, in ordine:

`night_start_date, wake_date, screen_time_total_minutes, last_screen_use, bedtime, wake_time, sleep_quality, sleep_duration_minutes, screen_free_before_bed_minutes, is_outlier_bedtime, outlier_acknowledged_bedtime, is_outlier_screen_time, outlier_acknowledged_screen_time, awakenings, awake_minutes, estimated_sleep_minutes`, poi (schema 4) `sleep_onset, screen_time_date, screen_time_date_status, in_bed_time, sleep_attempt, day_type, day_type_source, late_caffeine, alcohol, stress, unusual_night, last_screen_use_source` e una colonna `prov_<campo>` per ogni campo con provenienza (`prov_screenTimeTotal`, …, `prov_unusualNight`).

Le colonne nuove sono sempre in fondo, così chi legge le colonne precedenti per posizione non deve cambiare nulla. `screen_time_date_status` vale `verified`, `presumed` (con `screen_time_date` derivato = `date − 1`) o `unknown`; `prov_<campo>` vale `unknown` quando non c'è una voce in `meta`; indicatori: `true` / `false` / cella vuota (non indicato). `screen_time_total_minutes` si riferisce al giorno `night_start_date`. Celle vuote = dato non inserito o non calcolabile (mai 0): per i risvegli, cella vuota = non indicato, `0` = nessun risveglio. Flag: `true` / `false`. Il CSV non contiene medie o analisi e **non serve per il ripristino**: per quello c'è il backup JSON.

---

## 7. Backup JSON (ripristino)

```json
{
  "format": "diario-del-sonno-backup",
  "formatVersion": 1,
  "schemaVersion": 4,
  "exportedAt": "2026-11-04T17:44:00.000Z",
  "recordCount": 2,
  "records": [ { "date": "2026-11-03", "bedtime": "23:10", "...": "..." } ]
}
```

I record sono copiati esattamente come sono in IndexedDB. Bozze e preferenze non sono incluse.

**Importazione** (`js/backup.js`, `importEntries` in `js/db.js`):
1. **Validazione completa prima di qualsiasi scrittura**: formato e versione riconosciuti; `schemaVersion` non più recente di quella dell'app; `recordCount` coerente; ogni record con data reale, solo campi noti, tipi e intervalli del §2–3, almeno un dato; risvegli presenti in coppia, `0` ↔ `0`, solo con dati del mattino; per lo schema 4: orari validi, tipo di giorno e origine coerenti, indicatori booleani, tipo di giorno e indicatori solo con dati del mattino, `contextDefs` e `lastScreenUseSource` validi, giorno dello Screen Time coerente con il suo stato (verificato con data ≤ `date`, sconosciuto senza data), `meta` con date ISO, valori di provenienza ammessi e solo campi noti; nessuna data ripetuta. Un solo errore fa rifiutare l'intero file, con il motivo. Limite: 5 MB.
2. **Conversione**: un backup con `schemaVersion` precedente viene migrato con le funzioni del §5 (backup v1, v2 e v3 restano importabili; le loro notti arrivano con i risvegli e i campi dello schema 4 non indicati, provenienza `unknown` e giorno dello Screen Time presunto). Un backup creato da una versione più recente viene rifiutato.
3. **Riepilogo**: notti nuove, già presenti e identiche, già presenti con dati diversi (anche solo nei risvegli: "0 risvegli" e "non indicato" sono dati diversi, quindi una notte storica non viene sovrascritta in silenzio; il riepilogo indica anche le notti con gli stessi valori e solo l'origine dei dati diversa); notti con orari incoerenti (importate come sono e segnalate, perché possono provenire da dati v1 legittimi); bozze aperte sulle stesse notti (restano bozze).
4. **Protezione**: di default si aggiungono solo le notti nuove. Sostituire le notti in conflitto è una scelta esplicita che richiede un secondo tocco di conferma. Le notti presenti solo sul dispositivo non vengono mai toccate. Le date sono chiavi uniche: non possono nascere doppioni.
5. **Scrittura atomica**: tutte le notti in un'unica transazione; se fallisce, il database resta com'era.
6. **Verifica**: dopo l'importazione il database viene riletto e ogni notte importata viene confrontata con il backup.
