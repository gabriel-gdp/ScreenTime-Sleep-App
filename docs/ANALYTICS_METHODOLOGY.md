# ANALYTICS_METHODOLOGY.md
### Diario del sonno — Metodologia analitica (fonte di verità)

Questo documento descrive **come ogni valore viene calcolato oggi**, con quali dati, con quali minimi e quando l'app si astiene dal mostrare un risultato. Le formule sono in `js/analytics.js`; le affermazioni numeriche di questo documento sono verificate dai test in `tests/unit/` (vedi `tests/README.md`). Se codice e documento divergono, è un difetto da correggere.

Principio trasversale: **l'app non deve simulare una precisione che i dati non permettono.** Quando un minimo non è raggiunto, lo dice e indica quanto manca, invece di forzare un risultato.

**Stato di implementazione**

| Analisi | Stato | Dove |
|---|---|---|
| Intervallo di sonno, qualità, tempo senza schermo (§1–3) | Implementate | Diario, Andamento |
| Risvegli notturni e sonno effettivo stimato (§1.1) | Implementati | Diario, Andamento |
| Riepilogo di periodo: 7, 28 o 90 notti (§5) | Implementato | Andamento |
| Regolarità degli orari: deviazione standard circolare in minuti (§4) | Implementata | Andamento |
| Consistency Score, associazioni di Pearson, condizioni delle notti migliori, confronto 7 contro 7 con frecce (§6, §8) | **Rimossi** il 17/11/2026 (Fase 1) | — |
| Nuovi dati dello schema 4: tentativo di dormire, coricamento, tipo di giorno, indicatori, provenienza, giorno dello Screen Time (`DATA_MODEL.md` §2a–2c) | **Raccolti** dal 17/11/2026 (Fase 2); controlli di coerenza attivi (§7.1); **non ancora usati in nessuna analisi** | Diario, CSV, backup |
| Domande principali P1–P3 sullo schermo e il sonno | **In preparazione** (Fasi 3–4): nessun risultato mostrato | Andamento → "Schermo e sonno" |
| Riepilogo mensile, insight testuali, Personal Recovery Score e altri punteggi compositi (§9) | **Non implementati** | — |

In tutte le analisi le anomalie confermate sono escluse di default (§7) e il pulsante "Includi le anomalie" (Andamento) le riporta nel calcolo.

---

## 0. Copertura, numerosità e incertezza

Tre concetti distinti, che l'app mostra separatamente:

1. **Copertura del diario** — quante notti di un periodo hanno almeno un dato ("Copertura 5/7"). Dice quanto è completo il diario, non quanto è affidabile un valore.
2. **Numerosità del campione per metrica** — su quante notti è calcolato *quel* valore, dopo aver tolto i dati mancanti e le anomalie escluse ("su 4 notti"). Due medie della stessa settimana possono avere numerosità diverse.
3. **Incertezza e limiti** — quanto il valore potrebbe cambiare con altri dati. Le statistiche descrittive non hanno intervalli di confidenza: l'incertezza è comunicata mostrando la dispersione (intervallo interquartile, minimo e massimo) e con frasi esplicite sui limiti. Le notti di una persona non sono osservazioni indipendenti; gli unici intervalli previsti sono quelli delle domande P1–P3 (in preparazione), corretti per questa dipendenza e validati con simulazioni.

**Etichette di numerosità** — `dataConfidence(n, giorni)`. Soglie in `js/config.js` (§12):

| Notti nel valore (periodo di 7) | Altri periodi (quota di notti) | Etichetta |
|---|---|---|
| 6–7 | ≥ 80% | Settimana quasi completa / Periodo quasi completo |
| 3–5 | ≥ 33% | Settimana parziale / Periodo parziale |
| 0–2 | meno | Troppo poche notti (i singoli valori restano visibili) |

Le etichette dipendono **solo dal numero di notti**: descrivono una quantità e non usano parole come "confidenza" o "affidabile". Superare la soglia più alta non rende un risultato stabile.

---

## 1. Intervallo di sonno (durata)

