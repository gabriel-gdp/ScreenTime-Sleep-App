// avatars.js — immagini del Profilo: nove volti disegnati (nessuna foto),
// con varianti per inclusività (carnagione, capelli, occhiali, colori dei
// personaggi). Funzioni pure: restituiscono testo SVG; nessun accesso a
// rete o archivi. Il valore salvato nel Profilo è
//   { id, tone, hair, glasses }   (hair solo per le persone)
// oppure null (nessuna immagine: si mostra l'iniziale del nome).

export const SKIN_TONES = [
  { id: 's1', label: 'Molto chiara', skin: '#F6D3B5', shade: '#E6BB98' },
  { id: 's2', label: 'Chiara', skin: '#EDBB94', shade: '#D9A37B' },
  { id: 's3', label: 'Media', skin: '#D29A6E', shade: '#BC845A' },
  { id: 's4', label: 'Scura', skin: '#A66B45', shade: '#8E5737' },
  { id: 's5', label: 'Molto scura', skin: '#6E4430', shade: '#5A3626' },
];
export const HAIR_COLORS = [
  { id: 'h1', label: 'Neri', color: '#231B19' },
  { id: 'h2', label: 'Castani', color: '#5A3B28' },
  { id: 'h3', label: 'Ramati', color: '#A2492A' },
  { id: 'h4', label: 'Biondi', color: '#D2A85A' },
  { id: 'h5', label: 'Grigi', color: '#A7A29C' },
];

const PERSON = 'person';
const CHAR = 'character';
export const AVATARS = [
  { id: 'giovane-uomo', label: 'Giovane uomo', kind: PERSON, defaults: { tone: 's2', hair: 'h2', glasses: false } },
  { id: 'giovane-donna', label: 'Giovane donna', kind: PERSON, defaults: { tone: 's3', hair: 'h1', glasses: false } },
  { id: 'uomo-adulto', label: 'Uomo adulto', kind: PERSON, defaults: { tone: 's2', hair: 'h2', glasses: false } },
  { id: 'donna-adulta', label: 'Donna adulta', kind: PERSON, defaults: { tone: 's4', hair: 'h1', glasses: true } },
  { id: 'alieno', label: 'Alieno simpatico', kind: CHAR, tones: [
    { id: 'verde', label: 'Verde', a: '#8FD39A', b: '#6AB178', c: '#7CC48A' },
    { id: 'lilla', label: 'Lilla', a: '#C3A6E8', b: '#A586D1', c: '#B496E0' },
    { id: 'azzurro', label: 'Azzurro', a: '#8CCBE8', b: '#68AECF', c: '#7ABDDC' },
  ], defaults: { tone: 'verde', glasses: false } },
  { id: 'gufo', label: 'Gufo', note: 'nottambulo', kind: CHAR, tones: [
    { id: 'bruno', label: 'Bruno', a: '#8A6A4A', b: '#6B5038' },
    { id: 'neve', label: 'Delle nevi', a: '#D8D4CC', b: '#A9A39A' },
  ], defaults: { tone: 'bruno', glasses: false } },
  { id: 'allodola', label: 'Allodola', note: 'mattiniera', kind: CHAR, tones: [
    { id: 'sabbia', label: 'Sabbia', a: '#C9A27A', b: '#9C7650' },
    { id: 'castano', label: 'Castano', a: '#A4805F', b: '#7A5A3E' },
  ], defaults: { tone: 'sabbia', glasses: false } },
  { id: 'gatto', label: 'Gatto assonnato', kind: CHAR, tones: [
    { id: 'grigio', label: 'Grigio', a: '#9AA3AE', b: '#7E8792', ink: '#2B2A28' },
    { id: 'rosso', label: 'Rosso', a: '#E0A060', b: '#C27E3E', ink: '#2B2A28' },
    { id: 'nero', label: 'Nero', a: '#3D3A3F', b: '#2A282C', ink: '#F6F3EE' },
  ], defaults: { tone: 'grigio', glasses: false } },
  { id: 'luna', label: 'Luna', kind: CHAR, tones: [
    { id: 'oro', label: 'Oro', a: '#F2D58A', b: '#E3C474', ink: '#5A4520' },
    { id: 'argento', label: 'Argento', a: '#D9DEE7', b: '#BFC6D3', ink: '#4A5263' },
  ], defaults: { tone: 'oro', glasses: false } },
];

