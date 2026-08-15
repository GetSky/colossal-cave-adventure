# Colossal Cave Adventure (Node.js)

A close, line-for-line JavaScript port of the original **Colossal Cave
Adventure** (350 points, Crowther & Woods, PDP-10 FORTRAN) for Node.js —
with a browser version that runs on GitHub Pages.

The original sources (`advent.for`, `advent.dat`) are unchanged. The
`advent.dat` data file is precompiled into `src/data.json` by a direct port of
the FORTRAN loader; all game text, the map, vocabulary, and logic are ported
1:1.

## Web version

The same engine runs in the browser: `index.html` + `web/` + `src/` are plain
ES modules and JSON with no build step and no dependencies. Open it locally
with any static server:

```bash
python3 -m http.server   # then open http://localhost:8000/
```

Every `git push` to `master` deploys the site via `.github/workflows/deploy.yml`
(one-time setup: Settings → Pages → Source: **GitHub Actions**). The web version
keeps the terminal aesthetic and adds:

- English and Russian (`?lang=ru` or the language selector);
- an automatic save after every turn — reloading the page continues exactly
  where you left off (the transcript replays through the deterministic engine);
- `SUSPEND`/`ПАУЗА` storing a snapshot, with a **Resume** button, like the
  CLI's `--resume`;
- command history on ↑/↓ and a mobile-friendly layout.

The web input layer is unit-tested to be byte-for-byte equivalent to the CLI
runs of the same command sequences (`test/web.test.mjs`).

## Requirements

Node.js 20+ (uses the built-in `node:test`; no external dependencies).

## Build and run

```bash
npm run build     # precompile advent.dat -> src/data.json
npm start         # start the game (reads input from the terminal)
```

Or run it in one command (`index.mjs` builds the data if it is missing):

```bash
node src/index.mjs
```

Save and restore a game:

```bash
# Type SUSPEND in the game; state is written to ~/.adventure-save.json
node src/index.mjs --resume   # resume the saved game
```

## Languages / Перевод

The game ships in English by default and includes a full Russian translation
of every message, location description, and object. Choose the language with
a launch argument:

```bash
node src/index.mjs --lang=ru   # or: --lang ru | -l ru
npm start -- --lang=ru
advent --lang ru               # when installed via `npm i -g`
```

- Without the argument the game is in English (byte-for-byte the historic
  behavior; tests run in English).
- `--lang=en`, `--lang=ru`, `--locale`, `--language`, and `-l` are accepted;
  only the language code's first segment is used, so `ru-RU` works too.
- An unknown language exits with an error listing the available ones.

### Russian commands

In `--lang=ru` mode the parser additionally understands Russian commands;
English commands keep working. Only the first five characters of each word
matter, exactly as in the original:

- Directions: `СЕВЕР`/`С`, `ЮГ`/`Ю`, `ВОСТОК`/`В`, `ЗАПАД`/`З`, `СВ`, `ЮВ`,
  `ЮЗ`, `СЗ`, `ВВЕРХ`, `ВНИЗ`, `ВОЙТИ`, `ВЫЙТИ`/`НАРУЖУ`, `ЛЕС`, `ЗДАНИЕ`,
  `ДОРОГА`, `ДОЛИНА`.
- Verbs: `ВОЗЬМИ` (take), `ПОЛОЖ`/`ВЫБРО` (drop), `ОТКРОЙ` (unlock),
  `ЗАКРОЙ` (lock), `ЗАЖГИ`/`ВКЛ` (light on), `ПОГАСИ`/`ВЫКЛ` (off),
  `СМОТРЕТЬ` (look), `ИНВЕНТ` (inventory), `СКАЖИ` (say), `УБЕЙ`/`БЕЙ`
  (attack), `НАЛЕЙ` (fill), `ВЫЛЕЙ` (pour), `ЕШЬ`, `ПЕЙ`, `КОПАЙ`, `ШВЫРНИ`
  (throw), `ЧИТАЙ` (read), `СЧЁТ` (score), `ВЫХОД`/`КОНЕЦ` (quit),
  `ПАУЗА`/`СОХРАНИ` (suspend), `ЧАСЫ` (hours), `ПОМОЩЬ` (help), `ИНФО`
  (info).
