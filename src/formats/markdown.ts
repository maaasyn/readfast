import { readFileSync } from "fs";
import type { FormatProcessor, ParsedDocument, Paragraph, Chapter } from "./types.js";

export const markdownProcessor: FormatProcessor = {
  extensions: [".md", ".markdown"],

  canHandle({ filePath }) {
    const lower = filePath.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown");
  },

  async parse({ filePath }) {
    const content = readFileSync(filePath, "utf-8");
    return parseMarkdown({ content });
  },
};

export function parseMarkdown({ content }: { content: string }): ParsedDocument {
  const lines = content.split("\n");
  const chapters: Chapter[] = [];
  let currentChapter: Chapter = { paragraphs: [] };
  let currentParagraph = "";
  let inBlockquote = false;

  const flushParagraph = () => {
    if (currentParagraph.trim()) {
      const text = stripMarkdownFormatting(currentParagraph.trim());
      if (text) {
        currentChapter.paragraphs.push({ text, isBlockquote: inBlockquote });
      }
    }
    currentParagraph = "";
    inBlockquote = false;
  };

  const flushChapter = () => {
    flushParagraph();
    if (currentChapter.paragraphs.length > 0 || currentChapter.title) {
      chapters.push(currentChapter);
    }
    currentChapter = { paragraphs: [] };
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (isHeading(trimmed)) {
      flushParagraph();
      const { level, text } = parseHeading(trimmed);

      if (isChapterHeading(level)) {
        flushChapter();
        currentChapter.title = text;
      }

      currentChapter.paragraphs.push({ text, isHeading: true, headingLevel: level });
      continue;
    }

    if (isBlockquoteLine(trimmed)) {
      if (!inBlockquote) {
        flushParagraph();
        inBlockquote = true;
      }
      currentParagraph += " " + trimmed.replace(/^>\s*/, "");
      continue;
    }

    if (isImageLine(trimmed) || isHorizontalRule(trimmed)) {
      flushParagraph();
      continue;
    }

    if (inBlockquote) {
      flushParagraph();
    }
    currentParagraph += " " + trimmed;
  }

  flushChapter();

  if (chapters.length === 0) {
    chapters.push({ paragraphs: [] });
  }

  return {
    metadata: { title: chapters[0]?.title },
    chapters,
  };
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+.+$/.test(line);
}

function parseHeading(line: string): { level: number; text: string } {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  return {
    level: match![1].length,
    text: stripMarkdownFormatting(match![2]),
  };
}

function isChapterHeading(level: number): boolean {
  return level <= 2;
}

function isBlockquoteLine(line: string): boolean {
  return line.startsWith(">");
}

function isImageLine(line: string): boolean {
  return /^!\[.*\]\(.*\)$/.test(line);
}

function isHorizontalRule(line: string): boolean {
  return /^[-*_]{3,}$/.test(line);
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