export const avatarDef = (id) => AVATARS.find((a) => a.id === id) || null;
export const isPerson = (id) => { const d = avatarDef(id); return !!d && d.kind === PERSON; };
export const tonesFor = (id) => { const d = avatarDef(id); if (!d) return []; return d.kind === PERSON ? SKIN_TONES : d.tones; };

export function defaultAvatar(id) {
  const d = avatarDef(id);
  if (!d) return null;
  const v = { id, tone: d.defaults.tone, glasses: !!d.defaults.glasses };
  if (d.kind === PERSON) v.hair = d.defaults.hair;
  return v;
}

// Controllo rigoroso: un valore sconosciuto non viene "corretto" in silenzio.
export function validateAvatar(v) {
  if (v == null || v === '') return { avatar: null, error: null };
  if (typeof v !== 'object' || Array.isArray(v)) return { avatar: null, error: 'Immagine non valida.' };
  const d = avatarDef(v.id);
  if (!d) return { avatar: null, error: 'Immagine sconosciuta.' };
  if (!tonesFor(v.id).some((t) => t.id === v.tone)) return { avatar: null, error: 'Variante non valida.' };
  if (typeof v.glasses !== 'boolean') return { avatar: null, error: 'Valore degli occhiali non valido.' };
  const out = { id: v.id, tone: v.tone, glasses: v.glasses };
  if (d.kind === PERSON) {
    if (!HAIR_COLORS.some((h) => h.id === v.hair)) return { avatar: null, error: 'Colore dei capelli non valido.' };
    out.hair = v.hair;
  } else if (v.hair != null) {
    return { avatar: null, error: 'Un personaggio non ha capelli da scegliere.' };
  }
  return { avatar: out, error: null };
}

export function avatarLabel(v) {
  const d = v && avatarDef(v.id);
  if (!d) return '';
  const tone = tonesFor(v.id).find((t) => t.id === v.tone);
  const parts = [d.label];
  if (d.kind === PERSON) {
    parts.push(`carnagione ${tone.label.toLowerCase()}`, `capelli ${HAIR_COLORS.find((h) => h.id === v.hair).label.toLowerCase()}`);
  } else if (d.tones.length > 1) parts.push(tone.label.toLowerCase());
  if (v.glasses) parts.push('con gli occhiali');
  return parts.join(', ');
}

// ---------- Disegno ----------
const BLUSH = '<circle cx="44" cy="{y}" r="4.5" fill="#E8967C" opacity="0.32"/><circle cx="76" cy="{y}" r="4.5" fill="#E8967C" opacity="0.32"/>';
const blush = (y) => BLUSH.replace(/\{y\}/g, y);
const eyes = (y, c = '#2B2A28') => `<ellipse cx="50" cy="${y}" rx="2.6" ry="3.2" fill="${c}"/><ellipse cx="70" cy="${y}" rx="2.6" ry="3.2" fill="${c}"/>`;
const smile = (y, c) => `<path d="M52 ${y} q8 7 16 0" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
const glassesAt = (y, r = 7.5, gap = 20, c = '#2F3B52') => {
  const x1 = 60 - gap / 2, x2 = 60 + gap / 2;
  return `<g fill="none" stroke="${c}" stroke-width="2.2"><circle cx="${x1}" cy="${y}" r="${r}"/><circle cx="${x2}" cy="${y}" r="${r}"/><path d="M${x1 + r} ${y} H${x2 - r}"/><path d="M${x1 - r} ${y - 1} l-6 -3 M${x2 + r} ${y - 1} l6 -3"/></g>`;
};
const mouthInk = (toneId) => (['s4', 's5'].includes(toneId) ? '#3A1E16' : '#7A3A30');

function person(v) {
  const s = SKIN_TONES.find((t) => t.id === v.tone);
  const h = HAIR_COLORS.find((x) => x.id === v.hair).color;
  const ink = mouthInk(v.tone);
  const g = v.glasses;
  switch (v.id) {
    case 'giovane-uomo':
      return `<rect width="120" height="120" fill="#CFE3DF"/>
