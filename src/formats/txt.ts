import { readFileSync } from "fs";
import type { FormatProcessor, ParsedDocument, Paragraph } from "./types.js";

export const txtProcessor: FormatProcessor = {
  extensions: [".txt"],

  canHandle({ filePath }) {
    return filePath.toLowerCase().endsWith(".txt");
  },

  async parse({ filePath }) {
    const content = readFileSync(filePath, "utf-8");
    return parseText({ content });
  },
};

export function parseText({ content }: { content: string }): ParsedDocument {
  const paragraphs = splitIntoParagraphs(content).map(normalizeWhitespace);

  return {
    metadata: {},
    chapters: [{ paragraphs }],
  };
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function normalizeWhitespace(text: string): Paragraph {
  return { text: text.replace(/\s+/g, " ") };
}
