import assert from "node:assert/strict";
import test from "node:test";
import { parseCSV } from "../src/pipeline/csvParser";

test("parses quoted comma CSV and normalizes DOI/arXiv values", () => {
  const papers = parseCSV(`title,doi,arxiv,authors\n"A paper, with comma",https://doi.org/10.1/test,arXiv:2401.01234,"Doe, Jane"`);
  assert.equal(papers.length, 1);
  assert.equal(papers[0]?.title, "A paper, with comma");
  assert.equal(papers[0]?.doi, "10.1/test");
  assert.equal(papers[0]?.arxivId, "2401.01234");
});

test("supports semicolon delimiters and column aliases", () => {
  const papers = parseCSV("paper_title;link;publication-year\nExample;https://example.org/paper.pdf;2026");
  assert.equal(papers[0]?.title, "Example");
  assert.equal(papers[0]?.url, "https://example.org/paper.pdf");
  assert.equal(papers[0]?.year, "2026");
});

test("rejects rows without an identifier", () => {
  assert.throws(() => parseCSV("title,doi\n,"), /header and at least one paper row|no title/i);
});
