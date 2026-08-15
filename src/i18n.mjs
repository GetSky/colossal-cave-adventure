// Localisation support.
//
// The game database (src/data.json) is the original English text; a locale
// file (src/locales/<lang>.json) overrides its text sections, extends the
// parser vocabulary with translated command synonyms, and provides the
// engine's UI strings (the handful of messages that are hardcoded in
// engine.mjs / wizard.mjs, here keyed instead of inlined).
//
// The language is chosen at launch:  --lang=ru | --lang ru | -l ru
// (default: en, keeping the historic English behaviour byte-for-byte).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, 'locales');

// The data sections a locale may override (everything textual in data.json).
const TEXT_SECTIONS = ['ltext', 'stext', 'rtext', 'mtext', 'otext', 'classes'];

// Parse `--lang=ru`, `--lang ru`, `-l ru` (also accepts --locale/--language
// spellings).  Returns the language code or null if absent.
export function resolveLang(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let m;
    if ((m = /^--(?:lang|locale|language)=(.+)$/.exec(a))) return normLang(m[1]);
    if (/^--(?:lang|locale|language)$/.test(a) || a === '-l') {
      if (i + 1 < argv.length) return normLang(argv[i + 1]);
      return 'en';
    }
  }
  return null;
}

function normLang(s) {
  return String(s).trim().toLowerCase().split(/[-_.]/)[0] || 'en';
}

// Language codes available in src/locales/ (excluding the base 'en' strings
// file is fine -- it lives there too, so it is listed).
export function availableLangs() {
  try {
    return fs
      .readdirSync(LOCALES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch {
    return ['en'];
  }
}

// Load a locale.  For 'en' the text sections stay in data.json (the locale
// file only carries the UI strings); any other language must exist as a file.
// Returns a locale object; throws with a friendly message for unknown langs.
export function loadLocale(lang) {
  const code = normLang(lang || 'en');
  const file = path.join(LOCALES_DIR, code + '.json');
  if (!fs.existsSync(file)) {
    throw new Error(`unknown language "${lang}" (available: ${availableLangs().join(', ')})`);
  }
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  locale.code = code;
  return locale;
}

// Overlay a locale onto the compiled database.  Returns a *new* data object;
// the original (English) data.json is never mutated.  Text sections are
// replaced wholesale when the locale provides them; the vocabulary is the
// English table plus the locale's synonyms (so English commands keep working).
// Locale vocabulary is stored in natural spelling -- it is normalised to the
// A5 contract (upper-case, first 5 chars, blank-padded) here, mirroring how
// tools/build-dat.mjs stores the English words.
export function applyLocale(data, locale) {
  if (!locale || locale.code === 'en') return data;
  const out = { ...data };
  for (const sec of TEXT_SECTIONS) {
    if (locale[sec] && Object.keys(locale[sec]).length > 0) out[sec] = locale[sec];
  }
  if (locale.vocabExtra && locale.vocabExtra.length > 0) {
    out.vocab = data.vocab.concat(locale.vocabExtra.map((e) => ({ n: e.n, w: w5(e.w) })));
  }
  return out;
}

// Template formatting for UI strings:
//   {name}        substitutes a parameter
//   {name:3}      right-aligns it in a field of 3 (FORTRAN-style padStart)
//   {@name:a,b}   outputs ONLY a plural form chosen by the numeric parameter
//                 `name`: 2 forms -> English rule (1 / other);
//                 3 forms -> Slavic rule (1 / 2-4 / other).
// Example: "You scored{s:4} {@s:point,points}" -> "You scored  32 points".
export function fmt(tpl, params = {}) {
  return String(tpl).replace(/\{(\w+)(?::(\d+))?\}|\{@(\w+):([^}]+)\}/g, (whole, name, width, pluralName, forms) => {
    if (pluralName !== undefined) {
      const v = params[pluralName];
      if (v === undefined) return whole;
      const list = forms.split(',');
      const n = Number(v);
      const idx = list.length === 2 ? (n === 1 ? 0 : 1) : slavicPluralIndex(n);
      return list[idx];
    }
    const v = params[name];
    if (v === undefined) return whole;
    const s = String(v);
    return width ? s.padStart(Number(width)) : s;
  });
}

function slavicPluralIndex(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

// English UI strings (locales/en.json `strings` section), read once and
// cached.  They double as the fallback for incomplete locales and as the
// strings used when no locale was requested at all.
let enStringsCache = null;
export function enStrings() {
  if (enStringsCache === null) {
    try {
      enStringsCache = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8')).strings || {};
    } catch {
      enStringsCache = {};
    }
  }
  return enStringsCache;
}

// Options bundle the engine needs from a locale.  Strings always fall back
// to English; yes/no/magic words accept English alongside the translation.
export function localeOptions(locale) {
  const base = {
    strings: enStrings(),
    yesWords: ['YES', 'Y'],
    noWords: ['NO', 'N'],
    magics: ['DWARF'],
  };
  if (!locale || locale.code === 'en') {
    return { ...base, yesWords: base.yesWords.map(w5), noWords: base.noWords.map(w5), magics: base.magics.map(w5) };
  }
  return {
    strings: { ...base.strings, ...(locale.strings || {}) },
    yesWords: uniq([...(locale.yesWords || []), ...base.yesWords]).map(w5),
    noWords: uniq([...(locale.noWords || []), ...base.noWords]).map(w5),
    magics: uniq([...(locale.magics || []), ...base.magics]).map(w5),
  };
}

// Vocabulary normalisation contract (A5): upper-case, first 5 chars,
// blank-padded -- mirrors norm() from vocab.mjs without a circular import.
function w5(w) {
  return (String(w).toUpperCase() + '     ').slice(0, 5);
}

function uniq(arr) {
  return [...new Set(arr)];
}
