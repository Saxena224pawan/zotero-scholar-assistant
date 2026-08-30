import type { PaperRecord } from "../types";
import { getPref, prefKeys } from "../utils/prefs";
import { logger } from "../utils/logger";

export const PDF_LOOKUP_TIMEOUT_MS = 10 * 60 * 1000;

export class PDFLookupTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`PDF lookup timed out after ${formatDuration(timeoutMs)}.`);
    this.name = "PDFLookupTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchPDF(
  item: any,
  paper: PaperRecord,
  timeoutMs = PDF_LOOKUP_TIMEOUT_MS,
): Promise<any | null> {
  const existing = item.getAttachments()
    .map((id: number) => Zotero.Items.get(id))
    .find((attachment: any) => attachment?.attachmentContentType === "application/pdf");
  if (existing) return existing;

  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new PDFLookupTimeoutError(timeoutMs));
    }, Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([findNewPDF(item, paper, () => expired), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function findNewPDF(item: any, paper: PaperRecord, isExpired: () => boolean): Promise<any | null> {
  const attempted = new Set<string>();
  const tryPDF = async (url: string | undefined): Promise<any | null> => {
    if (!url || attempted.has(url) || isExpired()) return null;
    attempted.add(url);
    try {
      return await Zotero.Attachments.importFromURL({
        url,
        parentItemID: item.id,
        title: "Full Text PDF",
        contentType: "application/pdf",
      });
    } catch (error) {
      logger.debug(`PDF download failed: ${url}`, error);
      return null;
    }
  };

  if (!isExpired() && paper.arxivId && getPref(prefKeys.enableArxiv, true)) {
    const attachment = await tryPDF(`https://arxiv.org/pdf/${encodeURIComponent(paper.arxivId)}.pdf`);
    if (attachment) return attachment;
  }
  if (!isExpired() && paper.url && getPref(prefKeys.enableDirectURL, true) && /(?:\.pdf(?:$|\?)|arxiv\.org\/pdf\/)/i.test(paper.url)) {
    const attachment = await tryPDF(paper.url);
    if (attachment) return attachment;
  }
  if (!isExpired() && paper.doi && getPref(prefKeys.enableUnpaywall, true)) {
    const email = getPref(prefKeys.unpaywallEmail, "");
    if (email) {
      try {
        const response = await Zotero.HTTP.request(
          "GET",
          `https://api.unpaywall.org/v2/${encodeURIComponent(paper.doi)}?email=${encodeURIComponent(email)}`,
          { responseType: "json", timeout: 30000 },
        );
        const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
        const url = payload?.best_oa_location?.url_for_pdf;
        const attachment = await tryPDF(url);
        if (attachment) return attachment;
      } catch (error) {
        logger.debug("Unpaywall lookup failed", error);
      }
    }
  }
  if (!isExpired() && (paper.doi || paper.arxivId) && getPref(prefKeys.enableSemanticScholar, true)) {
    try {
      const identifier = paper.doi ? `DOI:${paper.doi}` : `ARXIV:${paper.arxivId}`;
      const response = await Zotero.HTTP.request(
        "GET",
        `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(identifier)}?fields=openAccessPdf`,
        { responseType: "json", timeout: 30000 },
      );
      const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
      const attachment = await tryPDF(payload?.openAccessPdf?.url);
      if (attachment) return attachment;
    } catch (error) {
      logger.debug("Semantic Scholar open-PDF lookup failed", error);
    }
  }
  return null;
}

function formatDuration(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / 60_000);
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
