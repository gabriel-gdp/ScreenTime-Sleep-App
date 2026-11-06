# ANALYTICS_METHODOLOGY.md
### Diario del sonno — Metodologia analitica (fonte di verità)

Questo documento descrive **come ogni valore viene calcolato oggi**, con quali dati, con quali minimi e quando l'app si astiene dal mostrare un risultato. Le formule sono in `js/analytics.js`; le affermazioni numeriche di questo documento sono verificate dai test in `tests/unit/` (vedi `tests/README.md`). Se codice e documento divergono, è un difetto da correggere.

Principio trasversale: **l'app non deve simulare una precisione che i dati non permettono.** Quando un minimo non è raggiunto, lo dice e indica quanto manca, invece di forzare un risultato.

**Stato di implementazione**

| Analisi | Stato | Dove |
|---|---|---|
| Intervallo di sonno, qualità, tempo senza schermo (§1–3) | Implementate | Diario, Andamento |
| Risvegli notturni e sonno effettivo stimato (§1.1) | Implementati | Diario, Andamento |
| Riepilogo delle ultime 7 notti (§5) | Implementato | Andamento |
| Regolarità degli orari (§4) | In anteprima | Andamento → Analisi in anteprima |
| Associazioni (§6) | In anteprima | Andamento → Analisi in anteprima |
| Condizioni delle notti migliori (§8) | In anteprima | Andamento → Analisi in anteprima |
| Riepilogo mensile, insight testuali, Personal Recovery Score (§9) | **Non implementati** | — |

In tutte le analisi le anomalie confermate sono escluse di default (§7) e il pulsante "Includi le anomalie" (Andamento) le riporta nel calcolo.

---

## 0. Copertura, numerosità e incertezza

Tre concetti distinti, che l'app mostra separatamente:

1. **Copertura del diario** — quante notti di un periodo hanno almeno un dato ("Copertura 5/7"). Dice quanto è completo il diario, non quanto è affidabile un valore.
2. **Numerosità del campione per metrica** — su quante notti è calcolato *quel* valore, dopo aver tolto i dati mancanti e le anomalie escluse ("su 4 notti"). Due medie della stessa settimana possono avere numerosità diverse.
3. **Incertezza e limiti** — quanto il valore potrebbe cambiare con altri dati. L'app non calcola intervalli di confidenza o p-value (i dati giornalieri di una persona non sono osservazioni indipendenti, §6): la comunica mostrando la variabilità (valori minimo e massimo della settimana) e con frasi esplicite sui limiti.

**Etichette di numerosità (riepilogo settimanale)** — `dataConfidence(n, 7)`:

| Notti nella media | Etichetta |
|---|---|
| 6–7 | Settimana quasi completa |
| 3–5 | Settimana parziale |
| 0–2 | Troppo poche notti (il valore resta visibile; il confronto con la settimana precedente non viene calcolato) |

Le etichette dipendono **solo dal numero di notti**: per questo descrivono una quantità e non usano parole come "confidenza" o "affidabile". Superare la soglia più alta non rende un risultato stabile: con una sola settimana anche una media su 7 notti può cambiare molto la settimana successiva, e l'app lo dice esplicitamente accanto ai valori.

**Analisi in anteprima** — non usano queste etichette ma soglie minime proprie, sotto le quali non mostrano nulla (riepilogo al §10). La forza di un'associazione o di una differenza ("segnale debole / moderato / forte", §6 e §8) misura **quanto è marcato** un pattern nelle notti osservate, non quanto sia certo; il testo lo ricorda.

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

## 4. Regolarità degli orari (Consistency Score)

### 4.1 Obiettivo
Un numero 0–100 che esprime quanto sono regolari gli orari di addormentamento e risveglio. La variabilità della durata non è inclusa: dipende in gran parte dagli stessi due orari e verrebbe contata due volte.

### 4.2 Formula (statistica circolare)
Gli orari sono punti su un ciclo di 24 ore: una media lineare tratterebbe 23:30 e 00:30 come lontani 23 ore. Si usa quindi la deviazione standard circolare, deterministica e indipendente da dove cadono gli orari rispetto alla mezzanotte:

