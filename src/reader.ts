import chalk from "chalk";
import { parseWord, isNumber, visibleWidth } from "./utils.js";
import stripAnsi from "strip-ansi";

// Helper to truncate string to specific width
export function truncate(str: string, width: number): string {
  if (str.length <= width) return str;
  return str.slice(0, width);
}

export type ChapterInfo = {
  title: string | undefined;
  startIndex: number;
};

export type ReaderOptions = {
  wpm: number;
  pivotColor: string;
  textColor: string;
  minimal: boolean;
  start: number;
  zen: boolean;
  initialDelayMs: number;
  chapters: ChapterInfo[];
  contextWindow: number;
  numberMultiplier: number;
  onQuit?: (state: { index: number; wpm: number }) => void;
};

const DEFAULT_OPTIONS: ReaderOptions = {
  wpm: 300,
  pivotColor: "red",
  textColor: "default",
  minimal: false,
  start: 0,
  zen: false,
  initialDelayMs: 400,
  chapters: [],
  contextWindow: 0,
  numberMultiplier: 2.0,
};

// Punctuation delay multipliers (as fraction of base word delay)
const PUNCTUATION_DELAYS: Record<string, number> = {
  ".": 1.5,
  "!": 1.5,
  "?": 1.5,
  ";": 0.75,
  ":": 0.75,
  ",": 0.5,
  "—": 0.5,
  "–": 0.5,
  ")": 0.25,
  "]": 0.25,
  '"': 0.25,
  "'": 0.25,
};

function getWordLengthMultiplier(length: number): number {
  if (length <= 5) return 0;
  if (length <= 9) return 0.1;
  if (length <= 13) return 0.2;
  return 0.3;
}

function getORPIndexFromLength(length: number): number {
  if (length <= 1) return 0;
  if (length <= 5) return 1;
  if (length <= 9) return 2;
  if (length <= 13) return 3;
  return 4;
}

function getCurrentChapterIndex({
  wordIndex,
  chapters,
}: {
  wordIndex: number;
  chapters: ChapterInfo[];
}): number {
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (wordIndex >= chapters[i].startIndex) {
      return i;
    }
  }
  return 0;
}

function colorize(color: string, text: string): string {
  if (color === "default") {
    return text;
  }
  const colorFn = (chalk as unknown as Record<string, (s: string) => string>)[
    color
  ];
  return colorFn ? colorFn(text) : text;
}

type ReaderState = {
  index: number;
  paused: boolean;
  wpm: number;
  quit: boolean;
  zen: boolean;
  needsRender: boolean;
  tapTimes: number[];
  browseMode: boolean;
  browseSelection: number;
  gotoMode: boolean;
  gotoInput: string;
};

type WordData = {
  raw: string;
  leading: string;
  core: string;
  trailing: string;
  orpIndex: number;
  punctuationMultiplier: number;
  lengthMultiplier: number;
  isNumber: boolean;
};

export function prepareWordData(words: string[]): WordData[] {
  const wordData: WordData[] = words.map((raw) => {
    const { leading, core, trailing } = parseWord(raw);
    let punctuationMultiplier = 0;
    for (const char of trailing) {
      punctuationMultiplier += PUNCTUATION_DELAYS[char] || 0;
    }
    const lengthMultiplier = getWordLengthMultiplier(core.length);
    return {
      raw,
      leading,
      core,
      trailing,
      orpIndex: getORPIndexFromLength(core.length),
      punctuationMultiplier,
      lengthMultiplier,
      isNumber: isNumber(core), // Check if the core word is a number
    };
  });

  return wordData;
}

export function isFooterVisible(termHeight: number, zen: boolean): boolean {
  return !zen && termHeight >= 4;
}

export function renderFocusWord(
  word: WordData,
  options: Partial<ReaderOptions>,
): string {
  if (word.core.length === 0) {
    return colorize(options.pivotColor || "red", word.raw);
  }

  const before = word.core.slice(0, word.orpIndex);
  const pivot = word.core[word.orpIndex] || "";
  const after = word.core.slice(word.orpIndex + 1);

  return (
    colorize(options.textColor || "default", word.leading) +
    colorize(options.textColor || "default", before) +
    colorize(options.pivotColor || "red", pivot) +
    colorize(options.textColor || "default", after) +
    colorize(options.textColor || "default", word.trailing)
  );
}

