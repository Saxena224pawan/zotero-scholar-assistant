import assert from "node:assert/strict";
import test from "node:test";
import { fetchPDF } from "../src/pipeline/pdfFetcher";

test("downloads a known arXiv PDF before querying fallback services", async () => {
  const imported: string[] = [];
  let fallbackRequests = 0;
  const attachment = { id: 99, attachmentContentType: "application/pdf" };
  (globalThis as any).Zotero = {
    Prefs: {
      get(key: string) {
        if (key.endsWith("enableArxiv") || key.endsWith("enableUnpaywall") || key.endsWith("enableSemanticScholar")) return true;
        if (key.endsWith("unpaywallEmail")) return "test@example.org";
        return undefined;
      },
    },
    Items: { get() { return null; } },
    Attachments: {
      async importFromURL({ url }: { url: string }) {
        imported.push(url);
        return attachment;
      },
    },
    HTTP: {
      async request() {
        fallbackRequests += 1;
        throw new Error("Fallback lookup should not run");
      },
    },
  };

  const result = await fetchPDF(
    { id: 42, getAttachments() { return []; } },
    { row: 2, arxivId: "2304.08818v2", doi: "10.1234/example" },
  );

  assert.equal(result, attachment);
  assert.deepEqual(imported, ["https://arxiv.org/pdf/2304.08818v2.pdf"]);
  assert.equal(fallbackRequests, 0);
});

test("uses an existing Zotero PDF without making network requests", async () => {
  const attachment = { id: 7, attachmentContentType: "application/pdf" };
  let networkCalls = 0;
  (globalThis as any).Zotero = {
    Items: { get(id: number) { return id === 7 ? attachment : null; } },
    Attachments: { async importFromURL() { networkCalls += 1; } },
    HTTP: { async request() { networkCalls += 1; } },
  };

  const result = await fetchPDF(
    { id: 42, getAttachments() { return [7]; } },
    { row: 2, arxivId: "2304.08818v2" },
  );

  assert.equal(result, attachment);
  assert.equal(networkCalls, 0);
});
