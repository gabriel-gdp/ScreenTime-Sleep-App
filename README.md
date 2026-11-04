# Diario del sonno — PWA

Personal analytics tool per sonno e screen time. Nessun backend, nessuna dipendenza da build tool: HTML/CSS/JS puri, storage locale via IndexedDB.

## Struttura del progetto

```
index.html              punto di ingresso
manifest.json            metadati PWA (nome, icone, tema)
service-worker.js        cache offline + notifiche locali
css/styles.css           design system (variabili colore, layout, temi chiaro/scuro)
js/analytics.js          tutte le formule (pure, testabili) — vedi docs/ANALYTICS_METHODOLOGY.md
js/db.js                 layer di storage (IndexedDB + localStorage per le preferenze)
js/app.js                stato dell'app e rendering dell'interfaccia
js/demo.js               dati di esempio per la modalità demo (solo in memoria)
js/backup.js             backup completo in JSON e ripristino validato
icons/                   icone PWA (192, 512, 512 maskable)
docs/                    ANALYTICS_METHODOLOGY.md (formule e soglie), DATA_MODEL.md (schema, CSV, backup),
                         MANUAL_TEST_CHECKLIST.md (verifiche da fare su iPhone)
tests/                   test automatici — vedi tests/README.md (non servono per usare l'app)
package.json             solo per eseguire i test (nessuna dipendenza per l'app)
```

## Uso in locale

I service worker richiedono HTTPS o `localhost` — aprire il file `index.html` direttamente da filesystem (`file://`) non basta. Da questa cartella:

```bash
npm run serve          # oppure: python3 -m http.server 8080
```

Poi apri l'indirizzo mostrato dal browser del computer. Da un telefono sulla stessa rete l'app si apre via IP, ma senza HTTPS il service worker (offline e notifiche) non si attiva: per provarla davvero su iPhone usa GitHub Pages.

## Compatibilità

Safari su iOS/iPadOS **15.4 o successivo** (usa `:focus-visible` e `:has()`); notifiche solo da **iOS 16.4**, con l'app aggiunta alla schermata Home. Le prove automatiche usano Chromium: la compatibilità con Safari va confermata con `docs/MANUAL_TEST_CHECKLIST.md`.

## Deploy per uso reale

Qualunque hosting statico va bene — non serve un backend. Opzioni semplici e gratuite:

- **GitHub Pages**: pusha questa cartella in un repository, attiva Pages dalle impostazioni.
- **Netlify** o **Vercel**: trascina la cartella nella dashboard, o collega il repository.

Dopo il deploy, apri l'URL da Safari (iOS) o Chrome (Android) e usa "Aggiungi a Home" — a quel punto l'app è installata come le altre, con la propria icona. Su iOS 16.4+ le notifiche funzionano solo con l'app aggiunta alla Home, e il promemoria compare quando apri l'app: senza un server un'app web non può inviare notifiche mentre è chiusa.

Per usare l'app bastano `index.html`, `manifest.json`, `service-worker.js` e le cartelle `css/`, `js/`, `icons/`. `docs/`, `tests/` e `package.json` possono essere caricati o no: l'app non li usa.

## Aggiornare l'app già installata

Il service worker usa una strategia "prima la rete": quando sei online l'app scarica sempre i file più recenti, offline usa l'ultima copia salvata. Dopo aver caricato file nuovi sul repository, chiudi del tutto l'app e riaprila (la prima volta dopo il passaggio da una versione vecchia può servire farlo due volte). Se l'aggiornamento arriva mentre hai modifiche non salvate, l'app non si ricarica da sola: compare l'avviso "Aggiorna", e le bozze vengono conservate.

Le bozze non salvate restano anche se chiudi l'app (copia in localStorage), ma entrano nel database e nelle analisi solo quando premi "Salva". Se un file dell'app manca (es. non caricato su GitHub), dopo qualche secondo compare un messaggio con "Riprova" invece di "Caricamento…" fisso.

## Dati

Tutto resta sul dispositivo (IndexedDB, nessun server né sincronizzazione). Nelle Impostazioni:

- **Salva backup completo (JSON)** — per ripristinare l'app, anche su un altro dispositivo. Conservalo fuori dal telefono.
- **Ripristina da backup** — valida il file prima di toccare qualsiasi dato, mostra un riepilogo (notti nuove, identiche, in conflitto) e chiede conferma. Di default aggiunge solo le notti mancanti; sostituire quelle in conflitto è una scelta esplicita. La scrittura avviene in un'unica transazione: se fallisce, i dati restano com'erano.
- **Esporta CSV** — una riga per notte, per l'analisi in un foglio di calcolo. Non serve per il ripristino.

Dettagli del formato e delle regole di importazione: `docs/DATA_MODEL.md` §6–7.

## Stato del progetto

Release candidate. Copre la Fase 1–4 (raccolta dati, calendario, riepilogo settimanale, export e backup) più un'anteprima della Fase 6 (regolarità, associazioni, notti migliori) con le formule di `docs/ANALYTICS_METHODOLOGY.md`, che in apertura riporta lo stato di implementazione di ogni analisi.

- **Anomalie**: i valori insoliti richiedono conferma al salvataggio (§7.1); le notti confermate come anomale vengono salvate con un flag, esportate nel CSV ed **escluse di default da tutte le analisi**: medie settimanali, regolarità (§4.6), associazioni e notti migliori. L'esclusione è per campo (orari anomali → fuori durata, tempo senza schermo e regolarità; screen time anomalo → fuori solo lo screen time). Ogni analisi dice quante notti ha escluso, e "Includi le anomalie" nella schermata Andamento le riporta nel calcolo.
- **Riepilogo settimanale**: la copertura (notti con almeno un dato su 7) è distinta dalla numerosità di ciascuna media (notti effettivamente usate, con minimo e massimo). Le etichette descrivono quante notti ci sono, non quanto un risultato sia stabile.
- **Non implementati**: riepilogo mensile, insight testuali, Personal Recovery Score.

## Test

Istruzioni complete in `tests/README.md`. In breve, da questa cartella:

```bash
npm install            # installa Playwright (solo per i test nel browser)
npx playwright install chromium
npm test               # test della logica + test nel browser
npm run test:unit      # solo logica, basta Node 18+ (nessuna installazione)
```
