// The Adventure game engine -- a port of the main program block of advent.for
// (lines 1-2094) plus the inlined data-structure / I/O subroutines.
//
// Control flow: the FORTRAN main block is a tangle of GOTOs between ~30 numeric
// labels.  We keep that structure by turning each top-level label into a phase
// method (named after the label, e.g. L2000) that does its work and *returns*
// the name of the next phase.  run() simply chains them until 'STOP'.
// FORTRAN line numbers are cited in comments for traceability.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ran, datime as datimeFn } from './rng.mjs';
import { createSpeaker } from './text.mjs';
import { makeVocabLookup, norm } from './vocab.mjs';
import { installWizard, EofSignal } from './wizard.mjs';

const SAVE_PATH = path.join(os.homedir(), '.gamayun-save.json');

export class Engine {
  constructor(data, io) {
    this.data = data;
    this.io = io;
    this.speech = createSpeaker(data, io);
    this.vocab = makeVocabLookup(data.vocab);
    this.setup();
  }

  bug(num) {
    throw new Error(`BUG(${num}) -- see advent.for SUBROUTINE BUG`);
  }
  eq(wd, lit) {
    return wd === norm(lit);
  }

  // =====================================================================
  //  SETUP -- port of advent.for lines 1100-1800
  // =====================================================================
  setup() {
    const d = this.data;
    const LOCSIZ = d.limits.LOCSIZ;

    this.place = new Array(101).fill(0);
    this.fixed = new Array(101).fill(0);
    this.prop = new Array(101).fill(0);
    this.link = new Array(201).fill(0);
    this.atloc = new Array(LOCSIZ + 1).fill(0);
    this.abb = new Array(LOCSIZ + 1).fill(0);

    // forced-motion cond bits (lines 1091-1094): first travel entry has verb 1
    for (let i = 1; i <= LOCSIZ; i++) {
      const t = d.travel[i];
      if (d.ltext[i] && t && t.length > 0 && t[0].v === 1) d.cond[i] = 2;
    }
    this.cond = d.cond;

    // build ATLOC/LINK via drop, two-placed first, both loops backwards (403-413)
    for (let i = 1; i <= 100; i++) {
      const k = 101 - i;
      if (d.fixd[k] <= 0) continue;
      this.drop(k + 100, d.fixd[k]);
      this.drop(k, d.plac[k]);
    }
    for (let i = 1; i <= 100; i++) {
      const k = 101 - i;
      this.fixed[k] = d.fixd[k];
      if (d.plac[k] !== 0 && d.fixd[k] <= 0) this.drop(k, d.plac[k]);
    }

    // treasures 50..79 (lines 421-426)
    this.maxtrs = 79;
    this.tally = 0;
    this.tally2 = 0;
    for (let i = 50; i <= this.maxtrs; i++) {
      if (d.otext[i]) this.prop[i] = -1;
      this.tally -= this.prop[i];
    }

    this.hinted = new Array(d.hntmax + 1).fill(false);
    this.hintlc = new Array(d.hntmax + 1).fill(0);

    const v = this.vocab;
    this.KEYS = v('KEYS', 1);
    this.LAMP = v('LAMP', 1);
    this.GRATE = v('GRATE', 1);
    this.CAGE = v('CAGE', 1);
    this.ROD = v('ROD', 1);
    this.ROD2 = this.ROD + 1;
    this.STEPS = v('STEPS', 1);
    this.BIRD = v('BIRD', 1);
    this.DOOR = v('DOOR', 1);
    this.PILLOW = v('PILLO', 1);
    this.SNAKE = v('SNAKE', 1);
    this.FISSUR = v('FISSU', 1);
    this.TABLET = v('TABLE', 1);
    this.CLAM = v('CLAM', 1);
    this.OYSTER = v('OYSTE', 1);
    this.MAGZIN = v('MAGAZ', 1);
    this.DWARF = v('DWARF', 1);
    this.KNIFE = v('KNIFE', 1);
    this.FOOD = v('FOOD', 1);
    this.BOTTLE = v('BOTTL', 1);
    this.WATER = v('WATER', 1);
    this.OIL = v('OIL', 1);
    this.PLANT = v('PLANT', 1);
    this.PLANT2 = this.PLANT + 1;
    this.AXE = v('AXE', 1);
    this.MIRROR = v('MIRRO', 1);
    this.DRAGON = v('DRAGO', 1);
    this.CHASM = v('CHASM', 1);
    this.TROLL = v('TROLL', 1);
    this.TROLL2 = this.TROLL + 1;
    this.BEAR = v('BEAR', 1);
    this.MESSAG = v('MESSA', 1);
    this.VEND = v('VENDI', 1);
    this.BATTER = v('BATTE', 1);
    this.NUGGET = v('GOLD', 1);
    this.COINS = v('COINS', 1);
    this.CHEST = v('CHEST', 1);
    this.EGGS = v('EGGS', 1);
    this.TRIDNT = v('TRIDE', 1);
    this.VASE = v('VASE', 1);
    this.EMRALD = v('EMERA', 1);
    this.PYRAM = v('PYRAM', 1);
    this.PEARL = v('PEARL', 1);
    this.RUG = v('RUG', 1);
    this.CHAIN = v('CHAIN', 1);
    this.SPICES = v('SPICE', 1);
    this.BACK = v('BACK', 0);
    this.LOOK = v('LOOK', 0);
    this.CAVE = v('CAVE', 0);
    this.NULL = v('NULL', 0);
    this.ENTRNC = v('ENTRA', 0);
    this.DPRSSN = v('DEPRE', 0);
    this.SAY = v('SAY', 2);
    this.LOCK = v('LOCK', 2);
    this.THROW = v('THROW', 2);
    this.FIND = v('FIND', 2);
    this.INVENT = v('INVEN', 2);

    // dwarf init (lines 517-528)
    this.chloc = 114;
    this.chloc2 = 140;
    this.dseen = new Array(7).fill(false);
    this.dloc = new Array(7).fill(0);
    this.odloc = new Array(7).fill(0);
    this.dflag = 0;
    this.dloc[1] = 19;
    this.dloc[2] = 27;
    this.dloc[3] = 33;
    this.dloc[4] = 44;
    this.dloc[5] = 64;
    this.dloc[6] = this.chloc;
    this.daltlc = 18;

    this.turns = 0;
    this.lmwarn = false;
    this.iwest = 0;
    this.knfloc = 0;
    this.detail = 0;
    this.abbnnum = 5;
    this.maxdie = 0;
    for (let i = 0; i <= 4; i++) if (d.rtext[2 * i + 81]) this.maxdie = i + 1;
    if (this.maxdie === 0) this.maxdie = 3;
    this.numdie = 0;
    this.holdng = 0;
    this.dkill = 0;
    this.foobar = 0;
    this.bonus = 0;
    this.clock1 = 30;
    this.clock2 = 50;
    this.saved = 0;
    this.closng = false;
    this.panic = false;
    this.closed = false;
    this.gaveup = false;
    this.scorng = false;
    this.wzdark = false;
    this.demo = false;

    this.poof();

    this.loc = 0;
    this.newloc = 0;
    this.oldloc = 0;
    this.oldlc2 = 0;
    this.verb = 0;
    this.obj = 0;
    this.spk = 0;
    this.k = 0;
    this.limit = 0;
    this.wd1 = '';
    this.wd2 = '';
    this.wd1raw = '';
    this.wd2raw = '';
  }

  // =====================================================================
  //  statement functions (advent.for lines 78-88)
  // =====================================================================
  toting(o) {
    return this.place[o] === -1;
  }
  here(o) {
    return this.place[o] === this.loc || this.toting(o);
  }
  at(o) {
    return this.place[o] === this.loc || this.fixed[o] === this.loc;
  }
  liq2(pbotl) {
    return (1 - pbotl) * this.WATER + Math.floor(pbotl / 2) * (this.WATER + this.OIL);
  }
  liq() {
    return this.liq2(Math.max(this.prop[this.BOTTLE], -1 - this.prop[this.BOTTLE]));
  }
  liqloc(loc) {
    const c = this.cond[loc] || 0;
    return this.liq2(((Math.floor(c / 2) * 2) % 8) - (5 * (Math.floor(c / 4) % 2)) + 1);
  }
  bitset(loc, n) {
    return ((this.cond[loc] || 0) & (1 << n)) !== 0;
  }
  forced(loc) {
    return (this.cond[loc] || 0) === 2;
  }
  dark() {
    return (this.cond[this.loc] || 0) % 2 === 0 && (this.prop[this.LAMP] === 0 || !this.here(this.LAMP));
  }
  pct(n) {
    return ran(100) < n;
  }