<path d="M44 100 h32 v22 h-32 z" fill="${s.shade}"/>
<ellipse cx="34" cy="66" rx="6" ry="8" fill="${s.skin}"/><ellipse cx="86" cy="66" rx="6" ry="8" fill="${s.skin}"/>
<ellipse cx="60" cy="64" rx="26" ry="31" fill="${s.skin}"/>
<path d="M33 60 C 31 36 46 26 62 27 C 78 26 90 36 87 58 C 84 48 76 44 68 46 C 64 38 50 36 44 44 C 38 46 35 52 33 60 Z" fill="${h}"/>
<path d="M46 39 C 52 30 66 28 72 34 C 64 33 56 35 50 41 Z" fill="#FFFFFF" opacity="0.14"/>
${eyes(66)}<path d="M45 58 q5 -3 10 0 M65 58 q5 -3 10 0" stroke="${h}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
${blush(76)}${smile(80, ink)}${g ? glassesAt(66) : ''}`;
    case 'giovane-donna':
      return `<rect width="120" height="120" fill="#F6E1C3"/>
<path d="M28 62 C 26 34 42 22 60 22 C 78 22 94 34 92 62 L 96 122 H 24 Z" fill="${h}"/>
<path d="M46 98 h28 v24 h-28 z" fill="${s.shade}"/>
<ellipse cx="60" cy="64" rx="25" ry="30" fill="${s.skin}"/>
<path d="M35 58 C 36 38 50 30 62 31 C 74 31 86 40 85 56 C 76 52 68 44 64 38 C 58 48 46 54 35 58 Z" fill="${h}"/>
${eyes(66)}<path d="M46 63 l-3 -2 M74 63 l3 -2" stroke="#2B2A28" stroke-width="1.8" stroke-linecap="round"/>
${blush(76)}${smile(80, ink)}${g ? glassesAt(66) : ''}`;
    case 'uomo-adulto':
      return `<rect width="120" height="120" fill="#DCE3EE"/>
<path d="M44 100 h32 v22 h-32 z" fill="${s.shade}"/>
<ellipse cx="34" cy="64" rx="6" ry="8" fill="${s.skin}"/><ellipse cx="86" cy="64" rx="6" ry="8" fill="${s.skin}"/>
<ellipse cx="60" cy="63" rx="26" ry="31" fill="${s.skin}"/>
<path d="M34 72 C 36 92 48 98 60 98 C 72 98 84 92 86 72 C 82 82 72 84 60 84 C 48 84 38 82 34 72 Z" fill="${h}"/>
<path d="M52 82 q8 -4 16 0" stroke="${h}" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M34 58 C 32 36 46 28 60 28 C 76 28 90 36 86 58 C 84 46 74 40 60 40 C 46 40 38 46 34 58 Z" fill="${h}"/>
<path d="M34 58 C 34 52 36 48 38 46 L 39 58 Z M86 58 C 86 52 84 48 82 46 L 81 58 Z" fill="#FFFFFF" opacity="0.35"/>
${eyes(64)}<path d="M44 56 h11 M65 56 h11" stroke="${h}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M54 88 q6 4 12 0" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/>${g ? glassesAt(64) : ''}`;
    case 'donna-adulta':
    default:
      return `<rect width="120" height="120" fill="#EED9D6"/>
