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

## E2. Andamento (Fase 1)

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| T1 | Andamento → riepilogo | Riquadri con la **mediana**, "metà delle notti tra … e …", min/max e "su N notti"; qualità come barre 1–10; nessuna freccia "vs 7 notti prima" | ✔ |
| T2 | Tocca "28 notti" e "90 notti", chiudi e riapri l'app | Titolo e copertura cambiano; la scelta resta; a 90 notti niente grafico notte per notte | ✔ |
| T3 | Regolarità degli orari | Minuti di variabilità per addormentamento e risveglio, numero di notti e periodo; "Come è calcolata e limiti" spiega metodo, esclusioni e limiti; nessun "/100" | ✔ |
| T4 | Con meno di 14 notti negli ultimi 28 giorni | Messaggio "Servono almeno 14 notti… (N/14 finora)" | ✔ (unità) |
| T5 | Leggibilità su iPhone in tema chiaro e scuro | Nessun testo tagliato o sovrapposto nei riquadri e nel selettore del periodo | ✘ |

## E3. Schema 4 (Fase 2)

**Prima di aprire la nuova versione sul telefono con i dati reali: salva un backup dalla versione attuale** (Impostazioni → Salva backup completo) e conservalo in File/iCloud Drive. L'app ne chiederà comunque un altro prima di aggiornare.

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| S1 | Apri la nuova versione con i dati esistenti | Compare "Aggiornamento dei dati" con il numero delle tue notti; "Aggiorna il database" inattivo | ✔ |
| S2 | "Crea e scarica il backup" → salva in File | Safari mostra il file `…-prima-aggiornamento-v3.json` da salvare; l'esito dice "verificato" con il numero di notti; il file si apre in File | ✘ (il download su iOS) |
| S3 | Spunta "Ho salvato il file…" → "Aggiorna il database" | Esito con "N notti, ognuna identica a prima"; "Continua" apre il diario; calendario e Andamento mostrano gli stessi valori di prima | ✔ |
| S4 | Chiudi e riapri l'app | Nessuna nuova richiesta di aggiornamento | ✔ |
| S5 | Notte scorsa: compila tutto il check-in mattutino con "Ieri e stanotte" chiuso. **Cronometra** | Tempo ≤ 45 s; tipo di giorno già proposto dallo schema (lun–ven vincolato) | ✘ (tempo) |
| S6 | Apri "Ieri e stanotte", tocca "Sì" e poi di nuovo "Sì" | Primo tocco seleziona, secondo torna a non indicato | ✔ |
| S7 | "Hai provato a dormire alle" dopo "Ti sei addormentato/a alle" | Messaggio rosso, salvataggio bloccato; con tentativo 4 ore prima chiede conferma | ✔ |
| S8 | Modifica la qualità di una notte di 3 o più giorni fa → Salva | Domanda "Da dove vengono questi dati?"; la scelta salva | ✔ |
| S9 | Impostazioni → Schema settimanale e orari degli indicatori | Toccare un giorno alterna Vincolato/Libero; gli orari si aprono con il selettore iOS | ✘ (selettore) |
| S10 | Selettore orario di "Hai provato a dormire" e "Sei andato/a a letto" | Rotelle iOS, valore centrato, nessuno zoom | ✘ |
| S11 | Tema chiaro e scuro, testo grande (Impostazioni iOS → Schermo → Dimensioni testo) | Pulsanti Sì/No e tipo di giorno non tagliati né sovrapposti | ✘ |

## E4. Origine dei dati (Fase 3)

Prima di classificare i dati reali: **salva un backup** (anche dal pulsante "Salva prima un backup" nel pannello).

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| O1 | Impostazioni → Origine dei dati | Riepilogo: i dati di prima dell'aggiornamento "Origine non nota", quelli nuovi "Inseriti al momento"; Screen Time storico "presunto" | ✔ |
| O2 | "Classifica l'origine dei dati" → tocca Dal / Al | Si apre il calendario di iOS; il giorno scelto resta e l'anteprima si aggiorna | ✘ (selettore data) |
| O3 | Scegli un intervallo, "Sera" e "Ricopiati da note dell'epoca" | Anteprima con numero di valori e notti; nessun cambiamento finché non tocchi "Classifica N valori" | ✔ |
| O4 | Conferma, poi controlla alcune notti nel Diario | Esito "verificato"; nel Diario gli stessi valori di prima; nel CSV le colonne `prov_…` aggiornate | ✔ |
| O5 | "Annulla questa operazione" | Riepilogo tornato come prima | ✔ |
| O6 | Giorno dello Screen Time → "Una notte" → scegli una notte e un giorno | Stato attuale mostrato; dopo "Aggiorna": "corretto a mano" | ✔ |
| O7 | Tema chiaro e scuro, testo grande | Caselle, pulsanti e date non tagliati né sovrapposti | ✘ |

