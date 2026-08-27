import type { PaperRecord } from "../types";
import { logger } from "../utils/logger";

export async function resolveMetadata(paper: PaperRecord, libraryID: number, collectionID: number): Promise<any> {
  const existing = await findExisting(paper, libraryID);
  if (existing) {
    existing.addToCollection(collectionID);
    await existing.saveTx();
    return existing;
  }

  const translated = await translateIdentifier(paper, libraryID);
  if (translated) {
    translated.addToCollection(collectionID);
    await translated.saveTx();
    return translated;
  }

  const item = new Zotero.Item("journalArticle");
  item.libraryID = libraryID;
  item.setField("title", paper.title || paper.doi || paper.arxivId || paper.url || "Imported paper");
  if (paper.doi) item.setField("DOI", paper.doi);
  if (paper.url) item.setField("url", paper.url);
  if (paper.year) item.setField("date", paper.year);
  if (paper.notes) item.setField("extra", `Imported note: ${paper.notes}`);
  if (paper.authors) item.setCreators(parseCreators(paper.authors));
  item.addToCollection(collectionID);
  await item.saveTx();
  return item;
}

async function findExisting(paper: PaperRecord, libraryID: number): Promise<any | null> {
  const attempts: Array<[string, string]> = [];
  if (paper.doi) attempts.push(["DOI", paper.doi]);
  if (paper.title) attempts.push(["title", paper.title]);
  for (const [field, value] of attempts) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "isNot", "attachment");
    search.addCondition("itemType", "isNot", "note");
    search.addCondition(field, "is", value);
    const ids = await search.search();
    if (ids.length) return Zotero.Items.get(ids[0]);
  }
  if (paper.arxivId) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("quicksearch-everything", "contains", paper.arxivId);
    const ids = await search.search();
    const match = ids.map((id: number) => Zotero.Items.get(id)).find((item: any) => item?.isRegularItem?.());
    if (match) return match;
  }
  return null;
}

async function translateIdentifier(paper: PaperRecord, libraryID: number): Promise<any | null> {
  const identifier = paper.doi
    ? { DOI: paper.doi }
    : paper.arxivId
      ? { arXiv: paper.arxivId }
      : paper.url
        ? { URI: paper.url }
        : null;
  if (!identifier) return null;
  try {
    const translate = new Zotero.Translate.Search();
    translate.setIdentifier(identifier);
    const translators = await translate.getTranslators();
    if (!translators.length) return null;
    translate.setTranslator(translators);
    const items = await translate.translate({ libraryID, saveAttachments: false });
    return items?.[0] ?? null;
  } catch (error) {
    logger.debug("Metadata lookup failed; creating a basic item", error);
    return null;
  }
}

function parseCreators(authors: string): Array<{ firstName: string; lastName: string; creatorType: string; fieldMode?: number }> {
  return authors.split(/\s*(?:;|\band\b)\s*/i).filter(Boolean).map((name) => {
    const trimmed = name.trim();
    if (/\bet al\.?$/i.test(trimmed)) return { firstName: "", lastName: trimmed, creatorType: "author", fieldMode: 1 };
    if (trimmed.includes(",")) {
      const [lastName = "", firstName = ""] = trimmed.split(",", 2);
      return { firstName: firstName.trim(), lastName: lastName.trim(), creatorType: "author" };
    }
    const parts = trimmed.split(/\s+/);
    const lastName = parts.pop() ?? trimmed;
    return { firstName: parts.join(" "), lastName, creatorType: "author" };
  });
}