Nell'interfaccia si chiama **"Intervallo di sonno"**: è il tempo tra addormentamento e risveglio finale, risvegli notturni compresi. Nel codice e nel CSV resta `durationMin` / `sleep_duration_minutes`.

- **Formula**: `wakeTime − bedtime`. Il risveglio è nel giorno `date` (giorno del risveglio); l'addormentamento è l'istante precedente più vicino al risveglio (`resolveBefore`). Mezzanotte, fine mese/anno e cambi d'ora sono gestiti senza soglie orarie arbitrarie: la notte del 25/10/2026 (fine ora legale) 23:00 → 07:00 dura 9 h, quella del 29/03/2026 dura 7 h.
- **Unità**: minuti, mostrati come ore e minuti.
- **Interpretazione**: tempo dichiarato tra addormentamento e risveglio, non sonno misurato.
- **Minimo**: 1 notte. **Limiti**: include i risvegli notturni (vedi §1.1); non considera il tempo per addormentarsi né i sonnellini.

### 1.1 Risvegli notturni e sonno effettivo stimato

- **Dati** (`DATA_MODEL.md` §2): numero di risvegli e minuti svegli in totale, indicati a memoria al mattino. "Nessun risveglio" (0/0) e "non indicato" (campi assenti) sono distinti; i minuti sono la somma approssimativa dei periodi svegli dopo il primo addormentamento, escluso il risveglio finale.
- **Sonno effettivo stimato** = intervallo di sonno − minuti svegli. Calcolato solo se l'intervallo esiste e i risvegli sono indicati; con 0 risvegli coincide con l'intervallo. Se i minuti svegli sono pari o superiori all'intervallo il risultato non sarebbe positivo: **salvataggio bloccato** (nei dati importati: valore non calcolato, notte segnalata come incoerente). Non viene mai calcolato un valore negativo.
- **Notti senza l'informazione** (storiche, o con il mattino non compilato): escluse da numero medio di risvegli, minuti svegli medi, sonno effettivo stimato e dalle associazioni che li usano; restano in tutte le altre analisi. Mai trattate come zero.
- **Anomalie**: un'anomalia confermata sugli orari esclude anche il sonno effettivo stimato (deriva dall'intervallo); numero e minuti dei risvegli restano, perché non dipendono dagli orari.
- **Non implementato di proposito**: *sleep efficiency* (sonno / tempo a letto) e simili, perché il tempo passato a letto prima di addormentarsi non viene raccolto.
- **Limiti**: stima soggettiva; i risvegli brevi spesso non si ricordano, quindi numero e minuti tendono a essere sottostimati.

## 2. Qualità percepita

- Input diretto, scala ordinale 1–10. Soggettiva per natura; il confronto è sempre con se stessi.

## 3. Tempo senza schermo prima di dormire

- **Formula**: `bedtime − lastScreenUse`, dove l'ultimo utilizzo è l'istante reale più vicino all'addormentamento (`nearestInstant`, confine simmetrico ±12 h: un intervallo oltre le 12 ore non è comunque plausibile). L'ultimo utilizzo può essere dopo mezzanotte e nella stessa data dell'addormentamento (00:30 → 01:00 = 30 min); fine mese/anno sono gestiti dal calendario e i cambi d'ora sono in tempo reale (29/03/2026: 01:50 → 03:10 = 20 min; 25/10/2026: 140 min).
- **Senza l'ora del risveglio** l'addormentamento non ha ancora una data: si usa la differenza d'orologio (`nearestClockDiff`), identica tranne che nelle due notti del cambio d'ora (differenza di 60 minuti). Il valore si corregge da solo appena il risveglio viene inserito.
- **Da non confondere con lo screen time**: lo screen time è il totale del giorno di calendario della sera (`date − 1`, 00:00–23:59, mostrato nel Diario come "Screen time di <giorno>"); l'ultimo utilizzo è un orario della notte. L'uso dopo mezzanotte appartiene al totale del giorno successivo, e l'app non somma mai due giorni. Quando la sera viene compilata dopo mezzanotte, il Diario ricorda di scegliere in Tempo di utilizzo il giorno precedente.
- **Validazione**: ultimo utilizzo successivo all'addormentamento → **salvataggio bloccato**. 0 minuti o più di 6 ore → avviso, salvabile con conferma.
- **Limiti**: l'ultimo utilizzo è una stima a memoria (o l'ora di "Adesso"), non un dato letto dal telefono.

