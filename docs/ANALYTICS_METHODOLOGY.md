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
| Nuovi dati dello schema 4: tentativo di dormire, coricamento, tipo di giorno, indicatori, provenienza, giorno dello Screen Time (`DATA_MODEL.md` §2a–2c) | Raccolti dal 17/11/2026 (Fase 2), usati dalla Fase 4 (§3.1, §4, §13). Lo Screen Time totale non entra in nessuna associazione | Diario, CSV, backup |
| Strumento "Origine dei dati": classificazione della provenienza e del giorno dello Screen Time dei dati storici (`DATA_MODEL.md` §8) | **Implementato** il 18/11/2026 (Fase 3); non modifica valori e non cambia nessuna analisi attuale | Impostazioni |
| Notte singola: tempo per addormentarsi, tempo dopo l'ultimo utilizzo, schermo dopo il tentativo, schermo a letto (§3.1) | Implementate il 18/11/2026 (Fase 4) | Diario, Andamento, CSV |
| Regolarità: tentativo di dormire, per tipo di giorno, differenza tra giorni liberi e vincolati; solo dati registrati all'epoca (§4) | Implementata il 18/11/2026 (Fase 4) | Andamento |
| Domande principali P1–P3 sullo schermo e il sonno (§13) | **Implementate** il 18/11/2026 (Fase 4), con astensione: un numero compare solo se tutte le condizioni sono soddisfatte | Andamento → "Schermo e sonno" |
| Filtri delle descrizioni: tipo di giorno, notti insolite, origine (§14.1) | Implementati il 18/11/2026 (Fase 5) | Andamento → panoramica e orari |
| Grafico degli orari (actogramma, §14.2) | Implementato il 18/11/2026 (Fase 5) | Andamento → Orari |
| Schede a sette elementi con "Evidenza generale" separata (§14.3) | Implementate il 18/11/2026 (Fase 5) | Andamento → regolarità e Schermo e sonno |
| Fondamento scientifico offline con lo stato di verifica delle fonti (§14.4) | Implementato il 18/11/2026 (Fase 5) | Andamento (schede) e Impostazioni |
| Andamento di una variabile (L3), notti insolite con la MAD (L4), pendenza di Theil–Sen | Non implementati: consigliati (roadmap C2–C3), fuori dalla Fase 5 | — |
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

## 3.1 Tempo per addormentarsi e uso dello schermo nella singola notte (Fase 4)

Calcolati da `computeNightMetrics` a partire dalle differenze già in tempo reale (mezzanotte e cambio d'ora corretti, §7.1). Tutti **stime soggettive**: gli orari sono inseriti a memoria al mattino.

| Valore | Formula | Richiede |
|---|---|---|
| Tempo per addormentarti (latenza stimata) | addormentamento − tentativo | tentativo, addormentamento |
| Dopo l'ultimo utilizzo | addormentamento − max(tentativo, ultimo utilizzo) = min(latenza, tempo senza schermo) | tentativo, ultimo utilizzo, addormentamento |
| Schermo dopo il tentativo (sì/no) | ultimo utilizzo > tentativo (uguale = no) | tentativo, ultimo utilizzo, addormentamento |
| Tentativo − ultimo utilizzo (`screenToAttemptMin`, Fase 4.1) | negativo = ultimo utilizzo dopo il tentativo. In tempo reale se la notte è collocabile (addormentamento e risveglio noti, tentativo coerente), altrimenti sull'istante più vicino (±12 h) | tentativo, ultimo utilizzo (serve a P1, che non richiede l'addormentamento) |
| Tempo a letto prima del tentativo | tentativo − coricamento | coricamento, tentativo |
| Schermo a letto (sì/no/non determinabile) | ultimo utilizzo > coricamento | coricamento **e** ultimo utilizzo, **entrambi** inseriti al momento o ricopiati da note dell'epoca; altrimenti "non determinabile", mai "no" |

Il tentativo non viene mai sostituito dall'addormentamento: senza tentativo non c'è latenza. Nel Diario "Dopo l'ultimo utilizzo" compare solo se diverso dal tempo per addormentarti; per "Schermo a letto" la provenienza considerata è quella che i dati avranno salvandoli in quel momento.

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
- **Notti usate**: risveglio negli ultimi 28 giorni (oggi compreso), con addormentamento e risveglio presenti e coerenti, **entrambi inseriti al momento o ricopiati da note dell'epoca** (dalla Fase 4). Motivo: le ricostruzioni a memoria tendono plausibilmente a "regolarizzare" gli orari verso quelli abituali, sottostimando la variabilità (ipotesi progettuale, `docs/research/FINAL_DATA_MODEL.md` §4.4). I dati storici entrano dopo averne classificato l'origine (Impostazioni → Origine dei dati).
- **Escluse, con il motivo mostrato**: anomalie confermate sugli orari (si possono includere dal riepilogo), notti con orari incoerenti, notti insolite; le notti escluse per la provenienza sono contate in una nota.
- **Minimo**: `REGULARITY_MIN_NIGHTS` = 14 notti. Motivo: l'errore relativo di una deviazione standard è circa 1/√(2(n−1)), cioè ~35% con 5 notti e ~20% con 14; con meno di una settimana di dati la SD è distorta (Fischer, Klerman e Phillips 2021). Sotto il minimo l'app mostra quante notti ci sono e quante ne servono.
- **Sempre mostrati**: numero di notti, periodo, metodo, esclusioni, limiti.

### 4.5 Limiti
Con 14–20 notti l'incertezza resta di circa ±20%. Non considera i risvegli notturni né i sonnellini (non ne conosce gli orari). Orari molto diversi tra giorni liberi e vincolati producono una SD totale alta che mescola le due abitudini: per questo c'è anche la divisione per tipo di giorno (§4.6).

