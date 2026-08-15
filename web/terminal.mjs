// Terminal-style transcript UI: renders the engine's output stream, echoes
// submitted commands, keeps an input history, and manages focus/scroll.
export function createTerminal({ screen, form, input }) {
  const history = [];
  let historyIndex = 0;
  let onSubmitLine = null;
  let noteShown = false;

  const scrollDown = () => {
    screen.scrollTop = screen.scrollHeight;
  };

  // Raw engine output (text chunks; the engine mostly writes whole lines).
  function write(s) {
    screen.appendChild(document.createTextNode(String(s)));
    scrollDown();
  }

  // The command echo: the terminal echoes what the player typed; the engine
  // does not.
  function echo(line) {
    const el = document.createElement('span');
    el.className = 'echo';
    el.textContent = `> ${line}\n`;
    screen.appendChild(el);
    scrollDown();
  }

  // A one-time UI note (e.g. after the game ended), visually set apart.
  function note(text) {
    if (noteShown) return;
    noteShown = true;
    const el = document.createElement('span');
    el.className = 'note';
    el.textContent = `\n[${text}]\n`;
    screen.appendChild(el);
    scrollDown();
  }

  function clearNote() {
    noteShown = false;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const line = input.value;
    input.value = '';
    if (line.trim() !== '') {
      history.push(line);
      localStorage.setItem('adventure:history', JSON.stringify(history.slice(-100)));
    }
    historyIndex = history.length;
    echo(line);
    onSubmitLine?.(line);
    input.focus();
  });

  // Everything the game prints is upper-case; keep the typed line that way
  // too (the value itself, so the echo and the history match).  The caret
  // position is preserved for mid-line edits, and IME composition (mobile
  // Russian keyboards) is left alone until it commits.
  input.addEventListener('input', (event) => {
    if (event.isComposing) return;
    const upper = input.value.toUpperCase();
    if (upper === input.value) return;
    const caret = input.selectionStart;
    input.value = upper;
    input.setSelectionRange(caret, caret);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      // Some embedded browsers never perform the form's implicit submission;
      // route Enter through requestSubmit() so there is a single code path.
      event.preventDefault();
      form.requestSubmit();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (history.length === 0) return;
    event.preventDefault();
    if (event.key === 'ArrowUp' && historyIndex > 0) historyIndex--;
    if (event.key === 'ArrowDown' && historyIndex < history.length) historyIndex++;
    input.value = history[historyIndex] ?? '';
  });

  // Typing anywhere focuses the input; so does a click on the game surface --
  // but never the toolbar (buttons, the language selector). Moving focus
  // while a native <select> popup is opening closes it instantly (macOS),
  // and stealing it on keydown does the same to an open popup.
  const inToolbar = (event) => event.target instanceof Element && event.target.closest('.tools') !== null;
  document.addEventListener('click', (event) => {
    if (inToolbar(event)) return;
    if (String(getSelection()).trim() === '') input.focus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.target === input) return;
    if (inToolbar(event)) return;
    if (event.key.length === 1 || event.key === 'Backspace') input.focus();
  });

  // Restore the command history from a previous visit (any language).
  try {
    history.push(...JSON.parse(localStorage.getItem('adventure:history') ?? '[]'));
    historyIndex = history.length;
  } catch {
    /* corrupt history is simply ignored */
  }

  return {
    write,
    echo,
    note,
    clearNote,
    setInputEnabled(enabled) {
      input.disabled = !enabled;
      form.classList.toggle('idle', !enabled);
      if (enabled) {
        clearNote();
        input.focus();
      }
    },
    set onSubmit(fn) {
      onSubmitLine = fn;
    },
  };
}
