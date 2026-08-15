// Tests for the web game driver (web/game.mjs): the promise-backed queue io
// and the autosave/replay machinery must reproduce the synchronous scripted
// runs byte-for-byte -- that is the web version's fidelity contract.
//
// Note: unlike a scripted stdin, a web page has no EOF, so every run here
// ends the game explicitly (QUIT/Y).  The engine asks for one more command
// even after the winning BLAST; in a browser that is simply the next turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createIo, scriptedInput } from '../src/io.mjs';
import { Engine } from '../src/engine.mjs';
import { applyLocale } from '../src/i18n.mjs';
import { loadLocale } from '../src/i18n-node.mjs';
import { ranSetState } from '../src/rng.mjs';
import { createSession, migrateSaveSlots } from '../web/game.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));
const locale = loadLocale('en');

const walkthrough = fs
  .readFileSync(new URL('./walkthrough.test.mjs', import.meta.url), 'utf8')
  .split('const walkthrough = `')[1]
  .split('`')[0]
  .trim()
  .split('|');

// every command sequence ends by leaving the game explicitly
const END = ['QUIT', 'Y'];

// localStorage-like storage backed by a Map.
function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

// Yield to the event loop until the session wants input (or the game ended).
async function untilReady(session) {
  while (!session.isWaiting() && !session.isStopped()) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Drive a session through the given lines like a player would.
async function drive(session, commands) {
  for (const cmd of commands) {
    await untilReady(session);
    if (session.isStopped()) throw new Error(`game ended before "${cmd}"`);
    assert.equal(session.submit(cmd), true, `submit(${cmd}) accepted`);
  }
  await untilReady(session);
}

// Baseline: the original synchronous scripted run of the same commands.
async function scriptedBaseline(commands) {
  ranSetState(6);
  const out = [];
  const io = createIo({ input: scriptedInput(commands), output: { write: (s) => out.push(s) } });
  const eng = new Engine(data, io, locale);
  await eng.run();
  return { text: out.join(''), eng };
}

function newSession(storage, out) {
  ranSetState(6);
  return createSession({ data, locale, storage, onWrite: (s) => out.push(s) });
}

test('queue io reproduces the scripted run byte-for-byte (live play, one command at a time)', async () => {
  const commands = ['NO', ...walkthrough, ...END];
  const base = await scriptedBaseline(commands);

  const out = [];
  const session = newSession(fakeStorage(), out);
  session.newGame();
  await drive(session, commands);

  assert.equal(session.isStopped(), true);
  assert.equal(session.isSuspended(), false);
  assert.equal(session.engine().score, base.eng.score);
  assert.equal(session.engine().turns, base.eng.turns);
  assert.equal(out.join(''), base.text);
});

test('queue io reproduces the scripted run byte-for-byte (type-ahead, all commands enqueued)', async () => {
  const commands = ['NO', ...walkthrough, ...END];
  const base = await scriptedBaseline(commands);

  const out = [];
  const session = newSession(fakeStorage(), out);
  session.newGame();
  session.qio.enqueue(commands); // everything queued before the first getline
  await untilReady(session); // the queue drains; the corpus ends the game
  assert.equal(session.isStopped(), true);

  assert.equal(session.engine().score, base.eng.score);
  assert.equal(out.join(''), base.text);
});

test('autosave replay resumes a mid-game session exactly (simulated page reload)', async () => {
  const commands = ['NO', ...walkthrough, ...END];
  const base = await scriptedBaseline(commands);

  // First visit: play half the game, then "close the tab".
  const storage = fakeStorage();
  const out1 = [];
  const first = newSession(storage, out1);
  first.newGame();
  await drive(first, commands.slice(0, 100));
  assert.equal(first.isWaiting(), true);

  // Second visit: same storage, brand-new session; resume replays the
  // transcript and the remaining commands continue the same game.
  const out2 = [];
  const second = createSession({ data, locale, storage, onWrite: (s) => out2.push(s) });
  assert.equal(second.resumeSaved(), true);
  await drive(second, commands.slice(100));

  assert.equal(second.isStopped(), true);
  assert.equal(second.engine().score, base.eng.score);
  assert.equal(second.engine().turns, base.eng.turns);
  // The reloaded page shows the full history: replay output == original output.
  assert.equal(out2.join(''), base.text);
});

test('SUSPEND stores a snapshot; resumeSaved() continues at the current location', async () => {
  const storage = fakeStorage();
  const out = [];
  const session = newSession(storage, out);
  session.newGame();
  await drive(session, ['NO', 'IN', 'TAKE LAMP', 'SUSPEND', 'Y']);

  assert.equal(session.isStopped(), true);
  assert.equal(session.isSuspended(), true);
  assert.ok(storage.getItem('adventure:suspend'), 'suspend snapshot persisted');

  // "Reload": a new session restores from the snapshot and keeps playing.
  const out2 = [];
  const next = createSession({ data, locale, storage, onWrite: (s) => out2.push(s) });
  assert.equal(next.resumeSaved(), true);
  await drive(next, ['QUIT', 'Y']);

  assert.match(out2.join(''), /YOU'RE INSIDE BUILDING\./);
  assert.match(out2.join(''), /DO YOU REALLY WANT TO QUIT NOW\?/);
  assert.equal(next.isStopped(), true);
  assert.equal(next.isSuspended(), false);
  // A finished game clears its slots.
  assert.equal(storage.getItem('adventure:auto'), null);
  assert.equal(storage.getItem('adventure:suspend'), null);
});

// ---- language switching keeps the game ----
//
// Mirrors web/app.mjs: the display locale carries the yes/no/magic words of
// every bundled language, and applyLocale unions the parse vocabulary, so a
// transcript recorded in one language replays and continues under another.

const enLocale = loadLocale('en');
const ruLocale = loadLocale('ru');
function webLocale(display, all) {
  const locale = { ...display };
  for (const key of ['yesWords', 'noWords', 'magics']) {
    locale[key] = all.flatMap((l) => l[key] ?? []);
  }
  return locale;
}
const ruWeb = webLocale(ruLocale, [enLocale, ruLocale]);
const enWeb = webLocale(enLocale, [enLocale, ruLocale]);
const ruData = applyLocale(data, ruWeb, [enLocale]);
const enData = applyLocale(data, enWeb, [ruLocale]);

test('switching RU -> EN keeps the game: the Russian transcript replays in English', async () => {
  const ruCommands = ['НЕТ', 'ВОЙТИ', 'ВОЗЬМИ ЛАМПУ'];
  const tail = ['ИНВЕНТАРЬ', 'ВЫЙТИ', 'ВЫХОД', 'ДА'];

  // Baseline: the whole script played in Russian.
  const baseOut = [];
  ranSetState(6);
  const baseline = createSession({ data: ruData, locale: ruWeb, storage: fakeStorage(), onWrite: (s) => baseOut.push(s) });
  baseline.newGame();
  await drive(baseline, [...ruCommands, ...tail]);
  assert.equal(baseline.isStopped(), true);

  // First visit in Russian: play half the game, then "switch the language".
  const storage = fakeStorage();
  const out1 = [];
  ranSetState(6);
  const first = createSession({ data: ruData, locale: ruWeb, storage, onWrite: (s) => out1.push(s) });
  first.newGame();
  await drive(first, ruCommands);
  assert.equal(first.isWaiting(), true);
  assert.match(out1.join(''), /ВЫ ВНУТРИ ЗДАНИЯ/);

  // "Reload" in English: the same shared slots resume the same game -- the
  // replay reprints the whole history in English and English commands
  // continue it exactly where the Russian run would be.
  const out2 = [];
  const second = createSession({ data: enData, locale: enWeb, storage, onWrite: (s) => out2.push(s) });
  assert.equal(second.resumeSaved(), true);
  await drive(second, ['INVENTORY', 'OUT', 'QUIT', 'YES']);

  assert.equal(second.isStopped(), true);
  assert.equal(second.engine().score, baseline.engine().score);
  assert.equal(second.engine().turns, baseline.engine().turns);
  const text2 = out2.join('');
  assert.match(text2, /WELCOME TO ADVENTURE/); // the replayed history is English
  assert.match(text2, /YOU ARE INSIDE A BUILDING/);
  assert.doesNotMatch(text2, /ДОБРО ПОЖАЛОВАТЬ/); // ...not Russian
});

test('a SUSPEND snapshot taken in Russian resumes in English (snapshots are language-independent)', async () => {
  const storage = fakeStorage();
  const out = [];
  ranSetState(6);
  const ruSession = createSession({ data: ruData, locale: ruWeb, storage, onWrite: (s) => out.push(s) });
  ruSession.newGame();
  await drive(ruSession, ['НЕТ', 'ВОЙТИ', 'ВОЗЬМИ ЛАМПУ', 'ПАУЗА', 'ДА']);
  assert.equal(ruSession.isSuspended(), true);

  const out2 = [];
  const enSession = createSession({ data: enData, locale: enWeb, storage, onWrite: (s) => out2.push(s) });
  assert.equal(enSession.resumeSaved(), true);
  await drive(enSession, ['QUIT', 'Y']);

  assert.equal(enSession.isStopped(), true);
  assert.match(out2.join(''), /YOU'RE INSIDE BUILDING\./);
  assert.match(out2.join(''), /DO YOU REALLY WANT TO QUIT NOW\?/);
});

// ---- one-time migration of the old per-language slots ----

test('migrateSaveSlots moves per-language progress to the shared keys', () => {
  const storage = fakeStorage();
  storage.setItem('adventure:auto:ru', '{"rngAtStart":6,"commands":["НЕТ"]}');
  migrateSaveSlots(storage, ['en', 'ru']);
  assert.equal(storage.getItem('adventure:auto'), '{"rngAtStart":6,"commands":["НЕТ"]}');
  assert.equal(storage.getItem('adventure:auto:ru'), null);
  assert.equal(storage.getItem('adventure:auto:en'), null);
});

test('migrateSaveSlots prefers a suspend snapshot over an autosave transcript', () => {
  const storage = fakeStorage();
  storage.setItem('adventure:auto:ru', '{"commands":["НЕТ"]}');
  storage.setItem('adventure:suspend:en', '{"state":{"loc":6}}');
  migrateSaveSlots(storage, ['ru', 'en']);
  assert.equal(storage.getItem('adventure:suspend'), '{"state":{"loc":6}}');
  assert.equal(storage.getItem('adventure:auto'), null); // the lesser save is dropped
  assert.equal(storage.getItem('adventure:auto:ru'), null);
  assert.equal(storage.getItem('adventure:suspend:en'), null);
});

test('migrateSaveSlots leaves existing shared slots and empty storage alone', () => {
  const storage = fakeStorage();
  migrateSaveSlots(storage, ['en', 'ru']); // nothing saved: no-op
  assert.equal(storage.getItem('adventure:auto'), null);

  storage.setItem('adventure:auto', '{"commands":["IN"]}');
  storage.setItem('adventure:auto:ru', '{"commands":["НЕТ"]}');
  migrateSaveSlots(storage, ['en', 'ru']); // shared slot wins: no-op
  assert.equal(storage.getItem('adventure:auto'), '{"commands":["IN"]}');
});
