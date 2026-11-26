// ui-profile.js — schermata Profilo (dati personali, storico del lavoro e
// delle routine, personalizzazione, backup del contesto) e blocchi di
// personalizzazione mostrati nel Diario e in Andamento.
// Separato da app.js, che gli passa solo gli strumenti di interfaccia
// comuni (deps). L'archivio contestuale è facoltativo: se non è
// disponibile la schermata lo dice e il resto dell'app non cambia.

import {
  TEXT_LIMITS, AGE_MIN, AGE_MAX, SEX_OPTIONS, CHRONOTYPE_OPTIONS, LEGACY_SHIFT_OPTIONS, SCREEN_FREE_GOALS,
  SLEEP_NEED_MIN, SLEEP_NEED_MAX, SLEEP_NEED_STEP, PROFILE_PREF_KEY,
  emptyProfile, validateProfile, displayAge, greetingName, isProfileEmpty, isBirthday, sameProfile,
} from './profile.js';
import {
  CATEGORIES, CATEGORY_LABELS, PERIOD_PROVENANCE, PERIOD_PROVENANCE_LABELS, WORK_SCHEDULES, WORK_SCHEDULE_LABELS,
  ROUTINE_KINDS, ROUTINE_KIND_LABELS, PERIOD_TEXT_LIMITS, DEFAULT_PERSONALIZATION, MIGRATION_PREF_KEY,
  emptyPeriodData, validatePeriod, periodSummaryText, lastIncludedDay, addDaysISO, newPeriodId,
  buildContextBackup, contextBackupFilename, parseContextBackup, planContextImport,
} from './context.js';
import * as DB from './context-db.js';
import { AVATARS, SKIN_TONES, HAIR_COLORS, avatarDef, isPerson, tonesFor, defaultAvatar, avatarSVG, avatarLabel, initialOf } from './avatars.js';
import { nightContext, contextHighlights, goalSuggestions } from './personalize.js';

const ctx = {
  status: 'loading', reason: '', profile: null, profileUnreadable: false, periods: [], personalization: { ...DEFAULT_PERSONALIZATION },
  migration: null, legacyCopy: false,
  draft: null, errors: {}, msg: null, clearPending: false, busy: false,
  periodForm: null, closeForm: null, deletePending: null, undo: null, periodMsg: null, prefMsg: null,
  importState: null, lastImportUndo: null, legacyRemovePending: false,
  avatarPicker: false, avatarMsg: null,
};
let env = null; // { getPref, removePref, todayISO, onChange }

export const getContextState = () => ctx;
export function contextGreetingName() { return ctx.status === 'ready' ? greetingName(ctx.profile) : ''; }
export function contextProfile() { return ctx.status === 'ready' ? ctx.profile : null; }
export function contextAvatar() { return ctx.status === 'ready' && ctx.profile ? ctx.profile.avatar || null : null; }