```
Per gli orari t₁…tₙ in minuti da mezzanotte:
θᵢ = tᵢ / 1440 × 2π
C = media(cos θᵢ),  S = media(sin θᵢ),  R = √(C² + S²)
σ (minuti) = √(−2 · ln R) × 1440 / 2π          (se R ≈ 0: σ = 720)

variabilità = (σ_addormentamento + σ_risveglio) / 2
Punteggio   = max(0, round(100 − variabilità / 90 × 100))
```

### 4.3 Il parametro "90 minuti"
Non è una soglia clinica: è una scelta di design. Con 90 minuti di variabilità media il punteggio arriva a 0; uno scarto feriali/weekend di circa un'ora abbassa il punteggio in modo visibile senza azzerarlo. È una **costante nel codice** (`consistencyScore`), documentata qui; non è modificabile dall'interfaccia.

### 4.4 Alternative valutate
- *Includere la variabilità della durata*: scartata (doppio conteggio).
- *Deviazione assoluta media (MAD)*: meno sensibile agli estremi, ma il problema degli estremi è risolto a monte escludendo le anomalie confermate (§4.6); resta un'alternativa a basso costo se il punteggio risultasse poco intuitivo.
- *Sleep Regularity Index*: richiede dati minuto per minuto, sproporzionato.
- *Percentile rispetto a una popolazione*: scartato, l'app confronta solo con i dati personali.

### 4.5 Verifica numerica (riprodotta dai test)

| Caso | Risultato del codice |
|---|---|
| 7 notti, sempre 23:00 → 07:00 | σ = 0 min, punteggio 100 |
| Addormentamento 23:30 e 00:30 | σ = 30 min (come la deviazione standard lineare di due punti a 60 minuti) |
| Addormentamento 23:30 e 01:30 | σ ≈ 60 min |
| 5 notti alle 22:30 e 2 all'01:00 (feriali/weekend) | σ ≈ 68 min |
| 6 notti regolari (addormentamento 22:50–23:10, risveglio 06:50–07:10) | σ addormentamento ≈ 6,5 min, punteggio 93 |
| Le stesse 6 notti + una notte anomala (04:00 → 09:00) | punteggio 19 se la notte resta nel calcolo |

### 4.6 Esclusione delle anomalie
Le notti con anomalia confermata sugli orari (`is_outlier_bedtime`) sono **escluse di default** dal calcolo: nell'esempio sopra il punteggio resta 93 invece di scendere a 19. L'app indica quante notti ha escluso e "Includi le anomalie" le riporta nel calcolo.

### 4.7 Finestra e minimi
Notti con risveglio negli ultimi **28 giorni di calendario** (oggi compreso), con addormentamento e risveglio presenti. Minimo **5 notti**; sotto, l'app indica quante ne mancano. Con dati radi la finestra può contenere poche notti: il numero di notti è sempre mostrato accanto al punteggio.

---

## 5. Riepilogo delle ultime 7 notti

- **Finestra**: le 7 notti con risveglio da oggi−6 a oggi, a scorrimento, confrontate con le 7 precedenti.
- **Metriche**: intervallo di sonno medio, sonno effettivo stimato medio, qualità media, risvegli per notte (con i minuti svegli medi), screen time medio, tempo senza schermo medio (media aritmetica). Sonno effettivo e risvegli sono calcolati solo sulle notti con i risvegli indicati, quindi hanno spesso una numerosità diversa dalle altre medie della stessa settimana: ogni riquadro mostra la propria, e la nota sotto i riquadri lo ricorda. Nel grafico "Notte per notte" la parte tratteggiata della barra sono i minuti svegli, solo dove indicati. La regolarità non fa parte del riepilogo settimanale.
- **Per ogni media l'app mostra**: il valore; su quante notti è calcolata; il valore minimo e massimo (con almeno 2 notti); l'etichetta di numerosità del §0.
- **Copertura**: "Copertura N/7" in testa al riepilogo, separata dalle etichette delle singole medie.
- **Confronto con la settimana precedente**: mostrato solo se entrambe le finestre hanno almeno 3 valori per quella metrica (`MIN_N_FOR_DELTA`); altrimenti l'app dice che il confronto non è ancora disponibile. Presentato in modo neutro (freccia e valore, nessun colore "buono/cattivo"), con la nota che descrive cosa è cambiato, non perché, e che piccole differenze rientrano spesso nella normale variazione tra notti.
- **Notte migliore e peggiore**: per qualità percepita, solo con almeno 3 notti valutate e qualità non tutte uguali; a parità vince la più recente.
- **Anomalie**: escluse dalle medie per campo (§7.2), elencate con il campo escluso; "Includi le anomalie" le riporta nel calcolo.
- **Limiti**: se mancano soprattutto certe notti (es. i weekend) le medie possono essere distorte; l'app non corregge questo effetto, lo rende visibile con copertura e numerosità.

