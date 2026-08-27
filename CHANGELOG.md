# Changelog

All notable changes to Zotero Scholar Assistant are documented here.

## [1.3.0] - 2026-08-27

### Added

- Independent Google Gemini stages for highlights, study notes, and quizzes.
- Per-paper dashboard columns for all AI-generation and Zotero-writing stages.
- Stage-based overall progress bar.
- Item-pane output badges and buttons for opening the study note and quiz.
- Validation requiring complete study-note sections and at least five quiz questions.

### Changed

- Google Gemini defaults to `gemini-3.6-flash` and uses minimal thinking by default.
- Study notes omit empty placeholders and include clean formatted content only.
- The Google connection test performs a real generation request.
- The dashboard loads through the registered add-on chrome URL.

### Fixed

- Broken or truncated JSON being saved as a Zotero note.
- Empty quizzes being accepted as successful output.
- Saved `gemini-2.5-flash` preferences causing HTTP 404 for new Google accounts.
- Dashboard and item-pane rendering problems in Zotero 10 dark mode.
- Zotero 10 file-picker compatibility, Ollama endpoint normalization, missing `AbortController`, and long-request timeout handling.
