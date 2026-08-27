import type { StudyNote } from "../types";

export async function writeStudyNote(parent: any, note: StudyNote): Promise<any> {
  if (!note.summary.trim()) throw new Error("The study note has no summary and was not saved.");
  const item = new Zotero.Item("note");
  item.libraryID = parent.libraryID;
  item.parentID = parent.id;
  item.setNote(`<div data-schema-version="9">
    <h1>Scholar Assistant — Study Note</h1>
    <p><em>${escapeHTML(parent.getDisplayTitle?.() || parent.getField?.("title") || "Research paper")}</em></p>
    ${section("Summary", paragraph(note.summary))}
    ${section("Key Contributions", list(note.keyContributions))}
    ${section("Important Concepts", list(note.importantConcepts))}
    ${section("Methodology", paragraph(note.methodology))}
    ${section("Important Results", list(note.importantResults))}
    ${section("Limitations", list(note.limitations))}
    ${section("Key Takeaways", list(note.keyTakeaways))}
  </div>`);
  item.addTag("scholar-assistant:note");
  await item.saveTx();
  return item;
}

function section(title: string, content: string): string {
  return content ? `<h2>${escapeHTML(title)}</h2>${content}` : "";
}

function paragraph(value: string): string {
  return value ? value.split(/\n{2,}/).map((part) => `<p>${escapeHTML(part.trim())}</p>`).join("") : "";
}

function list(values: string[]): string {
  return values.length ? `<ul>${values.map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul>` : "";
}

export function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
