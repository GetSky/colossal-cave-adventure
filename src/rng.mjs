// Faithful port of the FORTRAN RAN random-number generator (advent.for lines
// 2842-2861) and DATIME (lines 2865-2898).
//
// RAN is a multiplicative-congruential generator:  R = (R * 1021) mod 1048576,
// returning floor(range * R / 1048576) -- i.e. a uniform integer in [0, range-1].
// Keeping the *same* generator preserves the original probabilistic behaviour
// (dwarf knife throws, the 35% pit-in-the-dark fall, pirate appearances, etc.).
//
// The seed persists for the lifetime of the module (just like FORTRAN's DATA R/0/).

const MOD = 1048576; // 2**20

let R = 0; // current state (0 = "not yet seeded")

// Force the generator state (for tests / saved-game restore).
export function ranSetState(r) {
  R = r >>> 0;
}

export function ranState() {
  return R;
}

// DATIME: return [D, T] where D = days since 1977-01-01 and T = minutes past
// midnight (local time), matching the FORTRAN subroutine's contract.  Leap years
// are handled natively by JS Date arithmetic.
export function datime() {
  const now = new Date();
  const T = now.getHours() * 60 + now.getMinutes();
  const epoch = new Date(1977, 0, 1); // local midnight, 1977-01-01
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const D = Math.round((today.getTime() - epoch.getTime()) / 86400000);
  return [D, T];
}

// RAN(RANGE): uniform integer in [0, RANGE-1].  Direct port of advent.for RAN.
export function ran(range) {
  let d = 1;
  if (R === 0) {
    const [D, T] = datime();
    R = (18 * T + 5) % MOD;
    d = 1000 + (D % 1000); // spin ~1-2k times to decorrelate from the clock
  }
  for (let t = 1; t <= d; t++) {
    R = (R * 1021) % MOD;
  }
  return Math.trunc((range * R) / MOD);
}
