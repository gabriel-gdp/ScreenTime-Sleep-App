// boot.js — eseguito nel <head>, prima del primo disegno della pagina.
// 1. Applica subito il tema salvato (o quello del sistema), così né la
//    schermata iniziale né l'app mostrano un lampo del tema sbagliato.
//    app.js poi applica lo stesso valore (stessa regola: js/app.js, state.theme).
// 2. Gestisce la schermata iniziale (#splash in index.html):
//    - compare solo al primo avvio della sessione (apertura dal browser o
//      dalla Home); non a ogni cambio di scheda (la navigazione non ricarica
//      la pagina) né ai ricaricamenti nella stessa sessione, come quello
//      dopo un aggiornamento del service worker;
//    - scompare quando l'app ha davvero finito il primo disegno (evento
//      `ssl:ready` da app.js), dopo al più SPLASH_MIN_MS dall'inizio
//      (il tempo della comparsa del logo e del nome): nessuna attesa finta;
//    - se l'avvio fallisce scompare comunque dopo SPLASH_FAILSAFE_MS, prima
//      del messaggio di errore dell'avvio (6 s, index.html);
//    - con "riduci movimento" non c'è movimento né attesa minima.
// Script classico, senza dipendenze; nessun dato viene letto o scritto
// oltre al tema (lettura) e a un segno in sessionStorage.
(function () {
  var d = document.documentElement;

  var theme = null;
  try { theme = localStorage.getItem('ssl_theme'); } catch (e) { /* archivio non disponibile */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  d.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14161C' : '#F6F3EE');

  var seen = false;
  try {
    seen = sessionStorage.getItem('ssl_splash_seen') === '1';
    sessionStorage.setItem('ssl_splash_seen', '1');
  } catch (e) { seen = false; }
  if (seen) { d.classList.add('splash-off'); return; }

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var SPLASH_MIN_MS = reduce ? 0 : 400;
  var SPLASH_EXIT_MS = reduce ? 120 : 260;
  var SPLASH_FAILSAFE_MS = 5000;
  var start = (window.performance && performance.now) ? performance.now() : Date.now();
  var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
  var hiding = false;
  d.classList.add('splash-on');

  function hide(reason) {
    if (hiding) return;
    hiding = true;
    var wait = Math.max(0, SPLASH_MIN_MS - (now() - start));
    setTimeout(function () {
      d.classList.add('splash-leaving');
      setTimeout(function () {
        var s = document.getElementById('splash');
        if (s && s.parentNode) s.parentNode.removeChild(s);
        d.classList.remove('splash-on', 'splash-leaving');
        d.classList.add('splash-off');
        d.setAttribute('data-splash-end', reason);
      }, SPLASH_EXIT_MS);
    }, wait);
  }

  document.addEventListener('ssl:ready', function () { hide('ready'); });
  setTimeout(function () { hide('failsafe'); }, SPLASH_FAILSAFE_MS);
})();