- Nouns in the nominative or accusative: `ЛАМПА`/`ЛАМПУ`, `КЛЮЧИ`,
  `РЕШЕТКА`/`РЕШЕТКУ` (also spelled with `Ё`), `ПТИЦА`, `ДВЕРЬ`, `ЗМЕЯ`,
  `ТОПОР`, `ДРАКОН`, `МЕДВЕДЬ`, `ТРОЛЛЬ`, `ВОДА`, `МАСЛО`, `БУТЫЛКА`,
  `СУНДУК`, `ЯЙЦА`, `ВАЗА`, `ЗОЛОТО`, `АЛМАЗЫ`, `ЖЕМЧУГ`, `ЦЕПЬ` and the
  rest of the treasures.
- Yes/no prompts accept `ДА`/`Д` and `НЕТ`/`Н` (English `Y`/`N` too).
- The wizard's magic word can be `ГНОМ` as well as `DWARF`.
- Magic words `XYZZY`, `PLUGH`, `PLOVER`, `FEE FIE FOE FOO` stay English —
  they are part of the game's lore.

### Adding another language

Create `src/locales/<code>.json` modeled on `src/locales/ru.json`: override
the text sections (`ltext`, `stext`, `rtext`, `mtext`, `otext`, `classes`),
list command synonyms in `vocabExtra` (natural spelling; it is normalised to
the five-character contract automatically), and translate the engine's UI
`strings`. `test/i18n.test.mjs` can be extended to cover the new locale.

## Tests

```bash
npm test          # RNG, 36-bit shift, .dat parser, engine, walkthrough, i18n, web driver
```

The tests compare database counters with the FORTRAN program's own report,
check exact `RAN` RNG values and 36-bit `SHIFT` behavior, and cover engine
scenarios such as the opening, inventory, lamp, grate, scoring, and a
deterministic walkthrough command corpus.

## How to play

The game accepts one- or two-word commands. As in the original, only the
first five characters of each word are significant. Examples: `IN`,
`TAKE KEYS`, `LIGHT LAMP`, `UNLOCK GRATE`, `DOWN`, `INVENT`, `LOOK`,
`ATTACK DWARF`, `XYZZY`, `SCORE`, `QUIT`. Answer yes/no prompts with `Y` or
`N`. Type `HOURS` to see the cave's hours; use `MAGIC MODE` as the first
command to enter wizard mode.

## Architecture

Each module is a direct port of the corresponding part of `advent.for`.
Comments include line numbers for tracing behavior back to the original.

| File | Purpose | Corresponding `advent.for` code |
|---|---|---|
| `src/io.mjs` | Synchronous input/output for the CLI (like `ACCEPT`/`TYPE`) | I/O |
| `src/bits.mjs` | `SHIFT` and 36-bit operations via BigInt | lines 2820–2838 |
| `src/rng.mjs` | `RAN` PRNG (`R*1021 mod 1048576`) and `DATIME` | lines 2842–2898 |
| `src/text.mjs` | `SPEAK`/`PSPEAK`/`RSPEAK`/`MSPEAK` | lines 1098–2170 |
| `src/vocab.mjs` | `VOCAB` dictionary lookup | lines 2309–2337 |
| `src/i18n.mjs` | Localization: `--lang` parsing, locale overlay, string templates (pure, browser-safe) | — |
| `src/i18n-node.mjs` | Node-only locale loading from `src/locales/` | — |
| `tools/build-dat.mjs` | `advent.dat → data.json` precompiler | lines 1002–1100 |
| `src/engine.mjs` | State, objects, main loop, verbs, dwarves, cave closing, scoring | main block + 2341–2451 |
| `src/wizard.mjs` | `START`/`WIZARD`/`HOURS`/`MAINT`/`MOTD` (cave hours) | lines 2452–2816 |
| `src/index.mjs` | CLI entry point | — |
| `web/game.mjs` | Web session driver: promise-backed input queue, autosave/replay | — |
| `web/app.mjs` | Web bootstrap: data/locale loading, toolbar, language | — |
| `web/terminal.mjs` | Terminal UI: transcript, echo, input history | — |
| `.github/workflows/deploy.yml` | Deploys `index.html` + `web/` + `src/` to GitHub Pages | — |

