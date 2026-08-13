// Pre-compiler: advent.dat -> src/data.json
//
// This is a faithful, line-oriented port of the database loader in advent.for
// (labels 1002-1100).  The original loads the data into in-memory arrays at
// runtime; here we do the same work once at build time and emit JSON that the
// engine consumes directly.  Every section's parsing mirrors the FORTRAN.
//
// Run with:  node tools/build-dat.mjs
//
// Notable fidelity points:
//  * The 'PHROG' XOR obfuscation on vocabulary words (advent.for lines 325/2322)
//    is dropped -- it only existed to hinder core-image reading and has no effect
//    on lookups.  Words are stored plain (5-char, upper-cased).
//  * A5 packed words (5 chars/word) become ordinary strings; one dat row == one
//    printed line.  Internal tabs within a row join fragments with a single
//    space (matches the canonical game output, e.g. loc 15 "ALIVE. A COLD WIND").
//  * '>$<' marks "no message"; we keep the text but the engine suppresses it.
//  * Arrays that the FORTRAN indexes 1-based (plac/fixd/cond/actspk/hints) keep
//    a dummy element 0 so the engine can use the same indexing verbatim.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shift, or36 } from '../src/bits.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAT_PATH = path.join(__dirname, '..', 'original', 'advent.dat');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data.json');

// ---- raw line stream (one FORTRAN READ == one physical line) ----
const rawText = fs.readFileSync(DAT_PATH, 'latin1');
const physLines = rawText.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
let pos = 0;
const readLine = () => (pos < physLines.length ? physLines[pos++] : null);

// Parse the whitespace/tab separated integers from a numeric dat line (FORMAT 99G).
const numList = (line) =>
  line
    .split(/[\t ]+/)
    .filter((s) => s !== '')
    .map((s) => Number.parseInt(s, 10));

// Split a text dat line into [keyNumber, text].  Internal tabs join with ' '.
function splitTextRow(line) {
  const tab = line.indexOf('\t');
  if (tab < 0) {
    // no tab: whole line is a number (shouldn't happen for text sections)
    return [Number.parseInt(line, 10), ''];
  }
  const key = Number.parseInt(line.slice(0, tab), 10);
  const rest = line.slice(tab + 1);
  const text = rest.split('\t').join(' ').replace(/\s+$/g, ''); // join fragments, rtrim
  return [key, text];
}

// Limits (advent.for DATA statement, line 90).
const LINSIZ = 9650;
const TRVSIZ = 750;
const TABSIZ = 300;
const LOCSIZ = 150;
const VRBSIZ = 35;
const RTXSIZ = 205;
const CLSMAX = 12;
const HNTSIZ = 20;
const MAGSIZ = 35;

// Output structures.
const ltext = {}; // loc -> [line, ...]
const stext = {}; // loc -> [line, ...]
const rtext = {}; // msg# -> [line, ...]
const mtext = {}; // msg# -> [line, ...]
const otext = {}; // obj  -> { inv:[line], props:[[line,...], ...] }
const classes = []; // ordered { threshold, lines:[...] }
const travel = {}; // loc  -> [{v:verb, d:destEnc}, ...]
const vocab = []; // { n, w }  (w is 5-char upper-cased, no XOR)
const plac = [0]; // 1-based
const fixd = [0]; // 1-based
const actspk = [0]; // 1-based
const hints = [null]; // 1-based; hints[k] = {turns,cost,qmsg,hmsg}
const cond = [0]; // 1-based; cond[loc] = OR of shift(1,k)
let hntmax = 0;

// counters for the table-space report
let linuse = 1; // words of message text used (informational only)
let trvs = 0; // travel entries
let tabndx = 0; // vocab entries
let clsses = 0;

// Pad/truncate a word to exactly 5 upper-case chars (the A5 contract).
const a5 = (w) => (w.toUpperCase() + '     ').slice(0, 5);

// ---- message sections 1,2,6,12 (and 10,5 handled specially) ----
// Mirror label 1004: same key as previous row => continuation line of same msg.
function readMessageSection(sect) {
  let oldKey = -1;
  while (true) {
    const line = readLine();
    if (line == null) throw new Error(`unexpected EOF in section ${sect}`);
    const [key, text] = splitTextRow(line);
    if (key === -1) return; // section terminator
    if (key === 0) continue; // FORTRAN skips loc-0 / all-blank lines
    const target = sect === 1 ? ltext : sect === 2 ? stext : sect === 6 ? rtext : mtext;
    if (key !== oldKey) target[key] = []; // new message
    target[key].push(text);
    oldKey = key;
    linuse++;
  }
}

// ---- section 10: class messages (ordered, threshold = key) ----
function readClassSection() {
  let oldKey = -1;
  let cur = null;
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 10');
    const [key, text] = splitTextRow(line);
    if (key === -1) return;
    if (key === 0) continue;
    if (key !== oldKey) {
      cur = { threshold: key, lines: [] };
      classes.push(cur);
      clsses++;
    }
    cur.lines.push(text);
    oldKey = key;
    linuse++;
  }
}

