# Security Policy

## Supported versions

Security fixes are applied to the latest released version of Zotero Scholar Assistant.

## Reporting a vulnerability

Do not report vulnerabilities or exposed credentials in a public GitHub issue. Use GitHub's private vulnerability-reporting feature for this repository when available, or contact the repository owner privately through their GitHub profile.

Include the affected version, reproduction steps, impact, and any suggested mitigation. Remove API keys, private paper content, Zotero database records, filesystem paths containing personal information, and other sensitive data from screenshots and logs.

## Credential handling

The add-on stores the Google AI API key in the local Zotero preferences and sends it only to Google's Generative Language API. It must never be committed to source control, included in an XPI, printed in diagnostic output, or added to GitHub Actions secrets unless a future workflow explicitly requires it.

If a credential is accidentally exposed, revoke it immediately, generate a replacement, remove it from Git history, and notify affected users.