---

## 6. Associazioni

- **Formula**: coefficiente di correlazione di Pearson tra coppie di valori della stessa notte, su **tutte le notti registrate** che hanno entrambi i valori (non su una finestra). Anomalie confermate escluse di default.
- **Coppie**: screen time della giornata e intervallo di sonno; screen time e qualità; tempo senza schermo e intervallo di sonno; tempo senza schermo e qualità; numero di risvegli e qualità; minuti svegli e qualità; numero di risvegli e intervallo di sonno; sonno effettivo stimato e qualità.
- **Coppie dei risvegli**: usano solo le notti con i risvegli indicati (campione più piccolo e di un periodo diverso; il dettaglio lo dice). Molte notti con 0 risvegli rendono r meno informativo di quanto il numero suggerisca. Non è inclusa la coppia minuti svegli / sonno effettivo, legata per costruzione (il sonno effettivo si ottiene sottraendo i minuti svegli).
- **Perché né p-value né intervalli di confidenza**: le notti di una persona non sono indipendenti (abitudini, weekend, periodi della vita si trascinano); i test classici darebbero un falso senso di rigore. La classificazione usa congiuntamente numero di notti e |r|.

**Soglie implementate (`correlationSignal`)**

| Notti con entrambi i valori | \|r\| < 0,2 | 0,2 – 0,4 | 0,4 – 0,6 | ≥ 0,6 |
|---|---|---|---|---|
| meno di 14 | non mostrata | non mostrata | non mostrata | non mostrata |
| 14 – 29 | non mostrata | Segnale debole | Segnale moderato + "pochi dati" | Segnale forte + "pochi dati" |
| 30 o più | non mostrata | Segnale debole | Segnale moderato | Segnale forte |

Se una delle due variabili non varia mai, r non è definito e la coppia non è mostrata.

- **Cosa mostra l'app**: forza del segnale, direzione (positiva/negativa) e numero di notti nel titolo; nel dettaglio una frase che descrive la direzione ("a uno screen time più alto corrisponde in media una qualità più bassa"), il ricordo che non indica una causa, periodo delle notti usate, r, il limite di Pearson (solo relazioni lineari) e il fatto che l'associazione può indebolirsi o sparire con nuovi dati.
- **Coppie non mostrate**: elencate con il motivo (meno di 14 notti; un valore che non varia; nessuna associazione lineare rilevabile, che *non esclude* relazioni di altro tipo). Così l'assenza di una coppia non viene letta come "nessun legame".

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

Un avviso richiede un secondo tocco ("Conferma e salva comunque"). Alla conferma vengono salvati `is_outlier_bedtime` (avvisi su durata, tempo senza schermo, addormentamento, risveglio) e/o `is_outlier_screen_time` (screen time), con i rispettivi flag di conferma (`DATA_MODEL.md` §3).

### 7.2 Trattamento nelle analisi