---

## 4. Regolarità degli orari

### 4.1 Che cosa mostra
Per l'addormentamento e per il risveglio separatamente, la **deviazione standard circolare in minuti** (arrotondata a 5) e l'orario medio circolare, sugli ultimi `REGULARITY_WINDOW_DAYS` = 28 giorni di calendario. Indica di quanto, in genere, gli orari si discostano dal loro valore medio. **Non è un punteggio**: non c'è una scala 0–100 né un valore "giusto". Il Consistency Score (0–100, con il parametro non validato di 90 minuti) è stato **rimosso** il 17/11/2026.

### 4.2 Formula (statistica circolare)
Gli orari sono punti su un ciclo di 24 ore: una media lineare tratterebbe 23:30 e 00:30 come lontani 23 ore.

```
Per gli orari t₁…tₙ in minuti da mezzanotte:
θᵢ = tᵢ / 1440 × 2π
C = media(cos θᵢ),  S = media(sin θᵢ),  R = √(C² + S²)
σ (minuti)     = √(−2 · ln R) × 1440 / 2π      (se R ≈ 0: non definita)
orario medio   = atan2(S, C) riportato a HH:MM  (se R ≈ 0: non definito)
```

### 4.3 Verifica numerica (riprodotta dai test)

| Caso | Risultato del codice |
|---|---|
| 7 notti, sempre 23:00 | σ = 0 min |
| Addormentamento 23:30 e 00:30 | σ = 30 min (come la SD lineare di due punti a 60 minuti), orario medio 00:00 |
| Addormentamento 23:30 e 01:30 | σ ≈ 60 min |
| 5 notti alle 22:30 e 2 all'01:00 (feriali/weekend) | σ ≈ 68 min |
| 6 notti tra 22:50 e 23:10 | σ ≈ 6,5 min |
| Orari distribuiti uniformemente sulle 24 ore (00, 06, 12, 18) | non definita |

### 4.4 Notti usate, esclusioni, minimi
- **Notti usate**: risveglio negli ultimi 28 giorni (oggi compreso), con addormentamento e risveglio presenti e coerenti.
- **Escluse, con il motivo mostrato**: anomalie confermate sugli orari (si possono includere dal riepilogo) e notti con orari incoerenti.
- **Minimo**: `REGULARITY_MIN_NIGHTS` = 14 notti. Motivo: l'errore relativo di una deviazione standard è circa 1/√(2(n−1)), cioè ~35% con 5 notti e ~20% con 14; con meno di una settimana di dati la SD è distorta (Fischer, Klerman e Phillips 2021). Sotto il minimo l'app mostra quante notti ci sono e quante ne servono.
- **Sempre mostrati**: numero di notti, periodo, metodo, esclusioni, limiti.

### 4.5 Limiti
Con 14–20 notti l'incertezza resta di circa ±20%. Non considera i risvegli notturni né i sonnellini (non ne conosce gli orari). Orari molto diversi tra giorni liberi e vincolati producono una SD alta che mescola le due abitudini; la divisione per tipo di giorno arriverà con lo schema 4.

---

## 5. Riepilogo di periodo (7, 28 o 90 notti)

- **Finestra**: le ultime 7, 28 o 90 notti con risveglio fino a oggi incluso. La scelta resta salvata sul dispositivo.
- **Metriche**: intervallo di sonno, sonno effettivo stimato, qualità percepita, risvegli per notte, screen time della giornata, tempo senza schermo prima di dormire.
- **Statistiche per ogni metrica**:
  - **mediana**, da `MEDIAN_MIN_NIGHTS` = 3 notti;
  - **intervallo interquartile** (25°–75° percentile, "metà delle notti tra … e …"), da `IQR_MIN_NIGHTS` = 5 notti;
  - **minimo e massimo**;
  - **numero di notti**;
  - etichetta di numerosità (§0).

  Sotto i minimi si mostrano i singoli valori. I quantili usano l'interpolazione lineare tra i valori ordinati (metodo "tipo 7" di Hyndman e Fan, quello predefinito di R e dei fogli di calcolo).