export function renderWordLine(
  index: number,
  wordData: WordData[],
  options: Partial<ReaderOptions>,
  basePadding: number,
): string {
  const word = wordData[index];
  const ctx = options.contextWindow || 0;

  // No context: simple centered word
  if (ctx === 0) {
    const focusWord = renderFocusWord(word, options);
    const leftPad = " ".repeat(
      Math.max(0, basePadding - word.leading.length - word.orpIndex),
    );
    return leftPad + focusWord;
  }

  // With context: show surrounding words
  const contextBefore: string[] = [];
  const contextAfter: string[] = [];

  for (let i = Math.max(0, index - ctx); i < index; i++) {
    contextBefore.push(wordData[i].raw);
  }
  for (
    let i = index + 1;
    i <= Math.min(wordData.length - 1, index + ctx);
    i++
  ) {
    contextAfter.push(wordData[i].raw);
  }

  const beforeText =
    contextBefore.length > 0 ? chalk.dim(contextBefore.join(" ") + " ") : "";
  const afterText =
    contextAfter.length > 0 ? chalk.dim(" " + contextAfter.join(" ")) : "";
  const focusWord = renderFocusWord(word, options);

  // Calculate padding to keep focus word centered on its ORP
  const beforeLen =
    contextBefore.join(" ").length + (contextBefore.length > 0 ? 1 : 0);
  const leftPad = " ".repeat(
    Math.max(0, basePadding - beforeLen - word.leading.length - word.orpIndex),
  );

  return leftPad + beforeText + focusWord + afterText;
}

export type RenderedStatusBar = {
  statusLine: string;
  separator: string;
};

/**
 * Build a single-line status bar that never exceeds `width`.
 * Adds parts in priority order until it would overflow.
 * Pads to exactly `width` columns to fully overwrite previous content.
 */
function joinFitMeta(
  parts: string[],
  width: number,
  sep = "  ",
  sidePadding = 0,
): { line: string; kept: number } {
  const pad = Math.max(0, sidePadding | 0);
  const innerWidth = Math.max(0, width - pad * 2);

  const out: string[] = [];
  let used = 0;

  for (const p of parts) {
    const candidate = (out.length ? sep : "") + p;
    const w = visibleWidth(candidate);
    if (used + w > innerWidth) break;
    out.push(p);
    used += w;
  }

  let line = out.join(sep);

  // Last-resort trim (should rarely trigger)
  while (visibleWidth(line) > innerWidth) line = line.slice(0, -1);

  // Pad inner so it overwrites any previous longer line
  const innerPad = Math.max(0, innerWidth - visibleWidth(line));
  const inner = line + " ".repeat(innerPad);

  // Apply side padding
  const side = " ".repeat(pad);
  return { line: side + inner + side, kept: out.length };
}

function joinFit(
  parts: string[],
  width: number,
  sep = "  ",
  sidePadding = 0,
): string {
  return joinFitMeta(parts, width, sep, sidePadding).line;
}

/**
 * Safer separator that won’t be “double width” in some terminals.
 * If you really want box drawing, you can swap "-" with "─".
 */
function makeSeparator(width: number): string {
  return chalk.dim("-".repeat(Math.max(0, width)));
}

