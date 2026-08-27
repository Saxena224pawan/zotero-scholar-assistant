# Contributing

Thank you for contributing to Zotero Scholar Assistant.

## Before starting

- Search existing issues before opening a new one.
- Use a separate Zotero profile for add-on development and testing.
- Never include API keys, Zotero databases, private PDFs, profile files, or generated user data in an issue or commit.
- Keep changes compatible with Zotero 10.0.x unless a compatibility change is discussed first.

## Development setup

```powershell
git clone https://github.com/Saxena224pawan/zotero-scholar-assistant.git
cd zotero-scholar-assistant
npm ci
npm run build
```

Install the generated XPI from `build/` into a development Zotero profile.

## Making changes

1. Create a focused branch.
2. Add or update tests for behavior changes.
3. Keep provider-specific network logic in `src/llm/` and Zotero-writing logic in `src/pipeline/`.
4. Do not silently accept incomplete AI output. Errors should identify the failed pipeline stage.
5. Update the README and changelog when behavior or configuration changes.

Run the full verification suite before submitting a pull request:

```powershell
npm run typecheck
npm test
npm run build
```

## Pull requests

Describe the problem, user-visible behavior, Zotero and provider versions tested, test results, and any privacy or network implications. Do not attach copyrighted PDFs or real API credentials.
