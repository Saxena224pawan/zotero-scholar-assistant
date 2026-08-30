# Changelog

All notable changes to Zotero Scholar Assistant are documented here.

## [1.3.6] - 2026-08-30

### Fixed

- Download known arXiv and direct PDF URLs immediately instead of waiting for fallback discovery services.
- Query Unpaywall and Semantic Scholar only after faster deterministic PDF sources fail.
- Reuse existing Zotero PDF attachments without making any discovery or download requests.

## [1.3.5] - 2026-08-29

### Fixed

- Changed the default Google model to `gemini-3.5-flash-lite`, which is available to the tested API project while its `gemini-3.6-flash` quota is exhausted.
- Converted Google HTTP 429 responses into a clear quota message with actionable alternatives.
- Kept connection and preflight errors visible in the dashboard instead of leaving the selected papers with an apparently idle status.
- Preserved the selected provider without silently falling back from Google Gemini to Ollama.

## [1.3.4] - 2026-08-29

### Fixed

- Passed a CSV selected from the Tools menu into the dashboard instead of opening an empty dashboard that requested the file again.
- Opened the dashboard as a non-modal Zotero window so collection creation and paper processing can begin immediately.
- Started the import pipeline before displaying the dashboard, preventing the window lifecycle from blocking processing.
- Added regression coverage for the selected-file handoff and for importing while a dashboard is already open.

## [1.3.3] - 2026-08-29

### Fixed

- Replaced full dashboard table rebuilding with incremental row updates for large CSV imports.
- Reduced recovery polling frequency while keeping event-driven status updates immediate.
- Added the active paper number to live status messages.
- Added a 147-paper dashboard regression test based on the reported workload.

## [1.3.2] - 2026-08-29

### Fixed

- Restored the HTTPS `applications.zotero.update_url` required for installation on current Zotero versions.
- Added a repository-hosted update manifest and manifest regression tests.

## [1.3.1] - 2026-08-29

### Fixed

- Bound the live progress renderer to the dashboard object so stage rendering no longer throws.
- Isolated dashboard and other progress-listener errors from the import pipeline.
- Added a persistent failure-details panel with the paper row, exact failed stage, and full error message.
- Added the exact failed stage to the final import summary dialog.

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
