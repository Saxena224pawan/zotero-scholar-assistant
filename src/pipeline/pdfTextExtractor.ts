import type { ExtractedText } from "../types";

export async function extractPDFText(attachment: any): Promise<ExtractedText> {
  let text = String((await attachment.attachmentText) ?? "").trim();
  if (!text) {
    const fulltext = Zotero.Fulltext ?? Zotero.FullText;
    if (typeof fulltext?.indexItems === "function") {
      await fulltext.indexItems([attachment.id], { complete: true });
      text = String((await attachment.attachmentText) ?? "").trim();
    }
  }
  if (!text) throw new Error("Zotero could not extract indexed text from the PDF.");

  const separated = text.split(/\f+/).map((page) => page.trim()).filter(Boolean);
  const pages = separated.length > 1
    ? separated.map((pageText, pageIndex) => ({ pageIndex, text: pageText }))
    : [{ pageIndex: 0, text }];
  return { text, pages };
}