<circle cx="60" cy="56" r="37" fill="${h}"/>
<path d="M46 98 h28 v24 h-28 z" fill="${s.shade}"/>
<ellipse cx="60" cy="64" rx="25" ry="30" fill="${s.skin}"/>
<path d="M36 58 C 38 40 50 34 60 34 C 72 34 84 40 84 58 C 78 48 70 44 60 44 C 50 44 42 48 36 58 Z" fill="${h}"/>
<circle cx="35" cy="80" r="3.2" fill="#E3A64F"/><circle cx="85" cy="80" r="3.2" fill="#E3A64F"/>
${eyes(65)}${blush(78)}${smile(81, ink)}${g ? glassesAt(65, 7.5, 20, '#C08A22') : ''}`;
  }
}

function character(v) {
  const d = avatarDef(v.id);
  const t = d.tones.find((x) => x.id === v.tone);
  const g = v.glasses;
  switch (v.id) {
    case 'alieno':
      return `<rect width="120" height="120" fill="#1C2433"/>
<circle cx="20" cy="28" r="1.6" fill="#F2D58A"/><circle cx="98" cy="22" r="1.3" fill="#F2D58A"/><circle cx="104" cy="88" r="1.5" fill="#F2D58A"/>
<path d="M48 36 L 40 16 M72 36 L 80 16" stroke="${t.c}" stroke-width="3" stroke-linecap="round"/>
<circle cx="40" cy="15" r="5" fill="#F2D58A"/><circle cx="80" cy="15" r="5" fill="#F2D58A"/>
<path d="M50 96 h20 v26 h-20 z" fill="${t.b}"/>
<path d="M60 30 C 86 30 96 50 92 70 C 88 90 74 100 60 100 C 46 100 32 90 28 70 C 24 50 34 30 60 30 Z" fill="${t.a}"/>
<ellipse cx="46" cy="64" rx="9" ry="11" fill="#1C2433" transform="rotate(-12 46 64)"/><ellipse cx="74" cy="64" rx="9" ry="11" fill="#1C2433" transform="rotate(12 74 64)"/>
<circle cx="49" cy="60" r="3" fill="#FFFFFF"/><circle cx="77" cy="60" r="3" fill="#FFFFFF"/>
<circle cx="40" cy="80" r="4" fill="#E8967C" opacity="0.4"/><circle cx="80" cy="80" r="4" fill="#E8967C" opacity="0.4"/>
${smile(84, '#1C2433')}${g ? glassesAt(64, 12.5, 28, '#F2D58A') : ''}`;
    case 'gufo':
      return `<rect width="120" height="120" fill="#2F3B52"/>
<path d="M28 40 L 36 18 L 50 34 C 56 32 64 32 70 34 L 84 18 L 92 40 C 100 60 96 92 60 100 C 24 92 20 60 28 40 Z" fill="${t.a}"/>
<circle cx="46" cy="58" r="15" fill="#F3E6CC"/><circle cx="74" cy="58" r="15" fill="#F3E6CC"/>
<circle cx="46" cy="58" r="8.5" fill="#E3A64F"/><circle cx="74" cy="58" r="8.5" fill="#E3A64F"/>
<circle cx="46" cy="58" r="4.4" fill="#1C2433"/><circle cx="74" cy="58" r="4.4" fill="#1C2433"/>
<circle cx="47.8" cy="56.2" r="1.5" fill="#FFFFFF"/><circle cx="75.8" cy="56.2" r="1.5" fill="#FFFFFF"/>
<path d="M60 66 l-5 6 l5 7 l5 -7 z" fill="#D9893A"/>
<path d="M44 84 q4 3 8 0 M56 88 q4 3 8 0 M68 84 q4 3 8 0" stroke="${t.b}" stroke-width="2" fill="none" stroke-linecap="round"/>${g ? glassesAt(58, 16, 28, '#1C2433') : ''}`;
    case 'allodola':
      return `<rect width="120" height="120" fill="#F7E6B8"/>
