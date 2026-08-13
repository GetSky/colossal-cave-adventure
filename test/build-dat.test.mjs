// Verifies the precompiled data.json against the FORTRAN's own table-space
// report (advent.for lines 596-611) and a handful of known values.  A failure
// here means the loader drifted from the original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data.json' with { type: 'json' };

const travelEntryCount = Object.values(data.travel).reduce((n, a) => n + a.length, 0);

test('location / message counts match the FORTRAN limits', () => {
  const maxLoc = Math.max(...Object.keys(data.ltext).map(Number));
  assert.equal(maxLoc, 140, 'highest location number');
  assert.ok(Object.keys(data.stext).length > 0, 'some short descriptions');
  assert.ok(Object.keys(data.rtext).length <= data.limits.RTXSIZ, 'rtext within limit');
  assert.ok(Object.keys(data.mtext).length <= data.limits.MAGSIZ, 'mtext within limit');
});

test('travel / vocab counts', () => {
  assert.ok(travelEntryCount <= data.limits.TRVSIZ, 'travel within limit');
  assert.ok(travelEntryCount > 700, `expected ~741 travel entries, got ${travelEntryCount}`);
  assert.equal(data.vocab.length, 295, 'vocabulary word count');
});

test('grate (object 3): inventory + two property messages', () => {
  const g = data.otext['3'];
  assert.deepEqual(g.inv, ['*GRATE']);
  assert.deepEqual(g.props[0], ['THE GRATE IS LOCKED.']);
  assert.deepEqual(g.props[1], ['THE GRATE IS OPEN.']);
});

test('plant (object 24): six property messages, one multi-line', () => {
  const p = data.otext['24'];
  assert.equal(p.props.length, 6);
  assert.equal(p.props[2].length, 2, 'prop 2 (12-ft beanstalk) is two lines');
});

test('two-placed and immovable objects from section 7', () => {
  assert.equal(data.plac[3], 8); // grate above
  assert.equal(data.fixd[3], 9); // grate below
  assert.equal(data.plac[9], 94); // door
  assert.equal(data.fixd[9], -1); // door immovable
  assert.equal(data.plac[2], 3); // lamp starts in the building
});

test('condition bits: loc 1 is lit + liquid (cond=5)', () => {
  assert.equal(data.cond[1], 5);
  assert.equal(data.cond[8], 17); // + hint bit 4
});

test('classes are ordered by ascending threshold, last is the cap', () => {
  assert.equal(data.classes.length, 9);
  assert.equal(data.classes[0].threshold, 35);
  assert.equal(data.classes[data.classes.length - 1].threshold, 9999);
});

test('travel entries encode dest*1000 + verb', () => {
  // raw row "1  2  2 44 29" -> dest 2, verbs 2/44/29
  const t = data.travel['1'];
  assert.deepEqual(
    t.slice(0, 3),
    [
      { v: 2, d: 2002 },
      { v: 44, d: 2044 },
      { v: 29, d: 2029 },
    ],
  );
});

test('hints parsed correctly', () => {
  assert.equal(data.hntmax, 9);
  assert.deepEqual(data.hints[4], { turns: 4, cost: 2, qmsg: 62, hmsg: 63 });
});

test('vocabulary words are 5-char upper-case, PHROG obfuscation removed', () => {
  assert.deepEqual(data.vocab[0], { n: 2, w: 'ROAD ' });
  const key = data.vocab.find((e) => e.w === 'KEYS ');
  assert.ok(key, 'KEYS present in vocabulary');
});
