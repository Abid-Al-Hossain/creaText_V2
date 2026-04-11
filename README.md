# CreaText V2

A Chrome extension that injects a floating AI text toolkit into any page.

CreaText is built for practical writing work inside the browser:
- Summarize
- Translate
- Proofread
- Rewrite
- Write
- Page Insight

It supports three provider modes:
- `Accuracy` -> Gemini
- `Speed` -> Groq
- `Best Effort` -> Gemini, then exhausts all Groq models, then OpenRouter

## Overview

CreaText V2 is a Manifest V3 Chrome extension with a single main UI surface: the injected floating panel. The extension is designed to stay usable on arbitrary websites, preserve user drafts, and route AI requests through the extension service worker instead of the page-bound content script.

Each user supplies their own provider keys. There is no shared backend and no shared quota pool.

## Main Features

- Floating draggable panel injected into any normal webpage
- Resizable drawer with edge and corner resize handles
- Wide-layout split view with side-by-side input/output panels
- Vertical splitter for resizing input/output width in wide mode
- Hide/show controls for input and output panels
- Shadow DOM UI isolation so host-page CSS cannot break the layout
- Per-tool draft preservation while switching tools
- Built-in themes plus custom color mode
- Separate API keys for Gemini, Groq, and OpenRouter
- Structured proofread output where the provider supports it
- Honest provider fallback behavior instead of fake success states
- Raw Groq quota snapshots from provider headers, with no invented countdown logic
- Independent format and tone controls on Rewrite and Page Insight

## Provider Modes

### Accuracy

Uses Gemini and one shared Gemini API key across these models:

- `Gemini 2.5 Flash`
  Stable default and best free-tier balance.
- `Gemini 2.5 Pro`
  Best free-tier accuracy, but lower daily quota.
- `Gemini 3 Flash Preview`
  Newer preview option for users who want to test a newer Gemini path.

### Speed

Uses Groq with a user-selectable model.

Curated Groq models in this project:

- `GPT-OSS 120B`
  Most powerful option here. Has tighter TPM limits on free Groq.
- `Llama 3.3 70B`
  Strong all-round text model. Uses JSON object mode.
- `Llama 4 Scout`
  Recommended for longer inputs on free Groq limits. Supports JSON Schema.
- `GPT-OSS 20B`
  Recommended speed option for quick everyday text tasks. Supports JSON Schema.

These are intentionally curated for a text utility product. The project does not expose every Groq model just because it exists.

### Best Effort

Best Effort is not "failureless". It is a fallback chain intended to improve completion rate:

1. Try your selected Gemini model
2. If that fails for a technical reason, exhaust **all available Groq models** (starting with your selected model)
3. If all Groq attempts fail for a technical reason, try OpenRouter `openrouter/free`

Best Effort does not silently route around policy or safety refusals.

## API Keys

Each user supplies their own keys:

- Gemini: `https://aistudio.google.com/app/apikey`
- Groq: `https://console.groq.com/keys`
- OpenRouter: `https://openrouter.ai/settings/keys`

Keys are stored locally in `chrome.storage.local`.

## Groq Quota UI

The Groq quota card shows raw header snapshots returned by Groq for the last request made with the selected model.

It does not pretend to know things Groq did not provide. The extension does not invent:
- synchronized reset timing
- countdowns
- predictions
- exact future availability

If the selected model and the last quota snapshot model differ, the UI tells the user that the snapshot is stale and needs one fresh request.

## Architecture

The project is small, but the responsibilities are split clearly.

### Runtime flow

```text
content.jsx -> aiBuiltins.js -> bg.js / aiService.js -> provider API -> UI result
```

### Key files

- `src/content.jsx`
  Main React UI. Handles the floating panel, settings, drag, resize, per-tool drafts, and result display.
- `src/style.css`
  Entire design system, layout, theming, controls, and state visuals.
- `src/aiBuiltins.js`
  Thin message wrapper between the UI and the service worker.
- `src/aiService.js`
  Provider router and request layer for Gemini, Groq, and OpenRouter.
- `src/bg.js`
  MV3 service worker bootstrap and message entry point.
- `src/providerCatalog.js`
  Shared model catalog used by both the backend and the settings UI.
- `src/popup.jsx`
  Popup entry that can toggle or open the injected UI.

## UI Behavior

- The widget mounts inside a Shadow DOM host so host-page CSS does not override extension styles.
- The drawer can be moved independently from the page and resized from edges or corners.
- Wide layouts show input on the left and output on the right for easier comparison.
- The wide layout includes a draggable vertical splitter to adjust panel width.
- Either panel can be hidden and restored from a slim rail when you need maximum width.
- The active tool remains consistent while dragging.
- Theme tokens now drive the full shell, sidebar, inputs, dropdowns, cards, and action states.
- Tool drafts persist across tool switches and settings navigation.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Abid-Al-Hossain/creaText_V2.git
cd creaText_V2
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the extension

```bash
npm run build
```

### 4. Load it into Chrome

- Open `chrome://extensions`
- Enable `Developer mode`
- Click `Load unpacked`
- Select the `dist/` folder

## Development

Run the development build:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

## Usage

### Opening the panel

- Click the floating `CT` bubble
- Or use the extension popup to open the panel or settings

### Summarize

- Choose `By words` or `By length`
- Paste the source text
- Run the tool

### Output panel

- Use the vertical splitter to widen the output when tables are wide
- Hide the input panel to make the output full width
- Restore a hidden panel from the rail on the edge

### Translate

- Paste the text
- Enter the target language code or name
- Run the tool

### Proofread

- Paste the text
- Run the tool
- Review the corrected output and the changes list

### Rewrite

- Paste the text
- Pick the output **Format**: Paragraph, Bullet Points, Table, or TL;DR
- Pick the output **Tone**: Formal, Neutral, or Casual
- Any format and tone combination works independently
- Run the tool

### Write

- Describe what you want generated
- Pick the tone
- Run the tool

### Page Insight

- Navigate to any article or webpage
- Open the Page Insight tool
- Choose summary **Length** (Short, Medium, Long) or target **Word count**
- Pick the output **Format**: Paragraph, Bullet Points, Table, or TL;DR
- Pick the output **Tone**: Formal, Neutral, or Casual
- Click **Analyze Page** — the extension scrapes and summarizes automatically
- Review the analysis results in the output panel

## Product Rules

The current project direction is intentionally strict:

- No fake quota predictions
- No hidden chunking that changes semantics
- No bluffing about provider capabilities
- No random model sprawl
- No success state when the provider returned nothing useful

## Known Limitations

- Chrome only
- Free-tier quotas depend on the user's own provider account
- Best Effort improves completion rate, but it cannot guarantee a result
- Gemini does not expose the same live quota visibility that Groq does
- Large inputs can still exceed provider-specific request limits
- Some provider outages or rate limits are outside the extension's control

## License

ISC