<circle cx="96" cy="26" r="10" fill="#F2C35A" opacity="0.7"/>
<path d="M58 26 C 62 16 70 14 74 18 C 68 20 66 24 66 30 Z" fill="${t.b}"/>
<path d="M60 28 C 84 28 92 48 90 66 C 88 86 76 100 60 100 C 42 100 30 86 30 66 C 30 46 38 28 60 28 Z" fill="${t.a}"/>
<path d="M60 64 C 74 64 84 74 82 90 C 76 98 68 100 60 100 C 50 100 42 96 38 90 C 36 74 46 64 60 64 Z" fill="#F1E2C6"/>
<circle cx="50" cy="58" r="3.6" fill="#2B2A28"/><circle cx="51.2" cy="56.8" r="1.2" fill="#FFFFFF"/>
<circle cx="70" cy="58" r="3.6" fill="#2B2A28"/><circle cx="71.2" cy="56.8" r="1.2" fill="#FFFFFF"/>
<path d="M54 65 H66 L60 74 Z" fill="#D9893A"/>
<circle cx="42" cy="70" r="4" fill="#E8967C" opacity="0.35"/><circle cx="78" cy="70" r="4" fill="#E8967C" opacity="0.35"/>${g ? glassesAt(58) : ''}`;
    case 'gatto':
      return `<rect width="120" height="120" fill="#E3E8EF"/>
<path d="M30 52 L 30 22 L 52 38 C 57 37 63 37 68 38 L 90 22 L 90 52 C 96 76 84 100 60 100 C 36 100 24 76 30 52 Z" fill="${t.a}"/>
<path d="M35 44 L 35 30 L 47 39 Z M85 44 L 85 30 L 73 39 Z" fill="#E7B7B3"/>
<path d="M60 38 v10 M53 39 v7 M67 39 v7" stroke="${t.b}" stroke-width="2.6" stroke-linecap="round"/>
<path d="M42 64 q6 5 12 0 M66 64 q6 5 12 0" stroke="${t.ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M56 72 h8 l-4 5 z" fill="#D98A8A"/>
<path d="M60 77 q-4 5 -8 3 M60 77 q4 5 8 3" stroke="${t.ink}" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M40 74 h-14 M40 79 l-13 4 M80 74 h14 M80 79 l13 4" stroke="#F6F3EE" stroke-width="1.6" stroke-linecap="round"/>
<path d="M86 30 h8 l-8 9 h8 M98 20 h6 l-6 7 h6" stroke="#5A6472" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${g ? glassesAt(65, 8.5, 24, t.id === 'nero' ? '#F2D58A' : '#2F3B52') : ''}`;
    case 'luna':
    default:
      return `<rect width="120" height="120" fill="#1C2433"/>
<circle cx="22" cy="92" r="1.5" fill="#F2D58A"/><circle cx="100" cy="30" r="1.3" fill="#F2D58A"/><circle cx="96" cy="96" r="1.6" fill="#F2D58A"/>
<circle cx="60" cy="62" r="36" fill="${t.a}"/>
<circle cx="80" cy="44" r="5" fill="${t.b}"/><circle cx="40" cy="84" r="4" fill="${t.b}"/><circle cx="84" cy="80" r="3" fill="${t.b}"/>
<path d="M42 60 q6 5 12 0 M66 60 q6 5 12 0" stroke="${t.ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<circle cx="42" cy="72" r="5" fill="#E8967C" opacity="0.45"/><circle cx="78" cy="72" r="5" fill="#E8967C" opacity="0.45"/>
${smile(74, t.ink)}${g ? glassesAt(61, 9, 24, t.ink) : ''}`;
  }
}

// SVG quadrato 120×120 (il cerchio lo fa il contenitore con border-radius).
// label: testo alternativo; senza label l'immagine è decorativa.
export function avatarSVG(v, { size = 48, label = '' } = {}) {
  const { avatar } = validateAvatar(v);
  if (!avatar) return '';
  const body = isPerson(avatar.id) ? person(avatar) : character(avatar);
  const a11y = label ? `role="img" aria-label="${String(label).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="avatar-svg" viewBox="0 0 120 120" width="${size}" height="${size}" ${a11y}>${body}</svg>`;
}

// Iniziale per chi non sceglie un'immagine.
export function initialOf(name) {
  const s = String(name || '').trim();
  return s ? s[0].toLocaleUpperCase('it-IT') : '';
}
