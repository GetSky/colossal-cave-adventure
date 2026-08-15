// Tests for the localisation layer (src/i18n.mjs + src/locales/*.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIo, scriptedInput } from '../src/io.mjs';
import { Engine } from '../src/engine.mjs';
import { resolveLang, loadLocale, applyLocale, localeOptions, fmt } from '../src/i18n.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en.json'), 'utf8'));
const ru = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'ru.json'), 'utf8'));

// ---- argument parsing ----

test('resolveLang parses --lang=ru, --lang ru, -l ru and is case-insensitive', () => {
  assert.equal(resolveLang(['node', 'game', '--lang=ru']), 'ru');
  assert.equal(resolveLang(['node', 'game', '--lang', 'ru']), 'ru');
  assert.equal(resolveLang(['node', 'game', '-l', 'ru']), 'ru');
  assert.equal(resolveLang(['node', 'game', '--language=RU']), 'ru');
  assert.equal(resolveLang(['node', 'game', '--locale', 'ru-RU']), 'ru');
  assert.equal(resolveLang(['node', 'game', '--resume']), null);
});

test('loadLocale rejects unknown languages with the available list', () => {
  assert.throws(() => loadLocale('xx'), /unknown language "xx" \(available: .*en.*ru.*\)/);
});

// ---- locale completeness vs the compiled database ----

test('ru locale covers every text section of data.json', () => {
  for (const sec of ['ltext', 'stext', 'rtext', 'mtext']) {
    for (const key of Object.keys(data[sec])) {
      assert.ok(Array.isArray(ru[sec][key]) && ru[sec][key].length > 0, `${sec}[${key}] missing in ru.json`);
      for (const line of ru[sec][key]) assert.ok(typeof line === 'string' && line.trim() !== '', `${sec}[${key}] has an empty line`);
    }
  }
});

test('ru otext covers every object with an inventory name and as many property messages', () => {
  for (const key of Object.keys(data.otext)) {
    const got = ru.otext[key];
    assert.ok(got, `otext[${key}] missing in ru.json`);
    assert.ok(Array.isArray(got.inv) && got.inv.length > 0, `otext[${key}].inv missing`);
    assert.equal(got.props.length, data.otext[key].props.length, `otext[${key}].props count differs`);
  }
});

test('ru classes keep the English thresholds (game balance is unchanged)', () => {
  assert.equal(ru.classes.length, data.classes.length);
  for (let i = 0; i < data.classes.length; i++) {
    assert.equal(ru.classes[i].threshold, data.classes[i].threshold);
    assert.ok(ru.classes[i].lines.length > 0);
  }
});

test('every engine UI string of en.json is translated in ru.json', () => {
  for (const key of Object.keys(en.strings)) {
    assert.ok(typeof ru.strings[key] === 'string' && ru.strings[key] !== '', `strings.${key} missing in ru.json`);
  }
});

// ---- vocabulary sanity ----

const w5 = (w) => (String(w).toUpperCase() + '     ').slice(0, 5);

test('ru vocabExtra: unique, valid, and does not collide with the English table', () => {
  const seen = new Set();
  for (const e of ru.vocabExtra) {
    assert.ok(Number.isInteger(e.n), `vocabExtra entry with non-integer n: ${JSON.stringify(e)}`);
    const w = w5(e.w);
    assert.notEqual(w.trim(), '', 'vocabExtra entry with empty word');
    const pair = `${e.n}:${w}`;
    assert.ok(!seen.has(pair), `duplicate vocabExtra entry ${pair}`);
    seen.add(pair);
  }
  // A Russian word must never shadow an English one with a *different* code.
  const enWords = new Map(data.vocab.map((e) => [e.w, e.n]));
  for (const e of ru.vocabExtra) {
    const w = w5(e.w);
    if (enWords.has(w)) assert.equal(enWords.get(w), e.n, `Cyrillic word "${w}" collides with English entry`);
  }
});

test('every ru vocabExtra code exists in the English vocabulary', () => {
  const enCodes = new Set(data.vocab.map((e) => e.n));
  for (const e of ru.vocabExtra) assert.ok(enCodes.has(e.n), `code ${e.n} (${e.w}) unknown in data.json`);
});

// ---- engine behaviour with the locale applied ----