**Control flow.** The main FORTRAN block is a tangle of roughly 30 numbered
labels and `GOTO`s. Each label becomes a phase method (`L2000`, `L2600`,
`L8`, …) that does its work and **returns the next phase name**; `run()` chains
them until `'STOP'`. This retains the original flow 1:1 without a `goto`
emulation layer or a behavior-changing refactor.

**Input/output.** The FORTRAN `ACCEPT` blocks until a line is typed. The
engine's phases await `io.getline()`; the CLI layer keeps input synchronous
(`fs.readSync`), so the engine remains a near line-for-line port — awaiting a
plain string is a no-op. The web version supplies an io whose `getline`
returns a Promise that resolves when the player submits a line, which lets
the same unmodified engine run in a browser. At EOF (CLI only), the game
cleanly ends and calculates the score through an `EofSignal`.

## Fidelity to the original

**Ported directly (1:1):** all text, the map, condition-encoded travel table,
vocabulary, object placement, every verb's logic, dwarves/pirate/troll/bear/
dragon, cave closing and the final repository room, scoring and player ranks,
death/reincarnation, the lamp and batteries, `RAN` (with the same probability
distribution), five-character input semantics, wizard mode, and cave hours.

**Behavior-preserving adaptations:**

- A5 packing (five characters in a 36-bit word) becomes ordinary JavaScript
  strings. Mandatory truncation to five characters is retained because it is
  part of the gameplay.
- `XOR 'PHROG'` vocabulary obfuscation is removed; it only made core-image
  reading harder and did not affect lookups.
- Messages are stored as arrays of strings rather than one `LINES` array with
  pointers; `SPEAK` behavior (a blank line before a message and `>$<` as a
  suppression marker) is preserved.
- `SUSPEND` serializes state to `~/.adventure-save.json`; `--resume` restores
  it. `LATNCY` remains a field but does not block in this single-user program.
  In the web version the same snapshot goes to `localStorage`, and an
  automatic turn-by-turn autosave replays deterministically after a page
  reload (the one wall-clock dependency — wizard `MAINT` cave hours — is not
  part of the replay; hours configured there can differ after a reload).
- Cave-hours behavior (`START`/`HOURS`/`MAINT`/wizard) works, but the cave is
  open all day by default (`WKDAY=0`). The original `WKDAY=0o00777400` would
  block play during business hours—a sensible setting on a shared 1977 system,
  but not on a modern machine. Wizard mode can configure actual hours with
  `MAINT`.
- 36-bit arithmetic (`SHIFT` and the wizard challenge) is implemented with
  BigInt/Number and a 36-bit mask.

## Data structure (`src/data.json`)

Generated from `advent.dat`. It contains long/short location descriptions
(`ltext`/`stext`), arbitrary and magic messages (`rtext`/`mtext`), object
descriptions with inventory and property messages (`otext`), the travel table
(`travel`), condition bits (`cond`), vocabulary (`vocab`), initial object
locations (`plac`/`fixd`), default verb messages (`actspk`), player classes
(`classes`), and hints (`hints`).

## Credits

Original game: Willie Crowther and Don Woods. The PDP-10 FORTRAN sources were
kindly supplied by Alan H. Martin (DEC) from a recovered LINK-10 regression
test system copy.
