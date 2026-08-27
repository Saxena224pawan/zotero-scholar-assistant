import type { PaperRecord } from "../types";
import { getPref, prefKeys } from "../utils/prefs";
import { logger } from "../utils/logger";

export async function fetchPDF(item: any, paper: PaperRecord): Promise<any | null> {
  const existing = item.getAttachments()
    .map((id: number) => Zotero.Items.get(id))
    .find((attachment: any) => attachment?.attachmentContentType === "application/pdf");
  if (existing) return existing;

  const candidates: string[] = [];
  if (paper.arxivId && getPref(prefKeys.enableArxiv, true)) {
    candidates.push(`https://arxiv.org/pdf/${encodeURIComponent(paper.arxivId)}.pdf`);
  }
  if (paper.doi && getPref(prefKeys.enableUnpaywall, true)) {
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
        if (url) candidates.push(url);
      } catch (error) {
        logger.debug("Unpaywall lookup failed", error);
      }
    }
  }
  if ((paper.doi || paper.arxivId) && getPref(prefKeys.enableSemanticScholar, true)) {
    try {
      const identifier = paper.doi ? `DOI:${paper.doi}` : `ARXIV:${paper.arxivId}`;
      const response = await Zotero.HTTP.request(
        "GET",
        `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(identifier)}?fields=openAccessPdf`,
        { responseType: "json", timeout: 30000 },
      );
      const payload = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
      if (payload?.openAccessPdf?.url) candidates.push(payload.openAccessPdf.url);
    } catch (error) {
      logger.debug("Semantic Scholar open-PDF lookup failed", error);
    }
  }
  if (paper.url && getPref(prefKeys.enableDirectURL, true) && /(?:\.pdf(?:$|\?)|arxiv\.org\/pdf\/)/i.test(paper.url)) {
    candidates.push(paper.url);
  }

  for (const url of [...new Set(candidates)]) {
    try {
      return await Zotero.Attachments.importFromURL({
        url,
        parentItemID: item.id,
        title: "Full Text PDF",
        contentType: "application/pdf",
      });
    } catch (error) {
      logger.debug(`PDF download failed: ${url}`, error);
    }
  }
  return null;
}
