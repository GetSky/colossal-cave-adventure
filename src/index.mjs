#!/usr/bin/env node
// Colossal Cave Adventure -- Node CLI entry point.
// Loads the precompiled database (building it first if absent), wires the
// synchronous terminal I/O, and runs the engine.
//
// Usage: advent [--lang <xx>] [--resume]
//   --lang ru | --lang=ru | -l ru   choose the UI language (default: en)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createIo } from './io.mjs';
import { Engine } from './engine.mjs';
import { resolveLang, applyLocale } from './i18n.mjs';
import { loadLocale } from './i18n-node.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data.json');
const SAVE_PATH = path.join(os.homedir(), '.adventure-save.json');

function ensureData() {
  if (fs.existsSync(DATA_PATH)) return;
  // build on demand if the precompiler is available
  const buildPath = path.join(__dirname, '..', 'tools', 'build-dat.mjs');
  if (fs.existsSync(buildPath)) {
    import(buildPath);
  } else {
    throw new Error('data.json missing -- run `npm run build` first.');
  }
}

ensureData();
const baseData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// Pick the language from the command line (--lang=ru / --lang ru / -l ru).
let locale;
try {
  locale = loadLocale(resolveLang(process.argv) || 'en');
} catch (e) {
  console.error(String(e.message));
  process.exit(1);
}
const data = applyLocale(baseData, locale);

const io = createIo();
const engine = new Engine(data, io, locale, {
  // SUSPEND persistence lives outside the engine (it is Node-specific here,
  // localStorage in the web version).
  onSave: (json) => fs.writeFileSync(SAVE_PATH, json),
});

const wantResume = process.argv.includes('--resume') || process.argv.includes('resume');
if (wantResume && fs.existsSync(SAVE_PATH)) {
  try {
    const state = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    engine.resume(state);
    await engine.run('L2000'); // continue from the current location description
  } catch (e) {
    io.println(engine.t('resumeFailed', { msg: e.message }));
  }
} else {
  await engine.run();
}
