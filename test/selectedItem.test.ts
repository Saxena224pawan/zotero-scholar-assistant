import assert from "node:assert/strict";
import test from "node:test";
import { paperRecordFromItem, resolveSelectedPDF } from "../src/hooks";

function pdfAttachment(id: number, parentID?: number) {
  return {
    id,
    parentID,
    attachmentContentType: "application/pdf",
    isAttachment: () => true,
    getFilename: () => "paper.pdf",
  };
}

test("a selected bibliographic item resolves its attached PDF", () => {
  const attachment = pdfAttachment(20, 10);
  const item = {
    id: 10,
    isRegularItem: () => true,
    isAttachment: () => false,
    getAttachments: () => [19, 20],
  };
  const otherAttachment = {
    id: 19,
    attachmentContentType: "text/html",
    isAttachment: () => true,
    getFilename: () => "snapshot.html",
  };
  const items = new Map([[19, otherAttachment], [20, attachment]]);

  assert.deepEqual(resolveSelectedPDF([item], (id) => items.get(id)), { item, attachment });
});

test("selecting a PDF attachment uses its parent bibliographic item", () => {
  const item = { id: 10, isRegularItem: () => true };
  const attachment = pdfAttachment(20, 10);

  assert.deepEqual(resolveSelectedPDF([attachment], () => item), { item, attachment });
});

test("a selected item without a PDF reports a useful error", () => {
  const item = {
    id: 10,
    isRegularItem: () => true,
    isAttachment: () => false,
    getAttachments: () => [],
  };

  assert.throws(() => resolveSelectedPDF([item], () => null), /has no PDF attachment/);
});

test("a Zotero item becomes a dashboard paper record", () => {
  const fields: Record<string, string> = {
    title: "A selected paper",
    DOI: "10.1000/example",
    url: "https://example.test/paper",
    date: "2025-04-12",
  };

  assert.deepEqual(paperRecordFromItem({ getField: (name: string) => fields[name] ?? "" }), {
    row: 1,
    title: "A selected paper",
    doi: "10.1000/example",
    url: "https://example.test/paper",
    year: "2025",
  });
});
