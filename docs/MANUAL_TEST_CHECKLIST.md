# Checklist di verifica manuale — iPhone / Safari

I test automatici (`tests/`) girano su Chromium con schermo da iPhone: coprono la logica, il database, il service worker e il layout, ma **non sostituiscono Safari su un iPhone reale**. Questa lista copre ciò che solo il dispositivo può verificare. Colonna "Auto": ✔ = già verificato anche dai test automatici su Chromium (qui serve solo la conferma su Safari); ✘ = verificabile solo sul dispositivo.

Prima di iniziare: **salva un backup** (Impostazioni → Salva backup completo) e conservalo in File/iCloud Drive.

Requisiti: iOS 15.4 o successivo (16.4 per le notifiche), app pubblicata su HTTPS (es. GitHub Pages).

## A. Installazione e aggiornamento

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| A1 | Apri l'indirizzo in Safari → Condividi → "Aggiungi alla schermata Home" → apri dall'icona | Si apre a tutto schermo con l'icona dell'app, intestazione non coperta dall'ora/notch, barra in basso sopra l'indicatore Home | ✘ |
| A2 | Carica una nuova versione su GitHub, attendi un minuto, chiudi l'app (scorri via dal multitasking) e riaprila | Compare la nuova versione (se serve, chiudi e riapri una seconda volta) | ✔ |
| A3 | Con una notte modificata e non salvata, carica una nuova versione e riapri l'app | La bozza è ancora lì; se compare "È pronta una versione aggiornata", tocca "Aggiorna": la bozza resta | ✔ |
| A4 | Dopo l'aggiornamento, controlla calendario e Andamento | Tutte le notti salvate in precedenza ci sono, con gli stessi valori | ✔ |

## B. Inserimento dati

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| B1 | Tocca un campo orario | Si apre il selettore a rotelle di iOS; il valore scelto appare **centrato** nella casella, in formato 24 ore | ✘ |
| B2 | Tocca i campi senza che lo schermo faccia zoom | Nessuno zoom automatico | ✘ |
| B3 | Screen time 3:15 | Appare "3h 15m", non "03:15" | ✔ |
| B4 | Ultimo utilizzo 23:30, addormentamento 22:29 | Messaggio rosso, i due campi bordati di rosso, pulsante "Correggi i dati per salvare" inattivo | ✔ |
| B5 | Addormentamento 15:00 → Salva | Il pulsante diventa ambra "Conferma e salva comunque"; al secondo tocco salva | ✔ |
| B6 | "Adesso" sull'ultimo utilizzo della notte di stasera | Inserisce l'ora attuale | ✔ |
| B7 | Qualità: tocca 6, poi di nuovo 6 | Selezionato, poi deselezionato | ✔ |
| B8 | Svuota tutti i campi di una notte salvata (nel selettore: "Reimposta"/"Cancella"), deseleziona la qualità | Il pulsante diventa "Elimina i dati di questa notte" e chiede conferma | ✔ |

## B2. Mezzanotte e risvegli notturni

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| R1 | Dopo mezzanotte (es. alle 00:40) apri la notte appena iniziata | Etichetta "Screen time di <giorno di ieri>" e avviso azzurro: in Tempo di utilizzo seleziona quel giorno, non oggi | ✔ |
| R2 | In Impostazioni iOS → Tempo di utilizzo, scegli il giorno indicato dall'app e inserisci quel totale | Il valore corrisponde al giorno di calendario della sera (non al giorno corrente) | ✘ |
| R3 | Ultimo utilizzo 00:30, addormentamento 01:00, risveglio 08:00 | 30 min senza schermo, nessun errore | ✔ |
| R4 | Salva una mattina senza toccare "Ho avuto risvegli durante la notte" | Salvato come "nessun risveglio"; sonno effettivo stimato = intervallo | ✔ |
| R5 | Seleziona la casella | Compaiono numero (1) e minuti; il pulsante dice "Completa i risvegli per salvare" finché mancano i minuti; la tastiera è numerica | ✔ (tastiera ✘) |
| R6 | Minuti 30, tocca + | 2 risvegli; "Sonno effettivo stimato" = intervallo − 30 min | ✔ |
| R7 | Apri una notte salvata prima di questo aggiornamento | Casella non selezionata con la nota "risvegli non registrati" e il pulsante "Segna: nessun risveglio"; modificando la qualità e salvando, i risvegli restano non indicati | ✔ |
| R8 | VoiceOver sulla casella e sui campi dei risvegli | La casella annuncia stato e testo; i pulsanti − / + hanno un nome; gli errori vengono letti | ✘ |