export function getStatusBarData(
  state: { index: number; paused: boolean; wpm: number; zen: boolean },
  wordsCount: number,
  options: { chapters?: { startIndex: number; title?: string }[] } = {},
  width: number,
  tapCount: number,
): RenderedStatusBar {
  // Guard
  width = Math.max(0, width | 0);

  const separator = makeSeparator(width);

  // Priority tokens (build in order, highest priority first)
  const stateIcon = state.paused ? "⏸" : "▶";
  const stateColor = state.paused ? chalk.yellow : chalk.green;
  const stateLabel = state.paused ? "PAUSED" : "PLAYING";

  const wpmText =
    tapCount > 0 ? `${state.wpm} wpm ♪${tapCount}` : `${state.wpm} wpm`;

  const chaptersCount = options.chapters?.length ?? 0;

  const iconToken = stateColor(stateIcon);
  const labelToken = stateColor(stateLabel);
  const wpmToken = chalk.cyan(wpmText);

  const rest: string[] = [];
  rest.push(chalk.dim("←/→: word  ↑/↓: wpm"));
  rest.push(chalk.dim(`pos: ${state.index + 1}/${wordsCount}`));

  // Shortcuts (human-readable; each is its own token so joinFit can drop them)
  // Use a visible symbol for Space: "␠" (U+2420)
  rest.push(chalk.dim("␠: pause"));
  rest.push(chalk.dim("t: tempo"));
  rest.push(chalk.dim("g: goto"));
  if (chaptersCount > 1) rest.push(chalk.dim("b: chapters"));
  if (!state.zen) rest.push(chalk.dim("z: zen"));
  rest.push(chalk.dim("q: quit"));

  // Base bar: icon + wpm + rest
  const baseParts = [iconToken, wpmToken, ...rest];
  const base = joinFitMeta(baseParts, width, "  ", 1);

  // With label placed next to icon (NOT at the end).
  // Only use it if it doesn't cause us to drop anything compared to the base line.
  const labeledParts = [iconToken, labelToken, wpmToken, ...rest];
  const labeled = joinFitMeta(labeledParts, width, "  ", 1);

  const statusLine =
    labeled.kept === labeledParts.length && labeled.kept >= base.kept
      ? labeled.line
      : base.line;

  return { statusLine, separator };
}