// ---- section 5: object descriptions (inventory + per-prop messages) ----
// Mirror label 1010: key 1..99 -> inventory of that object; key %100==0 -> prop.
function readObjectSection() {
  let curObj = null;
  let lastPropCode = -1;
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 5');
    const [key, text] = splitTextRow(line);
    if (key === -1) return;
    if (key === 0 && curObj == null) continue; // leading blanks only
    if (key % 100 !== 0) {
      // inventory line for object `key`
      curObj = key;
      if (!otext[curObj]) otext[curObj] = { inv: [], props: [] };
      otext[curObj].inv = [text];
      lastPropCode = -1;
    } else {
      const propIndex = key / 100;
      const o = otext[curObj] || (otext[curObj] = { inv: [], props: [] });
      if (propIndex !== lastPropCode) {
        o.props[propIndex] = [text];
      } else {
        o.props[propIndex].push(text);
      }
      lastPropCode = propIndex;
    }
    linuse++;
  }
}

// ---- section 3: travel table (label 1030) ----
function readTravelSection() {
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 3');
    const nums = numList(line);
    let i = 0;
    const loc = nums[i++];
    if (loc === -1) return;
    if (loc === 0) continue; // FORTRAN kluge: skip blank
    const newloc = nums[i++];
    const verbs = [];
    for (; i < nums.length; i++) {
      if (nums[i] === 0) break;
      verbs.push(nums[i]);
    }
    if (!travel[loc]) travel[loc] = [];
    for (const v of verbs) {
      travel[loc].push({ v, d: newloc * 1000 + v });
      trvs++;
    }
  }
}

// ---- section 4: vocabulary (label 1040) ----
function readVocabSection() {
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 4');
    const tab = line.indexOf('\t');
    const nStr = tab >= 0 ? line.slice(0, tab) : line;
    const n = Number.parseInt(nStr, 10);
    if (n === 0) continue; // FORTRAN re-reads on 0
    if (n === -1) return;
    const w = tab >= 0 ? a5(line.slice(tab + 1)) : '     ';
    vocab.push({ n, w });
    tabndx++;
  }
}

// ---- section 7: object locations (label 1050) ----
function readObjectLocations() {
  // ensure arrays cover up to 100 (1-based)
  while (plac.length <= 100) plac.push(0);
  while (fixd.length <= 100) fixd.push(0);
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 7');
    const nums = numList(line);
    if (nums[0] === -1) return;
    const obj = nums[0];
    const j = nums[1] ?? 0;
    const k = nums[2] ?? 0;
    plac[obj] = j;
    fixd[obj] = k;
  }
}

// ---- section 8: action defaults (label 1060) ----
function readActionDefaults() {
  while (actspk.length <= VRBSIZ) actspk.push(0);
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 8');
    const nums = numList(line);
    if (nums[0] === -1) return;
    actspk[nums[0]] = nums[1];
  }
}

// ---- section 9: conditions (label 1070) ----
function readConditions() {
  while (cond.length <= LOCSIZ) cond.push(0);
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 9');
    const nums = numList(line);
    const k = nums[0];
    if (k === -1) return;
    for (let i = 1; i < nums.length; i++) {
      const loc = nums[i];
      if (loc === 0) break;
      cond[loc] = or36(cond[loc], shift(1, k));
    }
  }
}

// ---- section 11: hints (label 1080) ----
function readHints() {
  while (hints.length <= HNTSIZ) hints.push(null);
  while (true) {
    const line = readLine();
    if (line == null) throw new Error('unexpected EOF in section 11');
    const nums = numList(line);
    const k = nums[0];
    if (k === -1) return;
    if (k === 0) continue;
    hints[k] = { turns: nums[1], cost: nums[2], qmsg: nums[3], hmsg: nums[4] };
    if (k > hntmax) hntmax = k;
  }
}

// ---- main: dispatch by section number (label 1002) ----
function build() {
  while (true) {
    const marker = readLine();
    if (marker == null) break;
    const sect = Number.parseInt(marker.trim(), 10);
    if (Number.isNaN(sect)) continue;
    switch (sect) {
      case 0:
        finish();
        return;
      case 1:
      case 2:
        readMessageSection(sect);
        break;
      case 3:
        readTravelSection();
        break;
      case 4:
        readVocabSection();
        break;
      case 5:
        readObjectSection();
        break;
      case 6:
        readMessageSection(sect);
        break;
      case 7:
        readObjectLocations();
        break;
      case 8:
        readActionDefaults();
        break;
      case 9:
        readConditions();
        break;
      case 10:
        readClassSection();
        break;
      case 11:
        readHints();
        break;
      case 12:
        readMessageSection(sect);
        break;
      default:
        throw new Error(`invalid section number ${sect}`);
    }
  }
  finish();
}

function finish() {
  const data = {
    limits: { LINSIZ, TRVSIZ, TABSIZ, LOCSIZ, VRBSIZ, RTXSIZ, CLSMAX, HNTSIZ, MAGSIZ },
    usage: { linuse, trvs, tabndx, clsses, hntmax },
    ltext,
    stext,
    rtext,
    mtext,
    otext,
    classes,
    travel,
    vocab,
    plac,
    fixd,
    actspk,
    hints,
    cond,
    hntmax,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(data, null, 0) + '\n', 'utf8');
  const objCount = Object.keys(otext).length;
  process.stdout.write(
    `Wrote ${OUT_PATH}\n` +
      `  locations:  ${Math.max(...Object.keys(ltext).map(Number))} ltext, ` +
      `${Object.keys(stext).length} stext\n` +
      `  messages:   ${Object.keys(rtext).length} rtext, ${Object.keys(mtext).length} mtext\n` +
      `  objects:    ${objCount}\n` +
      `  travel:     ${trvs} entries over ${Object.keys(travel).length} locs\n` +
      `  vocab:      ${tabndx}\n` +
      `  classes:    ${clsses}, hints: ${hntmax}\n`,
  );
}

build();