  // =====================================================================
  //  object operations (advent.for lines 2341-2451)
  // =====================================================================
  dstroy(obj) {
    this.move(obj, 0);
  }
  juggle(obj) {
    this.move(obj, this.place[obj]);
    this.move(obj + 100, this.fixed[obj]);
  }
  move(obj, where) {
    const from = obj > 100 ? this.fixed[obj - 100] : this.place[obj];
    if (from > 0 && from <= 300) this.carry(obj, from);
    this.drop(obj, where);
  }
  put(obj, where, pval) {
    this.move(obj, where);
    return -1 - pval;
  }
  carry(obj, where) {
    if (obj <= 100) {
      if (this.place[obj] === -1) return;
      this.place[obj] = -1;
      this.holdng++;
    }
    if (this.atloc[where] === obj) {
      this.atloc[where] = this.link[obj];
      return;
    }
    let temp = this.atloc[where];
    while (this.link[temp] !== obj) temp = this.link[temp];
    this.link[temp] = this.link[obj];
  }
  drop(obj, where) {
    if (obj > 100) {
      this.fixed[obj - 100] = where;
    } else {
      if (this.place[obj] === -1) this.holdng--;
      this.place[obj] = where;
    }
    if (where <= 0) return;
    this.link[obj] = this.atloc[where];
    this.atloc[where] = obj;
  }

  // =====================================================================
  //  I/O helpers
  // =====================================================================
  rspeak(i) {
    this.speech.rspeak(i);
  }
  mspeak(i) {
    this.speech.mspeak(i);
  }
  pspeak(msg, skip) {
    this.speech.pspeak(msg, skip);
  }
  speak(lines) {
    this.speech.speak(lines);
  }

  getin() {
    if (this.speech.blklin) this.io.blank();
    while (true) {
      const raw = this.io.getline();
      if (raw === null) throw new EofSignal();
      const tokens = raw.toUpperCase().split(/\s+/).filter((t) => t.length > 0);
      if (tokens.length === 0) {
        if (this.speech.blklin) this.io.blank();
        continue;
      }
      this.wd1raw = tokens[0];
      this.wd2raw = tokens[1] || '';
      this.wd1 = norm(tokens[0]);
      this.wd2 = this.wd2raw ? norm(this.wd2raw) : '';
      return { wd1: this.wd1, wd2: this.wd2 };
    }
  }

  // YES(X,Y,Z) -- port of YESX (lines 2255-2275)
  yes(x, y, z) {
    while (true) {
      if (x) this.rspeak(x);
      const r = this.getin();
      if (r.wd1 === norm('YES') || r.wd1 === norm('Y')) {
        if (y) this.rspeak(y);
        return true;
      }
      if (r.wd1 === norm('NO') || r.wd1 === norm('N')) {
        if (z) this.rspeak(z);
        return false;
      }
      this.io.println('Please answer the question.');
    }
  }

  poof() {
    // Defaults: cave open all day (WKDAY=0). The original POOF used
    // 0o00777400 (weekday prime time); see wizard.mjs for the rationale.
    this.wkday = 0;
    this.wkend = 0;
    this.holid = 0;
    this.hbegin = 0;
    this.hend = -1;
    this.hname = '';
    this.short = 30;
    this.magic = 'DWARF';
    this.magnm = 11111;
    this.latncy = 90;
  }

  datime() {
    return datimeFn();
  }

  // =====================================================================
  //  main loop
  // =====================================================================
  run(start = 'L1') {
    let phase = start;
    try {
      while (phase !== 'STOP') phase = this[phase]();
    } catch (e) {
      if (!(e instanceof EofSignal)) throw e;
      // EOF: end the game with a score, like the original did on input EOF.
      this.gaveup = true;
      try {
        phase = 'L20000';
        while (phase !== 'STOP') phase = this[phase]();
      } catch (e2) {
        if (!(e2 instanceof EofSignal)) throw e2;
      }
    }
    return phase;
  }

  L1() {
    this.demo = this.start();
    this.motd(false);
    ran(1);
    this.hinted[3] = this.yes(65, 1, 0);
    this.newloc = 1;
    this.limit = this.hinted[3] ? 1000 : 330;
    return 'L2';
  }
  motd() {}

  // ---- L2: closing check + dwarf phase (lines 630-663) ----
  L2() {
    if (!(this.newloc >= 9 || this.newloc === 0 || !this.closng)) {
      this.rspeak(130);
      this.newloc = this.loc;
      if (!this.panic) this.clock2 = 15;
      this.panic = true;
    }
    // 71-74 dwarf blocking
    if (!(this.newloc === this.loc || this.forced(this.loc) || this.bitset(this.loc, 3))) {
      for (let i = 1; i <= 5; i++) {
        if (this.odloc[i] === this.newloc && this.dseen[i]) {
          this.newloc = this.loc;
          this.rspeak(2);
          break;
        }
      }
    }
    this.loc = this.newloc; // 74

    if (this.loc === 0 || this.forced(this.loc) || this.bitset(this.newloc, 3)) return 'L2000';
    if (this.dflag !== 0) {
      const r = this.dwarfActive();
      if (r) return r;
    } else if (this.loc >= 15) {
      this.dflag = 1;
    }
    return 'L2000';
  }

  dwarfActive() {
    // lines 6000-6010: first encounter
    if (this.dflag !== 1) return this.dwarfRunning();
    if (this.loc < 15 || this.pct(95)) return null;
    this.dflag = 2;
    for (let i = 1; i <= 2; i++) {
      const j = 1 + ran(5);
      if (this.pct(50) && this.saved === -1) this.dloc[j] = 0;
    }
    for (let i = 1; i <= 5; i++) {
      if (this.dloc[i] === this.loc) this.dloc[i] = this.daltlc;
      this.odloc[i] = this.dloc[i];
    }
    this.rspeak(3);
    this.drop(this.AXE, this.loc);
    return null;
  }

  dwarfRunning() {
    // lines 6010-6030
    let dtotal = 0;
    let attack = 0;
    let stick = 0;
    for (let i = 1; i <= 6; i++) {
      if (this.dloc[i] === 0) continue;
      const moves = [];
      const t = this.data.travel[this.dloc[i]];
      if (t) {
        for (const e of t) {
          const nl = Math.floor(Math.abs(e.d) / 1000) % 1000;
          const forbid = Math.floor(Math.abs(e.d) / 1000000) === 100;
          if (
            nl > 300 ||
            nl < 15 ||
            nl === this.odloc[i] ||
            moves.includes(nl) ||
            moves.length >= 20 ||
            nl === this.dloc[i] ||
            this.forced(nl) ||
            (i === 6 && this.bitset(nl, 3)) ||
            forbid
          )
            continue;
          moves.push(nl);
        }
      }
      moves.push(this.odloc[i]);
      let j = moves.length;
      if (j >= 2) j--;
      this.odloc[i] = this.dloc[i];
      this.dloc[i] = moves[ran(j)]; // 1+RAN(j) -> index ran(j) in 0..j-1
      this.dseen[i] =
        (this.dseen[i] && this.loc >= 15) ||
        this.dloc[i] === this.loc ||
        this.odloc[i] === this.loc;
      if (!this.dseen[i]) continue;
      this.dloc[i] = this.loc;
      if (i !== 6) {
        dtotal++;
        if (this.odloc[i] !== this.dloc[i]) continue;
        attack++;
        if (this.knfloc >= 0) this.knfloc = this.loc;
        if (ran(1000) < 95 * (this.dflag - 2)) stick++;
        continue;
      }
      const r = this.piratePhase();
      if (r) return r;
    }
    if (dtotal === 0) return null;
    if (dtotal === 1) {
      this.rspeak(4);
    } else {
      this.io.println('');
      this.io.println(` There are ${dtotal} threatening little dwarves in the room with you.`);
    }
    if (attack === 0) return null;
    if (this.dflag === 2) this.dflag = 3;
    if (this.saved !== -1) this.dflag = 20;
    let kstart;
    if (attack === 1) {
      this.rspeak(5);
      kstart = 52;
    } else {
      this.io.println('');
      this.io.println(` ${attack} of them throw knives at you!`);
      kstart = 6;
    }
    // lines 782-793
    if (stick > 1) {
      this.io.println('');
      this.io.println(` ${stick} of them get you!`);
      this.oldlc2 = this.loc;
      return 'L99';
    }
    this.rspeak(kstart + stick);
    if (stick === 0) return null;
    this.oldlc2 = this.loc;
    return 'L99';
  }