// Immagine del Profilo: l'avatar scelto, altrimenti l'iniziale del nome,
// altrimenti l'icona passata da chi chiama. size in px; label: testo
// alternativo (vuoto = decorativa).
export function avatarBadgeHTML(profile, { size = 32, label = '', fallbackIcon = '' } = {}) {
  const av = profile && profile.avatar;
  if (av) return `<span class="avatar" style="width:${size}px;height:${size}px">${avatarSVG(av, { size, label })}</span>`;
  const ini = initialOf(greetingName(profile));
  if (ini) return `<span class="avatar avatar-initial" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px"${label ? ` role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : ' aria-hidden="true"'}>${ini.replace(/[&<>]/g, '')}</span>`;
  return fallbackIcon;
}
export function contextBirthday(todayISO) { return ctx.status === 'ready' && ctx.profile ? isBirthday(ctx.profile.birthDate, todayISO) : false; }

function applyLoaded(r) {
  ctx.status = 'ready';
  ctx.profile = r.profile || null;
  ctx.profileUnreadable = !!r.profileUnreadable;
  ctx.periods = r.periods || [];
  const p = (r.preferences || []).find((x) => x.key === 'personalization');
  ctx.personalization = { ...DEFAULT_PERSONALIZATION, ...(p && p.value ? p.value : {}) };
  const m = (r.preferences || []).find((x) => x.key === MIGRATION_PREF_KEY);
  ctx.migrationRecord = m ? m.value : null;
}

async function reload() {
  const r = await DB.loadContext();
  if (!r.ok) { ctx.status = 'unavailable'; ctx.reason = r.reason; return false; }
  applyLoaded(r);
  return true;
}

// Avvio: apre l'archivio, esegue (se serve) la migrazione del vecchio
// profilo, carica tutto. Non blocca il Diario: chi chiama non attende.
export async function initContext(e) {
  env = e;
  ctx.status = 'loading';
  if (!(await reload())) { env.onChange(); return; }
  await runMigration();
  env.onChange();
}

async function runMigration() {
  const res = await DB.migrateLegacyProfile(() => env.getPref(PROFILE_PREF_KEY, ''), env.todayISO());
  ctx.migration = res.status === 'already' || res.status === 'done' ? null : res;
  if (res.status === 'done' && res.record && res.record.status === 'migrated') ctx.migrationDone = res.record;
  await reload();
  ctx.legacyCopy = !!env.getPref(PROFILE_PREF_KEY, '');
}

export async function retryContext() {
  DB.resetContextConnection();
  await initContext(env);
}

// ---------- Utilità di formattazione ----------
const fmtDay = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; };
const REASON_TEXT = {
  unavailable: 'il browser non permette di usare l\'archivio (per esempio in navigazione privata)',
  timeout: 'l\'archivio non ha risposto in tempo (forse è aperto in un\'altra scheda)',
  corrupt: 'l\'archivio è danneggiato',
  newer_version: 'l\'archivio è stato creato da una versione più recente dell\'app',
  quota: 'lo spazio di archiviazione è esaurito',
  failed: 'la scrittura non è riuscita',
  aborted: 'la scrittura è stata interrotta',
  verify_failed: 'la verifica dopo il salvataggio non ha dato esito positivo',
  unreadable_existing: 'il profilo salvato è stato scritto da una versione più recente dell\'app',
  mark_failed: 'non è stato possibile registrare il completamento',
};
const reasonText = (r) => REASON_TEXT[r] || 'errore sconosciuto';

// ---------- Schermata Profilo ----------
export function renderProfile(d) {
  const { tabContent, msgHTML, escapeHTML: esc, ICONS, todayISO } = d;
  const today = todayISO();
  if (ctx.status === 'loading') { tabContent().innerHTML = '<section class="card card-pad"><h2 class="settings-title">Profilo</h2><p class="muted">Caricamento…</p></section>'; return; }
  if (ctx.status === 'unavailable') {
    tabContent().innerHTML = `
      <section class="card card-pad" aria-labelledby="profile-title">
        <h2 class="settings-title" id="profile-title">Profilo</h2>
        ${msgHTML(`Il Profilo non è disponibile: ${esc(reasonText(ctx.reason))}. Il Diario, le statistiche e le analisi funzionano normalmente; la personalizzazione è disattivata.`, 'warn', 'profile-unavailable')}
        <button type="button" class="btn-ghost" id="profile-retry">Riprova</button>
      </section>`;
    d.root.querySelector('#profile-retry').addEventListener('click', async () => { await retryContext(); });
    return;
  }
  const p = ctx.draft || ctx.profile || emptyProfile();
  const err = ctx.errors || {};
  const dirty = !!ctx.draft;
  const age = displayAge(ctx.profile, today);
  const opts = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${String(k) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const errP = (k) => (err[k] ? `<p class="pf-error" id="pf-${k}-err">${esc(err[k])}</p>` : '');
  const inv = (k) => (err[k] ? ` aria-invalid="true" aria-describedby="pf-${k}-err"` : '');
  const help = (h, k) => (h ? `<p class="muted small" id="pf-${k}-help">${h}</p>` : '');
  const text = (k, label, h = '', extra = '') => `
    <div class="pf-field"><label for="pf-${k}">${label}</label>
      <input type="text" class="pf-input" id="pf-${k}" data-pf="${k}" value="${esc(p[k])}" maxlength="${TEXT_LIMITS[k]}" ${extra}${inv(k)}>
      ${help(h, k)}${errP(k)}</div>`;
  const select = (k, label, list, h = '') => `
    <div class="pf-field"><label for="pf-${k}">${label}</label>
      <select class="pf-input" id="pf-${k}" data-pf="${k}"${inv(k)}>${opts(list, p[k])}</select>
      ${help(h, k)}${errP(k)}</div>`;
  const area = (k, label, h = '') => `
    <div class="pf-field"><label for="pf-${k}">${label}</label>
      <textarea class="pf-input" id="pf-${k}" data-pf="${k}" maxlength="${TEXT_LIMITS[k]}" rows="${k === 'notes' ? 4 : 2}"${inv(k)}>${esc(p[k])}</textarea>
      ${help(h, k)}${errP(k)}</div>`;
  const needOpts = [['', 'Non indicato']];
  for (let m = SLEEP_NEED_MIN; m <= SLEEP_NEED_MAX; m += SLEEP_NEED_STEP) needOpts.push([m, fmtDur(m)]);
  const ageLine = age ? `${age.years} ${age.years === 1 ? 'anno' : 'anni'}${age.source === 'manual' ? ' (scritta a mano: non si aggiorna da sola)' : ' (calcolata dalla data di nascita)'}` : '';
  const name = [ctx.profile && ctx.profile.firstName, ctx.profile && ctx.profile.lastName].filter(Boolean).join(' ') || greetingName(ctx.profile);
  const summary = isProfileEmpty(ctx.profile)
    ? '<p class="muted" id="profile-summary">Nessun dato inserito. Tutti i campi sono facoltativi.</p>'
    : `<p class="profile-name" id="profile-summary">${esc(name || 'Profilo')}${ageLine ? `<span class="muted"> · ${ageLine}</span>` : ''}</p>`;
  const msg = ctx.msg && ctx.msg.text ? msgHTML(esc(ctx.msg.text), ctx.msg.type, 'profile-msg') : '';
  const legacy = p.legacy ? `
      <div class="pf-legacy" id="pf-legacy">
        <p><strong>Dal profilo precedente, senza date</strong>: ${[p.legacy.occupation ? `professione «${esc(p.legacy.occupation)}»` : '', p.legacy.shiftWork ? `lavoro su turni: ${esc(LEGACY_SHIFT_OPTIONS[p.legacy.shiftWork].toLowerCase())}` : ''].filter(Boolean).join('; ')}.</p>
        <p class="muted small">Ora lavoro e turni sono periodi con date, così possono descrivere anche le notti passate. Per usarli crea un periodo indicando da quando valgono: l'app non inventa la data d'inizio.</p>
        <button type="button" class="btn-ghost" id="pf-legacy-to-period">Crea un periodo con questi valori</button>
        <button type="button" class="btn-ghost" id="pf-legacy-dismiss">Togli questi valori dal profilo</button>
      </div>` : '';
  tabContent().innerHTML = `
    <section class="card card-pad" aria-labelledby="profile-title">
      <h2 class="settings-title" id="profile-title">Profilo</h2>
      <div class="pf-head">
        <div class="pf-head-avatar" id="profile-avatar">${avatarBadgeHTML(ctx.profile, { size: 88, label: ctx.profile && ctx.profile.avatar ? `Immagine del profilo: ${avatarLabel(ctx.profile.avatar)}` : '', fallbackIcon: `<span class="avatar avatar-initial avatar-empty" style="width:88px;height:88px" aria-hidden="true">${ICONS.user}</span>` })}</div>
        <div class="pf-head-text">
          ${summary}
          ${ctx.profileUnreadable ? '' : `<button type="button" class="btn-ghost" id="avatar-toggle" aria-expanded="${ctx.avatarPicker}" aria-controls="avatar-picker">${ctx.avatarPicker ? 'Chiudi la scelta' : 'Cambia immagine'}</button>`}
        </div>
      </div>
      ${ctx.avatarPicker && !ctx.profileUnreadable ? avatarPickerHTML(d) : ''}
      <p class="muted small" id="profile-scope">Serve a personalizzare l'app e a dare un contesto alle tue notti. Resta su questo dispositivo, in un archivio separato dal diario; non cambia i dati delle notti, le statistiche né le tre domande su schermo e sonno. Tutti i campi sono facoltativi.</p>
      ${migrationNoticeHTML(msgHTML, esc)}
      ${ctx.profileUnreadable ? msgHTML('Il profilo salvato è stato scritto da una versione più recente dell\'app e non viene letto né modificato da questa versione.', 'warn', 'profile-unreadable') : ''}
    </section>
    ${ctx.profileUnreadable ? '' : `
    <form class="card card-pad" id="profile-form" novalidate aria-labelledby="pf-who-title">
      <h3 class="settings-title" id="pf-who-title">Chi sei</h3>
      ${text('firstName', 'Nome', '', 'autocomplete="given-name"')}
      ${text('lastName', 'Cognome', '', 'autocomplete="family-name"')}
      ${text('displayName', 'Come vuoi essere chiamato', 'Usato nel saluto al posto del nome.', 'autocomplete="nickname"')}
      <h3 class="settings-title pf-section">Età</h3>
      <div class="pf-field"><label for="pf-birthDate">Data di nascita</label>
        <input type="date" class="pf-input" id="pf-birthDate" data-pf="birthDate" value="${esc(p.birthDate)}" max="${today}" autocomplete="bday"${inv('birthDate')}>
        ${errP('birthDate')}</div>
      <div class="pf-field"><label for="pf-ageManual">Oppure l'età in anni</label>
        <input type="text" inputmode="numeric" pattern="[0-9]*" class="pf-input pf-short" id="pf-ageManual" data-pf="ageManual" value="${esc(p.ageManual)}" maxlength="3" autocomplete="off"${inv('ageManual')}>
        <p class="muted small">Da ${AGE_MIN} a ${AGE_MAX}. Usata solo se non indichi la data di nascita.</p>${errP('ageManual')}</div>
      <h3 class="settings-title pf-section">Altre informazioni</h3>
      ${select('sex', 'Sesso', SEX_OPTIONS)}
      ${text('gender', 'Genere', 'Facoltativo, con le parole che preferisci.')}
      ${select('chronotype', 'Ti senti più mattiniero o nottambulo?', CHRONOTYPE_OPTIONS, 'Una tua impressione, non una misura.')}
      ${legacy}
      <h3 class="settings-title pf-section">Sonno e obiettivi</h3>
      ${select('sleepNeedMin', 'Di quanto sonno senti di aver bisogno?', needOpts, 'Una tua percezione, distinta dal sonno misurato nel diario. Serve a confrontarli negli spunti.')}
      <div class="pf-field"><label for="pf-goalAttemptTime">Vorrei provare a dormire entro le</label>
        <input type="time" class="pf-input pf-short" id="pf-goalAttemptTime" data-pf="goalAttemptTime" value="${esc(p.goalAttemptTime)}"${inv('goalAttemptTime')}>${errP('goalAttemptTime')}</div>
      ${select('goalScreenFreeMin', 'Vorrei smettere di usare lo schermo almeno', [['', 'Nessun obiettivo'], ...SCREEN_FREE_GOALS.map((m) => [m, `${m} minuti prima di provare a dormire`])])}
      ${area('goal', 'Un obiettivo con parole tue', 'Solo un promemoria per te: l\'app non lo interpreta.')}
      ${area('notes', 'Note')}
      <button type="submit" class="btn-primary" id="profile-save" ${dirty && !ctx.busy ? '' : 'aria-disabled="true"'}>${ICONS.check}<span>${ctx.busy ? 'Salvataggio…' : dirty ? 'Salva profilo' : 'Profilo salvato'}</span></button>
      <div aria-live="polite">${msg}</div>
    </form>`}
    ${periodsSectionHTML(d)}
    ${personalizationSectionHTML(d)}
    ${backupSectionHTML(d)}
    ${dangerSectionHTML(d)}
  `;
  attachProfileListeners(d);
}

function avatarPickerHTML(d) {
  const esc = d.escapeHTML;
  const cur = (ctx.profile && ctx.profile.avatar) || null;
  const ini = initialOf(greetingName(ctx.profile));
  const opt = (id, inner, label) => {
    const on = id === '' ? !cur : !!cur && cur.id === id;
    return `<button type="button" class="avatar-opt" data-avatar-pick="${id}" aria-pressed="${on}" aria-label="${esc(label)}">${inner}</button>`;
  };
  const options = [
    opt('', `<span class="avatar avatar-initial" style="width:56px;height:56px;font-size:24px" aria-hidden="true">${ini ? esc(ini) : d.ICONS.user}</span>`, ini ? `Nessuna immagine: iniziale ${ini}` : 'Nessuna immagine'),
    ...AVATARS.map((a) => {
      const v = cur && cur.id === a.id ? cur : defaultAvatar(a.id);
      return opt(a.id, `<span class="avatar" style="width:56px;height:56px">${avatarSVG(v, { size: 56 })}</span>`, a.label + (a.note ? ` (${a.note})` : ''));
    }),
  ].join('');
  let variants = '';
  if (cur) {
    const def = avatarDef(cur.id);
    const tones = tonesFor(cur.id);
    const sw = (attr, list, curId, title, colorOf) => `
      <fieldset class="avatar-var"><legend>${title}</legend><div class="swatches">
        ${list.map((t) => `<button type="button" class="swatch" ${attr}="${t.id}" aria-pressed="${t.id === curId}" aria-label="${esc(t.label)}" title="${esc(t.label)}"><span style="background:${colorOf(t)}"></span></button>`).join('')}
      </div></fieldset>`;
    if (def.kind === 'person') {
      variants += sw('data-avatar-tone', SKIN_TONES, cur.tone, 'Carnagione', (t) => t.skin);
      variants += sw('data-avatar-hair', HAIR_COLORS, cur.hair, 'Capelli', (t) => t.color);
    } else if (tones.length > 1) {
      variants += sw('data-avatar-tone', tones, cur.tone, 'Colore', (t) => t.a);
    }
    variants += `<label class="check-row"><input type="checkbox" id="avatar-glasses" ${cur.glasses ? 'checked' : ''}><span>Occhiali</span></label>`;
  }
  const m = ctx.avatarMsg ? d.msgHTML(esc(ctx.avatarMsg.text), ctx.avatarMsg.type, 'avatar-msg') : '';
  return `
    <div class="avatar-picker" id="avatar-picker" role="group" aria-labelledby="avatar-picker-title">
      <p class="avatar-picker-title" id="avatar-picker-title">Scegli un'immagine</p>
      <div class="avatar-grid">${options}</div>
      ${variants ? `<div class="avatar-variants">${variants}</div>` : ''}
      <p class="muted small">Disegni inclusi nell'app: nessuna foto, nulla esce dal telefono. Ogni scelta si salva subito.</p>
      <div aria-live="polite">${m}</div>
    </div>`;
}

function migrationNoticeHTML(msgHTML, esc) {
  const m = ctx.migration;
  let out = '';
  if (m && m.status === 'failed') {
    const why = m.reason === 'corrupt' ? 'non è leggibile' : m.reason === 'unknown_version' ? `ha una versione sconosciuta (${esc(String(m.version))})` : `non è stato trasferito: ${esc(reasonText(m.reason))}`;
    out += `<div class="pf-migration" id="profile-migration">${msgHTML(`Il profilo della versione precedente ${why}. Non è stato modificato né cancellato.`, 'warn')}
      <button type="button" class="btn-ghost" id="mig-retry">Riprova</button>
      ${m.reason === 'corrupt' || m.reason === 'unknown_version' ? '<button type="button" class="btn-ghost" id="mig-skip">Inizia un profilo nuovo</button><p class="muted small">La copia del vecchio profilo resta comunque sul dispositivo.</p>' : ''}</div>`;
  } else if (m && m.status === 'conflict') {
    out += `<div class="pf-migration" id="profile-migration">${msgHTML('Esiste già un profilo nel nuovo archivio, diverso da quello della versione precedente. Nessuno dei due è stato sovrascritto: scegli quale tenere.', 'warn')}
      <button type="button" class="btn-ghost" id="mig-keep">Tieni il profilo attuale</button>
      <button type="button" class="btn-ghost" id="mig-legacy">Usa quello precedente</button></div>`;
  }
  if (ctx.migrationDone && ctx.migrationDone.dropped && ctx.migrationDone.dropped.length) {
    out += msgHTML(`Profilo trasferito nel nuovo archivio. Alcuni valori non validi non sono stati copiati (${esc(ctx.migrationDone.dropped.join(', '))}); restano nella copia del vecchio profilo.`, 'info', 'profile-migrated');
  }
  return out;
}

// ---------- Storico dei periodi ----------
function periodItemHTML(p, d) {
  const esc = d.escapeHTML;
  const last = lastIncludedDay(p);
  const when = `dal ${fmtDay(p.validFrom)} ${last ? `al ${fmtDay(last)}` : 'a oggi (in corso)'}`;
  const closing = ctx.closeForm && ctx.closeForm.id === p.id;
  const deleting = ctx.deletePending === p.id;
  return `
    <li class="period-item" data-period-id="${esc(p.id)}">
      <p class="period-title">${esc(periodSummaryText(p))}</p>
      <p class="muted small">${when} · <span class="period-prov prov-${esc(p.provenance)}">${esc(PERIOD_PROVENANCE_LABELS[p.provenance])}</span></p>
      ${closing ? `
        <div class="pf-field"><label for="close-last">Ultimo giorno del periodo</label>
          <input type="date" class="pf-input pf-short" id="close-last" value="${esc(ctx.closeForm.lastDay)}" min="${esc(p.validFrom)}"${ctx.closeForm.error ? ' aria-invalid="true" aria-describedby="close-err"' : ''}>
          ${ctx.closeForm.error ? `<p class="pf-error" id="close-err">${esc(ctx.closeForm.error)}</p>` : ''}</div>
        <div class="period-actions"><button type="button" class="btn-ghost" id="close-confirm">Termina il periodo</button><button type="button" class="btn-ghost" id="close-cancel">Annulla</button></div>` : `
        <div class="period-actions">
          <button type="button" class="btn-ghost" data-period-edit="${esc(p.id)}">Modifica</button>
          ${p.validTo == null ? `<button type="button" class="btn-ghost" data-period-close="${esc(p.id)}">Termina</button>` : ''}
          <button type="button" class="btn-ghost ${deleting ? 'pf-danger' : ''}" data-period-delete="${esc(p.id)}">${deleting ? 'Conferma: elimina' : 'Elimina'}</button>
          ${deleting ? '<button type="button" class="btn-ghost" id="period-delete-cancel">Annulla</button>' : ''}
        </div>`}
    </li>`;
}

function periodFormHTML(d) {
  const f = ctx.periodForm;
  const esc = d.escapeHTML;
  const v = f.values, e = f.errors || {};
  const today = d.todayISO();
  const inv = (k) => (e[k] ? ` aria-invalid="true" aria-describedby="per-${k}-err"` : '');
  const errP = (k) => (e[k] && k !== 'overlap' ? `<p class="pf-error" id="per-${k}-err">${esc(e[k])}</p>` : '');
  const data = v.data;
  const fields = f.category === 'work' ? `
      <div class="pf-field"><label for="per-occupation">Professione o attività</label>
        <input type="text" class="pf-input" id="per-occupation" data-per="occupation" value="${esc(data.occupation)}" maxlength="${PERIOD_TEXT_LIMITS.occupation}"${inv('occupation')}>${errP('occupation')}</div>
      <div class="pf-field"><label for="per-schedule">Tipo di orario</label>
        <select class="pf-input" id="per-schedule" data-per="schedule"${inv('schedule')}><option value="">Scegli…</option>${WORK_SCHEDULES.map((k) => `<option value="${k}" ${data.schedule === k ? 'selected' : ''}>${esc(WORK_SCHEDULE_LABELS[k])}</option>`).join('')}</select>${errP('schedule')}</div>
      <fieldset class="pf-field pf-days"><legend>Giorni di lavoro o studio</legend>
        <div class="tpl-days">${[1, 2, 3, 4, 5, 6, 0].map((i) => `<label class="day-check"><input type="checkbox" data-per-day="${i}" ${data.workDays.includes(i) ? 'checked' : ''}><span>${['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][i]}</span></label>`).join('')}</div>
        <p class="muted small">Il giorno è quello del risveglio, come nel diario.</p>${errP('workDays')}</fieldset>
      <div class="pf-row3">
        <div class="pf-field"><label for="per-start">Inizio</label><input type="time" class="pf-input" id="per-start" data-per="start" value="${esc(data.start)}"${inv('start')}>${errP('start')}</div>
        <div class="pf-field"><label for="per-end">Fine</label><input type="time" class="pf-input" id="per-end" data-per="end" value="${esc(data.end)}"${inv('end')}>${errP('end')}</div>
        <div class="pf-field"><label for="per-alarm">Sveglia</label><input type="time" class="pf-input" id="per-alarm" data-per="alarm" value="${esc(data.alarm)}"${inv('alarm')}>${errP('alarm')}</div>
      </div>
      <p class="muted small">Sveglia: l'orario fisso nei giorni di lavoro o studio, se c'è. Tutti gli orari sono facoltativi.</p>` : `
      <div class="pf-field"><label for="per-kind">Tipo</label>
        <select class="pf-input" id="per-kind" data-per="kind"${inv('kind')}><option value="">Scegli…</option>${ROUTINE_KINDS.map((k) => `<option value="${k}" ${data.kind === k ? 'selected' : ''}>${esc(ROUTINE_KIND_LABELS[k])}</option>`).join('')}</select>${errP('kind')}</div>
      <div class="pf-field"><label for="per-label">Nome breve (facoltativo)</label>
        <input type="text" class="pf-input" id="per-label" data-per="label" value="${esc(data.label)}" maxlength="${PERIOD_TEXT_LIMITS.label}"${inv('label')}>${errP('label')}</div>
      <div class="pf-field"><label for="per-note">Note (facoltative)</label>
        <textarea class="pf-input" id="per-note" data-per="note" rows="2" maxlength="${PERIOD_TEXT_LIMITS.note}"${inv('note')}>${esc(data.note)}</textarea>${errP('note')}</div>`;
  const pastStart = v.validFrom && v.validFrom < addDaysISO(today, -1);
  const overlapList = e.overlap ? ctx.periods.filter((o) => e.overlap.includes(o.id)) : [];
  return `
    <form class="period-form" id="period-form" novalidate aria-labelledby="period-form-title">
      <h4 class="settings-title" id="period-form-title">${f.mode === 'edit' ? 'Modifica il periodo' : `Nuovo periodo: ${esc(CATEGORY_LABELS[f.category].toLowerCase())}`}</h4>
      ${fields}
      <div class="pf-row2">
        <div class="pf-field"><label for="per-validFrom">Primo giorno</label>
          <input type="date" class="pf-input" id="per-validFrom" data-per="validFrom" value="${esc(v.validFrom)}"${inv('validFrom')}>${errP('validFrom')}</div>
        <div class="pf-field"><label for="per-lastDay">Ultimo giorno</label>
          <input type="date" class="pf-input" id="per-lastDay" data-per="lastDay" value="${esc(v.lastDay)}" aria-describedby="per-lastDay-help"${e.validTo ? ' aria-invalid="true"' : ''}>
          <p class="muted small" id="per-lastDay-help">Vuoto se è ancora in corso.</p>${e.validTo ? `<p class="pf-error" id="per-validTo-err">${esc(e.validTo)}</p>` : ''}</div>
      </div>
      <fieldset class="pf-field" id="per-provenance-group"${e.provenance ? ' aria-describedby="per-provenance-err"' : ''}><legend>Come conosci questo periodo?</legend>
        ${PERIOD_PROVENANCE.map((k) => {
          const disabled = k === 'contemporaneous' && pastStart && v.provenance !== 'contemporaneous';
          return `<label class="radio-row"><input type="radio" name="per-provenance" value="${k}" ${v.provenance === k ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${esc(PERIOD_PROVENANCE_LABELS[k].charAt(0).toUpperCase() + PERIOD_PROVENANCE_LABELS[k].slice(1))}${k === 'contemporaneous' ? ' (lo stai indicando mentre inizia)' : k === 'declared_later' ? ' (date e dettagli che ricordi con sicurezza)' : k === 'retrospective' ? ' (ricostruito, con date approssimative)' : ''}</span></label>`;
        }).join('')}
        ${errP('provenance')}</fieldset>
      ${overlapList.length ? `<p class="pf-error" id="per-overlap-err" role="alert">Si sovrappone a: ${overlapList.map((o) => `${esc(periodSummaryText(o))} (dal ${fmtDay(o.validFrom)}${o.validTo ? ` al ${fmtDay(lastIncludedDay(o))}` : ', in corso'})`).join('; ')}. Termina prima quel periodo o cambia le date.</p>` : ''}
      <div class="period-actions"><button type="submit" class="btn-primary" id="period-save" ${ctx.busy ? 'aria-disabled="true"' : ''}>${ctx.busy ? 'Salvataggio…' : 'Salva periodo'}</button><button type="button" class="btn-ghost" id="period-cancel">Annulla</button></div>
    </form>`;
}

function periodsSectionHTML(d) {
  const esc = d.escapeHTML;
  const byCat = (c) => ctx.periods.filter((p) => p.category === c).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  const pm = ctx.periodMsg ? `<div class="period-msg" id="period-msg" role="status">${d.msgHTML(esc(ctx.periodMsg.text), ctx.periodMsg.type)}${ctx.undo ? `<button type="button" class="btn-ghost" id="period-undo">Annulla: ${esc(ctx.undo.label)}</button>` : ''}</div>` : '';
  return `
    <section class="card card-pad" aria-labelledby="periods-title" id="periods-section">
      <h3 class="settings-title" id="periods-title">Lavoro e routine nel tempo</h3>
      <p class="muted small">Le informazioni che cambiano nel tempo hanno un primo e un ultimo giorno. Puoi inserire anche periodi passati: restano distinti, secondo come li conosci, da quelli registrati all'epoca. Due periodi della stessa categoria non possono sovrapporsi.</p>
      ${pm}
      ${CATEGORIES.map((c) => `
        <h4 class="period-cat">${esc(CATEGORY_LABELS[c])}</h4>
        ${byCat(c).length ? `<ul class="period-list">${byCat(c).map((p) => periodItemHTML(p, d)).join('')}</ul>` : '<p class="muted small">Nessun periodo indicato.</p>'}
        ${ctx.periodForm && ctx.periodForm.category === c ? periodFormHTML(d) : `<button type="button" class="btn-ghost" data-period-add="${c}">+ Aggiungi ${c === 'work' ? 'un periodo di lavoro o studio' : 'una routine particolare'}</button>`}
      `).join('')}
    </section>`;
}

function personalizationSectionHTML(d) {
  const p = ctx.personalization;
  const row = (k, label, help) => `<label class="check-row"><input type="checkbox" data-pers="${k}" ${p[k] ? 'checked' : ''}><span>${label}<span class="row-help">${help}</span></span></label>`;
  return `
    <section class="card card-pad" aria-labelledby="pers-title">
      <h3 class="settings-title" id="pers-title">Personalizzazione</h3>
      ${row('contextNotes', 'Contesto della notte nel Diario', 'Periodo di lavoro o routine valido quella notte e confronto con la sveglia dichiarata.')}
      ${row('highlights', 'Confronti tra periodi in Andamento', 'Orari e durata del sonno nei diversi periodi, con il numero di notti.')}
      ${row('suggestions', 'Spunti legati ai tuoi obiettivi', 'Solo se hai indicato un obiettivo e ci sono abbastanza notti registrate.')}
      ${ctx.prefMsg ? d.msgHTML(d.escapeHTML(ctx.prefMsg.text), ctx.prefMsg.type, 'pers-msg') : ''}
    </section>`;
}

function backupSectionHTML(d) {
  const esc = d.escapeHTML;
  const s = ctx.importState;
  let panel = '';
  if (s && s.error) panel = d.msgHTML(esc(s.error), 'error', 'ctx-import-error');
  else if (s && s.plan) {
    const pl = s.plan;
    const profLine = { add: 'il profilo del file verrà aggiunto', identical: 'il profilo è identico a quello attuale', conflict: 'il profilo del file è diverso da quello attuale: resta quello attuale', keep: 'il file non contiene un profilo: resta quello attuale', none: 'nessun profilo' }[pl.profile];
    panel = `
      <div class="import-panel" id="ctx-import-panel" role="region" aria-label="Riepilogo del ripristino del contesto">
        <p><strong>${esc(s.fileName || 'File')}</strong>${s.data.exportedAt ? ` · creato il ${fmtDay(s.data.exportedAt.slice(0, 10))}` : ''}</p>
        <ul class="small">
          <li>Periodi nuovi da aggiungere: ${pl.add.length}</li>
          <li>Periodi identici (nessuna modifica): ${pl.identical.length}</li>
          <li>Periodi diversi da quelli salvati (restano quelli salvati): ${pl.conflicts.length}</li>
          <li>Periodi che si sovrappongono a quelli salvati (non aggiunti): ${pl.overlaps.length}</li>
          <li>Profilo: ${profLine}</li>
          ${s.ignored ? `<li>Preferenze sconosciute ignorate: ${s.ignored}</li>` : ''}
        </ul>
        <button type="button" class="btn-ghost" id="ctx-import-merge" ${s.busy ? 'disabled' : ''}>Aggiungi i nuovi</button>
        <button type="button" class="btn-ghost ${s.confirmReplace ? 'pf-danger' : ''}" id="ctx-import-replace" ${s.busy ? 'disabled' : ''}>${s.confirmReplace ? 'Conferma: sostituisci tutto il contesto' : 'Sostituisci tutto il contesto'}</button>
        <button type="button" class="btn-ghost" id="ctx-import-cancel">Annulla</button>
        <p class="muted small">"Sostituisci" cancella profilo, periodi e preferenze attuali e scrive quelli del file. Le notti del diario non sono mai toccate.</p>
      </div>`;
  } else if (s && s.done) {
    panel = `${d.msgHTML(esc(s.text), s.ok ? 'info' : 'error', 'ctx-import-done')}${s.ok && ctx.lastImportUndo ? '<button type="button" class="btn-ghost" id="ctx-import-undo">Annulla il ripristino</button>' : ''}`;
  }
  return `
    <section class="card card-pad" aria-labelledby="ctx-backup-title">
      <h3 class="settings-title" id="ctx-backup-title">Backup del profilo e del contesto</h3>
      <p class="muted small">File separato dal backup delle notti: contiene profilo, periodi e preferenze della personalizzazione. Se cancelli i dati del sito o del browser, o disinstalli l'app, profilo e contesto si perdono come le notti: salva entrambi i backup e conservali fuori dal telefono.</p>
      <div class="data-actions">
        <button type="button" class="btn-ghost" id="ctx-export">${d.ICONS.download}<span>Salva backup del contesto</span></button>
        <button type="button" class="btn-ghost" id="ctx-restore" ${s && s.busy ? 'disabled' : ''}>${d.ICONS.upload}<span>Ripristina il contesto</span></button>
        <input type="file" id="ctx-restore-file" accept="application/json,.json" class="visually-hidden" tabindex="-1" aria-hidden="true" aria-label="File di backup del contesto">
      </div>
      <div aria-live="polite">${panel}</div>
    </section>`;
}

function dangerSectionHTML(d) {
  const parts = [];
  if (!isProfileEmpty(ctx.profile)) {
    parts.push(`<p class="muted">Toglie i dati del profilo da questo dispositivo. Periodi, notti e impostazioni non cambiano.</p>
      <button type="button" class="btn-ghost ${ctx.clearPending ? 'pf-danger' : ''}" id="profile-clear">${ctx.clearPending ? 'Conferma: cancella il profilo' : 'Cancella profilo'}</button>
      ${ctx.clearPending ? '<button type="button" class="btn-ghost" id="profile-clear-cancel">Annulla</button>' : ''}`);
  }
  if (ctx.legacyCopy && ctx.migrationRecord && ['migrated', 'skipped'].includes(ctx.migrationRecord.status)) {
    parts.push(`<p class="muted small" id="legacy-copy-note">Sul dispositivo resta anche la copia del profilo della versione precedente, conservata per sicurezza dopo il trasferimento.</p>
      <button type="button" class="btn-ghost ${ctx.legacyRemovePending ? 'pf-danger' : ''}" id="legacy-remove">${ctx.legacyRemovePending ? 'Conferma: rimuovi la vecchia copia' : 'Rimuovi la vecchia copia'}</button>`);
  }
  if (!parts.length) return '';
  return `<section class="card card-pad" aria-labelledby="pf-clear-title"><h3 class="settings-title" id="pf-clear-title">Cancellazione</h3>${parts.join('')}</section>`;
}

// ---------- Azioni ----------
function setMsg(type, text) { ctx.msg = { type, text }; }

function attachProfileListeners(d) {
  const { root } = d;
  const rerender = () => renderProfile(d);
  const keepFocus = (sel) => { const el = root.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
  // Immagine del Profilo: ogni scelta si salva subito (solo l'immagine:
  // eventuali modifiche non salvate agli altri campi restano nel modulo).
  const avToggle = root.querySelector('#avatar-toggle');
  if (avToggle) avToggle.addEventListener('click', () => { ctx.avatarPicker = !ctx.avatarPicker; ctx.avatarMsg = null; rerender(); keepFocus(ctx.avatarPicker ? '#avatar-picker [aria-pressed="true"]' : '#avatar-toggle'); });
  const saveAvatar = async (next, focusSel) => {
    if (ctx.busy) return; // doppio tocco: ignorato
    const base = ctx.profile || emptyProfile();
    const { profile, errors } = validateProfile({ ...base, avatar: next }, d.todayISO());
    if (errors.avatar) { ctx.avatarMsg = { type: 'error', text: errors.avatar }; rerender(); return; }
    ctx.busy = true;
    const r = await DB.saveProfile(profile);
    ctx.busy = false;
    if (r.ok) {
      ctx.profile = profile;
      if (ctx.draft) ctx.draft = { ...ctx.draft, avatar: next };
      ctx.avatarMsg = { type: 'info', text: next ? `Immagine salvata: ${avatarLabel(next)}.` : 'Immagine tolta: si vede l\'iniziale del nome.' };
      d.render();
    } else {
      ctx.avatarMsg = { type: 'error', text: `Immagine NON salvata: ${reasonText(r.reason)}.` };
      rerender();
    }
    keepFocus(focusSel);
  };
  root.querySelectorAll('[data-avatar-pick]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.avatarPick;
    const cur = (ctx.profile && ctx.profile.avatar) || null;
    if (id === '') { saveAvatar(null, '[data-avatar-pick=""]'); return; }
    if (cur && cur.id === id) return;
    saveAvatar(defaultAvatar(id), `[data-avatar-pick="${id}"]`);
  }));
  root.querySelectorAll('[data-avatar-tone]').forEach((b) => b.addEventListener('click', () => {
    const cur = ctx.profile && ctx.profile.avatar; if (!cur) return;
    saveAvatar({ ...cur, tone: b.dataset.avatarTone }, `[data-avatar-tone="${b.dataset.avatarTone}"]`);
  }));
  root.querySelectorAll('[data-avatar-hair]').forEach((b) => b.addEventListener('click', () => {
    const cur = ctx.profile && ctx.profile.avatar; if (!cur) return;
    saveAvatar({ ...cur, hair: b.dataset.avatarHair }, `[data-avatar-hair="${b.dataset.avatarHair}"]`);
  }));
  const gl = root.querySelector('#avatar-glasses');
  if (gl) gl.addEventListener('change', () => {
    const cur = ctx.profile && ctx.profile.avatar; if (!cur) return;
    saveAvatar({ ...cur, glasses: gl.checked }, '#avatar-glasses');
  });
  const form = root.querySelector('#profile-form');
  if (form) {
    const values = () => {
      const v = {};
      form.querySelectorAll('[data-pf]').forEach((el) => { v[el.dataset.pf] = el.value; });
      return v;
    };
    form.addEventListener('input', () => {
      ctx.draft = { ...(ctx.draft || ctx.profile || emptyProfile()), ...values() };
      ctx.clearPending = false;
      const btn = root.querySelector('#profile-save');
      if (!ctx.busy) { btn.removeAttribute('aria-disabled'); btn.querySelector('span').textContent = 'Salva profilo'; }
      const m = root.querySelector('#profile-msg'); if (m) m.remove();
      ctx.msg = null;
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!ctx.draft || ctx.busy) return; // doppio tocco: ignorato
      const { profile, errors } = validateProfile({ ...ctx.draft, ...values() }, d.todayISO());
      ctx.errors = errors;
      if (Object.keys(errors).length) {
        setMsg('error', 'Profilo non salvato: correggi i campi segnati.');
        rerender();
        const first = root.querySelector('[aria-invalid="true"]'); if (first) first.focus();
        return;
      }
      ctx.busy = true; rerender();
      const r = await DB.saveProfile(profile);
      ctx.busy = false;
      if (r.ok) {
        ctx.profile = profile; ctx.draft = null;
        setMsg('info', 'Profilo salvato e verificato su questo dispositivo.');
        d.render();
        keepFocus('#profile-save');
      } else {
        setMsg('error', `Profilo NON salvato: ${reasonText(r.reason)}. I valori inseriti restano nel modulo: puoi riprovare.`);
        rerender();
        keepFocus('#profile-save');
      }
    });
  }
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
  // Migrazione
  on('#mig-retry', async () => { ctx.migration = null; await runMigration(); d.render(); });
  on('#mig-skip', async () => { const r = await DB.resolveMigration('skip'); ctx.migration = r.status === 'done' ? null : { status: 'failed', reason: r.reason }; await reload(); d.render(); });
  on('#mig-keep', async () => { const r = await DB.resolveMigration('keep_current'); ctx.migration = r.status === 'done' ? null : { status: 'failed', reason: r.reason }; await reload(); d.render(); });
  on('#mig-legacy', async () => { const leg = ctx.migration && ctx.migration.legacy; const r = await DB.resolveMigration('use_legacy', leg); ctx.migration = r.status === 'done' ? null : { status: 'failed', reason: r.reason }; await reload(); d.render(); });
  // Vecchi valori senza date → periodo
  on('#pf-legacy-to-period', () => {
    const leg = (ctx.draft || ctx.profile).legacy || {};
    const data = emptyPeriodData('work');
    data.occupation = leg.occupation || '';
    data.schedule = leg.shiftWork === 'yes' ? 'shift' : leg.shiftWork === 'sometimes' ? 'irregular' : leg.shiftWork === 'no' ? 'regular' : '';
    ctx.periodForm = { mode: 'new', category: 'work', values: { category: 'work', validFrom: '', lastDay: '', provenance: '', data }, errors: {}, fromLegacy: true };
    rerender(); keepFocus('#per-occupation');
  });
  on('#pf-legacy-dismiss', () => {
    ctx.draft = { ...(ctx.draft || ctx.profile || emptyProfile()), legacy: null };
    setMsg('info', 'Valori del profilo precedente tolti dal modulo: tocca "Salva profilo" per confermare. La copia del vecchio profilo resta sul dispositivo.');
    rerender(); keepFocus('#profile-save');
  });
  // Periodi
  root.querySelectorAll('[data-period-add]').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.periodAdd;
    ctx.periodForm = { mode: 'new', category: c, values: { category: c, validFrom: '', lastDay: '', provenance: '', data: emptyPeriodData(c) }, errors: {} };
    ctx.closeForm = null; ctx.deletePending = null;
    rerender(); keepFocus(c === 'work' ? '#per-occupation' : '#per-kind');
  }));
  root.querySelectorAll('[data-period-edit]').forEach((b) => b.addEventListener('click', () => {
    const p = ctx.periods.find((x) => x.id === b.dataset.periodEdit);
    if (!p) return;
    ctx.periodForm = { mode: 'edit', category: p.category, original: p, values: { ...p, lastDay: lastIncludedDay(p) || '', data: JSON.parse(JSON.stringify(p.data)) }, errors: {} };
    ctx.closeForm = null; ctx.deletePending = null;
    rerender(); keepFocus('#per-validFrom');
  }));
  root.querySelectorAll('[data-period-close]').forEach((b) => b.addEventListener('click', () => {
    ctx.closeForm = { id: b.dataset.periodClose, lastDay: d.todayISO(), error: '' };
    ctx.periodForm = null; ctx.deletePending = null;
    rerender(); keepFocus('#close-last');
  }));
  root.querySelectorAll('[data-period-delete]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.periodDelete;
    if (ctx.deletePending !== id) { ctx.deletePending = id; ctx.periodForm = null; ctx.closeForm = null; rerender(); keepFocus(`[data-period-delete="${id}"]`); return; }
    const before = ctx.periods.find((x) => x.id === id);
    const r = await DB.deletePeriod(id);
    ctx.deletePending = null;
    await afterPeriodWrite(r, 'Periodo eliminato.', { label: 'ripristina il periodo', before, afterId: null }, d);
  }));
  on('#period-delete-cancel', () => { ctx.deletePending = null; rerender(); });
  on('#close-cancel', () => { ctx.closeForm = null; rerender(); });
  on('#close-confirm', async () => {
    const p = ctx.periods.find((x) => x.id === ctx.closeForm.id);
    const last = root.querySelector('#close-last').value;
    const next = { ...p, validTo: last ? addDaysISO(last, 1) : '', updatedAt: new Date().toISOString(), revision: (p.revision || 1) + 1 };
    const { period, errors } = validatePeriod(next, ctx.periods, d.todayISO());
    if (!last || Object.keys(errors).length) { ctx.closeForm = { ...ctx.closeForm, lastDay: last, error: !last ? 'Indica l\'ultimo giorno.' : errors.validTo || 'Data non valida.' }; rerender(); keepFocus('#close-last'); return; }
    const r = await DB.putPeriod(period);
    ctx.closeForm = null;
    await afterPeriodWrite(r, 'Periodo terminato.', { label: 'riapri il periodo', before: p, afterId: p.id }, d);
  });
  const pform = root.querySelector('#period-form');
  if (pform) {
    const collect = () => {
      const f = ctx.periodForm;
      const v = { ...f.values, data: { ...f.values.data } };
      pform.querySelectorAll('[data-per]').forEach((el) => {
        const k = el.dataset.per;
        if (['validFrom', 'lastDay'].includes(k)) v[k] = el.value; else v.data[k] = el.value;
      });
      if (f.category === 'work') v.data.workDays = [...pform.querySelectorAll('[data-per-day]')].filter((x) => x.checked).map((x) => Number(x.dataset.perDay));
      const pr = pform.querySelector('input[name="per-provenance"]:checked');
      v.provenance = pr ? pr.value : '';
      return v;
    };
    pform.addEventListener('change', (ev) => {
      ctx.periodForm.values = collect();
      // La scelta "registrato all'epoca" dipende dal primo giorno: si ridisegna.
      if (ev.target && ev.target.dataset && ev.target.dataset.per === 'validFrom') { rerender(); keepFocus('#per-validFrom'); }
    });
    pform.addEventListener('input', () => { ctx.periodForm.values = collect(); });
    pform.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (ctx.busy) return;
      const f = ctx.periodForm;
      const v = collect();
      f.values = v;
      const now = new Date().toISOString();
      const today = d.todayISO();
      // Un periodo che inizia oggi o nel futuro è registrato all'epoca per costruzione.
      const provenance = v.provenance || (v.validFrom && v.validFrom >= today ? 'contemporaneous' : '');
      const input = {
        ...(f.mode === 'edit' ? f.original : {}),
        id: f.mode === 'edit' ? f.original.id : newPeriodId(),
        category: f.category,
        validFrom: v.validFrom,
        validTo: v.lastDay ? addDaysISO(v.lastDay, 1) : null,
        provenance,
        data: v.data,
        createdAt: f.mode === 'edit' ? f.original.createdAt : now,
        updatedAt: now,
        revision: f.mode === 'edit' ? (f.original.revision || 1) + 1 : 1,
      };
      if (v.lastDay && v.validFrom && v.lastDay < v.validFrom) { f.errors = { validTo: 'L\'ultimo giorno non può essere prima del primo.' }; rerender(); keepFocus('#per-lastDay'); return; }
      const { period, errors } = validatePeriod(input, ctx.periods, today);
      if (provenance === 'contemporaneous' && v.validFrom && v.validFrom < addDaysISO(today, -1) && !(f.mode === 'edit' && f.original.provenance === 'contemporaneous')) {
        errors.provenance = 'Un periodo iniziato prima di ieri non può essere registrato all\'epoca: scegli un\'altra voce.';
      }
      f.errors = errors;
      if (Object.keys(errors).length) {
        rerender();
        const first = root.querySelector('#period-form [aria-invalid="true"], #period-form input[name="per-provenance"], #per-overlap-err');
        if (errors.provenance) keepFocus('input[name="per-provenance"]'); else if (first) first.focus();
        return;
      }
      ctx.busy = true; rerender();
      const r = await DB.putPeriod(period);
      ctx.busy = false;
      const wasLegacy = f.fromLegacy;
      if (r.ok) ctx.periodForm = null;
      await afterPeriodWrite(r, f.mode === 'edit' ? 'Periodo aggiornato e verificato.' : 'Periodo salvato e verificato.', { label: f.mode === 'edit' ? 'ripristina la versione precedente' : 'elimina il periodo appena creato', before: f.mode === 'edit' ? f.original : null, afterId: period.id }, d);
      if (r.ok && wasLegacy) ctx.periodMsg.text += ' I valori del profilo precedente restano visibili finché non li rimuovi salvando il profilo senza di essi.';
    });
  }
  on('#period-cancel', () => { ctx.periodForm = null; rerender(); });
  on('#period-undo', async () => {
    const u = ctx.undo;
    if (!u) return;
    const r = u.before ? await DB.putPeriod(u.before) : await DB.deletePeriod(u.afterId);
    ctx.undo = null;
    await afterPeriodWrite(r, 'Operazione annullata.', null, d);
  });
  // Personalizzazione
  root.querySelectorAll('[data-pers]').forEach((cb) => cb.addEventListener('change', async () => {
    const next = { ...ctx.personalization, [cb.dataset.pers]: cb.checked };
    const r = await DB.setContextPreference('personalization', next);
    if (r.ok) { ctx.personalization = next; ctx.prefMsg = null; } else { cb.checked = !cb.checked; ctx.prefMsg = { type: 'error', text: `Scelta non salvata: ${reasonText(r.reason)}.` }; }
    rerender(); keepFocus(`[data-pers="${cb.dataset.pers}"]`);
  }));
  // Backup del contesto
  on('#ctx-export', () => {
    const now = new Date();
    const prefs = [{ key: 'personalization', value: ctx.personalization }];
    const b = buildContextBackup({ profile: ctx.profile, periods: ctx.periods, preferences: prefs }, now);
    d.downloadFile(JSON.stringify(b, null, 2), contextBackupFilename(now), 'application/json');
  });
  const fileInput = root.querySelector('#ctx-restore-file');
  on('#ctx-restore', () => fileInput && fileInput.click());
  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    let text = '';
    try { text = await file.text(); } catch (e) { ctx.importState = { error: 'Il file non è leggibile.' }; rerender(); return; }
    const parsed = parseContextBackup(text, d.todayISO());
    if (!parsed.ok) { ctx.importState = { error: parsed.error }; rerender(); return; }
    const current = { profile: ctx.profile, periods: ctx.periods, preferences: [{ key: 'personalization', value: ctx.personalization }] };
    ctx.importState = { fileName: file.name, data: parsed.data, ignored: parsed.ignoredPreferences, plan: planContextImport(current, parsed.data, 'merge', sameProfile) };
    rerender(); keepFocus('#ctx-import-merge');
  });
  on('#ctx-import-cancel', () => { ctx.importState = null; rerender(); keepFocus('#ctx-restore'); });
  const runImport = async (mode) => {
    const s = ctx.importState;
    const current = { profile: ctx.profile, periods: ctx.periods, preferences: [{ key: 'personalization', value: ctx.personalization }] };
    const plan = planContextImport(current, s.data, mode, sameProfile);
    const snapshot = { profile: ctx.profile, periods: ctx.periods.map((p) => ({ ...p })), preferences: [{ key: 'personalization', value: { ...ctx.personalization } }] };
    s.busy = true; rerender();
    const r = await DB.writeContextBatch(plan.writes);
    await reload();
    if (r.ok) {
      ctx.lastImportUndo = snapshot;
      ctx.importState = { done: true, ok: true, text: mode === 'replace' ? `Contesto sostituito e verificato: ${s.data.periods.length} periodi${s.data.profile ? ', profilo' : ''}.` : `Ripristino completato e verificato: ${plan.add.length} periodi aggiunti${plan.profile === 'add' ? ', profilo aggiunto' : ''}.` };
    } else {
      ctx.importState = { done: true, ok: false, text: `Ripristino non riuscito: ${reasonText(r.reason)}. Il contesto è rimasto com'era.` };
    }
    d.render();
  };
  on('#ctx-import-merge', () => runImport('merge'));
  on('#ctx-import-replace', () => {
    if (!ctx.importState.confirmReplace) { ctx.importState.confirmReplace = true; rerender(); keepFocus('#ctx-import-replace'); return; }
    runImport('replace');
  });
  on('#ctx-import-undo', async () => {
    const snap = ctx.lastImportUndo;
    const r = await DB.writeContextBatch({ profile: snap.profile, periods: snap.periods, preferences: snap.preferences, replaceAll: true });
    await reload();
    ctx.lastImportUndo = null;
    ctx.importState = { done: true, ok: r.ok, text: r.ok ? 'Ripristino annullato: il contesto è tornato com\'era prima.' : `Annullamento non riuscito: ${reasonText(r.reason)}.` };
    d.render();
  });
  // Cancellazione
  on('#profile-clear', async () => {
    if (!ctx.clearPending) { ctx.clearPending = true; rerender(); keepFocus('#profile-clear'); return; }
    const r = await DB.deleteProfile();
    ctx.clearPending = false;
    if (r.ok) { ctx.profile = null; ctx.draft = null; ctx.errors = {}; setMsg('info', 'Profilo cancellato da questo dispositivo.'); }
    else setMsg('error', `Profilo non cancellato: ${reasonText(r.reason)}.`);
    d.render(); keepFocus('#profile-save');
  });
  on('#profile-clear-cancel', () => { ctx.clearPending = false; rerender(); keepFocus('#profile-clear'); });
  on('#legacy-remove', () => {
    if (!ctx.legacyRemovePending) { ctx.legacyRemovePending = true; rerender(); keepFocus('#legacy-remove'); return; }
    const r = env.removePref(PROFILE_PREF_KEY);
    ctx.legacyRemovePending = false;
    ctx.legacyCopy = !!env.getPref(PROFILE_PREF_KEY, '');
    setMsg(r.ok ? 'info' : 'error', r.ok ? 'Vecchia copia del profilo rimossa.' : 'La vecchia copia non è stata rimossa.');
    d.render();
  });
}