- **Qualità**: scala ordinale, quindi **mediana** e **distribuzione dei voti** (conteggio per ciascun valore da 1 a 10), mai una media. Indicatore descrittivo secondario: non entra in alcuna analisi di associazione.
- **Risvegli**: mediana del numero e quante notti hanno almeno un risveglio. Sonno effettivo e risvegli contano solo le notti con i risvegli indicati, quindi hanno spesso una numerosità diversa: ogni riquadro mostra la propria.
- **Copertura**: "Copertura N/giorni" in testa, separata dalla numerosità delle singole metriche.
- **Nessun confronto con frecce** tra un periodo e il precedente: con poche notti per parte presentava come cambiamento il rumore ordinario tra notti. Il confronto con la propria variabilità abituale è previsto più avanti (`VARIABILITY_HISTORY_WEEKS`).
- **Notti con qualità più alta e più bassa** del periodo: solo con almeno 3 notti valutate e voti non tutti uguali; a parità, la più recente. Servono per aprire la notte, non come giudizio.
- **Grafico "Notte per notte"**: per 7 e 28 notti (per 90 sarebbe illeggibile sul telefono). La parte tratteggiata della barra sono i minuti svegli, solo dove indicati.
- **Anomalie**: escluse dalle statistiche per campo (§7.2), elencate con il campo escluso; "Includi le anomalie nelle statistiche" le riporta nel calcolo.
- **Limiti**: se mancano soprattutto certe notti (es. i weekend) le statistiche possono essere distorte; l'app non corregge questo effetto, lo rende visibile con copertura e numerosità.

---

## 6. Associazioni (rimosse)

Fino al 16/11/2026 l'app mostrava correlazioni di Pearson su tutte le notti, con le etichette "debole/moderato/forte" a partire da 14 notti e |r| ≥ 0,2. Sono state **rimosse il 17/11/2026** perché la validazione con simulazioni (`research-review/STATISTICAL_VALIDATION.md` §5) ha mostrato che producono segnali falsi nel 29–99% dei casi quando le notti sono autocorrelate o condividono andamenti lenti, anche senza alcuna relazione reale.

Le uniche analisi di associazione previste sono le tre domande principali P1–P3 (`FINAL_ANALYTICS_SPEC.md` §2). Sono in preparazione e verranno mostrate solo con i criteri di inclusione, numerosità, provenienza e astensione approvati. Fino ad allora la sezione "Schermo e sonno" di Andamento spiega perché non ci sono risultati.

---

## 7. Dati mancanti e anomalie

### 7.1 Soglie per campo

