import { readFileSync } from "fs";
import JSZip from "jszip";
import type { FormatProcessor, ParsedDocument, Chapter, DocumentMetadata } from "./types.js";

export const epubProcessor: FormatProcessor = {
  extensions: [".epub"],

  canHandle({ filePath }) {
    return filePath.toLowerCase().endsWith(".epub");
  },

  async parse({ filePath }) {
    const data = readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);

    const containerXml = await readZipFile({ zip, path: "META-INF/container.xml" });
    if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

    const opfPath = extractOpfPath(containerXml);
    const opfContent = await readZipFile({ zip, path: opfPath });
    if (!opfContent) throw new Error(`Invalid EPUB: missing OPF file at ${opfPath}`);

    const basePath = getDirectoryPath(opfPath);
    const metadata = extractMetadata(opfContent);
    const manifest = extractManifest(opfContent);
    const spine = extractSpine(opfContent);

    const chapters: Chapter[] = [];
    for (const itemId of spine) {
      const item = manifest.get(itemId);
      if (!item || !isXhtmlFile(item.href)) continue;

      const chapterContent = await readZipFile({ zip, path: basePath + item.href });
      if (!chapterContent) continue;

      const chapter = parseXhtml(chapterContent);
      if (chapter.paragraphs.length > 0) {
        chapters.push(chapter);
      }
    }

    return { metadata, chapters };
  },
};

async function readZipFile({ zip, path }: { zip: JSZip; path: string }): Promise<string | null> {
  const file = zip.file(path);
  return file ? file.async("string") : null;
}

function getDirectoryPath(filePath: string): string {
  return filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/") + 1) : "";
}

function isXhtmlFile(href: string): boolean {
  return /\.(xhtml|html|htm)$/i.test(href);
}

function extractOpfPath(containerXml: string): string {
  const match = containerXml.match(/full-path="([^"]+)"/);
  if (!match) throw new Error("Invalid container.xml: missing rootfile path");
  return match[1];
}

function extractMetadata(opfContent: string): DocumentMetadata {
  return {
    title: extractTagContent({ xml: opfContent, tag: "dc:title" }),
    author: extractTagContent({ xml: opfContent, tag: "dc:creator" }),
    language: extractTagContent({ xml: opfContent, tag: "dc:language" }),
  };
}

function extractTagContent({ xml, tag }: { xml: string; tag: string }): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return match ? decodeHtmlEntities(match[1].trim()) : undefined;
}

type ManifestItem = { href: string; mediaType: string };

function extractManifest(opfContent: string): Map<string, ManifestItem> {
  const manifest = new Map<string, ManifestItem>();
  const patterns = [
    /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/gi,
    /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(opfContent)) !== null) {
      const [id, href, mediaType] = pattern === patterns[0]
        ? [match[1], match[2], match[3]]
        : [match[2], match[1], match[3]];
      manifest.set(id, { href, mediaType });
    }
  }

  return manifest;
}

function extractSpine(opfContent: string): string[] {
  const spine: string[] = [];
  const regex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?>/gi;
  let match;
  while ((match = regex.exec(opfContent)) !== null) {
    spine.push(match[1]);
  }
  return spine;
}

function parseXhtml(content: string): Chapter {
  const title = extractXhtmlTitle(content);
  const body = extractXhtmlBody(content);
  const cleaned = removeNonContentElements(body);

  const paragraphs = [
    ...extractHeadings(cleaned),
    ...extractParagraphs(cleaned),
    ...extractBlockquotes(cleaned),
  ];

  if (paragraphs.length === 0) {
    const fallbackText = stripHtmlTags(cleaned);
    if (fallbackText) {
      paragraphs.push(...splitIntoParagraphs(fallbackText));
    }
  }

  return { title, paragraphs };
}

function extractXhtmlTitle(content: string): string | undefined {
  const match = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHtmlEntities(match[1].trim()) : undefined;
}

function extractXhtmlBody(content: string): string {
  const match = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : content;
}

function removeNonContentElements(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function extractHeadings(html: string) {
  const headings: Chapter["paragraphs"] = [];
  const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripHtmlTags(match[2]).trim();
    if (text) {
      headings.push({ text, isHeading: true, headingLevel: parseInt(match[1], 10) });
    }
  }
  return headings;
}

function extractParagraphs(html: string) {
  const paragraphs: Chapter["paragraphs"] = [];
  const regex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripHtmlTags(match[1]).trim();
    if (text) paragraphs.push({ text });
  }
  return paragraphs;
}

function extractBlockquotes(html: string) {
  const quotes: Chapter["paragraphs"] = [];
  const regex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = stripHtmlTags(match[1]).trim();
    if (text) quotes.push({ text, isBlockquote: true });
  }
  return quotes;
}

function splitIntoParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => ({ text: p.replace(/\s+/g, " ").trim() }));
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&lsquo;": "\u2018",
  "&rsquo;": "\u2019",
  "&ldquo;": "\u201C",
  "&rdquo;": "\u201D",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

function decodeHtmlEntities(text: string): string {
  let result = text;

  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }

  result = result.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return result;
}
