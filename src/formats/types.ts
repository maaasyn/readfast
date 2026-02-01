export type DocumentMetadata = {
  title?: string;
  author?: string;
  language?: string;
};

export type Paragraph = {
  text: string;
  isHeading?: boolean;
  headingLevel?: number;
  isBlockquote?: boolean;
};

export type Chapter = {
  title?: string;
  paragraphs: Paragraph[];
};

export type ParsedDocument = {
  metadata: DocumentMetadata;
  chapters: Chapter[];
};

export type FormatProcessor = {
  extensions: string[];
  canHandle: (input: { filePath: string }) => boolean;
  parse: (input: { filePath: string }) => Promise<ParsedDocument>;
};