function play(locale, cmds) {
  const gameData = applyLocale(data, locale);
  const out = [];
  const io = createIo({ input: scriptedInput(cmds), output: { write: (s) => out.push(s) } });
  const eng = new Engine(gameData, io, locale);
  eng.run();
  return { text: out.join(''), eng };
}

test('russian locale: welcome, movement and commands in Russian; YES/NO in Russian', () => {
  const locale = loadLocale('ru');
  const { text, eng } = play(locale, ['НЕТ', 'ВОЙТИ', 'ВОЗЬМИ ЛАМПУ', 'ИНВЕНТАРЬ', 'ВЫХОД', 'ДА']);
  assert.match(text, /ДОБРО ПОЖАЛОВАТЬ В ПРИКЛЮЧЕНИЕ/);
  assert.match(text, /ВЫ СТОИТЕ В КОНЦЕ ДОРОГИ ПЕРЕД НЕБОЛЬШИМ КИРПИЧНЫМ ДОМОМ/);
  assert.match(text, /ВЫ ВНУТРИ ЗДАНИЯ/);
  assert.match(text, /ЛАТУННЫЙ ФОНАРЬ/);
  assert.match(text, /ВЫ ДЕЙСТВИТЕЛЬНО ХОТИТЕ СЕЙЧАС ВЫЙТИ\?/);
  assert.match(text, /Вы набрали\s+\d+ очк[ао] из возможных/i);
  assert.ok(eng.holdng === 1, 'the lamp was taken');
});

test('russian locale accepts English commands too', () => {
  const locale = loadLocale('ru');
  const { text } = play(locale, ['НЕТ', 'ENTER', 'TAKE KEYS', 'INVENTORY', 'QUIT', 'ДА']);
  assert.match(text, /СВЯЗКА КЛЮЧЕЙ/);
});

test('compass abbreviations: В/З/С/Ю and СВ..СЗ work in Russian', () => {
  const locale = loadLocale('ru');
  const { text } = play(locale, ['НЕТ', 'ВОЙТИ', 'ВЫЙТИ', 'ВЫХОД', 'ДА']);
  // НАРУЖ (OUT) from inside the building must put us back at the road end.
  assert.match(text, /ВЫ ВНУТРИ ЗДАНИЯ/);
  assert.match(text, /ВЫ СНОВА В КОНЦЕ ДОРОГИ/);
});

test('localeOptions merges strings with English fallback and pads yes/no words', () => {
  const o = localeOptions(loadLocale('ru'));
  assert.equal(o.strings.scored, ru.strings.scored);
  assert.equal(o.strings.pleaseAnswer, ru.strings.pleaseAnswer);
  assert.ok(o.yesWords.includes('ДА   '));
  assert.ok(o.yesWords.includes('YES  '));
  assert.ok(o.noWords.includes('НЕТ  '));
  assert.ok(o.noWords.includes('NO   '));
});

test('fmt: substitution, padding, and plural forms (EN 2-form / RU 3-form rules)', () => {
  assert.equal(fmt('a {x} b', { x: 7 }), 'a 7 b');
  assert.equal(fmt('n={n:4}.', { n: 7 }), 'n=   7.');
  assert.equal(fmt('{n} {@n:point,points}', { n: 1 }), '1 point');
  assert.equal(fmt('{n} {@n:point,points}', { n: 32 }), '32 points');
  assert.equal(fmt('{n} {@n:очко,очка,очков}', { n: 1 }), '1 очко');
  assert.equal(fmt('{n} {@n:очко,очка,очков}', { n: 32 }), '32 очка');
  assert.equal(fmt('{n} {@n:очко,очка,очков}', { n: 350 }), '350 очков');
  assert.equal(fmt('{n} {@n:очко,очка,очков}', { n: 11 }), '11 очков');
  assert.equal(fmt('{n} {@n:очко,очка,очков}', { n: 21 }), '21 очко');
  assert.equal(fmt('{n} {@n:ход,хода,ходов}', { n: 4 }), '4 хода');
});

test('applyLocale does not mutate the base data (English stays the default)', () => {
  const before = JSON.stringify(data.vocab.length) + data.ltext[1][0];
  applyLocale(data, loadLocale('ru'));
  assert.equal(JSON.stringify(data.vocab.length) + data.ltext[1][0], before);
});
