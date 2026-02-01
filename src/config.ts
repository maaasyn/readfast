import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { parse } from "smol-toml";

// XDG Base Directory Specification
// https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");

const CONFIG_DIR = join(XDG_CONFIG_HOME, "readfast");
const DATA_DIR = join(XDG_DATA_HOME, "readfast");

const CONFIG_FILE = join(CONFIG_DIR, "config.toml");
const PROGRESS_FILE = join(DATA_DIR, "progress.json");

export type Config = {
  speed: number;
  pivot_color: string;
  text_color: string;
  zen: boolean;
  minimal: boolean;
  initial_delay: number;
  context_window: number;
  number_multiplier: number;
};

// Sane defaults - no config file needed
const DEFAULT_CONFIG: Config = {
  speed: 300,
  pivot_color: "red",
  text_color: "default",
  zen: false,
  minimal: false,
  initial_delay: 400,
  context_window: 0,
  number_multiplier: 2.0,
};

export const CONFIG_EXAMPLE = `# Readfast configuration
# Place this file at: ${CONFIG_FILE}

# Default reading speed (words per minute)
speed = 300

# Colors (use "default" for terminal default)
pivot_color = "red"
text_color = "default"

# Display options
zen = false
minimal = false

# Context window: show N words before and after (0 = off)
context_window = 0

# Delay before first word (milliseconds)
# Delay before first word (milliseconds)
initial_delay = 400

# Delay multiplier for numbers (e.g. 2.0 = 2x normal duration)
number_multiplier = 2.0
`;

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): Config {
  // No config file? Use defaults. That's fine.
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = parse(content);

    // Merge with defaults - only override what's specified
    return {
      speed: typeof parsed.speed === "number" ? parsed.speed : DEFAULT_CONFIG.speed,
      pivot_color: typeof parsed.pivot_color === "string" ? parsed.pivot_color : DEFAULT_CONFIG.pivot_color,
      text_color: typeof parsed.text_color === "string" ? parsed.text_color : DEFAULT_CONFIG.text_color,
      zen: typeof parsed.zen === "boolean" ? parsed.zen : DEFAULT_CONFIG.zen,
      minimal: typeof parsed.minimal === "boolean" ? parsed.minimal : DEFAULT_CONFIG.minimal,
      initial_delay: typeof parsed.initial_delay === "number" ? parsed.initial_delay : DEFAULT_CONFIG.initial_delay,
      context_window: typeof parsed.context_window === "number" ? parsed.context_window : DEFAULT_CONFIG.context_window,
      number_multiplier: typeof parsed.number_multiplier === "number" ? parsed.number_multiplier : DEFAULT_CONFIG.number_multiplier,
    };
  } catch {
    // Invalid config? Use defaults and don't crash.
    return { ...DEFAULT_CONFIG };
  }
}

// Progress tracking - stored in XDG_DATA_HOME

type ProgressEntry = {
  index: number;
  wpm: number;
  lastRead: string;
};

type ProgressData = Record<string, ProgressEntry>;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadProgressData(): ProgressData {
  if (!existsSync(PROGRESS_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(PROGRESS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveProgressData(data: ProgressData) {
  ensureDataDir();
  writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

export function getProgress({ filePath }: { filePath: string }): ProgressEntry | null {
  const absolutePath = resolve(filePath);
  const data = loadProgressData();
  return data[absolutePath] || null;
}

export function saveProgress({ filePath, index, wpm }: { filePath: string; index: number; wpm: number }) {
  const absolutePath = resolve(filePath);
  const data = loadProgressData();
  data[absolutePath] = {
    index,
    wpm,
    lastRead: new Date().toISOString(),
  };
  saveProgressData(data);
}

export function clearProgress({ filePath }: { filePath: string }) {
  const absolutePath = resolve(filePath);
  const data = loadProgressData();
  delete data[absolutePath];
  saveProgressData(data);
}
