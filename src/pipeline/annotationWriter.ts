import type { AnalysisResult, ExtractedText, HighlightAnnotation } from "../types";
import { logger } from "../utils/logger";

export async function writeAnnotations(attachment: any, extracted: ExtractedText, analysis: AnalysisResult): Promise<number> {
  let created = 0;
  for (const highlight of analysis.highlights) {
    try {
      const pageIndex = locatePage(extracted, highlight);
      const annotation = new Zotero.Item("annotation");
      annotation.libraryID = attachment.libraryID;
      annotation.parentID = attachment.id;
      annotation.annotationType = "highlight";
      annotation.annotationText = highlight.text;
      annotation.annotationComment = `[${titleCase(highlight.category)}] ${highlight.explanation}`;
      annotation.annotationColor = highlight.color;
      annotation.annotationPageLabel = String(pageIndex + 1);
      annotation.annotationSortIndex = `${String(pageIndex).padStart(5, "0")}|000000|00000`;
      annotation.annotationPosition = JSON.stringify({
        pageIndex,
        rects: [[10, 10, 24, 18]],
      });
      annotation.addTag(`scholar-assistant:${highlight.category}`);
      await annotation.saveTx();
      created += 1;
    } catch (error) {
      logger.debug(`Could not create annotation for: ${highlight.text.slice(0, 80)}`, error);
    }
  }
  return created;
}

function locatePage(extracted: ExtractedText, highlight: HighlightAnnotation): number {
  const needle = normalize(highlight.text).slice(0, 180);
  if (!needle) return 0;
  let bestPage = 0;
  let bestScore = 0;
  for (const page of extracted.pages) {
    const haystack = normalize(page.text);
    if (haystack.includes(needle)) return page.pageIndex;
    const words = needle.split(" ").filter((word) => word.length > 3);
    const score = words.length ? words.filter((word) => haystack.includes(word)).length / words.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestPage = page.pageIndex;
    }
  }
  return bestPage;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} .,:;()\-]/gu, "").trim();
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
