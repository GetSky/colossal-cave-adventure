// Node-only locale loading (the CLI side of i18n.mjs).
//
// i18n.mjs itself is environment-independent; reading src/locales/*.json from
// disk requires `node:fs`, so it lives here where a web page never imports it.
// A web page fetches the same JSON files and attaches `uiBase` the same way
// (see web/app.mjs), so both environments feed the engine identical locales.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, 'locales');

// Language codes available in src/locales/ (the base 'en' strings file lives
// there too, so it is listed).
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

// English UI strings (locales/en.json `strings` section), read once and
// cached.  They are attached to every locale as `uiBase` and double as the
// fallback for incomplete locales.
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

// Load a locale.  For 'en' the text sections stay in data.json (the locale
// file only carries the UI strings); any other language must exist as a file.
// Returns a locale object; throws with a friendly message for unknown langs.
export function loadLocale(lang) {
  const code = String(lang || 'en').trim().toLowerCase().split(/[-_.]/)[0] || 'en';
  const file = path.join(LOCALES_DIR, code + '.json');
  if (!fs.existsSync(file)) {
    throw new Error(`unknown language "${lang}" (available: ${availableLangs().join(', ')})`);
  }
  const locale = JSON.parse(fs.readFileSync(file, 'utf8'));
  locale.code = code;
  locale.uiBase = enStrings();
  return locale;
}