  piratePhase() {
    if (this.loc === this.chloc || this.prop[this.CHEST] >= 0) return null;
    let k = 0;
    for (let j = 50; j <= this.maxtrs; j++) {
      if (j === this.PYRAM && (this.loc === this.data.plac[this.PYRAM] || this.loc === this.data.plac[this.EMRALD])) continue;
      if (this.toting(j)) {
        this.rspeak(128);
        if (this.place[this.MESSAG] === 0) this.move(this.CHEST, this.chloc);
        this.move(this.MESSAG, this.chloc2);
        for (let jj = 50; jj <= this.maxtrs; jj++) {
          if (jj === this.PYRAM && (this.loc === this.data.plac[this.PYRAM] || this.loc === this.data.plac[this.EMRALD])) continue;
          if (this.at(jj) && this.fixed[jj] === 0) this.carry(jj, this.loc);
          if (this.toting(jj)) this.drop(jj, this.chloc);
        }
        this.dloc[6] = this.chloc;
        this.odloc[6] = this.chloc;
        this.dseen[6] = false;
        return null;
      }
      if (this.here(j)) k = 1;
    }
    if (this.tally === this.tally2 + 1 && k === 0 && this.place[this.CHEST] === 0 && this.here(this.LAMP) && this.prop[this.LAMP] === 1) {
      this.rspeak(186);
      this.move(this.CHEST, this.chloc);
      this.move(this.MESSAG, this.chloc2);
      this.dloc[6] = this.chloc;
      this.odloc[6] = this.chloc;
      this.dseen[6] = false;
      return null;
    }
    if (this.odloc[6] !== this.dloc[6] && this.pct(20)) this.rspeak(127);
    return null;
  }

  // ---- L2000: describe location (lines 798-834) ----
  L2000() {
    if (this.loc === 0) return 'L99';
    let kk = this.data.stext[this.loc];
    if (!kk || this.abb[this.loc] % this.abbnnum === 0) kk = this.data.ltext[this.loc];
    if (this.forced(this.loc) || !this.dark()) {
      // 2001
    } else {
      if (this.wzdark && this.pct(35)) return 'L90';
      kk = this.data.rtext[16];
    }
    if (this.toting(this.BEAR)) this.rspeak(141);
    this.speak(kk);
    if (this.forced(this.loc)) return 'L8';
    if (this.loc === 33 && this.pct(25) && !this.closng) this.rspeak(8);

    if (!this.dark()) {
      this.abb[this.loc]++;
      let i = this.atloc[this.loc];
      while (i !== 0) {
        let obj = i > 100 ? i - 100 : i;
        if (!(obj === this.STEPS && this.toting(this.NUGGET))) {
          if (this.prop[obj] < 0) {
            if (!this.closed) {
              this.prop[obj] = 0;
              if (obj === this.RUG || obj === this.CHAIN) this.prop[obj] = 1;
              this.tally--;
              if (this.tally === this.tally2 && this.tally !== 0) this.limit = Math.min(35, this.limit);
            }
          }
          let p = this.prop[obj];
          if (obj === this.STEPS && this.loc === this.fixed[this.STEPS]) p = 1;
          this.pspeak(obj, p);
        }
        i = this.link[i];
      }
    }
    return 'L2012';
  }

  L90() {
    this.rspeak(23);
    this.oldlc2 = this.loc;
    return 'L99';
  }

  L99() {
    if (this.closng) {
      this.rspeak(131);
      this.numdie++;
      return 'L20000';
    }
    const yea = this.yes(81 + this.numdie * 2, 82 + this.numdie * 2, 54);
    this.numdie++;
    if (this.numdie === this.maxdie || !yea) return 'L20000';
    this.place[this.WATER] = 0;
    this.place[this.OIL] = 0;
    if (this.toting(this.LAMP)) this.prop[this.LAMP] = 0;
    for (let j = 1; j <= 100; j++) {
      const i = 101 - j;
      if (!this.toting(i)) continue;
      let k = this.oldlc2;
      if (i === this.LAMP) k = 1;
      this.drop(i, k);
    }
    this.loc = 3;
    this.oldloc = this.loc;
    return 'L2000';
  }

  L2012() {
    this.verb = 0;
    this.obj = 0;
    return 'L2600';
  }

  // ---- L2600: hints + read command (lines 843-871) ----
  L2600() {
    for (let hint = 4; hint <= this.data.hntmax; hint++) {
      if (this.hinted[hint]) continue;
      if (!this.bitset(this.loc, hint)) this.hintlc[hint] = -1;
      this.hintlc[hint]++;
      if (this.hintlc[hint] >= this.data.hints[hint].turns) {
        const r = this.hintOffer(hint);
        if (r) return r;
      }
    }
    if (this.closed) {
      if (this.prop[this.OYSTER] < 0 && this.toting(this.OYSTER)) this.pspeak(this.OYSTER, 1);
      for (let i = 1; i <= 100; i++) {
        if (this.toting(i) && this.prop[i] < 0) this.prop[i] = -1 - this.prop[i];
      }
    }
    this.wzdark = this.dark();
    if (this.knfloc > 0 && this.knfloc !== this.loc) this.knfloc = 0;
    ran(1);
    this.getin();
    return 'L2608';
  }

  hintOffer(hint) {
    const h = this.data.hints[hint];
    let offer = false;
    switch (hint) {
      case 4:
        offer = this.prop[this.GRATE] === 0 && !this.here(this.KEYS);
        break;
      case 5:
        offer = this.here(this.BIRD) && this.toting(this.ROD) && this.obj === this.BIRD;
        break;
      case 6:
        offer = this.here(this.SNAKE) && !this.here(this.BIRD);
        break;
      case 7:
        offer =
          this.atloc[this.loc] === 0 &&
          this.atloc[this.oldloc] === 0 &&
          this.atloc[this.oldlc2] === 0 &&
          this.holdng > 1;
        break;
      case 8:
        offer = this.prop[this.EMRALD] !== -1 && this.prop[this.PYRAM] === -1;
        break;
      case 9:
        offer = true;
        break;
    }
    if (!offer) {
      this.hintlc[hint] = 0;
      return null;
    }
    this.hintlc[hint] = 0;
    if (!this.yes(h.qmsg, 0, 54)) return null;
    this.io.println('');
    this.io.println(` I am prepared to give you a hint, but it will cost you${String(h.cost).padStart(3)} points.`);
    this.hinted[hint] = this.yes(175, h.hmsg, 54);
    if (this.hinted[hint] && this.limit > 30) this.limit += 30 * h.cost;
    return null;
  }

  // ---- L2608: foobar, clocks, lamp, word hacks (lines 873-908) ----
  L2608() {
    this.foobar = Math.min(0, -this.foobar);
    if (this.turns === 0 && this.eq(this.wd1, 'MAGIC') && this.eq(this.wd2, 'MODE')) this.maint();
    this.turns++;
    if (this.demo && this.turns >= this.short) return 'L13000';
    if (this.verb === this.SAY && this.wd2 !== '') this.verb = 0;
    if (this.verb === this.SAY) return 'L4090';
    if (this.tally === 0 && this.loc >= 15 && this.loc !== 33) this.clock1--;
    if (this.clock1 === 0) return 'L10000';
    if (this.clock1 < 0) this.clock2--;
    if (this.clock2 === 0) return 'L11000';
    if (this.prop[this.LAMP] === 1) this.limit--;
    if (this.limit <= 30 && this.here(this.BATTER) && this.prop[this.BATTER] === 0 && this.here(this.LAMP)) return 'L12000';
    if (this.limit === 0) return 'L12400';
    if (this.limit < 0 && this.loc <= 8) return 'L12600';
    if (this.limit <= 30) return 'L12200';
    return 'L19999';
  }

  // ---- L19999 + dispatch2630 (lines 892-908) ----
  L19999() {
    let k = 43;
    if (this.liqloc(this.loc) === this.WATER) k = 70;
    if (this.eq(this.wd1, 'ENTER') && (this.eq(this.wd2, 'STREA') || this.eq(this.wd2, 'WATER'))) {
      this.spk = k;
      return 'L2011';
    }
    if (this.eq(this.wd1, 'ENTER') && this.wd2 !== '') return 'L2800';
    if ((this.eq(this.wd1, 'WATER') || this.eq(this.wd1, 'OIL')) && (this.eq(this.wd2, 'PLANT') || this.eq(this.wd2, 'DOOR'))) {
      if (this.at(this.vocab(this.wd2raw, 1))) {
        // The original rewrites WD2 before re-parsing it as the verb.  Keep
        // the raw form in sync too: L2800 dispatches from wd1raw.
        this.wd2 = norm('POUR');
        this.wd2raw = 'POUR';
      }
    }
    if (this.eq(this.wd1, 'WEST')) {
      this.iwest++;
      if (this.iwest === 10) this.rspeak(17);
    }
    return this.dispatch2630();
  }

  dispatch2630() {
    const i = this.vocab(this.wd1raw, -1);
    if (i === -1) return 'L3000';
    const kv = i % 1000;
    const kq = Math.floor(i / 1000) + 1;
    if (kq === 1) {
      this.k = kv;
      return 'L8';
    }
    if (kq === 2) {
      this.obj = kv;
      return 'L5000';
    }
    if (kq === 3) {
      this.verb = kv;
      return 'L4000';
    }
    if (kq === 4) {
      this.spk = kv;
      return 'L2011';
    }
    this.bug(22);
  }

  L2800() {
    this.wd1 = this.wd2;
    this.wd1raw = this.wd2raw;
    this.wd2 = '';
    this.wd2raw = '';
    if (this.eq(this.wd1, 'WEST')) {
      this.iwest++;
      if (this.iwest === 10) this.rspeak(17);
    }
    return this.dispatch2630();
  }

