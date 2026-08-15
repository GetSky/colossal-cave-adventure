// Wizard mode and "cave hours" -- port of advent.for lines 2452-2816
// (START, MAINT, WIZARD, HOURS, HOURSX, NEWHRS, NEWHRX, MOTD).
//
// These routines are installed onto Engine.prototype by installWizard().
//
// Fidelity note: the original POOF defaults set weekday prime-time hours
// (WKDAY=0o00777400), which would *lock non-wizards out of the cave during the
// business day* -- authentic for a 1977 timesharing system, but hostile on a
// modern single-user machine.  We keep every routine fully functional (HOURS,
// MAINT, wizard challenges all work) but default the cave to "open all day"
// (WKDAY=0), matching how essentially every later port behaves.  A wizard can
// still use MAINT to install real hours.

import { shift } from './bits.mjs';
import { norm } from './vocab.mjs';

// Shared EOF signal (also used by engine.mjs for input EOF).  Defined here so it
// can be imported by both modules without a circular dependency.
export class EofSignal extends Error {
  constructor() {
    super('EOF');
    this.name = 'EofSignal';
  }
}

// Install all wizard/cave-hours methods onto the given Engine class.
export function installWizard(Engine) {
  // YESM: yes/no prompt that uses "magic" (section 12) messages. (FORTRAN YESM)
  Engine.prototype.yesm = async function (x, y, z) {
    while (true) {
      if (x) this.mspeak(x);
      const r = await this.getin();
      if (this.yesWords.includes(r.wd1)) {
        if (y) this.mspeak(y);
        return true;
      }
      if (this.noWords.includes(r.wd1)) {
        if (z) this.mspeak(z);
        return false;
      }
      this.io.println(this.t('pleaseAnswer'));
    }
  };

  // START: prime-time / latency check.  Returns true for a demo game.
  // (FORTRAN START, lines 2455-2517)
  Engine.prototype.start = async function () {
    let [D, T] = this.datime();
    let primtm = this.wkday;
    if (D % 7 <= 1) primtm = this.wkend; // Saturday/Sunday (day 0 = Sat)
    if (D >= this.hbegin && D <= this.hend) primtm = this.holid;
    const ptime = (primtm & shift(1, Math.floor(T / 60))) !== 0;
    // latency (saved-game restart) gating is moot for a single-user port.
    if (!ptime) {
      this.saved = -1;
      return false;
    }
    // prime time: announce hours, require wizard, else offer a demo
    this.mspeak(3);
    this.hours();
    this.mspeak(4);
    if (await this.wizard()) {
      this.saved = -1;
      return false;
    }
    const demo = await this.yesm(5, 7, 7);
    if (demo) {
      this.saved = -1;
      return true;
    }
    this.mspeak(9);
    // In a port we never actually STOP the process here; fall back to a demo.
    return true;
  };

  // HOURS: announce current cave hours. (FORTRAN HOURS, lines 2639-2669)
  Engine.prototype.hours = function () {
    this.io.println('');
    this.hoursX(this.wkday, this.t('weekdays1'), this.t('weekdays2'));
    this.hoursX(this.wkend, this.t('weekend1'), this.t('weekend2'));
    this.hoursX(this.holid, this.t('holidayLabel1'), this.t('holidayLabel2'));
    const [D] = this.datime();
    if (this.hend < D || this.hend < this.hbegin) return;
    if (this.hbegin > D) {
      const days = this.hbegin - D;
      this.io.println(
        this.t('holidayNext', {
          d: days,
          unit: days === 1 ? this.t('holidayDay') : this.t('holidayDays'),
          name: this.hname,
        }),
      );
    } else {
      this.io.println(this.t('holidayToday', { name: this.hname }));
    }
  };

  // HOURSX: print the open/closed hours for one day-type. (lines 2673-2704)
  Engine.prototype.hoursX = function (h, day1, day2) {
    if (h === 0) {
      this.io.println(this.t('hoursOpen', { day1, day2 }));
      return;
    }
    let first = true;
    let from = 0;
    let till = 0;
    while (true) {
      while ((h & shift(1, from)) !== 0) from++; // skip prime (closed) hours
      if (from >= 24) {
        if (first) this.io.println(this.t('hoursClosed', { day1, day2 }));
        return;
      }
      till = from;
      while (till !== 24 && (h & shift(1, till)) === 0) till++;
      if (first) this.io.println(this.t('hoursRange', { day1, day2, from, till }));
      else this.io.println(this.t('hoursRangeNext', { from, till }));
      first = false;
      from = till;
    }
  };

  // NEWHRS / NEWHRX: let a wizard set prime-time hours. (lines 2708-2751)
  Engine.prototype.newHrs = async function () {
    this.mspeak(21);
    this.wkday = await this.newHrX(this.t('week1'), this.t('week2'));
    this.wkend = await this.newHrX(this.t('wknd1'), this.t('wknd2'));
    this.holid = await this.newHrX(this.t('hol1'), this.t('hol2'));
    this.mspeak(22);
    this.hours();
  };
  Engine.prototype.newHrX = async function (day1, day2) {
    let mask = 0;
    this.io.println(this.t('primeTimeOn', { day1, day2 }));
    while (true) {
      this.io.println(this.t('fromPrompt'));
      const from = Number.parseInt((await this.io.getline()) || '', 10);
      if (Number.isNaN(from) || from < 0 || from >= 24) return mask;
      this.io.println(this.t('tillPrompt'));
      const tillRaw = Number.parseInt((await this.io.getline()) || '', 10);
      const till = tillRaw - 1;
      if (Number.isNaN(till) || till < from || till >= 24) return mask;
      for (let i = from; i <= till; i++) mask |= shift(1, i);
    }
  };

  // WIZARD: ask for credentials. (FORTRAN WIZARD, lines 2578-2635)
  Engine.prototype.wizard = async function () {
    if (!(await this.yesm(16, 0, 7))) return false;
    this.mspeak(17);
    const r = await this.getin();
    if (!this.eq(r.wd1, this.magic) && !this.magics.includes(r.wd1)) return this.impostor();
    // generate the date-based challenge (5 letters), portable re-derivation of
    // the FORTRAN packed-word challenge (lines 2600-2623).
    let [D, T] = this.datime();
    T = T * 2 + 1;
    const val = [0, 0, 0, 0, 0, 0]; // 1-based
    for (let Y = 1; Y <= 5; Y++) {
      const x = 79 + (D % 5);
      D = Math.floor(D / 5);
      for (let Z = 1; Z <= x; Z++) T = (T * 1027) % 1048576;
      val[Y] = Math.floor((T * 26) / 1048576) + 1;
    }
    let chal = '';
    for (let Y = 1; Y <= 5; Y++) chal += String.fromCharCode(64 + val[Y]);
    if (await this.yesm(18, 0, 0)) return this.impostor();
    this.io.println('');
    this.io.println(' ' + chal);
    const rep = await this.getin();
    // compute the expected reply
    let [D2, T2] = this.datime();
    T2 = Math.floor(T2 / 60) * 40 + Math.floor(T2 / 10) * 10;
    let Dm = this.magnm;
    let ok = rep.wd1.length >= 5;
    for (let Y = 1; Y <= 5 && ok; Y++) {
      const Z = (Y % 5) + 1;
      const xi = (Math.abs(val[Y] - val[Z]) * (Dm % 10) + (T2 % 10)) % 26 + 1;
      T2 = Math.floor(T2 / 10);
      Dm = Math.floor(Dm / 10);
      const expected = String.fromCharCode(64 + xi);
      if (norm(rep.wd1raw[Y - 1] || ' ') !== norm(expected)) ok = false;
    }
    if (!ok) return this.impostor();
    this.mspeak(19);
    return true;
  };
  Engine.prototype.impostor = function () {
    this.mspeak(20);
    return false;
  };

  // MAINT: wizard maintenance menu. (FORTRAN MAINT, lines 2521-2574)
  Engine.prototype.maint = async function () {
    if (!(await this.wizard())) return;
    this.speech.blklin = false;
    if (await this.yesm(10, 0, 0)) this.hours();
    if (await this.yesm(11, 0, 0)) await this.newHrs();
    if (await this.yesm(26, 0, 0)) {
      this.mspeak(27);
      this.hbegin = Number.parseInt((await this.io.getline()) || '0', 10) || 0;
      this.mspeak(28);
      const span = Number.parseInt((await this.io.getline()) || '0', 10) || 0;
      const [D] = this.datime();
      this.hbegin += D;
      this.hend = this.hbegin + span - 1;
      this.mspeak(29);
      this.hname = ((await this.io.getline()) || '').toUpperCase();
    }
    this.io.println(this.t('shortGameLen', { n: this.short }));
    const sh = Number.parseInt((await this.io.getline()) || '0', 10);
    if (sh > 0) this.short = sh;
    this.mspeak(12);
    const mg = await this.getin();
    if (mg.wd1raw && mg.wd1raw.trim() !== '') this.magic = mg.wd1raw.toUpperCase();
    this.mspeak(13);
    const mn = Number.parseInt((await this.io.getline()) || '0', 10);
    if (mn > 0) this.magnm = mn;
    this.io.println(this.t('latencyPrompt', { n: this.latncy }));
    const lt = Number.parseInt((await this.io.getline()) || '0', 10);
    if (lt > 0 && lt < 45) this.mspeak(30);
    if (lt > 0) this.latncy = Math.max(45, lt);
    if (await this.yesm(14, 0, 0)) await this.motd(true);
    this.saved = 0;
    this.abb[1] = 0;
    this.mspeak(15);
    this.speech.blklin = true;
    // FORTRAN calls CIAO (exit) here; in the port we simply end.
    throw new EofSignal();
  };

  // MOTD: message of the day. (FORTRAN MOTD, lines 2755-2792)
  Engine.prototype.motd = async function (alter) {
    if (this._motd == null) this._motd = null; // null message by default
    if (alter) {
      this._motd = [];
      this.mspeak(23);
      while (true) {
        const line = await this.io.getline();
        if (line === null) break;
        if (line.trim() === '') break;
        this._motd.push(line);
        if (this._motd.length >= 14) {
          this.mspeak(25);
          break;
        }
      }
      return;
    }
    if (this._motd) for (const line of this._motd) this.io.println(line);
  };
}