### 4.6 Tentativo di dormire, tipo di giorno, giorni liberi e vincolati (Fase 4)
- **Tentativo di dormire**: stessa SD circolare, sulle stesse notti con il tentativo presente, coerente e registrato all'epoca; minimo 14.
- **Per tipo di giorno**: SD di addormentamento e risveglio separatamente per i mattini vincolati e liberi, da `REGULARITY_MIN_NIGHTS_PER_TYPE` = 7 notti per tipo (soglia nuova, provvisoria: in 28 giorni ci sono circa 8 mattini liberi; con 7 notti l'errore relativo della SD è circa ±29%).
- **Differenza tra giorni liberi e vincolati** (social jetlag): media circolare del punto medio del sonno per tipo; differenza libero − vincolato con il segno, in minuti arrotondati a 5, con il numero di notti per tipo. Da `SJL_MIN_NIGHTS_PER_TYPE` = 4 notti per tipo. È una descrizione: nessuna soglia "buono/cattivo".
- **Punto medio del sonno** (`sleepMidpoint`, corretto nella Fase 4.1): istante reale di addormentamento e di risveglio (`combineDateTime`, `resolveBefore`), punto medio sulla linea del tempo reale, riletto sull'orologio locale. Esempi verificati dai test: 23:00 → 07:00 = 03:00; 25/10/2026 (ritorno all'ora solare) 00:30 → 09:30, 10 ore reali = **04:30**; 29/03/2026 (passaggio all'ora legale) 23:30 → 07:30, 7 ore reali = 04:00; 22:00 → 02:30 = 00:15. Fino alla Fase 4 il codice sommava all'orario d'orologio metà della durata reale e sbagliava di un'ora in quelle notti (05:30 e 03:00).
- **Ora inesistente o ripetuta.** Gli orari sono salvati come HH:MM, senza fuso né indicazione dell'occorrenza. Se l'addormentamento o il risveglio cade nell'ora che non esiste (passaggio all'ora legale, 02:00–02:59) o in quella ripetuta (ritorno all'ora solare, 02:00–02:59, che compare due volte e non si può sapere quale delle due sia stata registrata), la notte è **esclusa dal solo social jetlag**, con il motivo mostrato; resta nel diario, nella regolarità e in P1–P3. Nessuna delle due occorrenze viene scelta. Le altre misure di quella notte (per esempio l'intervallo) usano l'occorrenza scelta da JavaScript e possono quindi essere sbagliate di un'ora: limite noto, non modificato nella Fase 4.1.
- **SD circolare di valori identici** (corretto nella Fase 4.1): con molti orari identici l'errore di arrotondamento poteva dare R appena sopra 1 e quindi "NaN min" (per esempio 28 tentativi alle 23:00). R è ora limitato a 1: SD = 0.

---

## 5. Riepilogo di periodo (7, 28 o 90 notti)

- **Finestra**: le ultime 7, 28 o 90 notti con risveglio fino a oggi incluso. La scelta resta salvata sul dispositivo.
- **Metriche**: intervallo di sonno, sonno effettivo stimato, qualità percepita, risvegli per notte, screen time della giornata, tempo senza schermo prima di dormire; dalla Fase 4, se nel periodo c'è almeno una notte con l'ora del tentativo, anche tempo per addormentarti e tempo dopo l'ultimo utilizzo (§3.1).
- **Conteggi descrittivi** (tutte le provenienze): notti con schermo dopo il tentativo; notti con l'ultimo utilizzo nell'ora prima del solito orario di riposo H (§13.1), solo per le notti per cui H è calcolabile.
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

Fino al 16/11/2026 l'app mostrava correlazioni di Pearson su tutte le notti, con le etichette "debole/moderato/forte" a partire da 14 notti e |r| ≥ 0,2. Sono state **rimosse il 17/11/2026** perché la validazione con simulazioni (`docs/research/STATISTICAL_VALIDATION.md` §5) ha mostrato che producono segnali falsi nel 29–99% dei casi quando le notti sono autocorrelate o condividono andamenti lenti, anche senza alcuna relazione reale.

Le uniche analisi di associazione sono le tre domande principali P1–P3 (§13), con i criteri di inclusione, numerosità, provenienza e astensione approvati.

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
| Anomalia confermata sugli orari (`is_outlier_bedtime`) | Esclusi di default durata, tempo senza schermo, tempi per addormentarsi e orari: riepilogo, regolarità, **P1, P2 e P3** (tutte usano orari della notte); la qualità resta. **Non** cambia il calcolo del solito orario H, che esclude sempre le notti con anomalie |
| Anomalia confermata sullo screen time (`is_outlier_screen_time`) | Escluso di default solo lo screen time del riepilogo. Non riguarda P1–P3 (il totale di Screen Time non vi entra): non esclude la notte |
| Provenienza `unknown` o `retrospective` | Descrizioni (riepilogo di periodo): incluse. Regolarità e P1–P3: escluse, contate e segnalate con il rimando a Origine dei dati. Sensibilità (b) di P1–P3: incluse |
| Giorno dello Screen Time presunto | Nessun effetto: lo Screen Time totale non entra in nessuna associazione (contesto) |
| Notte con orari incoerenti (possibile solo per dati migrati dalla v1 o importati) | Durata e/o tempo senza schermo non calcolati; il diario mostra l'errore da correggere |

**Principio**: nessuna imputazione, nessuna correzione automatica, nessuna esclusione silenziosa. Ogni analisi indica quante notti ha escluso; il riepilogo elenca quali e per quale campo. "Includi le anomalie" (dal riepilogo, oppure dalla sezione "Schermo e sonno" quando P1–P3 hanno anomalie da escludere) vale per riepilogo, regolarità, P1–P3 e le loro analisi di sensibilità, ma non per H. Nessun dato viene eliminato dall'app.

**Limite del modello dei flag.** Il flag sulle anomalie degli orari vale per tutta la notte, non per singolo campo: una notte segnata per un orario di risveglio insolito esce di default anche da P1, che non usa il risveglio. Il modello attuale non distingue il campo e la Fase 4.1 non lo cambia (schema 4 invariato).

---

## 8. Condizioni delle notti migliori (rimosse)

