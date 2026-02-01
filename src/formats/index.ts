import type { FormatProcessor, ParsedDocument } from "./types.js";
import { txtProcessor, parseText } from "./txt.js";
import { markdownProcessor, parseMarkdown } from "./markdown.js";
import { epubProcessor } from "./epub.js";

export type {
  FormatProcessor,
  ParsedDocument,
  DocumentMetadata,
  Chapter,
  Paragraph,
} from "./types.js";

export { parseText, parseMarkdown };

const processors: FormatProcessor[] = [
  epubProcessor,
  markdownProcessor,
  txtProcessor,
];

export function getProcessor({ filePath }: { filePath: string }): FormatProcessor | null {
  return processors.find((p) => p.canHandle({ filePath })) || null;
}

export function getSupportedExtensions(): string[] {
  return processors.flatMap((p) => p.extensions);
}

export async function parseFile({ filePath }: { filePath: string }): Promise<ParsedDocument> {
  const processor = getProcessor({ filePath });
  if (!processor) {
    const { readFileSync } = await import("fs");
    const content = readFileSync(filePath, "utf-8");
    return parseText({ content });
  }
  return processor.parse({ filePath });
}

export type ChapterInfo = {
  title: string | undefined;
  startIndex: number;
};

export type DocumentWords = {
  words: string[];
  paragraphBreaks: Set<number>;
  chapterBreaks: Set<number>;
  headingIndices: Set<number>;
  chapters: ChapterInfo[];
};

export function documentToWords({ doc }: { doc: ParsedDocument }): DocumentWords {
  const words: string[] = [];
  const paragraphBreaks = new Set<number>();
  const chapterBreaks = new Set<number>();
  const headingIndices = new Set<number>();
  const chapters: ChapterInfo[] = [];

  for (const chapter of doc.chapters) {
    const chapterStartIndex = words.length;

    for (const para of chapter.paragraphs) {
      const paraWords = para.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 0);

      if (paraWords.length === 0) continue;

      const startIndex = words.length;

      if (para.isHeading) {
        for (let i = 0; i < paraWords.length; i++) {
          headingIndices.add(startIndex + i);
        }
      }

      words.push(...paraWords);
      paragraphBreaks.add(words.length - 1);
    }

    if (words.length > chapterStartIndex) {
      chapters.push({ title: chapter.title, startIndex: chapterStartIndex });
      chapterBreaks.add(words.length - 1);
    }
  }

  return { words, paragraphBreaks, chapterBreaks, headingIndices, chapters };
}