  L3000() {
    let spk = 60;
    if (this.pct(20)) spk = 61;
    if (this.pct(20)) spk = 13;
    this.rspeak(spk);
    return 'L2600';
  }

  L2011() {
    this.rspeak(this.spk);
    return 'L2012';
  }

  maint() {}

  // =====================================================================
  //  verb dispatch (lines 928-956)
  // =====================================================================
  static INTRANS = [
    null, 'vTakeIntrans', 'vRandom', 'vRandom', 'vLockIntrans', 'vNothing', 'vLockIntrans',
    'vOn', 'vOff', 'vRandom', 'vRandom', 'vWalkMsg', 'vAttack', 'vPour', 'vEatIntrans',
    'vDrink', 'vRandom', 'vRandom', 'vQuit', 'vRandom', 'vInventory', 'vRandom', 'vFill',
    'vBlast', 'vScore', 'vFoo', 'vBrief', 'vReadIntrans', 'vRandom', 'vRandom', 'vSuspend', 'vHours',
  ];
  static TRANS = [
    null, 'vTake', 'vDrop', 'vSay', 'vLock', 'vNothing', 'vLock', 'vOn', 'vOff', 'vWave',
    'vNothing', 'vWalkMsg', 'vAttack', 'vPour', 'vEat', 'vDrink', 'vRub', 'vThrow', 'vNothing',
    'vFind', 'vFind', 'vFeed', 'vFill', 'vBlast', 'vNothing', 'vNothing', 'vNothing', 'vRead',
    'vBreak', 'vWake', 'vNothing', 'vNothing',
  ];

  L4000() {
    this.spk = this.data.actspk[this.verb];
    if (this.wd2 !== '' && this.verb !== this.SAY) return 'L2800';
    if (this.verb === this.SAY) this.obj = this.wd2raw ? 1 : 0;
    if (this.obj !== 0) return 'L4090';
    return 'L4080';
  }
  L4080() {
    const m = Engine.INTRANS[this.verb];
    if (!m) this.bug(23);
    return this[m]();
  }
  L4090() {
    const m = Engine.TRANS[this.verb];
    if (!m) this.bug(24);
    return this[m]();
  }

  // ---- L5000: object analysis (lines 964-996) ----
  L5000() {
    if (this.fixed[this.obj] !== this.loc && !this.here(this.obj)) return this.objectNotHere();
    return 'L5010';
  }
  L5010() {
    if (this.wd2 !== '') return 'L2800';
    if (this.verb !== 0) return 'L4090';
    this.io.println('');
    this.io.println(` What do you want to do with the ${this.wd1raw}?`);
    return 'L2600';
  }
  objectNotHere() {
    let k = this.obj;
    if (k === this.GRATE) {
      if (this.loc === 1 || this.loc === 4 || this.loc === 7) k = this.DPRSSN;
      if (this.loc > 9 && this.loc < 15) k = this.ENTRNC;
      if (k !== this.GRATE) {
        this.k = k;
        return 'L8';
      }
    }
    if (k === this.DWARF) {
      for (let i = 1; i <= 5; i++) {
        if (this.dloc[i] === this.loc && this.dflag >= 2) return 'L5010';
      }
    }
    if ((this.liq() === k && this.here(this.BOTTLE)) || k === this.liqloc(this.loc)) return 'L5010';
    if (this.obj === this.PLANT && this.at(this.PLANT2) && this.prop[this.PLANT2] === 0) {
      this.obj = this.PLANT2;
      return 'L5010';
    }
    if (this.obj === this.KNIFE && this.knfloc === this.loc) {
      this.knfloc = -1;
      this.spk = 116;
      return 'L2011';
    }
    if (this.obj === this.ROD && this.here(this.ROD2)) {
      this.obj = this.ROD2;
      return 'L5010';
    }
    if ((this.verb === this.FIND || this.verb === this.INVENT) && this.wd2 === '') return 'L5010';
    this.io.println('');
    this.io.println(` I see no ${this.wd1raw} here.`);
    return 'L2012';
  }

  // =====================================================================
  //  motion resolution (lines 1005-1157)
  // =====================================================================
  L8() {
    const travel = this.data.travel[this.loc];
    if (!travel || travel.length === 0) this.bug(26);
    const k = this.k;
    if (k === this.NULL) return 'L2';
    if (k === this.BACK) return this.motionBack();
    if (k === this.LOOK) return this.motionLook();
    if (k === this.CAVE) return this.motionCave();
    this.oldlc2 = this.oldloc;
    this.oldloc = this.loc;
    const idx = this.findMotion(travel, k);
    return this.applyMotion(travel, idx);
  }

  findMotion(travel, k) {
    for (let i = 0; i < travel.length; i++) {
      const v = Math.abs(travel[i].d) % 1000;
      if (v === 1 || v === k) return i;
    }
    return -1;
  }

  // decode dest, apply conditions, advance to alternates (lines 1015-1043)
  applyMotion(travel, idx) {
    if (idx < 0) return this.motionBad();
    let i = idx;
    let destEnc = Math.floor(Math.abs(travel[i].d) / 1000);
    for (;;) {
      const m = Math.floor(destEnc / 1000);
      const condObj = m % 100;
      let success;
      if (m > 300) success = this.prop[condObj] !== Math.floor(m / 100) - 3;
      else if (m > 100) success = this.toting(condObj) || (m > 200 && this.at(condObj));
      else success = m === 0 || this.pct(m);
      if (success) return this.gotoDest(destEnc % 1000);
      const next = this.advanceDiffDest(travel, i, destEnc);
      if (next === null) return this.motionBad();
      i = next.i;
      destEnc = next.destEnc;
    }
  }

  advanceDiffDest(travel, idx, destEnc) {
    for (let i = idx + 1; i < travel.length; i++) {
      const ne = Math.floor(Math.abs(travel[i].d) / 1000);
      if (ne !== destEnc) return { i, destEnc: ne };
    }
    return null;
  }

  gotoDest(n) {
    if (n <= 300) {
      this.newloc = n;
      return 'L2';
    }
    if (n <= 500) return this.specialMotion(n - 300);
    this.rspeak(n - 500);
    this.newloc = this.loc;
    return 'L2';
  }

  specialMotion(code) {
    if (code === 1) {
      this.newloc = 99 + 100 - this.loc;
      if (this.holdng === 0 || (this.holdng === 1 && this.toting(this.EMRALD))) return 'L2';
      this.newloc = this.loc;
      this.rspeak(117);
      return 'L2';
    }
    if (code === 2) {
      this.drop(this.EMRALD, this.loc);
      const travel = this.data.travel[this.loc];
      const idx = this.findMotion(travel, this.k);
      return this.applyMotion(travel, idx);
    }
    if (code === 3) return this.trollBridge();
    this.bug(20);
  }

  trollBridge() {
    if (this.prop[this.TROLL] === 1) {
      this.pspeak(this.TROLL, 1);
      this.prop[this.TROLL] = 0;
      this.move(this.TROLL2, 0);
      this.move(this.TROLL2 + 100, 0);
      this.move(this.TROLL, this.data.plac[this.TROLL]);
      this.move(this.TROLL + 100, this.data.fixd[this.TROLL]);
      this.juggle(this.CHASM);
      this.newloc = this.loc;
      return 'L2';
    }
    this.newloc = this.data.plac[this.TROLL] + this.data.fixd[this.TROLL] - this.loc;
    if (this.prop[this.TROLL] === 0) this.prop[this.TROLL] = 1;
    if (!this.toting(this.BEAR)) return 'L2';
    this.rspeak(162);
    this.prop[this.CHASM] = 1;
    this.prop[this.TROLL] = 2;
    this.drop(this.BEAR, this.newloc);
    this.fixed[this.BEAR] = -1;
    this.prop[this.BEAR] = 3;
    if (this.prop[this.SPICES] < 0) this.tally2++;
    this.oldlc2 = this.newloc;
    return 'L99';
  }

  motionBack() {
    let k = this.oldloc;
    if (this.forced(k)) k = this.oldlc2;
    this.oldlc2 = this.oldloc;
    this.oldloc = this.loc;
    if (k === this.loc) {
      this.rspeak(91);
      return 'L2';
    }
    const travel = this.data.travel[this.loc];
    let chosen = -1;
    let k2 = -1;
    for (let i = 0; i < travel.length; i++) {
      const ll = Math.floor(Math.abs(travel[i].d) / 1000) % 1000;
      if (ll === k) {
        chosen = i;
        break;
      }
      if (ll <= 300) {
        const jt = this.data.travel[ll];
        if (jt && this.forced(ll) && Math.floor(Math.abs(jt[0].d) / 1000) % 1000 === k) k2 = i;
      }
    }
    if (chosen < 0) {
      if (k2 < 0) {
        this.rspeak(140);
        return 'L2';
      }
      chosen = k2;
    }
    this.k = Math.abs(travel[chosen].d) % 1000;
    const idx = this.findMotion(travel, this.k);
    return this.applyMotion(travel, idx);
  }