| Campo | Bloccante (impedisce il salvataggio) | Avviso (salvabile con conferma) |
|---|---|---|
| Durata (derivata) | ≤ 0 minuti | < 2 h oppure > 14 h |
| Tempo senza schermo (derivato) | ultimo utilizzo dopo l'addormentamento | = 0 oppure > 6 h |
| Screen time | fuori da 0–23 h 59 min: impossibile da inserire (selettore ore:minuti), rifiutato nell'importazione dei backup | > 16 h |
| Addormentamento | — | fuori dalla fascia 18:00–06:00 |
| Risveglio | — | fuori dalla fascia 03:00–14:00 |
| Qualità | fuori da 1–10: impossibile da inserire (pulsanti 1–10), rifiutata nell'importazione | — |
| Tentativo di dormire (schema 4) | dopo l'addormentamento (istanti reali, anche attraverso la mezzanotte) | latenza (addormentamento − tentativo) > 3 h (`LATENCY_CONFIRM_ABOVE_MIN`) |
| Coricamento (schema 4) | dopo il tentativo (o dopo l'addormentamento se il tentativo manca) | — |

Un avviso richiede un secondo tocco ("Conferma e salva comunque"). L'avviso sulla latenza **non** segna la notte come anomala: chiede solo di confermare che l'orario sia giusto (un'insonnia lunga è un dato reale). Per gli altri avvisi, alla conferma vengono salvati `is_outlier_bedtime` (avvisi su durata, tempo senza schermo, addormentamento, risveglio) e/o `is_outlier_screen_time` (screen time), con i rispettivi flag di conferma (`DATA_MODEL.md` §3).

### 7.2 Trattamento nelle analisi

| Situazione | Trattamento |
|---|---|
| Notte senza dati | Esclusa da tutte le analisi; conta per il promemoria; "senza dati" nel calendario |
| Notte parziale | Ogni valore presente entra nelle analisi che lo usano |
| Singolo dato mancante | Mai stimato; il campo è assente ed escluso dai calcoli che lo richiedono |
| Risvegli non indicati | Esclusi dalle statistiche su risvegli, minuti svegli e sonno effettivo stimato; mai contati come 0 |
| Anomalia confermata sugli orari | Esclusi di default durata, tempo senza schermo e orari (quindi anche dalla regolarità); la qualità resta |
| Anomalia confermata sullo screen time | Escluso di default solo lo screen time |
| Provenienza `unknown` (tutti i dati storici) e giorno dello Screen Time presunto | Nessun effetto sulle analisi attuali (descrittive). Le analisi della Fase 4 che richiedono dati tempestivi o un'associazione temporale certa useranno i criteri di inclusione di `FINAL_ANALYTICS_SPEC` e distingueranno verificato da presunto |
| Notte con orari incoerenti (possibile solo per dati migrati dalla v1 o importati) | Durata e/o tempo senza schermo non calcolati; il diario mostra l'errore da correggere |

**Principio**: nessuna imputazione, nessuna correzione automatica, nessuna esclusione silenziosa. Ogni analisi indica quante notti ha escluso; il riepilogo elenca quali e per quale campo; "Includi le anomalie" vale per tutte le analisi. Nessun dato viene eliminato dall'app.

---

## 8. Condizioni delle notti migliori (rimosse)

Il confronto tra le notti con qualità alta e le altre (Cohen's d con etichette) è stato **rimosso il 17/11/2026**:
- dicotomizzava l'esito;
- trattava notti dipendenti come indipendenti;
- moltiplicava i confronti.

La qualità resta un indicatore descrittivo (§5).

---

## 9. Non implementato

Riepilogo mensile, insight testuali, Personal Recovery Score o altri punteggi compositi, sleep efficiency (richiede il tempo a letto, non raccolto). Un eventuale punteggio composito dovrebbe prima dimostrare di aggiungere valore rispetto alle metriche singole, restare interpretabile e non essere letto come indicatore medico.

---

## 10. Quando l'app si astiene (riepilogo)

| Analisi | Condizione minima per mostrare un risultato |
|---|---|
| Intervallo, qualità, tempo senza schermo | Sempre, se i dati della notte ci sono e sono coerenti |
| Sonno effettivo stimato | Se ci sono intervallo e risvegli indicati, e i minuti svegli sono meno dell'intervallo |
| Riepilogo di periodo | Dalla prima notte; mediana da 3 notti, IQR da 5; sotto, i singoli valori |
| Regolarità | ≥ 14 notti con orari completi e coerenti negli ultimi 28 giorni (anomalie escluse) |
| Domande P1–P3 | Non ancora attive |

---

## 12. Configurazione delle soglie

Tutte le soglie sono in `js/config.js` (`ANALYSIS_CONFIG`, immutabile durante l'uso). Le formule le leggono da lì: per cambiarle si modifica solo quel file. Un test (`tests/unit/config-baseline.test.mjs`) verifica che ogni voce della configurazione sia in questa tabella con lo stesso valore, e viceversa.

**Avvertenza.** Nessuna di queste soglie è uno standard scientifico universale: sono scelte progettuali, approvate in via provvisoria il 17/11/2026, salvo gli avvisi d'inserimento già in uso. Una numerosità minima è una condizione **necessaria, non sufficiente**: superarla non garantisce un risultato affidabile. Quando i dati non bastano, l'app spiega che cosa manca invece di mostrare un numero.

"Attiva" indica la fase della roadmap in cui la soglia entra in uso; prima di allora la voce è solo predisposta.

| Chiave | Valore | Attiva | Finalità | Motivazione | Limiti | Analisi | Astensione / effetto |
|---|---|---|---|---|---|---|---|
| `DURATION_WARN_BELOW_MIN` | 120 | in uso | Avviso: intervallo di sonno molto breve | Probabile errore di inserimento | Notti brevi reali esistono | Inserimento | Avviso non bloccante |
| `DURATION_WARN_ABOVE_MIN` | 840 | in uso | Avviso: intervallo di sonno molto lungo | Come sopra | Come sopra | Inserimento | Avviso non bloccante |
| `SCREEN_FREE_WARN_ABOVE_MIN` | 360 | in uso | Avviso: tempo senza schermo molto lungo | Probabile errore | — | Inserimento | Avviso |
| `SCREEN_TIME_WARN_ABOVE_MIN` | 960 | in uso | Avviso: screen time giornaliero oltre 16 h | Probabile errore | — | Inserimento | Avviso |
| `ONSET_PLAUSIBLE_FROM` | 18:00 | in uso | Fascia plausibile dell'addormentamento (inizio) | Errori di AM/PM | Turni e orari insoliti reali | Inserimento | Avviso |
| `ONSET_PLAUSIBLE_TO` | 06:00 | in uso | Fascia plausibile dell'addormentamento (fine) | Come sopra | Come sopra | Inserimento | Avviso |
| `WAKE_PLAUSIBLE_FROM` | 03:00 | in uso | Fascia plausibile del risveglio (inizio) | Come sopra | Come sopra | Inserimento | Avviso |
| `WAKE_PLAUSIBLE_TO` | 14:00 | in uso | Fascia plausibile del risveglio (fine) | Come sopra | Come sopra | Inserimento | Avviso |
| `LATENCY_CONFIRM_ABOVE_MIN` | 180 | Fase 2 | Conferma se l'addormentamento arriva più di 3 h dopo il tentativo | Probabile errore | Insonnia reale possibile | Inserimento | Conferma, non blocco |
| `COVERAGE_WEEK_HIGH_NIGHTS` | 6 | in uso | Etichetta "quasi completa" su 7 notti | Leggibilità della copertura | Descrive quante notti, non l'affidabilità | Riepilogo | — |
| `COVERAGE_WEEK_MID_NIGHTS` | 3 | in uso | Etichetta "parziale" su 7 notti | Come sopra | Come sopra | Riepilogo | Sotto: "troppo poche notti" |
| `COVERAGE_HIGH_SHARE` | 0,8 | in uso | Come sopra, per periodi diversi da 7 notti | Come sopra | Come sopra | Riepilogo | — |
| `COVERAGE_MID_SHARE` | 0,33 | in uso | Come sopra | Come sopra | Come sopra | Riepilogo | — |
| `MEDIAN_MIN_NIGHTS` | 3 | Fase 1 | Mostrare una mediana | Con meno di 3 valori la mediana non riassume nulla | Con 3 notti resta molto instabile | Riepilogo di periodo | Sotto: valori singoli |
| `IQR_MIN_NIGHTS` | 5 | Fase 1 | Mostrare l'intervallo interquartile | Servono abbastanza valori per i quartili | Instabile fino a ~10 notti | Riepilogo di periodo | Sotto: solo min–max |
| `ROLLING_WINDOW_NIGHTS` | 7 | Fase 5 | Linea mobile dell'andamento | Copre il ciclo settimanale | Smussa i cambiamenti rapidi | Andamento | — |
| `ROLLING_MIN_VALUES` | 4 | Fase 5 | Valori minimi nella finestra mobile | Evita linee basate su 1–2 notti | — | Andamento | Nessun punto della linea |
| `VARIABILITY_HISTORY_WEEKS` | 8 | Fase 5 | Confronto con la variabilità abituale | Servono abbastanza settimane per stimarla | Le prime settimane non hanno confronto | Riepilogo di periodo | Sotto: nessun confronto |
| `REGULARITY_WINDOW_DAYS` | 28 | Fase 1 | Finestra di calendario della regolarità | Quattro settimane intere | Cambiamenti recenti diluiti | Regolarità | — |
| `REGULARITY_MIN_NIGHTS` | 14 | Fase 1 | Minimo di notti per la SD circolare | Errore relativo della SD ≈ 1/√(2(n−1)): ~20% con 14 notti; con meno di una settimana di dati la SD è distorta (Fischer 2021) | Con 14–20 notti l'incertezza resta ~±20% | Regolarità | Sotto: "servono N notti" |
| `SJL_MIN_NIGHTS_PER_TYPE` | 4 | Fase 4 | Social jetlag | Almeno 4 notti per tipo di giorno | Coglie solo la differenza settimanale | Regolarità | Sotto: non mostrato |
| `MAD_K` | 3 | Fase 5 | Evidenziare notti molto diverse dal solito | Convenzione prudente per la MAD | Solo indicazione visiva; non per dati discreti | Notti insolite | MAD = 0: nessuna evidenziazione |
| `MAD_WINDOW_NIGHTS` | 28 | Fase 5 | Finestra della mediana mobile | — | — | Notti insolite | — |
| `MAD_MIN_VALUES` | 14 | Fase 5 | Valori minimi nella finestra | — | — | Notti insolite | Sotto: nessuna banda |
| `PROSPECTIVE_WINDOW_HOURS` | 36 | Fase 2 | Classificare come prospettico un dato inserito subito dopo la notte | Copre il check-in del mattino e quello del giorno dopo | Un dato tempestivo può essere impreciso, uno tardivo preciso | Provenienza | Oltre: l'app chiede l'origine |
| `N_EFF_MIN` | 30 | Fase 4 | Numerosità effettiva minima | Sotto 30 l'intervallo è troppo largo per dire qualcosa | Rileva solo effetti grandi | P1–P3 | Sotto: nessun numero |
| `GROUP_MIN_NIGHTS` | 10 | Fase 4 | Notti minime per gruppo | Medie non dominate da 1–2 notti | — | P1–P3 | Sotto: astensione |
| `MINORITY_SHARE_MIN` | 0,15 | Fase 4 | Esistenza di un vero confronto | Esposizione quasi costante = nessun contrasto | — | P1–P3 | Sotto: "quasi tutte le notti…" |
| `DAYTYPE_KNOWN_MIN_SHARE` | 0,8 | Fase 4 | Quota di notti con tipo di giorno noto | Senza tipo di giorno il ciclo settimanale crea falsi risultati | Le notti escluse potrebbero non essere casuali | P1–P3 | Sotto: astensione |
| `RESIDUAL_HALF_WINDOW_NIGHTS` | 14 | Fase 4 | Finestra per togliere le derive lente | Validata in simulazione | Derive rapide restano | P1–P3 | — |
| `RESIDUAL_MIN_VALUES` | 15 | Fase 4 | Valori minimi nella finestra dei residui | — | — | P1–P3 | Notte esclusa |
| `HABITUAL_WINDOW_NIGHTS` | 28 | Fase 4 | Notti precedenti per l'orario abituale H | Evita l'associazione per costruzione | Le prime settimane non hanno H | P1, P3 | Senza H: notte esclusa |
| `HABITUAL_MIN_VALUES` | 14 | Fase 4 | Valori minimi per calcolare H | — | — | P1, P3 | Notte esclusa |
| `PRESLEEP_WINDOW_MIN` | 60 | Fase 4 | Ampiezza dell'"ora prima" dell'orario abituale | Definizione comune "ora prima del sonno" | Confine netto e arbitrario; non misura i minuti d'uso | P1, P3 | — |
| `BH_Q` | 0,1 | Fase 4 | Correzione per tre confronti (Benjamini–Hochberg) | Convenzione comune | Effetto modesto con tre test | P1–P3 | Risultato con la dicitura "non supera la correzione" |
| `LATE_CAFFEINE_FROM` | 15:00 | Fase 2 | Definizione del chip "caffeina tardiva" (valore iniziale) | Circa 8 h prima di un tentativo tipico alle 23:00 | Non è una soglia clinica; dose e metabolismo ignorati | Contesto | Modificabile nelle Impostazioni |
| `ALCOHOL_FROM` | 18:00 | Fase 2 | Definizione del chip "alcol" (valore iniziale) | "La sera" | Nessuna soglia di quantità | Contesto | Modificabile nelle Impostazioni |
| `DEFAULT_DAYTYPE_TEMPLATE` | free, constrained, constrained, constrained, constrained, constrained, free | Fase 2 | Schema settimanale iniziale (domenica…sabato, mattino del risveglio) | Indicazione dell'utente: lunedì–venerdì vincolati | Non è una fonte di verità: il valore della singola notte prevale | Tipo di giorno | Modificabile nelle Impostazioni |

## 11. Storico delle decisioni

- Orari salvati come `HH:MM` e ancorati in modo relazionale, invece dei timestamp completi previsti inizialmente: stesso risultato, nessuna data da inserire.
- Schema v2: un record = una notte intera (prima i campi serali stavano nella notte precedente).
- Regolarità su finestra di calendario di 28 giorni (prima: ultime 28 notti registrate, che con dati radi mescolava notti lontane mesi).
- Anomalie confermate escluse da tutte le analisi (prima solo dalle medie settimanali).
- Notti migliori: pari merito inclusi e minimi per gruppo e per metrica (prima il taglio "primi 25%" poteva separare notti con la stessa qualità).
- Associazioni: tolte le frecce "→" (suggerivano una causa), aggiunte direzione, periodo e motivo delle coppie non mostrate.
- Tabella delle soglie del §6 allineata al codice: sotto 14 notti nessuna associazione è mostrata (una versione precedente della tabella prevedeva etichette con avviso anche sotto 14).
- Etichette del riepilogo: "Alta confidenza / Preliminare / Dati insufficienti" sostituite da etichette di numerosità, separate dalla copertura, con minimo e massimo della settimana.
- Schema 3: risvegli notturni facoltativi, con "nessun risveglio" registrato esplicitamente e "non indicato" per le notti storiche (nessuno zero d'ufficio). "Durata del sonno" rinominata "Intervallo di sonno" nell'interfaccia, distinta dal sonno effettivo stimato.
- Tempo senza schermo calcolato su istanti reali quando il risveglio è noto (prima: differenza d'orologio, sbagliata di un'ora solo se l'intervallo attraversava il cambio d'ora).
- Screen time: data di calendario esplicita nel Diario e avviso dopo mezzanotte (il totale è sempre del giorno della sera, mai la somma di due giorni).
- 17/11/2026 — Fase 0: tutte le soglie spostate in `js/config.js` e documentate al §12, senza cambiare il comportamento; aggiunti il backup schema 3 di riferimento e l'istantanea delle metriche (`tests/fixtures/`), che ogni fase successiva deve riprodurre.
- 17/11/2026 — Fase 1: rimossi Consistency Score, associazioni di Pearson, condizioni delle notti migliori e confronto 7 contro 7 con frecce; introdotti il riepilogo di periodo (mediana, IQR, min–max, n; qualità come distribuzione) e la regolarità come deviazione standard circolare in minuti, con un minimo di 14 notti.
- 17/11/2026 — Fase 2: schema 4 (aggiornamento identico del database, con backup verificato obbligatorio e confronto prima/dopo); nuovi campi facoltativi del mattino; provenienza per campo con regola delle 36 ore; giorno dello Screen Time verificato / presunto / sconosciuto. Nuovi controlli: tentativo dopo l'addormentamento e coricamento dopo il tentativo bloccano il salvataggio; latenza oltre 3 ore chiede conferma senza segnare un'anomalia. Nessuna analisi usa ancora i nuovi campi. Corretta la fase indicata per `SJL_MIN_NIGHTS_PER_TYPE` (4, non 2).
