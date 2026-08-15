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
import { loadLocale } from '../src/i18n-node.mjs';
import { ranSetState } from '../src/rng.mjs';
import { createSession } from '../web/game.mjs';

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