Il confronto tra le notti con qualità alta e le altre (Cohen's d con etichette) è stato **rimosso il 17/11/2026**:
- dicotomizzava l'esito;
- trattava notti dipendenti come indipendenti;
- moltiplicava i confronti.

La qualità resta un indicatore descrittivo (§5).

---

## 9. Non implementato

Insight testuali automatici, Personal Recovery Score o altri punteggi compositi, sleep efficiency (richiede il tempo a letto, non raccolto). Andamento di una misura, notti insolite con la MAD, SRI da diario e confronto con la variabilità abituale sono attivi dal 23/11/2026 (§16). Il riepilogo mensile si ottiene con il periodo di 28 notti e la navigazione nel tempo. Un eventuale punteggio composito dovrebbe prima dimostrare di aggiungere valore rispetto alle metriche singole, restare interpretabile e non essere letto come indicatore medico.

---

## 10. Quando l'app si astiene (riepilogo)

| Analisi | Condizione minima per mostrare un risultato |
|---|---|
| Intervallo, qualità, tempo senza schermo | Sempre, se i dati della notte ci sono e sono coerenti |
| Sonno effettivo stimato | Se ci sono intervallo e risvegli indicati, e i minuti svegli sono meno dell'intervallo |
| Riepilogo di periodo | Dalla prima notte; mediana da 3 notti, IQR da 5; sotto, i singoli valori |
| Regolarità | ≥ 14 notti con orari completi e coerenti negli ultimi 28 giorni (anomalie escluse) |
| Regolarità per tipo di giorno | ≥ 7 notti del tipo |
| Differenza tra giorni liberi e vincolati | ≥ 4 notti per tipo |
| Domande P1–P3 | Tutte le condizioni del §13.3; altrimenti il messaggio di che cosa manca (o "non stimabile"), nessun numero |
| Social jetlag di una notte | Addormentamento e risveglio non nell'ora inesistente o ripetuta del cambio d'ora |

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
| `ROLLING_WINDOW_NIGHTS` | 7 | in uso (L3, 23/11/2026) | Linea mobile dell'andamento | Copre il ciclo settimanale | Smussa i cambiamenti rapidi | Andamento | — |
| `ROLLING_MIN_VALUES` | 4 | in uso (L3, 23/11/2026) | Valori minimi nella finestra mobile; anche valori minimi di una settimana nel confronto con la variabilità abituale | Evita linee e medie basate su 1–2 notti | — | Andamento | Nessun punto della linea; settimana non usata |
| `VARIABILITY_HISTORY_WEEKS` | 8 | in uso (L3, 23/11/2026) | Confronto con la variabilità abituale | Servono abbastanza settimane per stimarla | Le prime settimane non hanno confronto | Riepilogo di periodo | Sotto: nessun confronto |
| `VARIABILITY_WINDOW_WEEKS` | 12 | in uso (L3, 23/11/2026) | Settimane precedenti considerate al massimo per la variabilità abituale | Circa un trimestre: abbastanza settimane, abitudini ancora attuali | Periodi molto diversi nel trimestre allargano la variabilità | Andamento | — |
| `THEIL_SEN_MIN_NIGHTS` | 28 | in uso (L3, 23/11/2026) | Notti minime per descrivere la pendenza | STATISTICAL_VALIDATION §13 | Descrittiva: nessun intervallo né p-value (autocorrelazione) | Andamento | Sotto: nessuna pendenza |
| `REGULARITY_WINDOW_DAYS` | 28 | Fase 1 | Finestra di calendario della regolarità | Quattro settimane intere | Cambiamenti recenti diluiti | Regolarità | — |
| `REGULARITY_MIN_NIGHTS` | 14 | Fase 1 | Minimo di notti per la SD circolare | Errore relativo della SD ≈ 1/√(2(n−1)): ~20% con 14 notti; con meno di una settimana di dati la SD è distorta (Fischer 2021) | Con 14–20 notti l'incertezza resta ~±20% | Regolarità | Sotto: "servono N notti" |
| `SJL_MIN_NIGHTS_PER_TYPE` | 4 | Fase 4 | Social jetlag | Almeno 4 notti per tipo di giorno | Coglie solo la differenza settimanale | Regolarità | Sotto: non mostrato |
| `SRI_WINDOW_DAYS` | 28 | in uso (23/11/2026) | Finestra dell'SRI da diario | Settimane intere, come Phillips 2017 (evita distorsioni dovute al giorno della settimana) | — | Regolarità | — |
| `SRI_MIN_PAIRS` | 14 | in uso (23/11/2026) | Coppie minime di notti consecutive valide | STATISTICAL_VALIDATION §3 | Una notte mancante elimina due coppie | Regolarità | Sotto: "servono N coppie" |
| `REGULARITY_MIN_NIGHTS_PER_TYPE` | 7 | Fase 4 (nuova, da approvare) | SD per tipo di giorno | In 28 giorni ci sono circa 8 mattini liberi; errore relativo ≈ 29% con 7 notti | Molto incerta | Regolarità | Sotto: "—" |
| `MAD_K` | 3 | in uso (L4, 23/11/2026) | Evidenziare notti molto diverse dal solito | Convenzione prudente per la MAD | Solo indicazione visiva; non per dati discreti | Notti insolite | MAD = 0: nessuna evidenziazione |
| `MAD_WINDOW_NIGHTS` | 28 | in uso (L4, 23/11/2026) | Finestra di calendario delle notti precedenti per mediana e MAD | Quattro settimane intere | Cambiamenti recenti diluiti | Notti insolite | — |
| `MAD_MIN_VALUES` | 14 | in uso (L4, 23/11/2026) | Valori minimi nella finestra | — | — | Notti insolite | Sotto: nessuna banda |
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
| `ALARM_NEAR_MIN` | 15 | Profilo e contesto | Dire che il risveglio è "vicino" alla sveglia dichiarata | Tolleranza di un quarto d'ora per orari stimati a memoria | Descrive, non spiega il risveglio | Contesto della notte (§15.1) | Oltre: "X minuti prima/dopo" |
| `CONTEXT_WINDOW_DAYS` | 365 | Profilo e contesto | Notti considerate nei confronti tra periodi | Un anno copre periodi di lavoro e vacanze diversi | Periodi lontani differiscono anche per stagione | Confronti tra periodi (§15.2) | — |
| `CONTEXT_GROUP_MIN_NIGHTS` | 7 | Profilo e contesto | Notti minime per mostrare un gruppo | Una settimana: mediana e IQR calcolabili | Con 7–13 notti la descrizione è molto instabile (detto nel testo) | Confronti tra periodi | Sotto: gruppo non mostrato, con il numero di notti |
| `CONTEXT_HIGHLIGHT_MIN_NIGHTS` | 14 | Profilo e contesto | Notti minime per segnalare una "differenza chiara" | Stesso minimo della regolarità | Non è un test statistico | Confronti tra periodi | Sotto: nessuna segnalazione |
| `SUGGESTION_WINDOW_DAYS` | 14 | Profilo e contesto | Finestra degli spunti legati agli obiettivi | Due settimane intere: abitudini recenti, ciclo settimanale compreso | Cambiamenti più vecchi non contano | Spunti (§15.3) | — |
| `SUGGESTION_MIN_NIGHTS` | 7 | Profilo e contesto | Notti valide minime per uno spunto | Almeno metà della finestra | Pochi dati: nessuno spunto | Spunti | Sotto: "servono N notti" |
| `SUGGESTION_MISS_SHARE` | 0,5 | Profilo e contesto | Quota di notti in cui l'obiettivo manca per proporre uno spunto | Lo spunto compare solo se il mancato obiettivo è abituale, non occasionale | Confine netto | Spunti | Sotto: "in linea con l'obiettivo" |
| `SLEEP_NEED_GAP_MIN` | 30 | Profilo e contesto | Differenza minima tra fabbisogno percepito e sonno osservato | Sotto i 30 minuti la differenza è dentro l'imprecisione degli orari stimati | Il fabbisogno è una percezione | Spunti | Sotto: nessuno spunto |

## 13. Le tre domande principali P1–P3 (Fase 4)

Codice: `js/inference.js`. Specifica: `docs/research/FINAL_ANALYTICS_SPEC.md` §2 e §7; validazione: `docs/research/STATISTICAL_VALIDATION.md` §7 e §17, riprodotta dai test su queste funzioni (§13.6).

### 13.1 Domande, esposizioni, esiti
| | Esposizione (sì/no) | Esito |
|---|---|---|
| **P1** | ultimo utilizzo L nell'intervallo circolare **[H − `PRESLEEP_WINDOW_MIN`, H]** (60 min), estremi inclusi | ora del tentativo di dormire (minuti dopo le 12:00) |
| **P2** | ultimo utilizzo > tentativo | tempo per addormentarsi **dopo l'ultimo utilizzo** = addormentamento − max(tentativo, ultimo utilizzo). Il tempo totale dal tentativo è mostrato a parte, solo descrittivo |
| **P3** | come P1 | sonno effettivo stimato = (risveglio − addormentamento) − minuti svegli: quanto hai dormito, **non** il tempo per addormentarti |

**H, il solito orario di riposo**: mediana circolare delle ore del tentativo nelle `HABITUAL_WINDOW_NIGHTS` = 28 notti **precedenti** (esclusa quella in esame), con almeno `HABITUAL_MIN_VALUES` = 14 valori; solo tentativi coerenti, con provenienza ammessa, non in notti insolite e **mai da notti con anomalie confermate, anche quando l'opzione "Includi le anomalie" è attiva** (H è un riferimento abituale robusto; decisione del 18/11/2026). Mediana circolare: il valore osservato che minimizza la somma delle distanze sul cerchio. Le schede di P1 e P3 mostrano sempre il solito orario attuale e le notti valide usate per calcolarlo, oppure che non è calcolabile (meno di 14 notti valide sulle 28 precedenti).

**Finestra di esposizione [H − 60, H]** (decisione del 18/11/2026): esposto se e solo se d = (H − L) mod 1440 è tra 0 e 60 minuti, estremi inclusi. Con H = 23:00: 21:59 no, 22:00 sì, 22:30 sì, 23:00 sì, 23:01 no, 23:30 no, 00:30 no. Con H = 00:00: 23:00 sì, 00:00 sì, 00:01 no. Un utilizzo **dopo** H non è esposto: il gruppo "non esposto" comprende quindi sia le notti in cui l'ultimo utilizzo è prima della finestra sia quelle in cui è dopo il solito orario. Le etichette lo dicono ("ultimo utilizzo in quell'ora" / "prima di quell'ora o dopo il tuo solito orario"): non è un confronto tra "schermo" e "nessuno schermo". È un'ora sull'orologio, non 60 minuti reali: nelle notti del cambio d'ora la durata reale della finestra differisce. L'esposizione è solo sì/no in base all'orario dell'ultimo utilizzo: l'interfaccia non parla mai di minuti o quantità di schermo.

**P1 e P3 rispetto al tentativo.** P1 esclude le notti in cui l'ultimo utilizzo è **dopo** il tentativo di dormire (motivo "ultimo utilizzo dopo il tentativo"; uguale = ammessa): lo schermo verrebbe dopo l'inizio dell'esito. Non sono contate come "non esposte". P3 usa un esito diverso (sonno effettivo) e ammette l'ultimo utilizzo dopo il tentativo, purché non dopo l'addormentamento (altrimenti motivo "ultimo utilizzo dopo l'addormentamento"); il tentativo di quella notte non è richiesto.

Definire l'esposizione rispetto al tentativo **della stessa notte**, o usare la latenza totale in P2, produrrebbe differenze per costruzione (verificato: §13.6).

### 13.2 Criteri di inclusione di una notte (specifici per domanda, Fase 4.1)
Ogni domanda controlla **solo** le variabili che usa: una notte non è mai esclusa per un errore su una variabile irrilevante per quella domanda. Le esclusioni sono **mutuamente esclusive**: ogni notte è contata una sola volta, al primo criterio non soddisfatto, nell'ordine delle tabelle. Vale sempre: notti considerate = notti usate + somma dei motivi (verificato dai test); la scheda "Come è calcolato" mostra i tre numeri.

| Ordine | P1 | P2 | P3 |
|---|---|---|---|
| 1. Dati presenti (`missing`) | ultimo utilizzo, tentativo | ultimo utilizzo, tentativo, addormentamento | ultimo utilizzo, addormentamento, risveglio, numero **e** minuti dei risvegli (mai considerati 0 se mancano) |
| 2. Coerenza (`incoherent`) | tentativo ≤ addormentamento, **solo se l'addormentamento c'è** | tentativo ≤ addormentamento; ultimo utilizzo ≤ addormentamento | intervallo valido; minuti svegli < intervallo |
| 3. Ordine dell'ultimo utilizzo | dopo il tentativo → `screenAfterAttempt` | — (l'uso dopo il tentativo è l'esposizione) | dopo l'addormentamento → `screenAfterOnset` |
| 4. Provenienza (`provenance`) | campi del punto 1 inseriti al momento o ricopiati da note dell'epoca | idem | idem |
| 5. Notte insolita (`unusual`) | esclusa (inclusa nella sensibilità c) | idem | idem |
| 6. Anomalia sugli orari (`outlier`) | esclusa salvo "Includi le anomalie" | idem | idem |
| 7. Solito orario H (`noH`) | almeno 14 notti valide sulle 28 precedenti | — | come P1 |
| 8. Sensibilità d (`confounder`) | solo notti con caffeina tardiva, alcol e stress = "no" | idem | idem |
| 9. Tipo di giorno (`noDayType`) | indicato | idem | idem |
| 10. Finestra dei residui (`noWindow`) | almeno 15 notti entro ±14 giorni | idem | idem |

Non controllati, per esempio: P1 non guarda risveglio, risvegli, sonno effettivo, coricamento; P2 non guarda risveglio, risvegli, coricamento; P3 non guarda il tentativo della notte né il coricamento. Un errore sul coricamento non esclude nessuna delle tre domande.

### 13.3 Condizioni per mostrare un numero (tutte)
- tipo di giorno noto in almeno `DAYTYPE_KNOWN_MIN_SHARE` = 80% delle notti che soddisfano gli altri criteri;
- almeno `N_EFF_MIN` = 30 notti dopo la finestra dei residui;
- gruppo minoritario ≥ `MINORITY_SHARE_MIN` = 15%;
- almeno `GROUP_MIN_NIGHTS` = 10 notti per gruppo;
- varianza stimabile (stato "non stimabile", vedi sotto);
- n_eff ≥ 30.

**Non stimabile** (`degenerate_variance`, Fase 4.1): se la varianza combinata dei residui è zero o non finita (per esempio tentativo sempre alla stessa ora: dopo residui e centratura tutti i valori di un gruppo coincidono), l'incertezza non si può stimare. La scheda mostra "Risultato non stimabile", il motivo e le notti per gruppo; **nessuna differenza tra le medie, nessun intervallo, nessun p-value**; la domanda non entra nella correzione di Benjamini–Hochberg. Nessun epsilon: una varianza piccola ma reale resta inferenza ordinaria. Prima della Fase 4.1 questo caso produceva un intervallo [Δ, Δ] con p = 1 (incoerente se Δ ≠ 0).

Altrimenti la scheda mostra "Dati non ancora sufficienti", il messaggio del caso (`docs/research/FINAL_ANALYTICS_SPEC.md` §7) e, per i dati non registrati all'epoca, il rimando a Origine dei dati. Nessun numero.

### 13.4 Metodo
1. Residuo: valore − media delle notti incluse entro ±`RESIDUAL_HALF_WINDOW_NIGHTS` = 14 giorni (almeno `RESIDUAL_MIN_VALUES` = 15 valori, altrimenti la notte esce).
2. Centratura per tipo di giorno (media dei residui del tipo).
3. Δ = media(residui | sì) − media(residui | no).
4. SE₀ = s_pooled · √(1/n₁ + 1/n₀).
5. ρ_E, ρ_r: autocorrelazione lag-1 di esposizione (0/1, stessi residui e centratura) e residui, **solo su coppie di notti consecutive**; con meno di 3 coppie si assume 0.
6. n_eff = n·(1 − ρ_E·ρ_r)/(1 + ρ_E·ρ_r), tra 3 e n; SE = SE₀·√(n/n_eff).
7. Intervallo al 95% = Δ ± 1,96·SE. Il p-value (normale) serve solo alla correzione di Benjamini–Hochberg a `BH_Q` = 0,10 sulle tre domande (m = 3 sempre, anche se alcune non hanno un risultato) e non viene mai mostrato.
8. Visualizzazione arrotondata a 5 minuti. "Differenza chiara" = intervallo che esclude lo zero.

**Sensibilità** (righe aggiuntive, mai al posto del risultato, solo se il principale c'è; tutte con la stessa scelta su "Includi le anomalie"): (a) solo dati inseriti al momento; (b) tutte le origini; (c) notti insolite incluse; (d) solo notti con caffeina tardiva, alcol e stress = "no", mostrata solo se soddisfa anch'essa le condizioni. Una sensibilità non stimabile è indicata come tale.

**Assunzioni** (dichiarate nella scheda): autocorrelazione approssimabile come AR(1); derive lente rispetto alla finestra; dati mancanti non legati al valore; nessun altro confondente oltre a periodo e tipo di giorno (non verificabile: il risultato resta un'associazione).

### 13.5 Testi
Modelli di `docs/research/FINAL_ANALYTICS_SPEC.md` §2.5: risultato con intervallo, numero di notti e di notti esposte, periodo in mesi, e la frase "È un'associazione osservata nei tuoi dati, non una prova che…". Con differenza chiara: una possibile interpretazione e almeno una spiegazione alternativa (per P1 anche il limite "quasi inevitabile" di `docs/research/STATISTICAL_VALIDATION.md` §17). Intervallo che include lo zero: "Nei tuoi dati non emerge una differenza chiara… non esclude un effetto piccolo". Risultato chiaro che non supera la correzione: nota dedicata. I test verificano che nessun testo contenga formule causali o prescrittive.

### 13.6 Verifica (tests/unit/inference.test.mjs)
| Simulazione sulle funzioni dell'app | Atteso | Esito del test |
|---|---|---|
| sim4: 200 diari da 120 notti, ultimo utilizzo e tentativo indipendenti, nessun effetto; P1 con la definizione della Fase 4.1 | ≈ 5% di differenze "chiare" per P1 e P2 | tra 1% e 10% (esecuzione del 18/11/2026: P1 7,5%, P2 5,5%) |
| Stesso scenario: differenza media di P1 | ≈ 0 | **effetto di selezione noto**: l'esclusione delle notti con L > T tiene le notti con T ≥ L e sposta la media di circa +3/+4 min (misurato nella diagnosi della Fase 4.1: +3,1 min, 6–7% di risultati chiari). Il test lo limita a 6 min invece di nasconderlo |
| P3 senza alcun effetto dello schermo (S = T + latenza), 150 diari | ≈ 5% | ≤ 10% (esecuzione del 18/11/2026: 3,3%, differenza media 0,3 min) |
| sim4, forme letterali (tentativo della stessa notte; latenza totale) con lo stesso metodo | ≈ 100% | > 90% |
| sim3: 120 notti, esposizione persistente (0,8), ciclo settimanale, deriva, nessun effetto | metodo dell'app ≈ 5%, confronto ingenuo molto più alto | app ≤ 10%, ingenuo > 15% |
| sim3 con effetto reale di 0,5 SD | rilevato spesso | > 50% |
| Diari con effetto reale di +25 min su P2 | intervallo sopra lo zero | > 80% |

Le percentuali esatte di ogni esecuzione sono stampate dal test.

---

## 14. Andamento e Fondamento scientifico (Fase 5)

Ordine della schermata (`docs/research/FINAL_ANALYTICS_SPEC.md` §8): notte scorsa; panoramica del periodo con i filtri; orari; regolarità; le tre domande.

### 14.1 Filtri delle descrizioni
- **Tipo di giorno**: tutti / vincolati / liberi. Con un filtro attivo le notti senza tipo di giorno escono (contate a parte).
- **Notti insolite**: **escluse di default** (la specifica le prevede come filtro "includi notti insolite"); si includono con la casella. Prima della Fase 5 la panoramica le includeva.
- **Origine**: tutte (default; le descrizioni usano tutte le provenienze, §7.2) / solo registrate all'epoca. Con "registrate all'epoca" i valori inseriti a memoria o di origine non nota sono tolti **da una copia della notte, solo per il calcolo**; i risvegli valgono in coppia (se uno dei due esce, escono entrambi); una notte senza altri valori esce.
- Valgono per la **panoramica** (riquadri, notti migliori e peggiori, grafico notte per notte, conteggi descrittivi) e per il **grafico degli orari**. **Non** valgono per la regolarità né per P1–P3, che hanno criteri propri e fissi (§4.4, §13.2): l'interfaccia lo dice.
- La schermata mostra sempre il riassunto dei filtri e quanto hanno escluso. Copertura e statistiche contano solo le notti e i valori rimasti.
- **Conteggi delle esclusioni: sequenziali e mutuamente esclusivi.** I filtri si applicano in quest'ordine: tipo di giorno → notti insolite → origine. Ogni notte è contata **una sola volta**, per il primo filtro che la esclude (es. una notte libera, insolita e di origine non nota, con il filtro "vincolati", conta solo come "dell'altro tipo di giorno"). I conteggi **non** sono categorie indipendenti e non vanno sommati come se ogni filtro fosse applicato da solo a tutte le notti. Il filtro sull'origine conta i **valori** tolti dalle notti che restano; le notti rimaste senza altri dati sono indicate a parte. L'interfaccia lo dice sotto la riga "Esclusi dai filtri". Verificato da `tests/unit/phase5.test.mjs` e `tests/browser/phase5-consolidation.test.mjs`.
- **Tutte le componenti filtrate usano solo il set filtrato** (consolidamento del 18/11/2026): riquadri, notti migliori e peggiori, grafico notte per notte, conteggio descrittivo "schermo nell'ora prima del tuo solito orario" (habitualShare) e grafico degli orari. In particolare per habitualShare **anche H** è calcolato sul set filtrato (tutti i filtri, compreso il tipo di giorno), con la funzione e i criteri consolidati di H; se in una notte del periodo non ci sono almeno 14 notti valide nelle 28 precedenti, l'app non usa un H calcolato su un campione insufficiente e scrive: "Solito orario non calcolabile con questi filtri (servono almeno 14 notti valide nelle 28 precedenti)", con il numero effettivo (es. 8/14). Con i filtri predefiniti il risultato è identico a prima (verificato). Fino a questa correzione H di habitualShare era calcolato su tutte le notti, anche quelle escluse dai filtri.
- La scelta resta sul dispositivo (`ssl_trend_filters`); i dati salvati non cambiano mai (verificato dai test).

### 14.2 Grafico degli orari (actogramma)
- Una riga per notte del periodo (7, 28 o 90), indicata con il giorno del risveglio, dalla più vecchia alla più recente; asse sull'orologio dalle 18:00 alle 14:00.
- Tratto chiaro: coricamento → tentativo (o addormentamento, se manca il tentativo). Tratto medio: tentativo → addormentamento. Barra piena: addormentamento → risveglio (senza i risvegli notturni, di cui non si conoscono gli orari). Punto: ultimo utilizzo. Segno verticale: **H** della notte, calcolato come in P1–P3 (§13.1, provenienza registrata all'epoca, senza anomalie).
- **Pieno** = dati inseriti al momento o ricopiati da note dell'epoca; **vuoto** = ricostruiti a memoria o di origine non nota: un tratto è pieno solo se **entrambi** gli orari che lo delimitano lo sono. Fascia per i mattini liberi; segno per le notti insolite (visibili solo se incluse dal filtro), letto **solo dal record filtrato**: con "registrate all'epoca" un'indicazione "notte insolita" ricostruita o di origine non nota non è mostrata.
- **Tratto "a letto"**: dal coricamento al tentativo, se il tentativo c'è ed è utilizzabile (coerente e nella fascia del grafico); al solo addormentamento se il tentativo **manca davvero** (la provenienza considera allora l'addormentamento). Se il tentativo c'è ma è incoerente o fuori fascia, il tratto **non** è disegnato: nessun ripiego silenzioso sull'addormentamento.
- **Segno di H**: è l'orario abituale delle analisi P1–P3, con i loro criteri, e **non dipende dai filtri** descrittivi (decisione del 18/11/2026; dichiarato nella legenda: "Il riferimento H rappresenta l'orario abituale utilizzato nelle analisi P1–P3. È indipendente dai filtri descrittivi applicati all'actogramma."). Per questo è diverso, quando i filtri sono attivi, dall'H del conteggio descrittivo habitualShare.
- Notti con orari incoerenti: nessuna barra del sonno. Orari fuori dalla fascia 18:00–14:00: non disegnati, contati e presenti nella tabella.
- Accessibilità: grafico con titolo e descrizione; tabella "Vedi come tabella" con tutti gli orari: "—" = dato assente; ° = non registrato all'epoca; "incoerente" = in contrasto con gli altri orari (errori già calcolati: durata, tentativo, coricamento, ultimo utilizzo dopo l'addormentamento), non disegnato; "fuori grafico" = fuori dalla fascia 18:00–14:00, non disegnato. I tre stati sono distinti tra loro e dall'assenza.
- È una descrizione: nessuna inferenza. **Limite**: orari letti sull'orologio, quindi nelle notti del cambio d'ora la lunghezza delle barre può differire di un'ora dal tempo reale.

### 14.3 Schede a sette elementi
Per P1, P2 e P3: 1 · Che cosa si analizza; 2 · Quali dati (campi, provenienze, notti usate e motivi di esclusione); 3 · Periodo e numeri (solito orario H, periodo, n, notti per gruppo, n_eff); 4 · Come è calcolato (con la formula); 5 · Nei tuoi dati (risultato con intervallo, oppure astensione o "non stimabile"; analisi di sensibilità); 6 · Limiti e spiegazioni alternative; 7 · Fondamento scientifico. La regolarità ha il proprio "Come è calcolata e limiti" e il Fondamento scientifico.

**Separazione dei registri** (`docs/research/FINAL_ANALYTICS_SPEC.md` §0): la letteratura compare solo nell'elemento 7 e nella sezione delle Impostazioni, sotto il titolo "Evidenza generale: che cosa hanno trovato studi su altre persone", con l'avvertenza che non è una previsione personale; **mai nella stessa frase** di un risultato personale (verificato dai test sul testo del risultato).

### 14.4 Fondamento scientifico
- Bibliografia in `js/bibliography.js` (dati letterali in formato JSON), compresa nella cache della PWA e quindi consultabile offline. Unica fonte: `docs/research/SCIENTIFIC_AUDIT.md` (verifiche del 10–11/11/2026); nessun dato aggiunto.
- 38 voci: 16 verificate (V1), 14 con verifica in corso (V2), 5 escluse come prova per adulti, 2 non verificate, 1 verifica dell'app (simulazioni).
- Regole (`SCIENTIFIC_AUDIT.md` §8), verificate da `tests/unit/phase5.test.mjs`:
  1. numeri solo da fonti V1, con popolazione e disegno accanto; **ogni numero mostrato è controllato automaticamente contro il documento di verifica**;
  2. fonti V2 senza numeri, con l'etichetta "Verifica in corso";
  3. fonti NV ed escluse mai a sostegno; le fonti pediatriche solo come contesto, con il badge "studi su bambini e ragazzi";
  4. nessuna fonte secondaria;
  5. ogni collegamento dichiara se riguarda il fenomeno, il metodo o la misura (es. Zhong 2025 sostiene il fenomeno, mai il metodo; Phillips 2017 non giustifica la deviazione standard);
  6. per ogni fonte: stato, data dell'ultima verifica, identificativi, collegamento alla fonte originale (che richiede internet).
- Collegamenti: P1–P3 → fenomeno (Zhong 2025, Exelmans e Van den Bulck 2017, Combertaldi 2021, Ellithorpe 2022, McAlpine 2024, Leger 2024, Gradisar 2013 secondo la domanda), contesto (Bourke 2026, Tkaczyk 2026, con badge), metodo (simulazioni dell'app, Pyper e Peterman 1998 V2, Benjamini e Hochberg 1995 V2), misura (Parry 2021). Regolarità → metodo (Fischer 2021, Wittmann 2006).
- **Limite**: le fonti V2 restano senza numeri finché la verifica non è completata con accesso diretto agli articoli.

---

## 15. Personalizzazione dal Profilo e dal contesto (23/11/2026)

Codice in `js/personalize.js`: funzioni pure che leggono le notti solo attraverso funzioni di `analytics.js`. Le analisi consolidate non leggono il contesto, e `tests/unit/personalize.test.mjs` verifica che P1–P3, regolarità e riepilogo siano identici prima e dopo. Modello dei dati e interfaccia: `docs/PROFILE_AND_CONTEXT.md`.

### 15.1 Contesto della notte (livello 1)
Per la data della notte (giorno del risveglio) si prende il periodo valido di ogni categoria, intervallo `[validFrom, validTo)`. Si mostrano:
- il periodo, con la sua provenienza;
- se, secondo i giorni dichiarati, era un giorno di lavoro o studio;
- l'eventuale differenza con il tipo di giorno segnato nella notte (prevale la notte);
- nei giorni di lavoro con una sveglia dichiarata, la distanza circolare tra risveglio e sveglia: "vicino" entro ±`ALARM_NEAR_MIN` (15) minuti, altrimenti "N minuti prima/dopo", segnalando un risveglio non registrato all'epoca.

Linguaggio descrittivo: "Descrive, non spiega".

### 15.2 Confronti tra periodi (livello 2)
**Notti considerate:**
- quelle degli ultimi `CONTEXT_WINDOW_DAYS` (365) giorni;
- con addormentamento e risveglio presenti e coerenti;
- non insolite e non anomale (le anomalie entrano solo con "Includi le anomalie");
- con la provenienza ammessa dal filtro delle descrizioni.

**Gruppi confrontati:**
- giorni di lavoro dichiarati e altri giorni (dentro i periodi di lavoro);
- tipi di orario di lavoro (regolare, turni, variabile, nessuno);
- ogni tipo di routine rispetto alle notti fuori dalle routine.

**Per gruppo** si mostrano n, mediana e quartili di intervallo di sonno, addormentamento e risveglio. Per gli orari, i valori sono letti come distanze dalla mediana circolare, poi riconvertiti.

**Regole di visualizzazione:**
- Un gruppo compare da `CONTEXT_GROUP_MIN_NIGHTS` (7) notti; sotto, se ne dichiara il numero.
- "Differenza chiara" solo se entrambi i gruppi hanno almeno `CONTEXT_HIGHLIGHT_MIN_NIGHTS` (14) notti e gli intervalli interquartili non si sovrappongono. È un criterio descrittivo e prudente, non un test statistico. Periodi diversi differiscono anche per stagione e abitudini: nessuna causalità.

### 15.3 Spunti legati agli obiettivi (livello 3)
**Ambito dei dati:**
- solo obiettivi dichiarati nel Profilo;
- finestra degli ultimi `SUGGESTION_WINDOW_DAYS` (14) giorni;
- solo valori registrati all'epoca, escluse notti insolite e anomalie confermate;
- almeno `SUGGESTION_MIN_NIGHTS` (7) notti valide per obiettivo.

**Quando compare uno spunto:**
- **Orario del tentativo:** se il tentativo è dopo l'orario obiettivo (distanza circolare > 0) in almeno `SUGGESTION_MISS_SHARE` (50%) delle notti.
- **Tempo senza schermo:** se il tempo tra ultimo utilizzo e tentativo è inferiore all'obiettivo in almeno il 50% delle notti.
- **Fabbisogno percepito:** se la mediana del sonno effettivo stimato (o dell'intervallo di sonno, se mancano i risvegli, detto nel testo) è almeno `SLEEP_NEED_GAP_MIN` (30) minuti sotto.

**Come è scritto ogni spunto:**
- dice il perché, il numero di notti e le date;
- è formulato come "una possibilità è…", non medico e senza promesse;
- se l'obiettivo è raggiunto, la frase è "in linea con l'obiettivo";
- con dati insufficienti non compare nessuno spunto e si indica quante notti servono.

## 16. Analisi descrittive attivate il 23/11/2026

Approvate in `docs/research/STATISTICAL_VALIDATION.md` (§3, §12, §13) e `FINAL_ANALYTICS_SPEC.md` (L1–L4), con le soglie già presenti in configurazione. Codice: `js/trends.js`, interfaccia `js/ui-trends.js`, test `tests/unit/trends.test.mjs`. Nessuna modifica a P1–P3 né alle statistiche esistenti.

### 16.1 SRI da diario (Regolarità)
Per ogni notte valida (stessi criteri della regolarità: §4.4) si ricostruisce lo stato, sonno o veglia, minuto per minuto, dalle 12:00 del giorno prima alle 12:00 del risveglio. Per ogni coppia di notti consecutive valide si confrontano i 1.440 minuti alla stessa ora dell'orologio; P è la quota di minuti concordanti, **SRI = 200·(P − ½)**, arrotondato all'intero.

**Finestra e minimi:**
- `SRI_WINDOW_DAYS` (28): settimane intere;
- almeno `SRI_MIN_PAIRS` (14) coppie.

**Verifiche (test):**
- 23–07 ogni notte → 100;
- alternanza 23–07 / 01–09 → 66,7 (mostrato 67);
- con il cambio dell'ora e orari identici sull'orologio → 100.

**Limiti:**
- Non coglie risvegli notturni né sonnellini.
- Una notte mancante elimina due coppie.
- Nessuna soglia di popolazione.

### 16.2 Andamento di una misura (L3)
**Misure disponibili:**
- intervallo di sonno;
- sonno effettivo stimato;
- addormentamento;
- tentativo;
- risveglio;
- tempo per addormentarsi.

Non sono disponibili qualità e risvegli, per i motivi di §12 di STATISTICAL_VALIDATION.

**Come si costruisce l'andamento:**
- **Periodo e filtri.** Quelli del riepilogo, compresa la navigazione nel tempo, con i filtri delle descrizioni. Le anomalie confermate sugli orari sono escluse, come nelle altre statistiche, salvo "Includi le anomalie".
- **Punti.** Pieni se tutti i campi usati sono registrati all'epoca, vuoti altrimenti.
- **Orari.** Distanze con segno dalla mediana circolare del periodo, così la mezzanotte non crea salti.
- **Media mobile.** Centrata su ±3 notti di calendario (`ROLLING_WINDOW_NIGHTS` 7), con almeno `ROLLING_MIN_VALUES` (4) valori.
- **Pendenza di Theil–Sen.** Mediana delle pendenze tra tutte le coppie, espressa in minuti al mese (×30), da `THEIL_SEN_MIN_NIGHTS` (28) notti. È descrittiva: senza intervallo né p-value, per l'autocorrelazione.

### 16.3 Notti molto diverse dal solito (L4)
Una notte è evidenziata se |x − mediana| > `MAD_K`·1,4826·MAD.

**Come si calcola:**
- Mediana e MAD sono quelle dei valori delle `MAD_WINDOW_NIGHTS` (28) notti di calendario **precedenti** la notte, scelta documentata: confronto con il proprio passato recente.
- Servono almeno `MAD_MIN_VALUES` (14) valori.
- Per gli orari, le distanze sono circolari.

**Quando non si evidenzia:**
- con MAD = 0 nessuna notte viene evidenziata;
- l'indicazione è solo visiva e nessuna notte viene esclusa.

### 16.4 Confronto con la variabilità abituale (L1)
**Che cosa si confronta:**
- la media delle ultime 7 notti, con almeno 4 valori;
- le medie delle settimane precedenti, fino a `VARIABILITY_WINDOW_WEEKS` (12), ciascuna con almeno 4 valori. Ne servono almeno `VARIABILITY_HISTORY_WEEKS` (8).

**Risultato:**
- "Entro la tua variabilità abituale" se la differenza dalla media delle medie settimanali non supera una deviazione standard di quelle medie, altrimenti "fuori".
- Mai "migliorato" o "peggiorato".

### 16.5 Navigazione nel tempo
Il riepilogo di periodo, il grafico degli orari e l'andamento si possono spostare indietro di un periodo alla volta (7, 28 o 90 notti). Regolarità, SRI, contesto e P1–P3 restano riferiti a oggi, e l'interfaccia lo dice.

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
- 18/11/2026 — Fase 3: strumento "Origine dei dati" nelle Impostazioni (riepilogo; classificazione della provenienza per intervallo e gruppi di campi; giorno dello Screen Time per intervallo o per una notte), con anteprima, scrittura in un'unica transazione, verifica dopo la rilettura e annullamento. Nessuna soglia nuova; le analisi attuali non cambiano (istantanea della Fase 0 riprodotta).
- 18/11/2026 — Fase 4: tempi per addormentarsi e uso dello schermo nella singola notte (§3.1); regolarità solo con dati registrati all'epoca, con tentativo di dormire, divisione per tipo di giorno e differenza tra giorni liberi e vincolati (§4.6; nuova soglia provvisoria `REGULARITY_MIN_NIGHTS_PER_TYPE` = 7); domande P1–P3 attive con astensione (§13), validate riproducendo sim3 e sim4 sulle funzioni dell'app. La demo passa da 60 a 150 notti per poter vedere un risultato completo.
- 18/11/2026 — Fase 4.1 (revisione e consolidamento, nessuna nuova funzionalità): esposizione di P1 e P3 ristretta alla finestra [H − 60, H] con estremi inclusi; P1 esclude le notti con l'ultimo utilizzo dopo il tentativo (P3 no, ma esclude quelle con l'ultimo utilizzo dopo l'addormentamento); criteri di coerenza specifici per domanda con motivi mutuamente esclusivi e conteggi verificati; "Includi le anomalie" esteso a P1–P3 e alle sensibilità (non a H), con il comando anche nella sezione "Schermo e sonno"; stato "non stimabile" per varianza nulla, escluso da BH; punto medio del sonno sulla linea del tempo reale, con esclusione dal solo social jetlag delle notti con un orario inesistente o ripetuto; SD circolare di valori identici = 0 (prima poteva dare NaN). Documenti di ricerca copiati senza modifiche in `docs/research/`. Schema 4, dati, backup, CSV, migrazioni e soglie invariati.
- 18/11/2026 — Fase 5: filtri delle descrizioni (tipo di giorno, notti insolite escluse di default, origine); grafico degli orari con H, ultimo utilizzo e provenienza piena/vuota; schede a sette elementi; Fondamento scientifico offline con 38 fonti e regole d'uso verificate automaticamente. Corrette le etichette di `ROLLING_*`, `MAD_*` e `VARIABILITY_HISTORY_WEEKS` (non attive: consigliate o non pianificate, non "Fase 5"). Nessuna modifica a schema, dati, soglie, P1–P3 e regolarità.
- 18/11/2026 — Consolidamento della Fase 5: habitualShare calcola anche H sul set filtrato (tutti i filtri), con messaggio quando H non è calcolabile; simbolo delle notti insolite letto solo dal record filtrato; tratto "a letto" con la provenienza di entrambi gli estremi e senza ripiego quando il tentativo c'è ma non è utilizzabile; tabella con "incoerente" e "fuori grafico"; spiegazione dei conteggi sequenziali delle esclusioni. Nessuna modifica a H di P1–P3, soglie, filtri, dati, backup, CSV.
- 23/11/2026 — Rilascio finale: personalizzazione dal Profilo e dal contesto (§15), fuori dalle analisi consolidate; SRI da diario, andamento di una misura (media mobile, Theil–Sen), notti molto diverse dal solito (MAD) e variabilità abituale (§16), con le soglie già approvate; navigazione nel tempo del riepilogo. P1–P3, H, filtri e statistiche precedenti invariati.
