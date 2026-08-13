// Message-printing helpers -- a port of the FORTRAN SPEAK / PSPEAK / RSPEAK /
// MSPEAK subroutines (advent.for lines 1098-2170).
//
// In the original, messages live in one big packed `LINES` array and are
// addressed by index; `>$<` as the first word means "no message".  Here the
// precompiler already resolved every message to an array of line strings, so
// SPEAK just prints such an array (leading blank line unless `blklin` is false,
// suppressed when the first line is the `>$<` sentinel).

export function createSpeaker(data, io) {
  const speaker = {
    // When true (the default), a blank line precedes each message (FORTRAN
    // BLKLIN).  The inventory listing temporarily clears it.
    blklin: true,

    // SPEAK(lines): print a message (array of lines).  Mirrors the `>$<` and
    // BLKLIN behaviour of FORTRAN SPEAK.
    speak(lines) {
      if (!lines || lines.length === 0) return;
      if (isNoMsg(lines[0])) return;
      if (this.blklin) io.blank();
      for (const ln of lines) io.println(ln);
    },

    // RSPEAK(i): the i-th "random" message (section 6).
    rspeak(i) {
      if (i && data.rtext[i]) this.speak(data.rtext[i]);
    },

    // MSPEAK(i): the i-th "magic" message (section 12).
    mspeak(i) {
      if (i && data.mtext[i]) this.speak(data.mtext[i]);
    },

    // PSPEAK(msg, skip): object message.  skip < 0 -> inventory name;
    // skip >= 0 -> the (skip)th property message.
    pspeak(msg, skip) {
      const o = data.otext[msg];
      if (!o) return;
      if (skip < 0) {
        this.speak(o.inv);
        return;
      }
      this.speak(o.props[skip]);
    },
  };
  return speaker;
}

// FORTRAN: IF(LINES(N+1).EQ.'>$<')RETURN -- first A5 word equals ">$<".
const NO_MSG = '>$<  ';
function isNoMsg(line) {
  return (line + '     ').slice(0, 5) === NO_MSG;
}
