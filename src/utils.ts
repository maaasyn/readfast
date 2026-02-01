/**
 * Strip leading and trailing punctuation from a word.
 * Returns the core word and the leading/trailing punctuation.
 */
export function parseWord(word: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  // Capture leading non-alphanumerics, then the core (anything), then trailing non-alphanumerics
  const match = word.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  if (!match) {
    return { leading: "", core: word, trailing: "" };
  }
  return {
    leading: match[1] || "",
    core: match[2] || "",
    trailing: match[3] || "",
  };
}

/**
 * Calculate the Optimal Recognition Point (ORP) index for a word
 * using the Spritz formula. Punctuation is ignored for calculation.
 *
 * | Length | ORP Index | Example        |
 * |--------|-----------|----------------|
 * | 1      | 0         | A              |
 * | 2-5    | 1         | word           |
 * | 6-9    | 2         | speed          |
 * | 10-13  | 3         | recognize      |
 * | 14+    | 4         | constitutional |
 */
export function getORPIndex(word: string): number {
  const { core } = parseWord(word);
  const len = core.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

/**
 * Extract words from text, preserving punctuation attached to words.
 */
export function extractWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/**
 * Check if a word represents a number (contains digits).
 */
export function isNumber(word: string): boolean {
  return /\d/.test(word);
}
