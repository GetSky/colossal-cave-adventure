// Palmer's published 350-point walkthrough, run with a fixed RNG state.
// The source explicitly notes that a literal play-through is affected by
// dwarves and the pirate, so this is a deterministic command-regression test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createIo, scriptedInput } from '../src/io.mjs';
import { Engine } from '../src/engine.mjs';
import { ranSetState } from '../src/rng.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));

const walkthrough = `
e|get lamp|xyzzy|on lamp|e|get cage|pit|e|get bird|w|d|s|get gold|n|n|free bird|drop cage|s|get jewel|n|w|get coins|e|n|get silver|n|plover|ne|get pyramid|s|plover|plugh|drop pyramid|drop coins|drop jewel|drop silver|drop gold|get bottle|get food|get keys|plugh|s|d|bedquilt|slab|s|d|pour water|u|w|u|reservoir|get water|s|s|d|s|d|pour water|u|e|d|get oil|u|w|d|climb|w|get eggs|n|oil door|n|get trident|w|d|drop bottle|sw|u|toss eggs|cross|ne|barren|e|feed bear|open chain|get chain|get bear|w|fork|ne|e|get spice|fork|w|w|cross|free bear|cross|sw|d|drop keys|bedquilt|e|n|open clam|d|d|get pearl|u|u|s|u|e|u|n|plugh|drop chain|drop spice|drop trident|drop pearl|plugh|s|d|bedquilt|w|oriental|n|w|drop lamp|drop axe|e|get emerald|w|get axe|get lamp|nw|s|get vase|se|e|get pillow|w|w|w|d|climb|w|fee|fie|foe|foo|get eggs|s|d|u|w|u|s|kill dragon|yes|get rug|e|e|n|n|plugh|drop rug|drop pillow|drop vase|drop emerald|drop eggs|xyzzy|get rod|pit|d|w|wave rod|w|get diamond|w|s|e|s|s|s|n|e|n|e|nw|get chest|get diamond|se|n|d|debris|xyzzy|drop rod|drop chest|drop diamond|plugh|s|d|bedquilt|e|e|get magazine|e|drop magazine|n|sw|get rod|ne|drop rod|sw|blast
`.trim().split('|');

function play(commands, seed = 6) {
  ranSetState(seed);
  let reads = 0;
  const input = scriptedInput(['NO', ...commands]);
  const io = createIo({
    input: () => {
      const command = input();
      if (command !== null) reads++;
      return command;
    },
    output: { write() {} },
  });
  const eng = new Engine(data, io);
  eng.run();
  return { eng, reads };
}

test('Palmer walkthrough command corpus runs end-to-end deterministically', () => {
  const { eng, reads } = play(walkthrough);

  assert.equal(walkthrough.length, 216);
  assert.equal(reads, walkthrough.length + 1); // plus the initial NO
  assert.equal(eng.turns, walkthrough.length - 1);
  assert.equal(eng.score, 193);
});

test('walkthrough oil-door shorthand pours the oil and opens the door', () => {
  const oilDoor = walkthrough.slice(0, walkthrough.indexOf('oil door') + 1);
  const { eng } = play(oilDoor);

  assert.equal(eng.prop[eng.DOOR], 1);
  assert.equal(eng.prop[eng.BOTTLE], 1);
});