  motionLook() {
    if (this.detail < 3) this.rspeak(15);
    this.detail++;
    this.wzdark = false;
    this.abb[this.loc] = 0;
    return 'L2';
  }

  motionCave() {
    if (this.loc < 8) this.rspeak(57);
    if (this.loc >= 8) this.rspeak(58);
    return 'L2';
  }

  motionBad() {
    const k = this.k;
    let spk = 12;
    if (k >= 43 && k <= 50) spk = 9;
    if (k === 29 || k === 30) spk = 9;
    if (k === 7 || k === 36 || k === 37) spk = 10;
    if (k === 11 || k === 19) spk = 11;
    if (this.verb === this.FIND || this.verb === this.INVENT) spk = 59;
    if (k === 62 || k === 65) spk = 42;
    if (k === 17) spk = 80;
    this.rspeak(spk);
    return 'L2';
  }

  // =====================================================================
  //  verbs
  // =====================================================================
  vRandom() {
    this.io.println('');
    this.io.println(` ${this.wd1raw}WHAT?`);
    this.obj = 0;
    return 'L2600';
  }
  vNothing() {
    this.spk = 54;
    return 'L2011';
  }
  vWalkMsg() {
    this.spk = this.data.actspk[this.verb];
    return 'L2011';
  }

  // TAKE (8010/9010, lines 1219-1262)
  vTakeIntrans() {
    if (this.atloc[this.loc] === 0 || this.link[this.atloc[this.loc]] !== 0) return this.vRandom();
    for (let i = 1; i <= 5; i++) {
      if (this.dloc[i] === this.loc && this.dflag >= 2) return this.vRandom();
    }
    const head = this.atloc[this.loc];
    this.obj = head > 100 ? head - 100 : head;
    return this.vTake();
  }
  vTake() {
    const obj = this.obj;
    if (this.toting(obj)) return 'L2011'; // spk = actspk[TAKE] = 24
    let spk = 25;
    if (obj === this.PLANT && this.prop[this.PLANT] <= 0) spk = 115;
    if (obj === this.BEAR && this.prop[this.BEAR] === 1) spk = 169;
    if (obj === this.CHAIN && this.prop[this.BEAR] !== 0) spk = 170;
    this.spk = spk;
    if (this.fixed[obj] !== 0) return 'L2011';
    if (obj === this.WATER || obj === this.OIL) {
      if (this.here(this.BOTTLE) && this.liq() === obj) {
        this.obj = this.BOTTLE;
        return this.takeCommon();
      }
      this.obj = this.BOTTLE;
      if (this.toting(this.BOTTLE) && this.prop[this.BOTTLE] === 1) return this.vFill();
      if (this.prop[this.BOTTLE] !== 1) this.spk = 105;
      if (!this.toting(this.BOTTLE)) this.spk = 104;
      return 'L2011';
    }
    return this.takeCommon();
  }
  takeCommon() {
    const obj = this.obj;
    if (this.holdng >= 7) {
      this.rspeak(92);
      return 'L2012';
    }
    if (obj === this.BIRD && this.prop[this.BIRD] === 0) {
      if (this.toting(this.ROD)) {
        this.rspeak(26);
        return 'L2012';
      }
      if (!this.toting(this.CAGE)) {
        this.rspeak(27);
        return 'L2012';
      }
      this.prop[this.BIRD] = 1;
    }
    if ((obj === this.BIRD || obj === this.CAGE) && this.prop[this.BIRD] !== 0) {
      this.carry(this.BIRD + this.CAGE - obj, this.loc);
    }
    this.carry(obj, this.loc);
    const k = this.liq();
    if (obj === this.BOTTLE && k !== 0) this.place[k] = -1;
    this.spk = 54;
    return 'L2011';
  }

  // DROP (9020, lines 1264-1315)
  vDrop() {
    if (this.toting(this.ROD2) && this.obj === this.ROD && !this.toting(this.ROD)) this.obj = this.ROD2;
    if (!this.toting(this.obj)) return 'L2011'; // spk = actspk[DROP] = 29
    const o = this.obj;
    if (o === this.BIRD && this.here(this.SNAKE)) {
      this.rspeak(30);
      if (this.closed) return 'L19000';
      this.dstroy(this.SNAKE);
      this.prop[this.SNAKE] = 1;
      return this.dropFinish();
    }
    if (o === this.COINS && this.here(this.VEND)) {
      this.dstroy(this.COINS);
      this.drop(this.BATTER, this.loc);
      this.pspeak(this.BATTER, 0);
      return 'L2012';
    }
    if (o === this.BIRD && this.at(this.DRAGON) && this.prop[this.DRAGON] === 0) {
      this.rspeak(154);
      this.dstroy(this.BIRD);
      this.prop[this.BIRD] = 0;
      if (this.place[this.SNAKE] === this.data.plac[this.SNAKE]) this.tally2++;
      return 'L2012';
    }
    if (o === this.BEAR && this.at(this.TROLL)) {
      this.rspeak(163);
      this.move(this.TROLL, 0);
      this.move(this.TROLL + 100, 0);
      this.move(this.TROLL2, this.data.plac[this.TROLL]);
      this.move(this.TROLL2 + 100, this.data.fixd[this.TROLL]);
      this.juggle(this.CHASM);
      this.prop[this.TROLL] = 2;
      return this.dropFinish();
    }
    if (o === this.VASE && this.loc !== this.data.plac[this.PILLOW]) {
      this.prop[this.VASE] = 2;
      if (this.at(this.PILLOW)) this.prop[this.VASE] = 0;
      this.pspeak(this.VASE, this.prop[this.VASE] + 1);
      if (this.prop[this.VASE] !== 0) this.fixed[this.VASE] = -1;
      return this.dropFinish();
    }
    this.rspeak(54);
    return this.dropFinish();
  }
  dropFinish() {
    const obj = this.obj;
    const k = this.liq();
    if (k === obj) this.obj = this.BOTTLE;
    if (this.obj === this.BOTTLE && k !== 0) this.place[k] = 0;
    if (this.obj === this.CAGE && this.prop[this.BIRD] !== 0) this.drop(this.BIRD, this.loc);
    if (this.obj === this.BIRD) this.prop[this.BIRD] = 0;
    this.drop(this.obj, this.loc);
    return 'L2012';
  }

  // SAY (9030, lines 1319-1330)
  vSay() {
    let word = this.wd2raw || this.wd1raw;
    const i = this.vocab(word, -1);
    if (i === 62 || i === 65 || i === 71 || i === 2025) {
      this.wd1 = norm(word);
      this.wd1raw = word;
      this.wd2 = '';
      this.wd2raw = '';
      this.obj = 0;
      return this.dispatch2630();
    }
    this.io.println('');
    this.io.println(` Okay, "${word}."`);
    return 'L2012';
  }

  // LOCK/OPEN/UNLOCK (8040/9040, lines 1332-1397)
  vLockIntrans() {
    let spk = 28;
    if (this.here(this.CLAM)) this.obj = this.CLAM;
    if (this.here(this.OYSTER)) this.obj = this.OYSTER;
    if (this.at(this.DOOR)) this.obj = this.DOOR;
    if (this.at(this.GRATE)) this.obj = this.GRATE;
    if (this.obj !== 0 && this.here(this.CHAIN)) return this.vRandom();
    if (this.here(this.CHAIN)) this.obj = this.CHAIN;
    if (this.obj === 0) {
      this.spk = spk;
      return 'L2011';
    }
    return this.vLock();
  }
  vLock() {
    const obj = this.obj;
    if (obj === this.CLAM || obj === this.OYSTER) return this.lockClam();
    let spk = 0;
    if (obj === this.DOOR) spk = 111;
    if (obj === this.DOOR && this.prop[this.DOOR] === 1) spk = 54;
    if (obj === this.CAGE) spk = 32;
    if (obj === this.KEYS) spk = 55;
    if (obj === this.GRATE || obj === this.CHAIN) spk = 31;
    if (spk !== 31 || !this.here(this.KEYS)) {
      this.spk = spk;
      return 'L2011';
    }
    if (obj === this.CHAIN) return this.lockChain();
    if (this.closng) {
      this.spk = 130;
      if (!this.panic) this.clock2 = 15;
      this.panic = true;
      return 'L2011';
    }
    let k = 34 + this.prop[this.GRATE];
    this.prop[this.GRATE] = 1;
    if (this.verb === this.LOCK) this.prop[this.GRATE] = 0;
    k = k + 2 * this.prop[this.GRATE];
    this.spk = k;
    return 'L2011';
  }
  lockClam() {
    const obj = this.obj;
    let k = obj === this.OYSTER ? 1 : 0;
    let spk = 124 + k;
    if (this.toting(obj)) spk = 120 + k;
    if (!this.toting(this.TRIDNT)) spk = 122 + k;
    if (this.verb === this.LOCK) spk = 61;
    if (spk !== 124) {
      this.spk = spk;
      return 'L2011';
    }
    this.dstroy(this.CLAM);
    this.drop(this.OYSTER, this.loc);
    this.drop(this.PEARL, 105);
    this.spk = 124;
    return 'L2011';
  }
  lockChain() {
    if (this.verb === this.LOCK) {
      let spk = 172;
      if (this.prop[this.CHAIN] !== 0) spk = 34;
      if (this.loc !== this.data.plac[this.CHAIN]) spk = 173;
      if (spk !== 172) {
        this.spk = spk;
        return 'L2011';
      }
      this.prop[this.CHAIN] = 2;
      if (this.toting(this.CHAIN)) this.drop(this.CHAIN, this.loc);
      this.fixed[this.CHAIN] = -1;
      this.spk = 172;
      return 'L2011';
    }
    let spk = 171;
    if (this.prop[this.BEAR] === 0) spk = 41;
    if (this.prop[this.CHAIN] === 0) spk = 37;
    if (spk !== 171) {
      this.spk = spk;
      return 'L2011';
    }
    this.prop[this.CHAIN] = 0;
    this.fixed[this.CHAIN] = 0;
    if (this.prop[this.BEAR] !== 3) this.prop[this.BEAR] = 2;
    this.fixed[this.BEAR] = 2 - this.prop[this.BEAR];
    this.spk = 171;
    return 'L2011';
  }

