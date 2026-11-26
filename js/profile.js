// Profilo dell'utente (versione 2): dati personali stabili, percezioni e
// obiettivi. È salvato nell'archivio contestuale `sleep-screen-context`
// (context-db.js), separato dal database delle notti; le informazioni che
// cambiano nel tempo (lavoro, routine) sono periodi con date (context.js).
// Nessun modulo di analisi consolidato (analytics.js, inference.js)
// importa questo file. Ogni campo è documentato in docs/PROFILE_AND_CONTEXT.md.

import { validateAvatar } from './avatars.js';

// Formato del Profilo nella versione precedente (localStorage `ssl_profile`).
export const PROFILE_PREF_KEY = 'profile';
export const LEGACY_PROFILE_VERSION = 1;
export const PROFILE_VERSION = 2;

export const TEXT_LIMITS = {
  firstName: 60, lastName: 60, displayName: 40, gender: 60, goal: 200, notes: 1000,
};
export const AGE_MIN = 1;
export const AGE_MAX = 120;
export const SLEEP_NEED_MIN = 240;   // 4 h
export const SLEEP_NEED_MAX = 720;   // 12 h
export const SLEEP_NEED_STEP = 15;
export const SCREEN_FREE_GOALS = [15, 30, 45, 60, 90, 120];

// Opzioni delle scelte. La chiave '' significa "non indicato".
export const SEX_OPTIONS = [
  ['', 'Non indicato'], ['female', 'Femmina'], ['male', 'Maschio'], ['intersex', 'Intersex'], ['undisclosed', 'Preferisco non dirlo'],
];
export const CHRONOTYPE_OPTIONS = [
  ['', 'Non indicato'], ['morning', 'Decisamente mattiniero'], ['rather_morning', 'Più mattiniero che nottambulo'],
  ['neither', 'Né l\'uno né l\'altro'], ['rather_evening', 'Più nottambulo che mattiniero'], ['evening', 'Decisamente nottambulo'],
];
// Valori della versione 1 che nella versione 2 diventano periodi con date:
// si conservano come "indicati senza date" finché l'utente non crea un
// periodo (non si inventa una data d'inizio).
export const LEGACY_SHIFT_OPTIONS = { no: 'No', sometimes: 'A volte', yes: 'Sì, regolarmente' };

// avatar (26/11/2026): immagine del Profilo scelta tra i disegni di avatars.js, oppure null.
export const PROFILE_FIELDS = ['firstName', 'lastName', 'displayName', 'birthDate', 'ageManual', 'sex', 'gender', 'chronotype', 'sleepNeedMin', 'goalAttemptTime', 'goalScreenFreeMin', 'goal', 'notes', 'avatar'];

