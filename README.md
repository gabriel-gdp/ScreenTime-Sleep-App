# Diario del sonno — PWA

Personal analytics tool per sonno e screen time. Nessun backend, nessuna dipendenza da build tool: HTML/CSS/JS puri, storage locale via IndexedDB.

## Struttura del progetto

```
index.html              punto di ingresso
manifest.json            metadati PWA (nome, icone, tema)
service-worker.js        cache offline + notifiche locali
css/styles.css           design system (variabili colore, layout, temi chiaro/scuro)
js/analytics.js          tutte le formule (pure, testabili) — vedi ANALYTICS_METHODOLOGY.md
js/db.js                 layer di storage (IndexedDB + localStorage per le preferenze)
js/app.js                stato dell'app e rendering dell'interfaccia
icons/                   icone PWA (192, 512, 512 maskable)
```

## Uso in locale

I service worker richiedono HTTPS o `localhost` — aprire il file `index.html` direttamente da filesystem (`file://`) non basta. Da questa cartella:

```bash
python3 -m http.server 8080
```

Poi apri `http://localhost:8080` dal browser del telefono (sulla stessa rete) o del computer.

## Deploy per uso reale

Qualunque hosting statico va bene — non serve un backend. Opzioni semplici e gratuite:

- **GitHub Pages**: pusha questa cartella in un repository, attiva Pages dalle impostazioni.
- **Netlify** o **Vercel**: trascina la cartella nella dashboard, o collega il repository.

Dopo il deploy, apri l'URL da Safari (iOS) o Chrome (Android) e usa "Aggiungi a Home" — a quel punto l'app è installata come le altre, con la propria icona, e su iOS 16.4+ i promemoria funzionano correttamente.

## Aggiornare l'app già installata

Il service worker usa una strategia "prima la rete": quando sei online l'app scarica sempre i file più recenti, offline usa l'ultima copia salvata. Dopo aver caricato file nuovi sul repository, chiudi del tutto l'app e riaprila (la prima volta dopo il passaggio da una versione vecchia può servire farlo due volte).

## Dati

Tutto resta sul dispositivo (IndexedDB, non sincronizzato altrove). L'export CSV nelle Impostazioni è sempre disponibile per portare i dati altrove — nessun lock-in.

## Stato del progetto

Copre la Fase 1–4 completa (raccolta dati, calendario, dashboard, export) più un'anteprima della Fase 6 (Sleep Consistency, Correlation Analysis, Optimal Zone) con le stesse formule di ANALYTICS_METHODOLOGY.md. I plausibility warning e il flusso di conferma outlier in fase di inserimento (§7.1 di ANALYTICS_METHODOLOGY.md) sono implementati e i flag vengono persistiti ed esportati nel CSV. Resta deferita a dopo un periodo di uso reale, come da roadmap, solo l'esclusione automatica delle notti outlier confermate dal calcolo del Consistency Score (§4.6 di ANALYTICS_METHODOLOGY.md) — oggi quelle notti sono visibili e flaggate ma non ancora escluse dal calcolo.
