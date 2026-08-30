import type { PaperRecord } from "../types";
import { getPref, prefKeys } from "../utils/prefs";
import { logger } from "../utils/logger";

export async function fetchPDF(item: any, paper: PaperRecord): Promise<any | null> {
  const existing = item.getAttachments()
    .map((id: number) => Zotero.Items.get(id))
    .find((attachment: any) => attachment?.attachmentContentType === "application/pdf");
  if (existing) return existing;

  const attempted = new Set<string>();
  const tryPDF = async (url: string | undefined): Promise<any | null> => {
    if (!url || attempted.has(url)) return null;
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

  if (paper.arxivId && getPref(prefKeys.enableArxiv, true)) {
    const attachment = await tryPDF(`https://arxiv.org/pdf/${encodeURIComponent(paper.arxivId)}.pdf`);
    if (attachment) return attachment;
  }
  if (paper.url && getPref(prefKeys.enableDirectURL, true) && /(?:\.pdf(?:$|\?)|arxiv\.org\/pdf\/)/i.test(paper.url)) {
    const attachment = await tryPDF(paper.url);
    if (attachment) return attachment;
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
        const attachment = await tryPDF(url);
        if (attachment) return attachment;
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
      const attachment = await tryPDF(payload?.openAccessPdf?.url);
      if (attachment) return attachment;
    } catch (error) {
      logger.debug("Semantic Scholar open-PDF lookup failed", error);
    }
  }
  return null;
}