  // LAMP ON/OFF (9070/9080)
  vOn() {
    if (!this.here(this.LAMP)) return 'L2011';
    if (this.limit < 0) return 'L2011';
    this.prop[this.LAMP] = 1;
    this.rspeak(39);
    if (this.wzdark) return 'L2000';
    return 'L2012';
  }
  vOff() {
    if (!this.here(this.LAMP)) return 'L2011';
    this.prop[this.LAMP] = 0;
    this.rspeak(40);
    if (this.dark()) this.rspeak(16);
    return 'L2012';
  }

  // WAVE (9090)
  vWave() {
    const obj = this.obj;
    let spk = 0;
    if (!this.toting(obj) && !(obj === this.ROD && this.toting(this.ROD2))) spk = 29;
    if (obj !== this.ROD || !this.at(this.FISSUR) || !this.toting(obj) || this.closng) {
      this.spk = spk;
      return 'L2011';
    }
    this.prop[this.FISSUR] = 1 - this.prop[this.FISSUR];
    this.pspeak(this.FISSUR, 2 - this.prop[this.FISSUR]);
    return 'L2012';
  }

  // ATTACK/KILL (9120)
  vAttack() {
    let i = 0;
    for (let d = 1; d <= 5; d++) {
      if (this.dloc[d] === this.loc && this.dflag >= 2) {
        i = d;
        break;
      }
    }
    let obj = this.obj;
    if (obj === 0) {
      if (i !== 0) obj = this.DWARF;
      if (this.here(this.SNAKE)) obj = obj * 100 + this.SNAKE;
      if (this.at(this.DRAGON) && this.prop[this.DRAGON] === 0) obj = obj * 100 + this.DRAGON;
      if (this.at(this.TROLL)) obj = obj * 100 + this.TROLL;
      if (this.here(this.BEAR) && this.prop[this.BEAR] === 0) obj = obj * 100 + this.BEAR;
      if (obj > 100) return this.vRandom();
      if (obj === 0) {
        if (this.here(this.BIRD) && this.verb !== this.THROW) obj = this.BIRD;
        if (this.here(this.CLAM) || this.here(this.OYSTER)) obj = 100 * obj + this.CLAM;
        if (obj > 100) return this.vRandom();
      }
    }
    this.obj = obj;
    if (obj === this.BIRD) {
      let spk = 137;
      if (this.closed) {
        this.spk = spk;
        return 'L2011';
      }
      this.dstroy(this.BIRD);
      this.prop[this.BIRD] = 0;
      if (this.place[this.SNAKE] === this.data.plac[this.SNAKE]) this.tally2++;
      this.spk = 45;
      return 'L2011';
    }
    return this.attackTarget(obj);
  }
  attackTarget(obj) {
    let spk = 0;
    if (obj === 0) spk = 44;
    if (obj === this.CLAM || obj === this.OYSTER) spk = 150;
    if (obj === this.SNAKE) spk = 46;
    if (obj === this.DWARF) spk = 49;
    if (obj === this.DWARF && this.closed) return 'L19000';
    if (obj === this.DRAGON) spk = 167;
    if (obj === this.TROLL) spk = 157;
    if (obj === this.BEAR) spk = 165 + Math.floor((this.prop[this.BEAR] + 1) / 2);
    if (obj !== this.DRAGON || this.prop[this.DRAGON] !== 0) {
      this.spk = spk;
      return 'L2011';
    }
    this.rspeak(49);
    this.verb = 0;
    this.obj = 0;
    this.getin();
    if (!this.eq(this.wd1, 'Y') && !this.eq(this.wd1, 'YES')) return 'L2608';
    this.pspeak(this.DRAGON, 1);
    this.prop[this.DRAGON] = 2;
    this.prop[this.RUG] = 0;
    const k = Math.floor((this.data.plac[this.DRAGON] + this.data.fixd[this.DRAGON]) / 2);
    this.move(this.DRAGON + 100, -1);
    this.move(this.RUG + 100, 0);
    this.move(this.DRAGON, k);
    this.move(this.RUG, k);
    for (let o = 1; o <= 100; o++) {
      if (this.place[o] === this.data.plac[this.DRAGON] || this.place[o] === this.data.fixd[this.DRAGON]) this.move(o, k);
    }
    this.loc = k;
    this.k = this.NULL;
    return 'L8';
  }

  // POUR (9130)
  vPour() {
    let obj = this.obj;
    if (obj === this.BOTTLE || obj === 0) obj = this.liq();
    this.obj = obj;
    if (obj === 0) return this.vRandom();
    if (!this.toting(obj)) return 'L2011';
    let spk = 78;
    if (obj !== this.OIL && obj !== this.WATER) {
      this.spk = spk;
      return 'L2011';
    }
    this.prop[this.BOTTLE] = 1;
    this.place[obj] = 0;
    spk = 77;
    if (!(this.at(this.PLANT) || this.at(this.DOOR))) {
      this.spk = spk;
      return 'L2011';
    }
    if (this.at(this.DOOR)) {
      this.prop[this.DOOR] = 0;
      if (obj === this.OIL) this.prop[this.DOOR] = 1;
      this.spk = 113 + this.prop[this.DOOR];
      return 'L2011';
    }
    spk = 112;
    if (obj !== this.WATER) {
      this.spk = spk;
      return 'L2011';
    }
    this.pspeak(this.PLANT, this.prop[this.PLANT] + 1);
    this.prop[this.PLANT] = (this.prop[this.PLANT] + 2) % 6;
    this.prop[this.PLANT2] = Math.floor(this.prop[this.PLANT] / 2);
    this.k = this.NULL;
    return 'L8';
  }

  // EAT (8140/9140)
  vEatIntrans() {
    if (!this.here(this.FOOD)) return this.vRandom();
    return this.vEat();
  }
  vEat() {
    if (this.obj === this.FOOD) {
      this.dstroy(this.FOOD);
      this.spk = 72;
      return 'L2011';
    }
    const o = this.obj;
    if ([this.BIRD, this.SNAKE, this.CLAM, this.OYSTER, this.DWARF, this.DRAGON, this.TROLL, this.BEAR].includes(o)) this.spk = 71;
    else this.spk = 0;
    return 'L2011';
  }

  // DRINK (9150)
  vDrink() {
    let spk = 0;
    if (this.obj === 0 && this.liqloc(this.loc) !== this.WATER && (this.liq() !== this.WATER || !this.here(this.BOTTLE))) return this.vRandom();
    if (this.obj !== 0 && this.obj !== this.WATER) spk = 110;
    if (spk === 110 || this.liq() !== this.WATER || !this.here(this.BOTTLE)) {
      this.spk = spk;
      return 'L2011';
    }
    this.prop[this.BOTTLE] = 1;
    this.place[this.WATER] = 0;
    this.spk = 74;
    return 'L2011';
  }

  // RUB (9160)
  vRub() {
    this.spk = this.obj !== this.LAMP ? 76 : 0;
    return 'L2011';
  }