## C. Bozze, chiusura e cambio di data

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| C1 | Inserisci un orario senza salvare, chiudi l'app dal multitasking, riaprila | L'orario è ancora lì con "modifiche non salvate" | ✔ |
| C2 | Lascia l'app aperta in background la sera, riaprila la mattina dopo | Intestazione con la data di oggi; aperta la notte appena trascorsa | ✔ |
| C3 | (Solo nei giorni del cambio d'ora: ultima domenica di marzo/ottobre) inserisci 23:00 → 07:00 | Durata 7 h a marzo, 9 h a ottobre | ✔ |

## D. Offline

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| D1 | Attiva la modalità aereo, apri l'app dalla Home | Si apre con i dati salvati | ✔ |
| D2 | Sempre offline, salva una notte; poi riattiva la rete | Il salvataggio riesce offline e resta dopo il ritorno della rete | ✔ |

## E. Backup, ripristino, export

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| E1 | Impostazioni → Salva backup completo | iOS propone di salvare/condividere un file `diario-del-sonno-backup-AAAA-MM-GG.json`; salvalo in File | ✘ |
| E2 | Ripristina da backup → scegli lo stesso file | Riepilogo: tutte le notti "già presenti e identiche", pulsante "Niente da importare" | ✔ |
| E3 | Modifica una notte, poi ripristina il backup di E1 | 1 notte "con dati diversi"; con "Mantieni i dati del dispositivo" non cambia nulla; con "Sostituiscili" serve un secondo tocco di conferma | ✔ |
| E4 | Ripristina un file qualsiasi che non sia un backup (es. una foto o il CSV) | Messaggio "non è un backup…"; nessun dato modificato | ✔ |
| E5 | Su un **altro** dispositivo o dopo aver rimosso l'app: installa, ripristina il backup | Tutte le notti ricompaiono, calendario e analisi uguali | ✘ |
| E6 | Esporta CSV e aprilo in Numbers | Una riga per notte, colonne separate; in Excel con impostazioni italiane potrebbe servire "Dati → Da testo" con separatore virgola | ✘ |

## F. Notifiche (iOS 16.4+, app dalla Home)

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| F1 | Impostazioni → Promemoria → attiva | iOS chiede il permesso per le notifiche | ✘ |
| F2 | Con la notte appena trascorsa completamente vuota, chiudi e riapri l'app | Compare una notifica sulla notte appena trascorsa, una sola volta | ✘ (simulata in Chromium) |
| F3 | Con l'app chiusa per tutto il giorno | **Nessuna notifica**: limite noto, senza server le app web non possono notificare ad app chiusa | ✘ |

## G. Accessibilità

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| G1 | Attiva VoiceOver, scorri il Diario | Ogni campo e pulsante ha un nome comprensibile; i campi orario annunciano etichetta e valore; gli errori vengono letti | ✘ (nomi verificati in Chromium) |
| G2 | VoiceOver sul gruppo qualità | "Qualità percepita del sonno", opzioni "6 su 10", stato selezionato | ✘ |
| G3 | Impostazioni iOS → Testo più grande (dimensioni accessibilità) | Il testo non si sovrappone e resta leggibile | ✘ |
| G4 | Con una tastiera Bluetooth: Tab, frecce sulla qualità, Invio | Focus visibile, frecce cambiano la qualità, Invio attiva i pulsanti | ✔ |

## H. Dati preesistenti

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| H1 | Prima di aggiornare, annota 2–3 notti (date e valori) dal calendario | — | — |
| H2 | Aggiorna l'app (A2) | Le notti annotate sono identiche; nessuna notte è sparita | ✔ (migrazione e conservazione verificate sui dati di test) |

Annota per ogni voce: esito (OK / problema), versione di iOS, eventuale screenshot.
