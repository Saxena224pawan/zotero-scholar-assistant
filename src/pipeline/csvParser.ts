import type { PaperRecord } from "../types";

const aliases: Record<string, keyof Omit<PaperRecord, "row">> = {
  title: "title",
  paper: "title",
  paper_title: "title",
  doi: "doi",
  arxiv: "arxivId",
  arxiv_id: "arxivId",
  arxivid: "arxivId",
  authors: "authors",
  author: "authors",
  year: "year",
  publication_year: "year",
  url: "url",
  link: "url",
  notes: "notes",
  note: "notes",
};

export function parseCSV(input: string): PaperRecord[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = normalized.split("\n", 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows = parseRows(normalized, delimiter).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) throw new Error("The CSV must contain a header and at least one paper row.");

  const headers = rows[0]!.map((header) => normalizeHeader(header));
  const recognized = headers.filter((header) => aliases[header]);
  if (!recognized.length) {
    throw new Error("No supported columns found. Use title, doi, arxiv_id, or url.");
  }

  const papers = rows.slice(1).map((values, index) => {
    const paper: PaperRecord = { row: index + 2 };
    headers.forEach((header, column) => {
      const key = aliases[header];
      const value = values[column]?.trim();
      if (key && value) paper[key] = cleanValue(key, value);
    });
    return paper;
  });

  const invalid = papers.filter((paper) => !paper.title && !paper.doi && !paper.arxivId && !paper.url);
  if (invalid.length) {
    throw new Error(`Rows ${invalid.map((paper) => paper.row).join(", ")} have no title, DOI, arXiv ID, or URL.`);
  }
  return papers;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function cleanValue(key: keyof Omit<PaperRecord, "row">, value: string): string {
  if (key === "doi") {
    return value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  }
  if (key === "arxivId") {
    return value.replace(/^arxiv:\s*/i, "").replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, "").replace(/\.pdf$/i, "");
  }
  return value;
}

function detectDelimiter(line: string): string {
  const candidates = [",", "\t", ";"];
  return candidates
    .map((candidate) => ({ candidate, count: countOutsideQuotes(line, candidate) }))
    .sort((a, b) => b.count - a.count)[0]?.candidate ?? ",";
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === delimiter) count += 1;
  }
  return count;
}

function parseRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const character = input[i]!;
    if (character === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  return rows;
}