  // THROW (9170)
  vThrow() {
    if (this.toting(this.ROD2) && this.obj === this.ROD && !this.toting(this.ROD)) this.obj = this.ROD2;
    const obj = this.obj;
    if (!this.toting(obj)) return 'L2011';
    if (obj >= 50 && obj <= this.maxtrs && this.at(this.TROLL)) {
      this.drop(obj, 0);
      this.move(this.TROLL, 0);
      this.move(this.TROLL + 100, 0);
      this.drop(this.TROLL2, this.data.plac[this.TROLL]);
      this.drop(this.TROLL2 + 100, this.data.fixd[this.TROLL]);
      this.juggle(this.CHASM);
      this.spk = 159;
      return 'L2011';
    }
    if (obj === this.FOOD && this.here(this.BEAR)) {
      this.obj = this.BEAR;
      return this.vFeed();
    }
    if (obj !== this.AXE) return this.vDrop();
    let di = 0;
    for (let d = 1; d <= 5; d++) {
      if (this.dloc[d] === this.loc) {
        di = d;
        break;
      }
    }
    if (di === 0) {
      let spk = 152;
      if (this.at(this.DRAGON) && this.prop[this.DRAGON] === 0) return this.throwAxeResult(spk);
      spk = 158;
      if (this.at(this.TROLL)) return this.throwAxeResult(spk);
      if (this.here(this.BEAR) && this.prop[this.BEAR] === 0) {
        this.rspeak(164);
        this.drop(this.AXE, this.loc);
        this.fixed[this.AXE] = -1;
        this.prop[this.AXE] = 1;
        this.juggle(this.BEAR);
        return 'L2012';
      }
      this.obj = 0;
      return this.vAttack();
    }
    let spk = 48;
    if (ran(3) === 0 && this.saved === -1) {
      this.dseen[di] = false;
      this.dloc[di] = 0;
      spk = 47;
      this.dkill++;
      if (this.dkill === 1) spk = 149;
    }
    return this.throwAxeResult(spk);
  }
  throwAxeResult(spk) {
    this.rspeak(spk);
    this.drop(this.AXE, this.loc);
    this.k = this.NULL;
    return 'L8';
  }

  // QUIT (8180)
  vQuit() {
    this.gaveup = this.yes(22, 54, 54);
    if (this.gaveup) return 'L20000';
    return 'L2012';
  }

  // FIND (9190)
  vFind() {
    const obj = this.obj;
    let spk = 0;
    if (this.at(obj) || (this.liq() === obj && this.at(this.BOTTLE)) || this.k === this.liqloc(this.loc)) spk = 94;
    for (let i = 1; i <= 5; i++) {
      if (this.dloc[i] === this.loc && this.dflag >= 2 && obj === this.DWARF) spk = 94;
    }
    if (this.closed) spk = 138;
    if (this.toting(obj)) spk = 24;
    this.spk = spk;
    return 'L2011';
  }

  // INVENTORY (8200)
  vInventory() {
    let spk = 98;
    for (let i = 1; i <= 100; i++) {
      if (i === this.BEAR || !this.toting(i)) continue;
      if (spk === 98) this.rspeak(99);
      this.speech.blklin = false;
      this.pspeak(i, -1);
      this.speech.blklin = true;
      spk = 0;
    }
    if (this.toting(this.BEAR)) spk = 141;
    this.spk = spk;
    return 'L2011';
  }

  // FEED (9210)
  vFeed() {
    const obj = this.obj;
    if (obj === this.BIRD) {
      this.spk = 100;
      return 'L2011';
    }
    if (obj === this.SNAKE || obj === this.DRAGON || obj === this.TROLL) {
      let spk = 102;
      if (obj === this.DRAGON && this.prop[this.DRAGON] !== 0) spk = 110;
      if (obj === this.TROLL) spk = 182;
      if (obj !== this.SNAKE || this.closed || !this.here(this.BIRD)) {
        this.spk = spk;
        return 'L2011';
      }
      spk = 101;
      this.dstroy(this.BIRD);
      this.prop[this.BIRD] = 0;
      this.tally2++;
      this.spk = spk;
      return 'L2011';
    }
    if (obj === this.DWARF) {
      if (!this.here(this.FOOD)) return 'L2011';
      this.spk = 103;
      this.dflag++;
      return 'L2011';
    }
    if (obj === this.BEAR) {
      let spk = 0;
      if (this.prop[this.BEAR] === 0) spk = 102;
      if (this.prop[this.BEAR] === 3) spk = 110;
      if (!this.here(this.FOOD)) {
        this.spk = spk;
        return 'L2011';
      }
      this.dstroy(this.FOOD);
      this.prop[this.BEAR] = 1;
      this.fixed[this.AXE] = 0;
      this.prop[this.AXE] = 0;
      this.spk = 168;
      return 'L2011';
    }
    this.spk = 14;
    return 'L2011';
  }

  // FILL (9220)
  vFill() {
    const obj = this.obj;
    if (obj === this.VASE) return this.fillVase();
    if (obj !== 0 && obj !== this.BOTTLE) return 'L2011';
    if (obj === 0 && !this.here(this.BOTTLE)) return this.vRandom();
    let spk = 107;
    if (this.liqloc(this.loc) === 0) spk = 106;
    if (this.liq() !== 0) spk = 105;
    if (spk !== 107) {
      this.spk = spk;
      return 'L2011';
    }
    this.prop[this.BOTTLE] = Math.floor(((this.cond[this.loc] || 0) % 4) / 2) * 2;
    const k = this.liq();
    if (this.toting(this.BOTTLE)) this.place[k] = -1;
    if (k === this.OIL) spk = 108;
    this.spk = spk;
    return 'L2011';
  }
  fillVase() {
    let spk = 29;
    if (this.liqloc(this.loc) === 0) spk = 144;
    if (this.liqloc(this.loc) === 0 || !this.toting(this.VASE)) {
      this.spk = spk;
      return 'L2011';
    }
    this.rspeak(145);
    this.prop[this.VASE] = 2;
    this.fixed[this.VASE] = -1;
    return this.dropFinish();
  }

  // BLAST (9230)
  vBlast() {
    if (this.prop[this.ROD2] < 0 || !this.closed) {
      this.spk = 0;
      return 'L2011';
    }
    this.bonus = 133;
    if (this.loc === 115) this.bonus = 134;
    if (this.here(this.ROD2)) this.bonus = 135;
    this.rspeak(this.bonus);
    return 'L20000';
  }

  // SCORE (8240)
  vScore() {
    this.scorng = true;
    return 'L20000';
  }
  L8241() {
    this.scorng = false;
    this.io.println('');
    this.io.println(
      ` If you were to quit now, you would score${String(this.score).padStart(4)} out of a possible${String(this.mxscor).padStart(4)}.`,
    );
    this.gaveup = this.yes(143, 54, 54);
    return 'L8185';
  }
  L8185() {
    return this.gaveup ? 'L20000' : 'L2012';
  }

  // FEE FIE FOE FOO (8250)
  vFoo() {
    const k = this.vocab(this.wd1raw, 3);
    let spk = 42;
    if (this.foobar === 1 - k) {
      this.foobar = k;
      if (k !== 4) {
        this.spk = 54;
        return 'L2011';
      }
      this.foobar = 0;
      if (this.place[this.EGGS] === this.data.plac[this.EGGS] || (this.toting(this.EGGS) && this.loc === this.data.plac[this.EGGS])) {
        this.spk = 54;
        return 'L2011';
      }
      if (this.place[this.EGGS] === 0 && this.place[this.TROLL] === 0 && this.prop[this.TROLL] === 0) this.prop[this.TROLL] = 1;
      let kk = 2;
      if (this.here(this.EGGS)) kk = 1;
      if (this.loc === this.data.plac[this.EGGS]) kk = 0;
      this.move(this.EGGS, this.data.plac[this.EGGS]);
      this.pspeak(this.EGGS, kk);
      return 'L2012';
    }
    if (this.foobar !== 0) spk = 151;
    this.spk = spk;
    return 'L2011';
  }

  // BRIEF (8260)
  vBrief() {
    this.spk = 156;
    this.abbnnum = 10000;
    this.detail = 3;
    return 'L2011';
  }

  // READ (8270/9270)
  vReadIntrans() {
    let obj = 0;
    if (this.here(this.MAGZIN)) obj = this.MAGZIN;
    if (this.here(this.TABLET)) obj = obj * 100 + this.TABLET;
    if (this.here(this.MESSAG)) obj = obj * 100 + this.MESSAG;
    if (this.closed && this.toting(this.OYSTER)) obj = this.OYSTER;
    if (obj > 100 || obj === 0 || this.dark()) return this.vRandom();
    this.obj = obj;
    return this.vRead();
  }
  vRead() {
    if (this.dark()) return this.objectNotHere();
    const obj = this.obj;
    let spk = 0;
    if (obj === this.MAGZIN) spk = 190;
    if (obj === this.TABLET) spk = 196;
    if (obj === this.MESSAG) spk = 191;
    if (obj === this.OYSTER && this.hinted[2] && this.toting(this.OYSTER)) spk = 194;
    if (obj !== this.OYSTER || this.hinted[2] || !this.toting(this.OYSTER) || !this.closed) {
      this.spk = spk;
      return 'L2011';
    }
    this.hinted[2] = this.yes(192, 193, 54);
    return 'L2012';
  }