## E5. Schermo e sonno, regolarità, notte singola (Fase 4)

| # | Passi | Risultato atteso | Auto |
|---|---|---|---|
| Q1 | Con i tuoi dati: Andamento → Schermo e sonno | Tre schede "Dati non ancora sufficienti" con il minimo, il conteggio e il rimando a Origine dei dati; nessun numero | ✔ |
| Q2 | Regolarità con i dati storici non classificati | "Servono almeno 14 notti… registrati all'epoca" e la nota sulle notti non considerate | ✔ |
| Q3 | Impostazioni → Origine dei dati: classifica le notti storiche che hai ricopiato da note, poi torna ad Andamento | La regolarità compare (se nelle ultime 4 settimane ci sono almeno 14 notti) | ✔ |
| Q4 | Diario: tentativo 23:20, ultimo utilizzo 23:35, addormentamento 23:50 | "Tempo per addormentarti 30 min", "Dopo l'ultimo utilizzo 15 min", "Schermo dopo aver provato a dormire: sì" | ✔ |
| Q5 | Impostazioni → Modalità demo → Andamento | Tre risultati con intervallo, notti, periodo, "associazione osservata" o "non emerge una differenza chiara"; regolarità con tentativo, tipi di giorno e giorni liberi/vincolati | ✔ |
| Q6 | In demo apri "Come è calcolato" e "Altre verifiche" in ogni scheda | Testi leggibili, nessuna sovrapposizione; righe di sensibilità allineate | ✘ (leggibilità su iPhone) |
| Q7 | Cambia periodo (7/28/90) in demo | La schermata si aggiorna senza attese percepibili | ✘ (velocità su iPhone) |
| Q8 | Testo grande e tema scuro in Andamento | Schede, badge e tabelle non tagliati | ✘ |

## E6. Revisione della Fase 4.1 (Safari su iPhone)

Da verificare con la PWA aperta dalla schermata Home, in tema chiaro e scuro. Non è stato possibile eseguire Safari/WebKit nell'ambiente di sviluppo: questi controlli sono necessari.

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| R1 | Andamento → Schermo e sonno, scheda P1 → "Come è calcolato" | Finestra "da un'ora prima fino al solito orario compreso"; nessun "(o dopo)"; "Le notti in cui l'ultimo utilizzo è dopo l'ora in cui hai provato a dormire non sono usate" | ✔ |
| R2 | Schede P1 e P3 | Riga "Il tuo solito orario di riposo…" con le notti valide su 28, oppure "non ancora calcolabile… ne servono 14" | ✔ |
| R3 | "Come è calcolato" di ogni scheda | Riga "Nel diario fino a oggi: X; usate…: Y. Non usate (ognuna contata una volta…)" con motivi leggibili, compreso "con l'ultimo utilizzo dopo l'ora in cui hai provato a dormire" (P1) e "dopo l'addormentamento" (P3) | ✔ |
| R4 | Con notti segnate come anomale: tocca "Includi le anomalie" nella sezione Schermo e sonno (o nel riepilogo) | La riga sopra le schede passa da "escluse" a "incluse"; le notti usate aumentano; il solito orario non cambia; il pulsante resta raggiungibile con VoiceOver | ✔ (VoiceOver ✘) |
| R5 | Demo, tre schede | Nessun "NaN", "Infinity", "undefined"; intervalli con "da … a … min"; etichette dei gruppi "con l'ultimo utilizzo in quell'ora" / "prima di quell'ora o dopo il tuo solito orario" | ✔ |
| R6 | Regolarità con dati che comprendono la notte del 25/10 con un orario tra 02:00 e 02:59 | Riga "Non usate per la differenza tra giorni liberi e vincolati…: ora ripetuta…"; la notte resta nelle altre analisi | ✔ |
| R7 | Testo grande (Impostazioni iOS) | Badge "Risultato non stimabile" / "Dati non ancora sufficienti" e titoli delle schede non sovrapposti | ✘ |
| R8 | Aggiornamento della PWA già installata | Dopo la riapertura compare la nuova versione (cache v13); i dati sono invariati | ✘ |

