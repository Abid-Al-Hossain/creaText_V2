# CreaText V2

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/Version-2.0.0-purple.svg)]()
[![Manifest](https://img.shields.io/badge/Manifest-V3-green.svg)]()

CreaText V2 is a lightweight AI writing toolkit injected directly into the browser. It provides a floating workspace for summarizing, translating, rewriting, extracting, proofreading, and generating text without forcing the user to leave the current page.

---

## Features

- Summarize long text into paragraphs, lists, tables, or TL;DR output.
- Translate text across common languages.
- Proofread text with corrected output plus a concrete change list.
- Rewrite text with independent control over format and tone.
- Write new content from a prompt.
- Analyze the current page with Page Insight.
- Ask grounded follow-up questions about the current page in a chat workflow.
- Use structured page tools behind Page Insight chat for:
  - exact word and phrase counts
  - section and passage retrieval
  - table lookup
  - Japanese-script token statistics
  - lightweight entity scanning
- Show collapsible source excerpts for Page Insight chat answers.
- Real provider-token streaming for plain-text tools in supported modes.
- Split-view input/output layout with draggable sizing.
- Local draft persistence across tools and sessions.
- Theme presets plus custom color controls.

---

## AI Modes

### Accuracy

Uses Gemini models for higher-quality reasoning and general text work.

### Speed

Uses Groq-hosted models for lower-latency responses.

### Best Effort

Uses a fallback chain across saved providers when direct single-provider execution is not enough. This mode prioritizes completion reliability over streaming.

---

## Page Insight

Page Insight has two modes:

- `Summary`: summarize the visible page content in the requested format and length.
- `Ask`: run a grounded chat against the current page only.

The chat mode is not a raw LLM wrapper. It builds a structured page document, runs local analysis tools when needed, and then asks the model to answer from the page content, retrieved evidence, and recent chat turns.

Current Page Insight chat capabilities include:

- conversational page Q&A
- follow-up question rewriting for short references like `how many are there?`
- section-aware and passage-aware retrieval
- exact frequency checks for words and phrases
- table-aware lookup
- collapsible source snippets under answers

It does not browse beyond the current page.

---

## Streaming

True streaming is implemented for plain-text operations where incremental output is safe and useful:

- Summarize
- Translate
- Rewrite
- Write
- Page Insight chat and summary mode

Structured operations remain non-streaming by design:

- Extract
- Proofread
- Best Effort mode

This keeps JSON, table, and fallback-heavy flows stable while still giving live output where it actually improves the experience.

---

## Provider Notes

- Bring your own API keys. Keys are stored locally in `chrome.storage.local`.
- Groq quota information is surfaced from provider response headers instead of guessed by the extension.
- The extension does not fake structured success on empty or invalid provider output.

---

## Installation

```bash
git clone https://github.com/Abid-Al-Hossain/creaText_V2.git
cd creaText_V2
npm install
npm run build
```

Then:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `dist/` folder

---

## API Keys

- Gemini: https://aistudio.google.com/app/apikey
- Groq: https://console.groq.com/keys
- OpenRouter: https://openrouter.ai/settings/keys

---

## Stack

- React
- Vite
- Chrome Extension Manifest V3
- Framer Motion
- Vanilla CSS

---

## License

Licensed under the ISC License.