async function afterPeriodWrite(r, okText, undo, d) {
  if (r.ok) {
    ctx.undo = undo;
    ctx.periodMsg = { type: 'info', text: okText };
  } else {
    ctx.periodMsg = { type: 'error', text: `Operazione non riuscita: ${reasonText(r.reason)}. Niente è stato modificato.` };
    ctx.undo = null;
  }
  await reload();
  d.render();
  const el = d.root.querySelector('#period-msg');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

// ---------- Blocchi di personalizzazione fuori dal Profilo ----------
export function nightContextHTML(entry, date, esc) {
  if (ctx.status !== 'ready' || !ctx.personalization.contextNotes || !ctx.periods.length) return '';
  const c = nightContext(entry, date, ctx.periods);
  if (!c) return '';
  return `<div class="night-context" id="night-context-box"><p class="nc-title">Contesto della notte</p><ul>${c.lines.map((l) => `<li class="nc-${l.kind}">${esc(l.text)}</li>`).join('')}</ul><p class="muted small">Dal tuo Profilo. Descrive, non spiega: non dice che cosa abbia influito sulla notte.</p></div>`;
}

const fmtMin = (m) => (m == null ? '—' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);
function groupRows(g) {
  const cell = (med, a, b) => `<td><span class="ctx-med">${med}</span>${a != null && b != null ? `<span class="ctx-iqr">${a}–${b}</span>` : ''}</td>`;
  return `<tr class="ctx-group"><th colspan="3" scope="colgroup">${g.label}<span class="muted"> · ${g.n} notti</span></th></tr>
    <tr class="ctx-vals">${cell(fmtMin(g.duration.median), g.duration.q1 != null ? fmtMin(g.duration.q1) : null, g.duration.q3 != null ? fmtMin(g.duration.q3) : null)}${cell(g.onset.median || '—', g.onset.q1, g.onset.q3)}${cell(g.wake.median || '—', g.wake.q1, g.wake.q3)}</tr>`;
}

export function contextTrendHTML(entries, { endDate, provenance, includeOutliers }, d) {
  if (ctx.status === 'unavailable') return `<section class="analysis-block ctx-trend" aria-labelledby="ctx-trend-title"><h2 class="section-h serif" id="ctx-trend-title">Nel tuo contesto</h2><div class="card card-pad"><p class="muted small" id="ctx-trend-unavailable">Personalizzazione non disponibile: l'archivio del Profilo non è accessibile. Le statistiche qui sopra e le tre domande non dipendono dal Profilo.</p></div></section>`;
  if (ctx.status !== 'ready') return '';
  const pers = ctx.personalization;
  if (!pers.highlights && !pers.suggestions) return '';
  const esc = d.escapeHTML;
  const parts = [];
  if (pers.highlights) {
    if (!ctx.periods.length) {
      parts.push('<p class="muted small" id="ctx-no-periods">Nessun periodo di lavoro o routine indicato nel Profilo: i confronti tra periodi compaiono quando ne aggiungi uno.</p>');
    } else {
      const h = contextHighlights(entries, ctx.periods, { endDate, provenance, includeOutliers });
      const blocks = h.comparisons.map((c) => {
        if (!c.available) {
          return `<div class="ctx-cmp" data-cmp="${esc(c.id)}"><p class="ctx-cmp-title">${esc(c.title)}</p><p class="muted small">Non ancora confrontabile: servono almeno ${d.CFG.CONTEXT_GROUP_MIN_NIGHTS} notti per gruppo${c.groups.concat(c.hidden).length ? ` (ora: ${c.groups.concat(c.hidden).map((g) => `${esc(g.label)} ${g.n}`).join(', ')})` : ''}.</p></div>`;
        }
        const clearList = c.clear ? Object.entries(c.clear).filter(([, v]) => v).map(([k]) => ({ duration: 'intervallo di sonno', onset: 'addormentamento', wake: 'risveglio' }[k])) : [];
        return `<div class="ctx-cmp" data-cmp="${esc(c.id)}">
          <p class="ctx-cmp-title">${esc(c.title)}</p>
          <div><table class="ctx-table"><caption class="visually-hidden">${esc(c.title)}: mediana e intervallo della metà centrale delle notti</caption>
            <thead><tr><th scope="col">Intervallo di sonno</th><th scope="col">Addormen&shy;tamento</th><th scope="col">Risveglio</th></tr></thead>
            <tbody>${c.groups.map(groupRows).join('')}</tbody></table></div>
          ${clearList.length ? `<p class="small ctx-clear">Differenza chiara per: ${clearList.join(', ')} (la metà centrale delle notti dei due gruppi non si sovrappone).</p>` : c.clear ? '<p class="small muted">Nessuna differenza chiara: le metà centrali delle notti si sovrappongono, oppure un gruppo ha meno di 14 notti.</p>' : ''}
          ${c.hidden.length ? `<p class="muted small">Non mostrati per poche notti: ${c.hidden.map((g) => `${esc(g.label)} (${g.n})`).join(', ')}.</p>` : ''}
          ${c.note ? `<p class="muted small">${esc(c.note)}</p>` : ''}
        </div>`;
      });
      parts.push(`<div id="ctx-highlights">${blocks.length ? blocks.join('') : '<p class="muted small">Nessuna notte con addormentamento e risveglio cade nei periodi indicati.</p>'}
        <p class="muted small">Ultimi 12 mesi, notti con addormentamento e risveglio coerenti, filtro dell'origine applicato; escluse notti insolite e anomalie confermate. Per ogni misura: mediana e, sotto, l'intervallo che contiene la metà centrale delle notti. È una descrizione: periodi diversi differiscono anche per stagione, abitudini e altro; non indica una causa.</p></div>`);
    }
  }
  if (pers.suggestions) {
    const s = goalSuggestions(entries, ctx.profile, { endDate });
    let body;
    if (s.status === 'no_goals') body = '<p class="muted small" id="ctx-no-goals">Indica un obiettivo nel Profilo (orario in cui provare a dormire, tempo senza schermo, sonno di cui senti di aver bisogno) per ricevere spunti.</p><button type="button" class="btn-ghost" data-goto-profile>Apri il Profilo</button>';
    else if (s.status === 'insufficient') body = `<p class="muted small" id="ctx-insufficient">Non ci sono ancora abbastanza notti per gli spunti: servono almeno ${s.min} notti con i dati registrati all'epoca nelle ultime 2 settimane (${s.checks.map((c) => `${c.n}`).join(' / ')} ora).</p>`;
    else {
      const ok = s.checks.filter((c) => c.status === 'ok' && !s.items.some((i) => i.id === c.goal));
      body = `${s.items.map((i) => `<div class="suggestion" data-suggestion="${esc(i.id)}"><p class="ctx-cmp-title">${esc(i.title)}</p><p>${esc(i.text)}</p><p class="muted small"><strong>Perché questo spunto:</strong> ${esc(i.why)} Notti considerate: ${i.basis.n}, dal ${fmtDay(i.basis.from)} al ${fmtDay(i.basis.to)}.</p></div>`).join('')}
        ${ok.length ? `<p class="small" id="ctx-on-track">${ok.map((c) => (c.goal === 'need' ? `Sonno in linea con quanto senti di aver bisogno (mediana ${fmtMin(c.median)} su ${c.n} notti).` : `In linea con l'obiettivo ${c.goal === 'attempt' ? 'sull\'orario in cui provi a dormire' : 'sul tempo senza schermo'} in ${c.met} notti su ${c.n}.`)).join(' ')}</p>` : ''}
        ${s.checks.filter((c) => c.status === 'insufficient').map((c) => `<p class="muted small">${c.goal === 'attempt' ? 'Orario del tentativo' : c.goal === 'screenFree' ? 'Tempo senza schermo' : 'Sonno'}: servono almeno ${c.min} notti registrate (ora ${c.n}).</p>`).join('')}`;
    }
    parts.push(`<div id="ctx-suggestions"><p class="ctx-sub">Spunti legati ai tuoi obiettivi</p>${body}<p class="muted small">Spunti semplici, non consigli medici, basati solo sugli obiettivi che hai indicato e sulle ultime 2 settimane. Non garantiscono un risultato. Se la stanchezza o i problemi di sonno durano nel tempo, parlane con il medico.</p></div>`);
  }
  return `<section class="analysis-block ctx-trend" aria-labelledby="ctx-trend-title" id="ctx-trend"><h2 class="section-h serif" id="ctx-trend-title">Nel tuo contesto</h2><p class="muted small">Dal tuo Profilo: periodi di lavoro e routine, obiettivi. Non entra nelle statistiche qui sopra né nelle tre domande.</p><div class="card card-pad">${parts.join('<hr class="ctx-sep">')}</div></section>`;
}
