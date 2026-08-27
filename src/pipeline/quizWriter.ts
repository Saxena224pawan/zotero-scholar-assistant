import type { QuizQuestion } from "../types";
import { escapeHTML } from "./noteWriter";

export async function writeQuiz(parent: any, quiz: QuizQuestion[]): Promise<any> {
  if (quiz.length < 5) throw new Error(`Only ${quiz.length} quiz questions were generated; the quiz was not saved.`);
  const item = new Zotero.Item("note");
  item.libraryID = parent.libraryID;
  item.parentID = parent.id;
  item.setNote(`<div data-schema-version="9">
    <h1>Scholar Assistant — Quiz</h1>
    <p><em>${escapeHTML(parent.getDisplayTitle?.() || parent.getField?.("title") || "Research paper")}</em></p>
    ${quiz.map((entry, index) => `<h2>${index + 1}. ${escapeHTML(entry.question)} <small>(${entry.difficulty})</small></h2>
      <p><strong>Answer:</strong> ${escapeHTML(entry.answer)}</p>
      <p><strong>Explanation:</strong> ${escapeHTML(entry.explanation)}</p>`).join("")}
  </div>`);
  item.addTag("scholar-assistant:quiz");
  await item.saveTx();
  return item;
}
