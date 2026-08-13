// Regression tests for the engine, driven by scripted input through a mock io.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createIo, scriptedInput } from '../src/io.mjs';
import { Engine } from '../src/engine.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../src/data.json', import.meta.url), 'utf8'));

// Run a game with the given scripted commands; return the joined output text.
function play(cmds) {
  const out = [];
  const io = createIo({ input: scriptedInput(cmds), output: { write: (s) => out.push(s) } });
  const eng = new Engine(data, io);
  eng.run();
  return { text: out.join(''), eng };
}

test('opening: welcome then road description', () => {
  const { text } = play(['NO', 'QUIT', 'Y']);
  assert.match(text, /WELCOME TO ADVENTURE/);
  assert.match(text, /YOU ARE STANDING AT THE END OF A ROAD BEFORE A SMALL BRICK BUILDING/);
  assert.match(text, /DO YOU REALLY WANT TO QUIT NOW\?/);
});

test('instructions are shown when requested', () => {
  const { text } = play(['YES', 'QUIT', 'Y']);
  assert.match(text, /SOMEWHERE NEARBY IS COLOSSAL CAVE/);
  assert.match(text, /WILLIE CROWTHER/);
});

test('take items and inventory', () => {
  const { text, eng } = play(['NO', 'IN', 'TAKE KEYS', 'TAKE LAMP', 'INVENT', 'QUIT', 'Y']);
  assert.match(text, /YOU ARE CURRENTLY HOLDING THE FOLLOWING:/);
  assert.match(text, /SET OF KEYS/);
  assert.match(text, /BRASS LANTERN/);
  assert.equal(eng.holdng, 2);
});

test('lamp on/off', () => {
  const { text } = play(['NO', 'IN', 'TAKE LAMP', 'LIGHT LAMP', 'OFF LAMP', 'QUIT', 'Y']);
  assert.match(text, /YOUR LAMP IS NOW ON\./);
  assert.match(text, /YOUR LAMP IS NOW OFF\./);
});

test('enter cave through the grate', () => {
  const { text, eng } = play([
    'NO', 'IN', 'TAKE KEYS', 'TAKE LAMP', 'LIGHT LAMP', 'OUT',
    'DOWN', 'GRATE', 'UNLOCK GRATE', 'DOWN', 'QUIT', 'Y',
  ]);
  assert.match(text, /THE GRATE IS NOW UNLOCKED\./);
  assert.match(text, /YOU ARE IN A SMALL CHAMBER BENEATH A 3X3 STEEL GRATE/);
  assert.ok(eng.dflag === 0 || eng.dflag === 1); // not yet fully active near the entrance
});

test('unknown word yields a "don\'t know" message', () => {
  const { text } = play(['NO', 'ZQNMP', 'QUIT', 'Y']);
  assert.match(text, /I DON'T KNOW THAT WORD\.|I DON'T UNDERSTAND THAT!|WHAT\?/);
});

test('scoring rates a fresh quit as a rank amateur', () => {
  const { text } = play(['NO', 'QUIT', 'Y']);
  assert.match(text, /You scored +\d+ out of a possible +350/);
  assert.match(text, /RANK AMATEUR/);
});
