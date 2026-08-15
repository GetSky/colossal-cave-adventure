// Web entry point: loads the game database and locales (plain fetch -- no
// build step), wires the terminal DOM to the game session (web/game.mjs),
// and manages the toolbar (new game / resume / language).
//
// Layout note: index.html sits at the repository root and imports ./web/*,
// and app.mjs imports ../src/*.  The GitHub Pages workflow copies index.html,
// web/ and src/ into the site verbatim, so paths work identically when the
// repository is served locally and when deployed under /<repo>/.

import { applyLocale } from '../src/i18n.mjs';
import { createSession } from './game.mjs';
import { createTerminal } from './terminal.mjs';

const LANGS = ['en', 'ru'];

const UI = {
  en: {
    newGame: 'New game',
    resume: 'Resume',
    confirmNew: 'Start over? The current game will be lost.',
    gameOver: 'Game over',
    suspended: 'Game saved by SUSPEND -- press Resume to continue',
    loading: 'Loading the cave... ',
    loadError: 'Failed to load the game data: ',
  },
  ru: {
    newGame: 'Новая игра',
    resume: 'Продолжить',
    confirmNew: 'Начать заново? Текущая игра будет потеряна.',
    gameOver: 'Игра окончена',
    suspended: 'Игра сохранена командой ПАУЗА — нажмите «Продолжить»',
    loading: 'Пещера загружается... ',
    loadError: 'Не удалось загрузить данные игры: ',
  },
};

function normalizeLang(value) {
  const code = String(value ?? '').trim().toLowerCase().split(/[-_.]/)[0];
  return LANGS.includes(code) ? code : null;
}

function detectLang() {
  // ?lang=ru beats the stored choice beats the browser locale.
  return (
    normalizeLang(new URLSearchParams(location.search).get('lang')) ??
    normalizeLang(localStorage.getItem('adventure:lang')) ??
    (normalizeLang(navigator.language) ?? 'en')
  );
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const lang = detectLang();
  localStorage.setItem('adventure:lang', lang);
  const ui = UI[lang];

  const newBtn = document.getElementById('new');
  const resumeBtn = document.getElementById('resume');
  const langSelect = document.getElementById('lang');
  newBtn.textContent = ui.newGame;
  resumeBtn.textContent = ui.resume;
  langSelect.value = lang;
  document.documentElement.lang = lang;

  const terminal = createTerminal({
    screen: document.getElementById('screen'),
    form: document.getElementById('form'),
    input: document.getElementById('input'),
  });
  const loading = document.createTextNode(ui.loading);
  document.getElementById('screen').appendChild(loading);

  let baseData, enJson, localeJson;
  try {
    [baseData, enJson, localeJson] = await Promise.all([
      fetchJson('./src/data.json'),
      fetchJson('./src/locales/en.json'),
      lang === 'en' ? null : fetchJson(`./src/locales/${lang}.json`),
    ]);
  } catch (err) {
    loading.remove();
    terminal.write(`\n${ui.loadError}${err.message}\n`);
    return;
  }
  loading.remove();

  // Same locale convention as the CLI's i18n-node.mjs: the English strings
  // ride along as uiBase and serve as the fallback for missing keys.
  const locale = localeJson ?? enJson;
  locale.code = lang;
  locale.uiBase = enJson.strings ?? {};
  const data = applyLocale(baseData, locale);

  let session = null;

  function syncUi() {
    const waiting = session?.isWaiting() ?? false;
    const stopped = session?.isStopped() ?? false;
    terminal.setInputEnabled(waiting);
    // Resume is meaningful once the current game has ended and something is
    // actually saved (a SUSPEND snapshot; a finished game clears its slots).
    const hasSave =
      localStorage.getItem(`adventure:suspend:${lang}`) !== null ||
      localStorage.getItem(`adventure:auto:${lang}`) !== null;
    resumeBtn.disabled = !(stopped && hasSave);
    if (stopped) {
      terminal.note(session.isSuspended() ? ui.suspended : ui.gameOver);
    }
  }

  function makeSession() {
    const s = createSession({
      data,
      locale,
      storage: localStorage,
      saveKey: `adventure:auto:${lang}`,
      suspendKey: `adventure:suspend:${lang}`,
      onWrite: (chunk) => terminal.write(chunk),
      onStateChange: syncUi,
    });
    s.qio.setOnWait(syncUi);
    return s;
  }

  // Returning visitors continue where they left off (the autosave replay
  // rebuilds the exact game, history and all); a first visit starts fresh.
  function startSession() {
    session = makeSession();
    if (!session.resumeSaved()) session.newGame();
    syncUi();
  }

  terminal.onSubmit = (line) => {
    if (!session || session.isStopped() || !session.isWaiting()) return;
    session.submit(line);
    syncUi();
  };

  newBtn.addEventListener('click', () => {
    if (
      (session && !session.isStopped()) ||
      localStorage.getItem(`adventure:suspend:${lang}`) !== null
    ) {
      if (!confirm(ui.confirmNew)) return;
    }
    session = makeSession();
    session.newGame(); // discards the save slots
    syncUi();
  });

  resumeBtn.addEventListener('click', () => {
    if (session && !session.isStopped()) return;
    session = makeSession();
    if (!session.resumeSaved()) session.newGame();
    syncUi();
  });

  langSelect.addEventListener('change', () => {
    localStorage.setItem('adventure:lang', langSelect.value);
    location.search = `?lang=${langSelect.value}`;
  });

  startSession();
}

main();
