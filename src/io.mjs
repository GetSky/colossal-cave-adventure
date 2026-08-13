// I/O layer for the Adventure port.
//
// The original FORTRAN uses blocking ACCEPT (input) and TYPE (output).  Since the
// target is a Node CLI, we mirror that with *synchronous* stdin reads (no async,
// no generators), so the engine can be a near line-for-line port.  This module is
// the only place that touches real file descriptors; the engine talks to an `io`
// object, which makes it trivially mockable in tests.

import fs from 'node:fs';

// Build a synchronous line reader over file descriptor `fd` (default: 0 = stdin).
// Returns the next line (without the trailing newline) or null at EOF.
function createStdinLineReader(fd = 0) {
  let pending = Buffer.alloc(0);
  return function getline() {
    while (true) {
      const nl = pending.indexOf(0x0a);
      if (nl >= 0) {
        const line = pending.subarray(0, nl);
        pending = pending.subarray(nl + 1);
        let s = line.toString('latin1');
        if (s.endsWith('\r')) s = s.slice(0, -1);
        return s;
      }
      const chunk = Buffer.alloc(256);
      let n;
      try {
        n = fs.readSync(fd, chunk, 0, chunk.length, null);
      } catch (e) {
        return null;
      }
      if (n <= 0) {
        if (pending.length > 0) {
          const s = pending.toString('latin1');
          pending = Buffer.alloc(0);
          return s;
        }
        return null;
      }
      pending = Buffer.concat([pending, chunk.subarray(0, n)]);
    }
  };
}

// Create an io object.
//   input  : () => string|null   (defaults to a synchronous stdin reader)
//   output : a writable stream   (defaults to process.stdout)
export function createIo({ input, output } = {}) {
  const readline = input ?? createStdinLineReader();
  const out = output ?? process.stdout;
  return {
    // TYPE '...'   (one line, with newline)
    println(s) {
      out.write(s == null ? '\n' : s + '\n');
    },
    // raw write, no newline
    print(s) {
      out.write(s == null ? '' : String(s));
    },
    // blank line (FORTRAN "TYPE 2" with FORMAT())
    blank() {
      out.write('\n');
    },
    // ACCEPT ...   (blocking; engine upper-cases/truncates as needed)
    getline() {
      return readline();
    },
    // expose for the few places that need to write raw bytes
    _out: out,
  };
}

// Helper for tests: an input source that returns scripted lines in order.
export function scriptedInput(lines) {
  let i = 0;
  return () => (i < lines.length ? lines[i++] : null);
}
