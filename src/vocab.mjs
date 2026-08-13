// Vocabulary lookup -- port of FORTRAN function VOCAB (advent.for lines
// 2309-2337).  The word table is the precompiled `vocab` array (entries
// { n, w }); we keep the linear search and first-match semantics of the
// original.  The `PHROG` XOR (obfuscation only) is dropped.
//
//   vocab(id, init):
//     init >= 0  -- initialisation lookup; restrict to type `init` (n/1000) and
//                   return n % 1000.  Not finding the word is a fatal bug.
//     init < 0   -- runtime lookup; return the raw n, or -1 if unknown.

export function makeVocabLookup(table) {
  return function vocab(id, init) {
    const w = norm(id);
    for (let i = 0; i < table.length; i++) {
      const e = table[i];
      if (e.n === -1) break;
      if (init >= 0 && Math.floor(e.n / 1000) !== init) continue;
      if (e.w === w) return init >= 0 ? e.n % 1000 : e.n;
    }
    if (init < 0) return -1;
    throw new Error(`BUG(5): required vocabulary word "${id}" (type ${init}) not found`);
  };
}

// Normalise to the A5 contract: upper-case, first 5 chars, blank-padded.
export function norm(id) {
  return (String(id).toUpperCase() + '     ').slice(0, 5);
}