export function emptyProfile() {
  return {
    firstName: '', lastName: '', displayName: '', birthDate: '', ageManual: '',
    sex: '', gender: '', chronotype: '', sleepNeedMin: '', goalAttemptTime: '', goalScreenFreeMin: '', goal: '', notes: '',
    avatar: null, legacy: null,
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isRealDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}
export const isHHMM = (s) => typeof s === 'string' && HHMM.test(s);

// Età in anni compiuti alla data `todayISO` (YYYY-MM-DD). Chi è nato il
// 29 febbraio compie gli anni il 1° marzo negli anni non bisestili.
export function ageOn(birthDate, todayISO) {
  if (!isRealDate(birthDate) || !isRealDate(todayISO) || birthDate > todayISO) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export function isBirthday(birthDate, todayISO) {
  if (!isRealDate(birthDate) || !isRealDate(todayISO) || birthDate > todayISO) return false;
  const [, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  if (bm === tm && bd === td) return true;
  const leap = (ty % 4 === 0 && ty % 100 !== 0) || ty % 400 === 0;
  return bm === 2 && bd === 29 && !leap && tm === 3 && td === 1;
}

// Controlla e normalizza i valori del modulo. Restituisce { profile, errors }:
// se `errors` non è vuoto il profilo non va salvato. I testi sono ripuliti
// dagli spazi esterni; nessun valore viene inventato o corretto in silenzio.
export function validateProfile(input, todayISO) {
  const p = emptyProfile();
  const errors = {};
  const src = input && typeof input === 'object' ? input : {};
  Object.keys(TEXT_LIMITS).forEach((k) => {
    const v = typeof src[k] === 'string' ? src[k].trim() : '';
    if (v.length > TEXT_LIMITS[k]) errors[k] = `Al massimo ${TEXT_LIMITS[k]} caratteri.`;
    p[k] = v;
  });
  const bd = typeof src.birthDate === 'string' ? src.birthDate.trim() : '';
  if (bd) {
    if (!isRealDate(bd)) errors.birthDate = 'Data non valida.';
    else if (bd > todayISO) errors.birthDate = 'La data di nascita non può essere nel futuro.';
    else if (ageOn(bd, todayISO) > AGE_MAX) errors.birthDate = `Controlla l'anno: risulterebbero più di ${AGE_MAX} anni.`;
    p.birthDate = bd;
  }
  const am = src.ageManual == null ? '' : String(src.ageManual).trim();
  if (am) {
    if (!/^\d{1,3}$/.test(am) || Number(am) < AGE_MIN || Number(am) > AGE_MAX) errors.ageManual = `Scrivi un numero intero da ${AGE_MIN} a ${AGE_MAX}.`;
    p.ageManual = am;
  }
  const choice = (k, opts) => {
    const v = typeof src[k] === 'string' ? src[k] : '';
    if (!opts.some(([key]) => key === v)) errors[k] = 'Scelta non valida.';
    else p[k] = v;
  };
  choice('sex', SEX_OPTIONS);
  choice('chronotype', CHRONOTYPE_OPTIONS);
  const sn = src.sleepNeedMin == null ? '' : String(src.sleepNeedMin).trim();
  if (sn) {
    const n = Number(sn);
    if (!/^\d+$/.test(sn) || n < SLEEP_NEED_MIN || n > SLEEP_NEED_MAX || n % SLEEP_NEED_STEP) errors.sleepNeedMin = 'Scegli un valore tra 4 e 12 ore.';
    else p.sleepNeedMin = n;
  }
  const ga = typeof src.goalAttemptTime === 'string' ? src.goalAttemptTime.trim() : '';
  if (ga) {
    if (!isHHMM(ga)) errors.goalAttemptTime = 'Orario non valido.';
    else p.goalAttemptTime = ga;
  }
  const gs = src.goalScreenFreeMin == null ? '' : String(src.goalScreenFreeMin).trim();
  if (gs) {
    if (!SCREEN_FREE_GOALS.includes(Number(gs)) || !/^\d+$/.test(gs)) errors.goalScreenFreeMin = 'Scelta non valida.';
    else p.goalScreenFreeMin = Number(gs);
  }
  const av = validateAvatar(src.avatar);
  if (av.error) errors.avatar = av.error;
  else p.avatar = av.avatar;
  // Valori della versione 1 senza date: conservati così come sono.
  if (src.legacy && typeof src.legacy === 'object') {
    const occ = typeof src.legacy.occupation === 'string' ? src.legacy.occupation.trim().slice(0, 80) : '';
    const sw = typeof src.legacy.shiftWork === 'string' && LEGACY_SHIFT_OPTIONS[src.legacy.shiftWork] ? src.legacy.shiftWork : '';
    p.legacy = occ || sw ? { occupation: occ, shiftWork: sw } : null;
  }
  return { profile: p, errors };
}

// L'età mostrata: dalla data di nascita se c'è, altrimenti quella scritta
// a mano (che non si aggiorna da sola, ed è detto nell'interfaccia).
export function displayAge(profile, todayISO) {
  if (!profile) return null;
  if (profile.birthDate) {
    const a = ageOn(profile.birthDate, todayISO);
    return a == null ? null : { years: a, source: 'birthDate' };
  }
  if (profile.ageManual) return { years: Number(profile.ageManual), source: 'manual' };
  return null;
}

export function greetingName(profile) {
  if (!profile) return '';
  return profile.displayName || profile.firstName || '';
}

export function isProfileEmpty(profile) {
  return !profile || (PROFILE_FIELDS.every((k) => profile[k] === '' || profile[k] == null) && !profile.legacy);
}

export function sameProfile(a, b) {
  const norm = (p) => JSON.stringify([...PROFILE_FIELDS.map((k) => (p && p[k] != null ? p[k] : '')), p && p.legacy ? [p.legacy.occupation || '', p.legacy.shiftWork || ''] : null]);
  return norm(a) === norm(b);
}

// Lettura rigorosa del Profilo della versione 1 (localStorage). Non tratta
// mai una struttura sconosciuta come un profilo vuoto:
//   { status: 'empty' }                         nessun profilo salvato
//   { status: 'ok', profile, dropped: [campi] } leggibile (i campi non validi sono elencati, non trasferiti)
//   { status: 'corrupt' }                       non è JSON o non ha la forma attesa
//   { status: 'unknown_version', version }      versione diversa da 1 (per esempio più recente)
export function parseLegacyProfile(raw, todayISO) {
  if (raw == null || raw === '') return { status: 'empty' };
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { return { status: 'corrupt' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { status: 'corrupt' };
  if (obj.version !== LEGACY_PROFILE_VERSION) return { status: 'unknown_version', version: obj.version == null ? null : obj.version };
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) return { status: 'corrupt' };
  const d = obj.data;
  const input = { ...d, legacy: { occupation: d.occupation, shiftWork: d.shiftWork } };
  // Campi della versione 1 che non esistono più (o sono diventati periodi).
  delete input.occupation; delete input.shiftWork;
  const { profile, errors } = validateProfile(input, todayISO);
  const dropped = Object.keys(errors);
  dropped.forEach((k) => { profile[k] = emptyProfile()[k]; });
  if (typeof d.occupation === 'string' && d.occupation.trim().length > 80) dropped.push('occupation');
  if (d.shiftWork && !LEGACY_SHIFT_OPTIONS[d.shiftWork]) dropped.push('shiftWork');
  return { status: 'ok', profile, dropped, updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : '' };
}

// Impronta del testo originale, registrata con la migrazione per poter
// riconoscere se l'originale è cambiato (FNV-1a, 32 bit: non crittografica).
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