  // BREAK (9280)
  vBreak() {
    const obj = this.obj;
    let spk = 0;
    if (obj === this.MIRROR) spk = 148;
    if (obj === this.VASE && this.prop[this.VASE] === 0) {
      spk = 198;
      if (this.toting(this.VASE)) this.drop(this.VASE, this.loc);
      this.prop[this.VASE] = 2;
      this.fixed[this.VASE] = -1;
      this.spk = spk;
      return 'L2011';
    }
    if (obj !== this.MIRROR || !this.closed) {
      this.spk = spk;
      return 'L2011';
    }
    this.rspeak(197);
    return 'L19000';
  }

  // WAKE (9290)
  vWake() {
    const obj = this.obj;
    if (obj !== this.DWARF || !this.closed) {
      this.spk = 0;
      return 'L2011';
    }
    this.rspeak(199);
    return 'L19000';
  }

  // SUSPEND (8300)
  vSuspend() {
    if (this.demo) {
      this.spk = 201;
      return 'L2011';
    }
    this.io.println('');
    this.io.println(
      ` I can suspend your adventure for you so that you can resume later, but\n you will have to wait at least${String(this.latncy).padStart(3)} minutes before continuing.`,
    );
    if (!this.yes(200, 54, 54)) return 'L2012';
    this.saveGame();
    return 'STOP';
  }
  saveGame() {
    // Serialize the full dynamic state.  Mnemonics (KEYS, LAMP, ...) are
    // recomputed deterministically by setup(), so they need not be saved; the
    // derived atloc/link chains ARE saved so restore needs no rebuilding.
    const state = {
      place: this.place, fixed: this.fixed, prop: this.prop,
      link: this.link, atloc: this.atloc, abb: this.abb,
      loc: this.loc, newloc: this.newloc, oldloc: this.oldloc, oldlc2: this.oldlc2,
      turns: this.turns, limit: this.limit, tally: this.tally, tally2: this.tally2,
      dflag: this.dflag, dloc: this.dloc, odloc: this.odloc, dseen: this.dseen,
      numdie: this.numdie, holdng: this.holdng, clock1: this.clock1, clock2: this.clock2,
      bonus: this.bonus, closng: this.closng, panic: this.panic, closed: this.closed,
      lmwarn: this.lmwarn, knfloc: this.knfloc, iwest: this.iwest, foobar: this.foobar,
      dkill: this.dkill, hinted: this.hinted, hintlc: this.hintlc, wzdark: this.wzdark,
      abbnnum: this.abbnnum, detail: this.detail,
    };
    try {
      fs.writeFileSync(SAVE_PATH, JSON.stringify(state));
      this.mspeak(32);
    } catch (e) {
      this.io.println(' Save failed: ' + e.message);
    }
  }

  // Restore a previously suspended game.  setup() has already established the
  // constant mnemonics; we overlay the saved dynamic state and continue.
  resume(state) {
    Object.assign(this, state);
    this.gaveup = false;
    this.scorng = false;
    this.saved = -1;
  }

  // HOURS (8310)
  vHours() {
    this.mspeak(6);
    this.hours();
    return 'L2012';
  }
  hours() {}

  // =====================================================================
  //  closing / endgame (lines 1853-1981)
  // =====================================================================
  L10000() {
    this.prop[this.GRATE] = 0;
    this.prop[this.FISSUR] = 0;
    for (let i = 1; i <= 6; i++) {
      this.dseen[i] = false;
      this.dloc[i] = 0;
    }
    this.move(this.TROLL, 0);
    this.move(this.TROLL + 100, 0);
    this.move(this.TROLL2, this.data.plac[this.TROLL]);
    this.move(this.TROLL2 + 100, this.data.fixd[this.TROLL]);
    this.juggle(this.CHASM);
    if (this.prop[this.BEAR] !== 3) this.dstroy(this.BEAR);
    this.prop[this.CHAIN] = 0;
    this.fixed[this.CHAIN] = 0;
    this.prop[this.AXE] = 0;
    this.fixed[this.AXE] = 0;
    this.rspeak(129);
    this.clock1 = -1;
    this.closng = true;
    return 'L19999';
  }
  L11000() {
    this.prop[this.BOTTLE] = this.put(this.BOTTLE, 115, 1);
    this.prop[this.PLANT] = this.put(this.PLANT, 115, 0);
    this.prop[this.OYSTER] = this.put(this.OYSTER, 115, 0);
    this.prop[this.LAMP] = this.put(this.LAMP, 115, 0);
    this.prop[this.ROD] = this.put(this.ROD, 115, 0);
    this.prop[this.DWARF] = this.put(this.DWARF, 115, 0);
    this.loc = 115;
    this.oldloc = 115;
    this.newloc = 115;
    this.put(this.GRATE, 116, 0);
    this.prop[this.SNAKE] = this.put(this.SNAKE, 116, 1);
    this.prop[this.BIRD] = this.put(this.BIRD, 116, 1);
    this.prop[this.CAGE] = this.put(this.CAGE, 116, 0);
    this.prop[this.ROD2] = this.put(this.ROD2, 116, 0);
    this.prop[this.PILLOW] = this.put(this.PILLOW, 116, 0);
    this.prop[this.MIRROR] = this.put(this.MIRROR, 115, 0);
    this.fixed[this.MIRROR] = 116;
    for (let i = 1; i <= 100; i++) {
      if (this.toting(i)) this.dstroy(i);
    }
    this.rspeak(132);
    this.closed = true;
    return 'L2';
  }
  L12000() {
    this.rspeak(188);
    this.prop[this.BATTER] = 1;
    if (this.toting(this.BATTER)) this.drop(this.BATTER, this.loc);
    this.limit += 2500;
    this.lmwarn = false;
    return 'L19999';
  }
  L12200() {
    if (this.lmwarn || !this.here(this.LAMP)) return 'L19999';
    this.lmwarn = true;
    let spk = 187;
    if (this.place[this.BATTER] === 0) spk = 183;
    if (this.prop[this.BATTER] === 1) spk = 189;
    this.rspeak(spk);
    return 'L19999';
  }
  L12400() {
    this.limit = -1;
    this.prop[this.LAMP] = 0;
    if (this.here(this.LAMP)) this.rspeak(184);
    return 'L19999';
  }
  L12600() {
    this.rspeak(185);
    this.gaveup = true;
    return 'L20000';
  }
  L13000() {
    this.mspeak(1);
    return 'L20000';
  }
  L19000() {
    this.rspeak(136);
    return 'L20000';
  }

  // =====================================================================
  //  scoring (lines 2007-2091)
  // =====================================================================
  L20000() {
    const d = this.data;
    let score = 0;
    let mxscor = 0;
    for (let i = 50; i <= this.maxtrs; i++) {
      if (!d.otext[i]) continue;
      let k = 12;
      if (i === this.CHEST) k = 14;
      if (i > this.CHEST) k = 16;
      if (this.prop[i] >= 0) score += 2;
      if (this.place[i] === 3 && this.prop[i] === 0) score += k - 2;
      mxscor += k;
    }
    score += (this.maxdie - this.numdie) * 10;
    mxscor += this.maxdie * 10;
    if (!(this.scorng || this.gaveup)) score += 4;
    mxscor += 4;
    if (this.dflag !== 0) score += 25;
    mxscor += 25;
    if (this.closng) score += 25;
    mxscor += 25;
    if (this.closed) {
      if (this.bonus === 0) score += 10;
      if (this.bonus === 135) score += 25;
      if (this.bonus === 134) score += 30;
      if (this.bonus === 133) score += 45;
    }
    mxscor += 45;
    if (this.place[this.MAGZIN] === 108) score += 1;
    mxscor += 1;
    score += 2;
    mxscor += 2;
    for (let i = 1; i <= d.hntmax; i++) if (this.hinted[i]) score -= d.hints[i].cost;
    this.score = score;
    this.mxscor = mxscor;
    if (this.scorng) return 'L8241';
    this.io.println('');
    this.io.println('');
    this.io.println('');
    this.io.println(`You scored${String(score).padStart(4)} out of a possible${String(mxscor).padStart(4)}, using${String(this.turns).padStart(5)} turns.`);
    let cls = -1;
    for (let i = 0; i < d.classes.length; i++) {
      if (d.classes[i].threshold >= score) {
        cls = i;
        break;
      }
    }
    if (cls < 0) {
      this.io.println('');
      this.io.println(' You just went off my scale!!');
      this.io.println('');
      return 'L25000';
    }
    this.speak(d.classes[cls].lines);
    if (cls !== d.classes.length - 1) {
      const need = d.classes[cls].threshold + 1 - score;
      this.io.println('');
      this.io.println(
        ` To achieve the next higher rating, you need${String(need).padStart(3)} more point${need === 1 ? '' : 's'}.`,
      );
      this.io.println('');
      return 'L25000';
    }
    this.io.println('');
    this.io.println(' To achieve the next higher rating would be a neat trick!');
    this.io.println('');
    this.io.println(' Congratulations!!');
    this.io.println('');
    return 'L25000';
  }
  L25000() {
    return 'STOP';
  }
}

// Install the wizard/cave-hours methods (START, WIZARD, HOURS, MAINT, MOTD, ...).
installWizard(Engine);
