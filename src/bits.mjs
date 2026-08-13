// Faithful port of the PDP-10 FORTRAN bit-manipulation helpers.
//
// The original machine had 36-bit words.  JS bitwise operators (& | << >>) work on
// 32-bit *signed* integers, which would corrupt the arithmetic the game relies on
// (COND bits, the travel condition encoding, the wizard challenge).  We therefore
// implement SHIFT using BigInt internally and return plain Numbers -- every value
// here stays below 2^36, which a double represents exactly.

const M36 = (1n << 36n) - 1n; // 36-bit mask
const SIGN35 = 1n << 35n; // FORTRAN "SHIFT.LT.0": the sign bit of a 36-bit word

// Octal constants copied verbatim from advent.for (SUBROUTINE SHIFT, lines 2820ff).
const C_RSHIFT = BigInt(Number.parseInt('200000000000', 8)); // carry on right shift
const M_RSHIFT = BigInt(Number.parseInt('377777777777', 8)); // mask before /2
const C_LSHIFT = BigInt(Number.parseInt('400000000000', 8)); // carry on left shift
const M_LSHIFT = BigInt(Number.parseInt('177777777777', 8)); // mask before *2
const T_LSHIFT = BigInt(Number.parseInt('200000000000', 8)); // bit tested for left carry

// SHIFT(VAL, DIST): left-shift VAL by DIST bits (right-shift if DIST < 0).
// Mirrors advent.for lines 2820-2838 exactly, including the (idiosyncratic)
// sign-extending right shift and the carry-from-bit-34-to-bit-35 left shift.
export function shift(val, dist) {
  let v = BigInt(val) & M36;
  const d = Number(dist);
  if (d === 0) return Number(v);
  if (d < 0) {
    const count = -d;
    for (let i = 0; i < count; i++) {
      const signExtended = (v & SIGN35) !== 0n ? C_RSHIFT : 0n;
      v = (v & M_RSHIFT) / 2n + signExtended;
    }
    return Number(v);
  }
  for (let i = 0; i < d; i++) {
    const carry = (v & T_LSHIFT) !== 0n ? C_LSHIFT : 0n;
    v = (v & M_LSHIFT) * 2n + carry;
  }
  return Number(v);
}

// 36-bit bitwise helpers (used where FORTRAN writes .AND. / .OR. on full words).
export function and36(a, b) {
  return Number(BigInt(a) & BigInt(b) & M36);
}
export function or36(a, b) {
  return Number((BigInt(a) | BigInt(b)) & M36);
}

// BITSET(L, N) = COND(L) has bit N set (bit 0 = units bit).  N is small (0..9).
// (Statement function, advent.for line 84.)
export function bitset(condWord, n) {
  return and36(condWord, shift(1, n)) !== 0;
}
