import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ran, ranSetState, ranState } from '../src/rng.mjs';
import { shift } from '../src/bits.mjs';

const MOD = 1048576;

test('RAN is deterministic given a fixed seed', () => {
  ranSetState(1);
  const a = [ran(100), ran(MOD), ran(MOD), ran(MOD)];
  ranSetState(1);
  const b = [ran(100), ran(MOD), ran(MOD), ran(MOD)];
  assert.deepEqual(a, b);
});

test('RAN returns hand-computed values', () => {
  ranSetState(1);
  // R=1 -> spin -> 1*1021 % MOD = 1021 ; floor(100*1021/MOD) = 0
  assert.equal(ran(100), 0);
  // R=1021 -> spin -> 1021*1021 % MOD = 1042441 ; ran(MOD) returns R
  assert.equal(ran(MOD), 1042441);
  // R=1042441 -> spin -> 1042441*1021 % MOD
  //   1042441*1021 = 1064332261 ; 1015*1048576 = 1064304640 ; diff = 27621
  assert.equal(ran(MOD), 27621);
  assert.equal(ranState(), 27621);
});

test('RAN respects its range', () => {
  ranSetState(12345);
  for (let i = 0; i < 5000; i++) {
    const r = ran(7);
    assert.ok(r >= 0 && r < 7, `out of range: ${r}`);
  }
  assert.equal(ran(1), 0); // range 1 always yields 0
});

test('shift(1,n) == 2**n for n in 0..35 and wraps to 0 at 36', () => {
  for (let n = 0; n < 36; n++) {
    assert.equal(shift(1, n), 2 ** n, `shift(1,${n})`);
  }
  assert.equal(shift(1, 36), 0);
});

test('shift right is arithmetic (sign bit 35 extends)', () => {
  // 0x800000000 = bit 35 set = negative in 36-bit FORTRAN
  const neg = 0x800000000;
  // one arithmetic right shift should keep the sign bit set
  assert.equal(shift(neg, -1) & 0x800000000, 0x800000000 >>> 0);
});
