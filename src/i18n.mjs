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
//
// This module is pure data plumbing (no Node- or browser-specific APIs), so
// the engine can import it in any environment.  Reading the locale files
// from disk is Node-only and lives in i18n-node.mjs; a web page fetches the
// JSON itself.  Both attach the English UI strings as `locale.uiBase`, which
// serves as the fallback for incompletely translated locales.

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

// Overlay a locale onto the compiled database.  Returns a *new* data object;
// the original (English) data.json is never mutated.  Text sections are
// replaced wholesale when the display locale provides them (English display
// keeps the base text); the vocabulary is the English table plus the synonyms
// of the display locale *and* every `extraLocales` -- so commands typed in any
// bundled language keep parsing whichever language is displayed (a transcript
// recorded in Russian replays identically under English text).
// Locale vocabulary is stored in natural spelling -- it is normalised to the
// A5 contract (upper-case, first 5 chars, blank-padded) here, mirroring how
// tools/build-dat.mjs stores the English words.
export function applyLocale(data, locale, extraLocales = []) {
  const display = locale && locale.code !== 'en' ? locale : null;
  const vocabLocales = [...(display ? [display] : []), ...extraLocales].filter(
    (l) => l && l.code !== 'en' && l.vocabExtra && l.vocabExtra.length > 0
  );
  if (!display && vocabLocales.length === 0) return data;
  const out = { ...data };
  if (display) {
    for (const sec of TEXT_SECTIONS) {
      if (display[sec] && Object.keys(display[sec]).length > 0) out[sec] = display[sec];
    }
  }
  if (vocabLocales.length > 0) {
    const extra = vocabLocales.flatMap((l) => l.vocabExtra.map((e) => ({ n: e.n, w: w5(e.w) })));
    out.vocab = out.vocab.concat(extra);
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

// Options bundle the engine needs from a locale.  Strings always fall back
// to English (`locale.uiBase`, attached by whoever loaded the locales -- see
// i18n-node.mjs / web); yes/no/magic words always accept English alongside
// the translation (the caller may pre-union several locales' words into the
// display locale, keeping e.g. Russian answers parseable in English mode).
export function localeOptions(locale) {
  const base = {
    strings: locale?.uiBase ?? {},
    yesWords: ['YES', 'Y'],
    noWords: ['NO', 'N'],
    magics: ['DWARF'],
  };
  return {
    strings: { ...base.strings, ...(locale?.strings || {}) },
    yesWords: uniq([...(locale?.yesWords || []), ...base.yesWords]).map(w5),
    noWords: uniq([...(locale?.noWords || []), ...base.noWords]).map(w5),
    magics: uniq([...(locale?.magics || []), ...base.magics]).map(w5),
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
