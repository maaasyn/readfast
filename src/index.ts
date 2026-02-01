#!/usr/bin/env node
import { program } from "commander";
import { existsSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { extname, join, resolve } from "path";
import { displayWords } from "./reader.js";
import { parseFile, parseText, documentToWords, getSupportedExtensions, type DocumentWords } from "./formats/index.js";
import { loadConfig, getProgress, saveProgress, getConfigPath, CONFIG_EXAMPLE } from "./config.js";

const EXAMPLE_TEXT =
  "Readfast uses a focused-word display to reduce eye movement. " +
  "Each word is aligned on its optimal recognition point, while punctuation adds small pauses for a natural rhythm. " +
  "Use the arrow keys to navigate, change speed with up and down, and toggle zen mode to remove distractions. " + 
  "Readfast supports various formats including plain text, Markdown, EPUB and links. " +
  "Press Q or Esc to quit at any time.";

const SUPPORTED_EXTENSIONS = getSupportedExtensions();

// Load config from file (provides defaults)
const config = loadConfig();

program
  .name("readfast")
  .description("A reading helper that displays words with minimal eye movement")
  .version("1.0.0")
  .addHelpText(
    "after",
    `
Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}

Config: ${getConfigPath()}

Controls:
  Space        Pause/Resume
  ←/→          Navigate words
  ↑/↓          Adjust speed (+/- 25 wpm)
  G            Go to (word number, %, or chapter)
  B            Browse chapters
  T            Tap tempo
  Z            Toggle zen mode
  Q / Esc      Quit`
  )
  .argument("[input...]", "File, URL, or words to display")
  .option("-s, --speed <wpm>", "Words per minute")
  .option("-m, --minimal", "Minimal mode (no UI, just words)")
  .option("-z, --zen", "Start in zen mode (no status bar)")
  .option("--fresh", "Ignore saved progress and start from beginning")
  .option("--start <word>", "Start from word number (1-based)")
  .option("--initial-delay <ms>", "Delay before first word (ms)")
  .option("--pivot-color <color>", "Color for the pivot letter")
  .option("--text-color <color>", "Color for the rest of the text")
  .option("-c, --context <words>", "Show N words before and after for context")
  .option("--force", "Read file as plain text regardless of extension")
  .option("--show-config", "Print example config to stdout")
  .action(async (input: string[], options) => {
    // Handle --show-config
    if (options.showConfig) {
      console.log(CONFIG_EXAMPLE);
      return;
    }

    const result = await extractWordsFromInput({ input, force: options.force ?? false });

    if (!result) {
      process.exit(1);
    }

    const { docWords, filePath } = result;

    if (docWords.words.length === 0) {
      console.error("No words to display");
      process.exit(1);
    }

    // Merge: config file < saved progress < CLI options
    let wpm = options.speed ? parseInt(options.speed, 10) : config.speed;
    let startIndex = 0;

    if (options.start) {
      startIndex = parseInt(options.start, 10) - 1;
    } else if (filePath && !options.fresh) {
      const saved = getProgress({ filePath });
      if (saved && saved.index > 0) {
        const percent = Math.round((saved.index / docWords.words.length) * 100);
        console.log(`Resuming from ${percent}% (word ${saved.index + 1}). Use --fresh to start over.`);
        startIndex = saved.index;
        if (!options.speed) {
          wpm = saved.wpm;
        }
      }
    }

    await displayWords(docWords.words, {
      wpm,
      pivotColor: options.pivotColor ?? config.pivot_color,
      textColor: options.textColor ?? config.text_color,
      minimal: options.minimal ?? config.minimal,
      start: startIndex,
      zen: options.zen ?? config.zen,
      initialDelayMs: options.initialDelay ? parseInt(options.initialDelay, 10) : config.initial_delay,
      chapters: docWords.chapters,
      contextWindow: options.context ? parseInt(options.context, 10) : config.context_window,
      numberMultiplier: config.number_multiplier,
      onQuit: filePath
        ? (state) => saveProgress({ filePath, index: state.index, wpm: state.wpm })
        : undefined,
    });
  });

type ExtractResult = {
  docWords: DocumentWords;
  filePath: string | null;
};

function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

async function fetchUrl({ url }: { url: string }): Promise<ExtractResult | null> {
  console.error(`Fetching: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status} ${response.statusText}`);
      return null;
    }

    const ext = extname(new URL(url).pathname).toLowerCase();
    const contentType = response.headers.get("content-type") || "";

    // Handle EPUB (binary) - need to save to temp file
    if (ext === ".epub" || contentType.includes("epub")) {
      const buffer = await response.arrayBuffer();
      const tempPath = join(tmpdir(), `readfast-${Date.now()}.epub`);
      writeFileSync(tempPath, Buffer.from(buffer));
      const doc = await parseFile({ filePath: tempPath });
      return { docWords: documentToWords({ doc }), filePath: url };
    }

    // Text-based formats
    const content = await response.text();

    if (ext === ".md" || ext === ".markdown" || contentType.includes("markdown")) {
      const { parseMarkdown } = await import("./formats/markdown.js");
      const doc = parseMarkdown({ content });
      return { docWords: documentToWords({ doc }), filePath: url };
    }

    // Default: plain text
    const doc = parseText({ content });
    return { docWords: documentToWords({ doc }), filePath: url };
  } catch (err) {
    console.error(`Failed to fetch: ${err instanceof Error ? err.message : "Unknown error"}`);
    return null;
  }
}

async function extractWordsFromInput({ input, force }: { input: string[]; force: boolean }): Promise<ExtractResult | null> {
  // No input and TTY: show example
  if (input.length === 0 && process.stdin.isTTY) {
    const doc = parseText({ content: EXAMPLE_TEXT });
    return { docWords: documentToWords({ doc }), filePath: null };
  }

  // Piped input
  if (input.length === 0 && !process.stdin.isTTY) {
    const content = await readStdin();
    if (!content.trim()) {
      console.error("No input provided");
      return null;
    }
    const doc = parseText({ content });
    return { docWords: documentToWords({ doc }), filePath: null };
  }

  const firstArg = input[0];

  // Check if it's a URL
  if (input.length === 1 && isUrl(firstArg)) {
    return fetchUrl({ url: firstArg });
  }

  // Check if it's a file path
  if (input.length === 1) {
    // Check existence
    if (!existsSync(firstArg)) {
      console.error(`File not found: ${firstArg}`);
      return null;
    }

    // Check if directory
    const stats = statSync(firstArg);
    if (stats.isDirectory()) {
      console.error(`Cannot read directory: ${firstArg}`);
      return null;
    }

    // Check format support
    const ext = extname(firstArg).toLowerCase();
    if (ext && !SUPPORTED_EXTENSIONS.includes(ext) && !force) {
      console.error(`Unsupported format: ${ext}`);
      console.error(`Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`);
      console.error(`Use --force to read as plain text`);
      return null;
    }

    // Parse file
    const filePath = resolve(firstArg);

    // Force mode: read as plain text
    if (force) {
      const { readFileSync } = await import("fs");
      const content = readFileSync(filePath, "utf-8");
      const doc = parseText({ content });
      return { docWords: documentToWords({ doc }), filePath };
    }

    const doc = await parseFile({ filePath });
    return { docWords: documentToWords({ doc }), filePath };
  }

  // Multiple args: treat as words
  const doc = parseText({ content: input.join(" ") });
  return { docWords: documentToWords({ doc }), filePath: null };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

program.parse();