## E7. Andamento e Fondamento scientifico (Fase 5, Safari su iPhone)

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| V1 | Andamento → Filtri → Liberi, poi "Registrate all'epoca", poi "Includi le notti insolite" | Il riassunto cambia; la riga "Esclusi dai filtri…" dice che cosa è escluso; regolarità e Schermo e sonno non cambiano | ✔ |
| V2 | Chiudi e riapri l'app | I filtri scelti restano; il pannello è aperto se un filtro è attivo | ✔ |
| V3 | Grafico degli orari con 7, 28 e 90 notti | Barre leggibili, etichette dei giorni non sovrapposte, segno del solito orario visibile; in tema scuro i tratti chiari si distinguono dallo sfondo | ✔ (resa su Safari ✘) |
| V4 | Con i dati storici non ancora classificati | Barre e punti vuoti; "Vedi come tabella" con ° accanto ai valori | ✔ |
| V5 | VoiceOver sul grafico | Legge titolo e descrizione ("Orari di N notti…"); la tabella è navigabile | ✘ |
| V6 | Una scheda di Schermo e sonno | Sette elementi numerati; "Nei tuoi dati" non cita studi; "7 · Fondamento scientifico" separa evidenza generale, contesto (badge per gli studi su bambini e ragazzi), metodo e misura | ✔ |
| V7 | "Tutte le fonti…" | Apre Impostazioni → Fondamento scientifico, con i gruppi per stato (16, 14, 5, 2, 1) | ✔ |
| V8 | In modalità aereo, con l'app installata dalla Home | Il Fondamento scientifico si apre e si legge; i collegamenti "fonte originale" si aprono solo con la rete | ✘ |
| V9 | Tocca "fonte originale" | Si apre Safari su una nuova pagina; tornando all'app i dati e la schermata sono intatti | ✘ |
| V10 | Aggiornamento della PWA già installata | Nuova versione (cache v14) dopo la riapertura; dati invariati | ✘ |

## E8. Profilo e contesto (rilascio finale, Safari su iPhone)

Prima: salva il backup delle notti.

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| K1 | Apri la nuova versione **senza** cancellare nulla, se avevi già compilato il Profilo il 18/11 | Il saluto in alto mostra il tuo nome; nel Profilo i dati ci sono; professione e turni compaiono come "valori senza date"; in "Cancellazione" la vecchia copia è dichiarata | ✔ |
| K2 | Profilo → modifica un campo → "Salva profilo" | "Profilo salvato e verificato"; il saluto si aggiorna | ✔ |
| K3 | Data di nascita e "Vorrei provare a dormire entro le" | Si aprono il selettore di data e quello dell'ora di iOS, leggibili; il valore resta dopo il salvataggio | ✘ |
| K4 | Età in anni | Compare la tastiera numerica; "200" è segnalato in rosso e non viene salvato | ✔ (tastiera ✘) |
| K5 | Lavoro e routine → aggiungi un periodo di lavoro iniziato mesi fa | "Registrato all'epoca" non è selezionabile; scegliendo "ricostruito a memoria" il periodo si salva; l'elenco mostra "in corso" e la provenienza | ✔ |
| K6 | Aggiungi un secondo periodo di lavoro che si sovrappone | Messaggio "Si sovrappone a…", nulla salvato | ✔ |
| K7 | "Termina" il primo periodo, poi aggiungi quello nuovo dal giorno dopo | Entrambi salvati; "Annulla" dopo ogni operazione la annulla | ✔ |
| K8 | Diario → la notte di oggi | "Contesto della notte" con il periodo e, se c'è una sveglia, il confronto con l'orario di risveglio | ✔ |
| K9 | Andamento → "Nel tuo contesto" | Confronti con il numero di notti; con un obiettivo nel Profilo, spunti con "Perché questo spunto" (oppure quante notti servono) | ✔ |
| K10 | Profilo → "Salva backup del contesto" | Si scarica un file `diario-del-sonno-contesto-…json` in File | ✘ |
| K11 | "Ripristina il contesto" con lo stesso file | Riepilogo con "identici"; "Aggiungi i nuovi" non cambia nulla | ✔ (selettore file ✘) |
| K12 | Chiudi l'app dal multitasking e riaprila, anche dopo un riavvio del telefono | Profilo, periodi e preferenze della personalizzazione ci sono ancora | ✘ |
| K13 | Navigazione privata di Safari (facoltativo) | Se il browser blocca l'archivio, il Profilo dice "non disponibile" e Diario e Andamento funzionano | ✔ (simulato) |
| K14 | VoiceOver sul Profilo | Ogni campo legge la sua etichetta; errori letti quando si torna sul campo; i giorni della settimana sono caselle con nome | ✘ |