export async function displayWords(
  words: string[],
  options: Partial<ReaderOptions> = {},
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const wordData = prepareWordData(words);

  const state: ReaderState = {
    index: Math.min(Math.max(0, opts.start), words.length - 1),
    paused: false,
    wpm: opts.wpm,
    quit: false,
    zen: opts.zen,
    needsRender: true,
    tapTimes: [],
    browseMode: false,
    browseSelection: 0,
    gotoMode: false,
    gotoInput: "",
  };

  const TAP_TIMEOUT_MS = 2000;
  const MIN_TAPS = 2;

  function handleTapTempo() {
    const now = Date.now();
    const recentTaps = state.tapTimes.filter((t) => now - t < TAP_TIMEOUT_MS);
    recentTaps.push(now);
    state.tapTimes = recentTaps;

    if (recentTaps.length >= MIN_TAPS) {
      const intervals: number[] = [];
      for (let i = 1; i < recentTaps.length; i++) {
        intervals.push(recentTaps[i] - recentTaps[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedWpm = Math.round(60000 / avgInterval);
      state.wpm = Math.max(50, Math.min(1000, calculatedWpm));
    }
  }

  function getTapCount() {
    const now = Date.now();
    return state.tapTimes.filter((t) => now - t < TAP_TIMEOUT_MS).length;
  }

  let wake: (() => void) | null = null;
  const lastFrame = new Map<number, string>();
  const notify = () => {
    if (wake) {
      const fn = wake;
      wake = null;
      fn();
    }
  };

  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      wake = resolve;
    });

  const waitForDelayOrEvent = (delayMs: number) =>
    new Promise<"timeout" | "event">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), delayMs);
      wake = () => {
        clearTimeout(timer);
        resolve("event");
      };
    });

  // Dynamic terminal dimensions
  const getTermDimensions = () => ({
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  });

  const getBasePadding = () => {
    if (opts.minimal) {
      // Small fixed padding for ORP alignment (like Unix tools, left-aligned)
      return 5;
    }
    const { width } = getTermDimensions();
    return Math.floor(width / 2);
  };

  const clearDisplay = () => {
    if (!opts.minimal) {
      process.stdout.write("\x1B[2J");
      process.stdout.write("\x1B[H");
      lastFrame.clear();
    } else {
      process.stdout.write("\r\x1B[K");
    }
  };

  // Hide cursor and enable raw mode
  process.stdout.write("\x1B[?25l");
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  if (!opts.minimal) {
    clearDisplay();
  } else {
    // Minimal mode: start on a new line like Unix tools
    process.stdout.write("\n");
  }

  // Handle terminal resize
  const handleResize = () => {
    if (!opts.minimal) {
      clearDisplay();
    }
    state.needsRender = true;
    notify();
  };
  process.stdout.on("resize", handleResize);

  // Cleanup
  const cleanup = () => {
    process.stdout.removeListener("resize", handleResize);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    if (!opts.minimal) {
      process.stdout.write("\x1B[2J");
      process.stdout.write("\x1B[H");
    } else {
      // Minimal mode: clear line and move to next line
      process.stdout.write("\r\x1B[K\n");
    }
    process.stdout.write("\x1B[?25h");
    opts.onQuit?.({ index: state.index, wpm: state.wpm });
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  // Handle keyboard input
  const handleKeypress = (key: Buffer) => {
    const keyStr = key.toString();

    // Browse mode key handling
    if (state.browseMode) {
      // Escape or Q to exit browse mode
      if (keyStr === "\x1B" && key.length === 1) {
        state.browseMode = false;
        clearDisplay();
        state.needsRender = true;
        notify();
        return;
      }

      // Enter to select chapter
      if (keyStr === "\r" || keyStr === "\n") {
        state.index = opts.chapters[state.browseSelection].startIndex;
        state.browseMode = false;
        clearDisplay();
        state.needsRender = true;
        notify();
        return;
      }

      // Arrow keys for navigation
      if (key.length === 3 && key[0] === 0x1b && key[1] === 0x5b) {
        if (key[2] === 0x41) {
          // Up
          state.browseSelection = Math.max(0, state.browseSelection - 1);
          renderBrowseMode();
        } else if (key[2] === 0x42) {
          // Down
          state.browseSelection = Math.min(
            opts.chapters.length - 1,
            state.browseSelection + 1,
          );
          renderBrowseMode();
        }
      }
      return;
    }

    // Goto mode key handling
    if (state.gotoMode) {
      // Escape to cancel
      if (keyStr === "\x1B" && key.length === 1) {
        state.gotoMode = false;
        state.gotoInput = "";
        clearDisplay();
        state.needsRender = true;
        notify();
        return;
      }

      // Enter to execute
      if (keyStr === "\r" || keyStr === "\n") {
        parseAndExecuteGoto();
        state.gotoMode = false;
        state.gotoInput = "";
        clearDisplay();
        state.needsRender = true;
        notify();
        return;
      }

      // Backspace
      if (keyStr === "\x7f" || keyStr === "\b") {
        state.gotoInput = state.gotoInput.slice(0, -1);
        renderGotoPrompt();
        return;
      }

      // Regular character input (alphanumeric and %)
      if (key.length === 1 && /[a-zA-Z0-9%]/.test(keyStr)) {
        state.gotoInput += keyStr;
        renderGotoPrompt();
      }
      return;
    }

    if (keyStr === "\x03") {
      state.quit = true;
      notify();
      return;
    }

    if (keyStr === "q" || keyStr === "Q") {
      state.quit = true;
      notify();
      return;
    }

    if (keyStr === "\x1B" && key.length === 1) {
      state.quit = true;
      notify();
      return;
    }

    if (keyStr === " ") {
      state.paused = !state.paused;
      state.needsRender = true;
      notify();
      return;
    }

    // Z to toggle zen mode
    if (keyStr === "z" || keyStr === "Z") {
      state.zen = !state.zen;
      clearDisplay();
      state.needsRender = true;
      notify();
      return;
    }

    // T for tap tempo
    if (keyStr === "t" || keyStr === "T") {
      handleTapTempo();
      state.needsRender = true;
      notify();
      return;
    }

    // B for chapter browser
    if ((keyStr === "b" || keyStr === "B") && opts.chapters.length > 1) {
      state.browseMode = true;
      state.browseSelection = getCurrentChapterIndex({
        wordIndex: state.index,
        chapters: opts.chapters,
      });
      state.paused = true;
      renderBrowseMode();
      return;
    }

    // G for goto
    if (keyStr === "g" || keyStr === "G") {
      state.gotoMode = true;
      state.gotoInput = "";
      state.paused = true;
      renderGotoPrompt();
      return;
    }

    // Arrow keys
    if (key.length === 3 && key[0] === 0x1b && key[1] === 0x5b) {
      switch (key[2]) {
        case 0x44: // Left - go back (stay paused if paused)
          state.index = Math.max(0, state.index - 1);
          state.needsRender = true;
          notify();
          break;
        case 0x43: // Right - go forward (stay paused if paused)
          state.index = Math.min(words.length - 1, state.index + 1);
          state.needsRender = true;
          notify();
          break;
        case 0x41: // Up
          state.wpm = Math.min(1000, state.wpm + 25);
          state.needsRender = true;
          notify();
          break;
        case 0x42: // Down
          state.wpm = Math.max(50, state.wpm - 25);
          state.needsRender = true;
          notify();
          break;
      }
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on("data", handleKeypress);
  }

  const renderFocusWordInner = (word: WordData) => {
    return renderFocusWord(word, opts);
  };

  const renderWordLineInner = (index: number) => {
    return renderWordLine(index, wordData, opts, getBasePadding());
  };

  const renderStatusBar = () => {
    const { width } = getTermDimensions();
    return getStatusBarData(
      {
        index: state.index,
        paused: state.paused,
        wpm: state.wpm,
        zen: state.zen,
      },
      words.length,
      opts,
      width,
      getTapCount(),
    );
  };

  const render = () => {
    const { height: termHeight } = getTermDimensions();
    const formattedLine = renderWordLineInner(state.index);

    const writeLine = (row: number, text: string) => {
      if (lastFrame.get(row) === text) {
        return;
      }
      process.stdout.write(`\x1B[${row};1H\x1B[K${text}`);
      lastFrame.set(row, text);
    };

    if (!opts.minimal) {
      // Centered mode: use absolute positioning
      const wordRow = Math.floor(termHeight / 2);
      writeLine(wordRow, formattedLine);

      // Only show footer if there is enough vertical space
      // We need at least 6 lines to show header (word) + footer without cramping/collision
      // Word is at 50% height.
      // If height=5, wordRow=2 (3rd line). Status=4, Legend=5.
      // If height=4, wordRow=2. Status=3, Legend=4.
      // Collision happens if wordRow >= termHeight - 2

      const footerSafe = isFooterVisible(termHeight, state.zen);

      if (footerSafe) {
        const { statusLine, separator } = renderStatusBar();

        // Show separator only if height >= 5
        if (termHeight >= 5) {
          writeLine(termHeight - 1, separator);
          writeLine(termHeight, statusLine);
        } else {
          // Height == 4: status only, no separator
          writeLine(termHeight, statusLine);
        }
      } else {
        // Clear footer area if we're not showing it (e.g. switched to zen or small screen)
        // If screen is small, these rows might not exist or might be the word row
        if (termHeight - 1 > wordRow) writeLine(termHeight - 1, "");
        if (termHeight > wordRow) writeLine(termHeight, "");
      }
    } else {
      // Minimal mode: just the word, nothing else
      process.stdout.write(`\r\x1B[K${formattedLine}`);
    }
  };

  function renderBrowseMode() {
    const { width, height: termHeight } = getTermDimensions();
    const chapters = opts.chapters;
    const currentChapter = getCurrentChapterIndex({
      wordIndex: state.index,
      chapters,
    });

    // Clear screen
    process.stdout.write("\x1B[2J\x1B[H");
    lastFrame.clear();

    const title = chalk.bold("  Chapters");
    const hint = chalk.dim("  ↑↓: select  Enter: go  Esc: cancel");
    const separator = chalk.dim("─".repeat(width));

    process.stdout.write(`${title}\n${hint}\n${separator}\n\n`);

    // Calculate visible range (scroll if needed)
    const maxVisible = termHeight - 6;
    let startIdx = 0;
    if (chapters.length > maxVisible) {
      startIdx = Math.max(
        0,
        state.browseSelection - Math.floor(maxVisible / 2),
      );
      startIdx = Math.min(startIdx, chapters.length - maxVisible);
    }
    const endIdx = Math.min(startIdx + maxVisible, chapters.length);

    for (let i = startIdx; i < endIdx; i++) {
      const chapter = chapters[i];
      const num = `${i + 1}`.padStart(3);
      const chapterTitle = chapter.title || "Untitled";
      const isSelected = i === state.browseSelection;
      const isCurrent = i === currentChapter;

      let line = `  ${num}. ${chapterTitle}`;
      if (isCurrent) line += chalk.dim(" (current)");

      if (isSelected) {
        process.stdout.write(chalk.inverse(line) + "\n");
      } else {
        process.stdout.write(line + "\n");
      }
    }

    if (chapters.length > maxVisible) {
      const scrollInfo = chalk.dim(
        `\n  ${startIdx + 1}-${endIdx} of ${chapters.length}`,
      );
      process.stdout.write(scrollInfo);
    }
  }

  function renderGotoPrompt() {
    const { width, height: termHeight } = getTermDimensions();

    // Clear screen
    process.stdout.write("\x1B[2J\x1B[H");
    lastFrame.clear();

    const title = chalk.bold("  Go to");
    const hints = [
      chalk.dim("  1500    → word 1500"),
      chalk.dim("  25%     → 25% through"),
      chalk.dim("  c3      → chapter 3"),
    ];
    const separator = chalk.dim("─".repeat(width));

    process.stdout.write(`${title}\n`);
    hints.forEach((h) => process.stdout.write(h + "\n"));
    process.stdout.write(`${separator}\n\n`);

    const prompt = `  > ${state.gotoInput}█`;
    process.stdout.write(prompt);
  }

  function parseAndExecuteGoto(): boolean {
    const input = state.gotoInput.trim().toLowerCase();
    if (!input) return false;

    // Chapter: c3, c12, etc.
    const chapterMatch = input.match(/^c(\d+)$/);
    if (chapterMatch) {
      const chapterNum = parseInt(chapterMatch[1], 10) - 1;
      if (chapterNum >= 0 && chapterNum < opts.chapters.length) {
        state.index = opts.chapters[chapterNum].startIndex;
        return true;
      }
      return false;
    }

    // Percentage: 25%, 50%, etc.
    const percentMatch = input.match(/^(\d+)%$/);
    if (percentMatch) {
      const percent = parseInt(percentMatch[1], 10);
      if (percent >= 0 && percent <= 100) {
        state.index = Math.floor((percent / 100) * (words.length - 1));
        return true;
      }
      return false;
    }

    // Word number: 1500, etc.
    const wordMatch = input.match(/^(\d+)$/);
    if (wordMatch) {
      const wordNum = parseInt(wordMatch[1], 10) - 1;
      if (wordNum >= 0 && wordNum < words.length) {
        state.index = wordNum;
        return true;
      }
      return false;
    }

    return false;
  }

  // Main loop
  if (opts.initialDelayMs > 0) {
    state.needsRender = true;
    render();
    state.needsRender = false;
    await waitForDelayOrEvent(opts.initialDelayMs);
  }

  while (state.index < words.length && !state.quit) {
    if (state.needsRender) {
      render();
      state.needsRender = false;
    }

    if (!state.paused) {
      const word = wordData[state.index];
      const baseDelay = 60000 / state.wpm;
      const delayMs = Math.floor(
        baseDelay *
          (1 +
            word.punctuationMultiplier +
            word.lengthMultiplier +
            (word.isNumber ? opts.numberMultiplier! - 1 : 0)),
      );

      const result = await waitForDelayOrEvent(delayMs);
      if (result === "timeout" && !state.paused && !state.quit) {
        state.index++;
        state.needsRender = true;
      }
    } else {
      await waitForEvent();
    }
  }

  if (process.stdin.isTTY) {
    process.stdin.removeListener("data", handleKeypress);
  }
  if (opts.initialDelayMs > 0) {
    await waitForDelayOrEvent(opts.initialDelayMs);
  }
  cleanup();
}
