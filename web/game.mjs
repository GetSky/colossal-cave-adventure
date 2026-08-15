// Web-side game driver -- environment-independent (no DOM, no window), so it
// is unit-testable under node (see test/web.test.mjs).  It bridges the
// engine's awaited getline() to a promise-backed input queue and keeps the
// game resumable across page reloads:
//
//   * autosave -- after every submitted command, the RNG state at game start
//     plus the command transcript are persisted.  Resuming replays the
//     transcript through a fresh engine: the game is fully deterministic
//     given the RNG state, so the replay lands exactly at the same awaited
//     input, whatever the original session was asking for.
//   * SUSPEND  -- the engine's state snapshot (via the onSave hook) is
//     persisted; resuming calls engine.resume() and continues at L2000,
//     exactly like the CLI's --resume.

import { Engine } from '../src/engine.mjs';
import { ran, ranState, ranSetState } from '../src/rng.mjs';

// Promise-backed io: getline() drains the queue first (type-ahead, replay),
// then suspends until feed() delivers the next line.
export function createQueueIo({ onWrite }) {
  const queue = [];
  let waiter = null;
  let onWait = null; // called when the engine starts waiting for input
  const io = {
    println(s) {
      onWrite(s == null ? '\n' : s + '\n');
    },
    print(s) {
      onWrite(s == null ? '' : String(s));
    },
    blank() {
      onWrite('\n');
    },
    getline() {
      if (queue.length > 0) return queue.shift();
      const pending = new Promise((resolve) => {
        waiter = (line) => {
          waiter = null;
          resolve(line);
        };
      });
      onWait?.(); // the engine is now waiting for input
      return pending;
    },
  };
  return {
    io,
    enqueue(lines) {
      queue.push(...lines);
    },
    feed(line) {
      if (waiter) {
        waiter(line);
      } else {
        queue.push(line);
      }
    },
    isWaiting() {
      return waiter !== null;
    },
    setOnWait(cb) {
      onWait = cb;
    },
  };
}

// One game session (a live engine plus its save slots).  `storage` is any
// { getItem, setItem, removeItem } object (localStorage in the browser, a Map
// wrapper in tests).  Slots are per-language: pass e.g. saveKey
// 'adventure:auto:ru'.
export function createSession({ data, locale, storage, onWrite, saveKey = 'adventure:auto', suspendKey = 'adventure:suspend', onStateChange }) {
  const qio = createQueueIo({ onWrite });

  let engine = null;
  let stopped = false; // run() resolved: game over, or suspended
  let suspended = false; // stopped because of the SUSPEND command
  let rngAtStart = 0;
  let commands = [];

  const notify = () => onStateChange?.(session);
  const readSlot = (key) => {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeSlot = (key, value) => storage.setItem(key, JSON.stringify(value));

  function persistAutosave() {
    writeSlot(saveKey, { rngAtStart, commands });
  }

  // The engine's saveGame() hands us the serialized snapshot (as JSON).
  function onSaveSnapshot(json) {
    writeSlot(suspendKey, { state: JSON.parse(json) });
    suspended = true; // vSuspend returns 'STOP' right after saving
  }

  function finish() {
    stopped = true;
    if (!suspended) {
      // The game really ended (quit, death, winning score): progress is spent.
      storage.removeItem(saveKey);
      storage.removeItem(suspendKey);
    }
    notify();
  }

  function onError(err) {
    stopped = true;
    onWrite(`\n*** ${err?.message ?? err} ***\n`);
    notify();
  }

  function launch(startPhase, { enqueueCommands = [], afterConstruct } = {}) {
    ranSetState(rngAtStart);
    engine = new Engine(data, qio.io, locale, { onSave: onSaveSnapshot });
    afterConstruct?.(engine);
    if (enqueueCommands.length > 0) qio.enqueue(enqueueCommands);
    stopped = false;
    suspended = false;
    engine.run(startPhase).then(finish, onError);
    notify();
  }

  const session = {
    qio,

    // Fresh game; any saved progress in the slots is discarded.
    newGame() {
      storage.removeItem(saveKey);
      storage.removeItem(suspendKey);
      // The generator seeds itself from the clock on first use; force that
      // now so the captured state is a concrete, replayable seed.
      if (ranState() === 0) ran(1);
      rngAtStart = ranState();
      commands = [];
      persistAutosave();
      launch('L1');
    },

    // Restore after a page reload: prefer a SUSPEND snapshot, else replay the
    // autosaved transcript.  Returns false when there is nothing to restore.
    resumeSaved() {
      if (engine && !stopped) return true; // already playing
      const snap = readSlot(suspendKey);
      if (snap && snap.state) {
        // The snapshot stays the source of truth until the game ends or a
        // new game begins (finish()/newGame() clear it), so every reload
        // resumes from the same consistent state.
        launch('L2000', { afterConstruct: (eng) => eng.resume(snap.state) });
        return true;
      }
      const saved = readSlot(saveKey);
      if (saved && Array.isArray(saved.commands) && saved.commands.length > 0) {
        rngAtStart = saved.rngAtStart;
        commands = [...saved.commands];
        launch('L1', { enqueueCommands: saved.commands });
        return true;
      }
      return false;
    },

    // User submitted a command line.  Returns false when the game cannot
    // accept input (not started, replaying, or over).
    submit(line) {
      if (!engine || stopped || !qio.isWaiting()) return false;
      commands.push(line);
      persistAutosave();
      qio.feed(line);
      return true;
    },

    isWaiting: () => engine !== null && !stopped && qio.isWaiting(),
    isStopped: () => stopped,
    isSuspended: () => suspended,
    engine: () => engine,
  };

  return session;
}