## E9. Nuove analisi, privacy, aggiornamento (rilascio finale)

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| N1 | Andamento → Regolarità | Sotto la deviazione standard compare "SRI da diario" (oppure quante coppie di notti servono) | ✔ |
| N2 | Andamento → "Andamento di una misura" → cambia misura | Il grafico si aggiorna; punti pieni o vuoti; linea della media mobile; "Vedi come tabella" | ✔ (resa su Safari ✘) |
| N3 | "‹ Precedenti" nel riepilogo | Date del periodo precedente; "Torna a oggi" riporta al periodo attuale | ✔ |
| N4 | Schede di "Schermo e sonno" | Più corte: "Definizione completa" e "Quali notti e perché" si aprono a richiesta | ✔ |
| N5 | In modalità aereo, app dalla Home | I caratteri sono gli stessi di quando sei online (nessun carattere di sistema al loro posto) | ✘ |
| N6 | Impostazioni di Safari → Avanzate → Dati dei siti web (facoltativo) | Nessun dato di fonts.googleapis.com o altri domini esterni dopo l'uso dell'app | ✘ |
| N7 | Aggiornamento della PWA già installata | Nuova versione (cache v19 dal 26/11) dopo la riapertura; notti, profilo e periodi invariati | ✘ |

## E10. Schermata iniziale (26/11/2026)

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| S1 | Chiudi l'app dal multitasking e riaprila dalla Home | Logo, nome, frase e "Un progetto di Gabriel" in basso; dopo meno di un secondo il Diario. Nessuno scatto né sfarfallio | ✔ (tempi) |
| S2 | Cambia scheda più volte, apri il Profilo | La schermata iniziale non ricompare | ✔ |
| S3 | Torna alla Home e rientra nell'app senza chiuderla | Nessuna schermata iniziale: l'app è com'era | ✘ |
| S4 | Con il tema scuro, chiudi e riapri | Schermata iniziale scura fin dal primo istante (nessun lampo chiaro) | ✔ |
| S5 | Impostazioni di iOS → Accessibilità → Movimento → Riduci movimento: attivo; riapri l'app | Nessun movimento, solo una dissolvenza breve | ✔ |
| S6 | Modalità aereo, riapri l'app | Schermata iniziale con il logo, poi il Diario | ✔ |
| S7 | VoiceOver attivo, riapri l'app | VoiceOver non legge la schermata iniziale; la prima voce letta è dell'app | ✔ (attributi) / ✘ (lettura reale) |
| S8 | Dopo l'aggiornamento alla cache v19 ("Aggiorna" o riapertura) | Nessuna schermata iniziale al ricaricamento automatico; dati invariati | ✔ |

## E11. Logo A1 e avatar del Profilo (26/11/2026)

| # | Passi | Risultato atteso | Auto (Chromium) |
|---|---|---|---|
| L1 | Dopo l'aggiornamento alla cache v20, togli l'app dalla Home e aggiungila di nuovo da Safari ("Condividi" → "Aggiungi a Home") | Icona con la luna di pagine dorata e il nastro su fondo notte (iOS conserva la vecchia icona finché non si aggiunge di nuovo) | ✔ (file e dimensioni) / ✘ (Home reale) |
| L2 | Chiudi e riapri l'app, tema chiaro e poi scuro | Logo oro scuro su fondo chiaro, oro chiaro su fondo scuro; il nastro scende per ultimo e si posa senza scatti | ✔ (colori, tempi) / ✘ (fluidità reale) |
| L3 | Con "Riduci movimento" attivo, riapri l'app | Il nastro è già al suo posto; solo dissolvenza | ✔ |
| A1 | Profilo → "Cambia immagine" → scegli un volto, poi carnagione, capelli e occhiali | Ogni tocco aggiorna subito l'immagine nel Profilo e nell'intestazione; messaggio "Immagine salvata" | ✔ |
| A2 | Scegli un personaggio (gufo, gatto…) e un suo colore | Nessuna scelta dei capelli; colori propri del personaggio | ✔ |
| A3 | Chiudi e riapri l'app | L'immagine scelta è ancora lì | ✔ |
| A4 | "Nessuna immagine" | Torna l'iniziale del nome | ✔ |
| A5 | VoiceOver sul Profilo | Legge "Immagine del profilo: …" con volto e varianti; ogni casella ha un nome | ✔ (attributi) / ✘ (lettura reale) |

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