| Situazione | Trattamento |
|---|---|
| Notte senza dati | Esclusa da tutte le analisi; conta per il promemoria; "senza dati" nel calendario |
| Notte parziale | Ogni valore presente entra nelle analisi che lo usano; una coppia (§6) richiede entrambi i valori nella stessa notte |
| Singolo dato mancante | Mai stimato; il campo è assente ed escluso dai calcoli che lo richiedono |
| Risvegli non indicati | Esclusi da risvegli medi, minuti svegli medi, sonno effettivo stimato e relative associazioni; mai contati come 0 |
| Anomalia confermata sugli orari | Esclusi di default durata, tempo senza schermo e orari (quindi anche dalla regolarità); la qualità resta |
| Anomalia confermata sullo screen time | Escluso di default solo lo screen time |
| Notte con orari incoerenti (possibile solo per dati migrati dalla v1 o importati) | Durata e/o tempo senza schermo non calcolati; il diario mostra l'errore da correggere |

**Principio**: nessuna imputazione, nessuna correzione automatica, nessuna esclusione silenziosa. Ogni analisi indica quante notti ha escluso; il riepilogo settimanale elenca quali e per quale campo; "Includi le anomalie" vale per tutte le analisi. Nessun dato viene eliminato dall'app.

---

## 8. Condizioni delle notti migliori

- **Notti migliori**: qualità ≥ soglia, dove soglia = il maggiore tra il **75° percentile personale** della qualità (rango più vicino) e **7**. Le notti a pari merito con la soglia sono tutte incluse: il risultato non dipende dall'ordine dei dati, ma il gruppo può superare il 25% delle notti (l'app mostra la percentuale effettiva). Si usano tutte le notti registrate con la qualità.
- **Minimi**: 30 notti con qualità; almeno 8 notti nel gruppo "migliori" e 8 nel gruppo "altre"; per ogni metrica confrontata, almeno 8 valori per gruppo. Sotto, l'app indica quanto manca.
- **Metriche confrontate**: intervallo di sonno, sonno effettivo stimato, minuti svegli, tempo senza schermo, screen time (non la regolarità). Sonno effettivo e minuti svegli usano solo le notti con i risvegli indicati e richiedono anch'essi 8 valori per gruppo.
- **Misura**: differenza standardizzata di Cohen, `d = (media_migliori − media_altre) / SD_combinata`. Se entrambi i gruppi hanno varianza nulla, d non è definita e la metrica non è mostrata.

  | \|d\| | Etichetta |
  |---|---|
  | < 0,2 | non mostrata |
  | 0,2 – 0,5 | Segnale debole |
  | 0,5 – 0,8 | Segnale moderato |
  | ≥ 0,8 | Segnale forte |
- **Cosa mostra l'app**: per ogni metrica con segnale, media e numero di notti di ciascun gruppo e d; metriche non confrontate per pochi dati elencate.
- **Limiti** (dichiarati nell'app): confrontando più aspetti su un numero limitato di notti, qualche differenza può comparire per caso; è un'indicazione da osservare nel tempo, non una regola da seguire.

---

## 9. Non implementato

Riepilogo mensile, insight testuali, Personal Recovery Score o altri punteggi compositi, sleep efficiency (richiede il tempo a letto, non raccolto). Un eventuale punteggio composito dovrebbe prima dimostrare di aggiungere valore rispetto alle metriche singole, restare interpretabile e non essere letto come indicatore medico.

---

## 10. Quando l'app si astiene (riepilogo)

| Analisi | Condizione minima per mostrare un risultato |
|---|---|
| Intervallo, qualità, tempo senza schermo | Sempre, se i dati della notte ci sono e sono coerenti |
| Sonno effettivo stimato | Se ci sono intervallo e risvegli indicati, e i minuti svegli sono meno dell'intervallo |
| Riepilogo 7 notti | Dalla prima notte; confronto con la settimana precedente da 3 valori per parte |
| Regolarità | ≥ 5 notti con orari completi negli ultimi 28 giorni (anomalie escluse) |
| Associazioni (per coppia) | ≥ 14 notti con entrambi i valori e \|r\| ≥ 0,2 |
| Notti migliori | ≥ 30 notti con qualità, ≥ 8 per gruppo e ≥ 8 valori per gruppo per metrica |

---

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
