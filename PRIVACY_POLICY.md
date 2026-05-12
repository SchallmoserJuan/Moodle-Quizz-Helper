# Privacy Policy

## Moodle Quizz Helper

**Last updated:** May 11, 2026

### Overview

Moodle Quizz Helper is a browser extension that helps users study Moodle quizzes by sending question text to AI APIs (Gemini, Groq, or any OpenAI-compatible provider) and displaying suggested answers.

### Data Collection

**We do NOT collect, store, or transmit any personal data to our servers.**

The extension only stores data locally in your browser using `chrome.storage.local`:

- Your API Keys (for the AI provider you choose)
- Your selected model and provider preferences
- Cached question answers (to avoid repeated API calls)

This data never leaves your computer except when making direct API calls to:
- `generativelanguage.googleapis.com` (if using Gemini)
- `api.groq.com` (if using Groq)
- Your configured custom API URL (if using OpenAI-compatible provider)

### Permissions

The extension requests minimal permissions:

- `storage`: To save your settings and cache locally
- `activeTab`: To read the current Moodle quiz page content
- `host_permissions`: To run on any URL (so it works on any Moodle instance)

### Third-Party Services

When you use this extension, question text is sent to third-party AI services:
- **Google Gemini** (if configured)
- **Groq** (if configured)
- **Your chosen OpenAI-compatible provider** (if configured)

Please review their privacy policies:
- Google: https://policies.google.com/privacy
- Groq: https://groq.com/privacy

### Data Security

- API Keys are stored locally and never transmitted to our servers.
- No analytics, tracking, or telemetry is implemented.
- No cookies are used.

### Changes to This Policy

We may update this policy as needed. Changes will be reflected in the GitHub repository.

### Contact

For questions about this privacy policy, please open an issue on our GitHub repository.
