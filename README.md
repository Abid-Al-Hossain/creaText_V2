# CreaText V2

> A powerful, privacy-respecting AI text toolkit for Chrome — powered by Google Gemini 2.5 Flash.

[![Manifest Version](https://img.shields.io/badge/Manifest-V3-blue?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-ISC-green?style=flat-square)](./LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Getting Your Free API Key](#getting-your-free-api-key)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Build System](#build-system)
- [Theme System](#theme-system)
- [Privacy & Security](#privacy--security)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**CreaText V2** is a Chrome extension that injects a floating, draggable AI text-tool panel into any web page. It provides five core AI-powered writing utilities — **Summarize**, **Translate**, **Proofread**, **Rewrite**, and **Write** — all driven by Google's **Gemini 2.5 Flash** API.

Unlike extensions that embed a shared API key (and expose it to all users), CreaText V2 requires each user to supply their own **free** Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey). This approach ensures:

- **No shared cost** — every user operates within their own free quota (1,500 requests/day)
- **No data leakage** — your API key and text never pass through any third-party server
- **No model downloads** — works instantly on any Chrome installation with no setup beyond the API key

---

## Features

| Feature | Description |
|---|---|
| ✍️ **Summarize** | Condense any text to a desired word count or length (short / medium / long) |
| 🌐 **Translate** | Translate text into any language using natural language codes (e.g. `fr`, `bn`, `ja`) |
| 🔍 **Proofread** | Fix grammar, spelling, and punctuation — with a changelog of what was corrected |
| ✏️ **Rewrite** | Restructure text in six modes: Paragraph, Key Points, Table, Formal, Neutral, or Casual tone |
| 🖊️ **Write** | Generate original content from a prompt in Formal, Neutral, or Casual tone |
| 📋 **Copy** | One-click copy of any result to the clipboard |
| 🎨 **Themes** | Six built-in themes + fully customizable colors |
| 📐 **Resizable Panel** | Drag to move, drag the corner to resize |
| 🔑 **API Key Management** | Secure local storage of your Gemini API key with show/hide toggle |

---

## Architecture

CreaText V2 is a **Manifest V3** Chrome extension with a minimal, direct architecture:

```
User Input (content.jsx)
        │
        ▼
 aiBuiltins.js
 fetch() → Gemini 2.5 Flash REST API
        │
        ▼
   Result → UI (content.jsx)
```

**Key design decisions:**
- The injected UI is rendered inside a **Shadow DOM** root so hostile page CSS cannot break the extension layout
- All AI calls are routed through the extension service worker so Gemini requests run in a trusted extension context instead of the page-bound content script
- The service worker now handles Gemini request execution, API-key access, and proofread structured-output parsing
- Each user's API key is stored exclusively in `chrome.storage.local` on their own device — never transmitted to any server other than Google's API

---

## Prerequisites

- **Google Chrome** 120 or later (Manifest V3 support required)
- **Node.js** 18 or later + npm (for building from source)
- A **free Google account** (for obtaining a Gemini API key)

---

## Installation

### Option A — Load from Source (Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/Abid-Al-Hossain/creaText_V2.git
   cd creaText_V2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load into Chrome**
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in the top-right corner)
   - Click **Load unpacked**
   - Select the `dist/` directory from the project root

5. **Configure your API key** — see [Getting Your Free API Key](#getting-your-free-api-key)

### Option B — Development Server

To run with hot-reload during development:

```bash
npm run dev
```

Then load the `dist/` directory as an unpacked extension as described above. The extension will automatically update as you make changes.

---

## Getting Your Free API Key

CreaText V2 requires a **Google Gemini API key**, which is completely free to obtain:

1. Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API key**
4. Copy the generated key

**Free tier limits (as of April 2026):**
- 15 requests per minute (RPM)
- 1,000,000 tokens per minute (TPM)
- 1,500 requests per day (RPD)

These limits are more than sufficient for personal use of a text tool extension.

Once you have your key:
1. Click the **CT** bubble on any web page
2. Open **⚙️ Settings**
3. Paste your key into the **Gemini API Key** field
4. Click **Save**

The key is stored locally in `chrome.storage.local` and persists across browser sessions.

---

## Usage

### Opening the Panel

- **Click** the floating **CT** bubble on any page to open the main panel
- **Drag** the bubble to reposition it anywhere on screen
- Use the **⚙️** icon in the popup to open Settings directly

### Summarize

1. Select **Summarize** from the sidebar
2. Paste or type the text you want summarized
3. Choose either **By words** (e.g. `120`) or **By length** (Short / Medium / Long)
4. Click **Run**

### Translate

1. Select **Translate**
2. Paste your text
3. Enter the target language code in the **To** field (e.g. `fr` for French, `bn` for Bengali, `ja` for Japanese)
4. Click **Run**

> Auto-detection of the source language is supported — no need to specify the source.

### Proofread

1. Select **Proofread**
2. Paste your text
3. Click **Run**
4. The result shows the **corrected text** followed by a **📝 Changes** list describing every correction made

### Rewrite

1. Select **Rewrite**
2. Paste your text
3. Choose a **mode**:
   - **Key Points** — extracts key bullet points
   - **New Paragraph** — rewrites as a clean, cohesive paragraph
   - **Table** — converts to a Markdown table
   - **Tone: Formal** / **Tone: Neutral** / **Tone: Casual** — rewrites in the specified register
4. Click **Run**

### Write

1. Select **Write** (enable it first under ⚙️ Settings → Feature toggles)
2. Describe what you want written in the text area
3. Choose a **tone** (Formal / Neutral / Casual)
4. Click **Run**

### Copying Results

Every result card has a **Copy** button in the bottom-right corner. Click it to copy the full result text to your clipboard. The button briefly shows **✓ Copied** as confirmation.

---

## Project Structure

```
creaText_V2/
├── dist/                        # Built extension (load this into Chrome)
│   ├── assets/
│   │   ├── bg.js-*.js           # Compiled service worker
│   │   ├── content.jsx-*.js     # Compiled content script
│   │   ├── content-*.css        # Compiled styles
│   │   └── popup.html-*.js      # Compiled popup
│   ├── manifest.json            # Processed extension manifest
│   └── service-worker-loader.js # crxjs bootstrap shim
│
├── src/                         # Source files
│   ├── aiBuiltins.js            # Gemini API integration (all AI features)
│   ├── bg.js                    # Service worker (minimal)
│   ├── content.jsx              # Main React app (UI, drag, resize, settings)
│   ├── offscreen.html           # Stub (unused)
│   ├── offscreen.js             # Stub (unused)
│   ├── popup.html               # Extension popup HTML
│   ├── popup.jsx                # Extension popup React component
│   └── style.css                # All styles with CSS custom properties
│
├── manifest.json                # Chrome Extension Manifest V3
├── vite.config.js               # Vite + crxjs build configuration
├── package.json                 # npm dependencies and scripts
└── README.md                    # This file
```

### Key Source Files

#### `src/aiBuiltins.js`
Thin client-side wrapper that forwards AI operations (`summarize`, `translate`, `proofread`, `rewrite`, `write`) plus `getApiKey` / `saveApiKey` to the service worker via `chrome.runtime.sendMessage`.

#### `src/geminiService.js`
The Gemini backend that runs inside the service worker. Handles API-key access, request execution, structured proofread output, and Gemini response validation.

#### `src/content.jsx`
The main React 19 application. Mounts itself into a **Shadow DOM** host attached to `document.documentElement` so the widget survives SPA navigation and remains isolated from host-page CSS. Contains:
- `App` — root component managing state, drag, resize
- `Settings` — theme presets, custom colors, API key UI, feature toggles
- `Pane` — per-feature input and options, with draft preservation across tool switches
- `ResultCard` — result display with copy button
- `ColorModal` — live-preview color picker

#### `src/style.css`
CSS custom properties-based design system. Theme presets are applied via CSS classes (`.theme-ocean`, `.theme-forest`, etc.) on the root element, and the stylesheet is injected into the widget's Shadow DOM so page styles cannot override the extension UI.

---

## Technology Stack

| Technology | Version | Role |
|---|---|---|
| [React](https://react.dev/) | 19.x | UI framework |
| [Framer Motion](https://www.framer.com/motion/) | 12.x | Animations (mount/unmount transitions) |
| [Vite](https://vite.dev/) | 7.x | Build tool |
| [@crxjs/vite-plugin](https://crxjs.dev/) | 2.x | Chrome extension build pipeline |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 5.x | React/JSX transform |
| [Gemini 2.5 Flash API](https://ai.google.dev/) | v1beta | AI backend |

---

## Build System

The project uses **Vite** with the **@crxjs/vite-plugin** to compile and package the Chrome extension.

```bash
# Install dependencies
npm install

# Production build (outputs to dist/)
npm run build

# Development server with hot reload
npm run dev
```

The build target is `es2022` with source maps disabled for production. The crxjs plugin handles:
- Manifest processing and path rewriting
- Content script bundling as an IIFE
- Service worker compilation as an ES module
- HTML entry point transformation

---

## Theme System

CreaText V2 ships with six built-in themes and a fully customizable mode.

| Theme | Description |
|---|---|
| **Default** | Dark slate with neutral gray accents |
| **Ocean** | Deep navy with cool blue highlights |
| **Forest** | Dark green with emerald accents |
| **Midnight** | Near-black with soft purple accents |
| **Sunrise** | Light warm cream with orange accents |
| **Lavender** | Light purple tint with violet accents |
| **Custom** | User-defined panel, border, accent, and text colors |

All theming is implemented via **CSS custom properties** (`--fai-bg`, `--fai-surface`, `--fai-border`, `--fai-accent`, `--fai-text`). Preset themes override these via class selectors; custom mode injects them inline via the `style` attribute.

---

## Privacy & Security

- **Your API key never leaves your device** — it is stored only in `chrome.storage.local` and sent exclusively to `generativelanguage.googleapis.com` (Google's official API endpoint)
- **No analytics, no telemetry, no third-party servers** — CreaText V2 makes exactly one type of external request: to the Gemini API
- **No shared backend** — each user authenticates with their own free API key; there is no central server or shared quota
- **Content script isolation** — the widget mounts inside a Shadow DOM host attached to the page root, sharply reducing interference from host-page CSS
- **Trusted request path** — Gemini network requests run from the extension service worker rather than directly from the content script
- **Permissions used:**
  - `storage` — persists API key, position, theme, and feature preferences
  - `activeTab` — allows the popup to detect the active tab
  - `scripting` — allows the popup to inject the content script into tabs opened before the extension was installed
  - `host_permissions: <all_urls>` — required for the content script to run on all pages

---

## Known Limitations

- **Chrome only** — Manifest V3 with the `chrome.*` API is Chrome-specific; Firefox and other browsers are not supported
- **HTTPS pages only** — the extension does not inject into `chrome://`, `file://`, or extension pages
- **API rate limits** — the free Gemini API tier allows 1,500 requests/day and 15 RPM; heavy usage may encounter rate limiting (HTTP 429)
- **Context window** — Gemini 2.5 Flash supports a 1M token context window; practical text inputs are well within this limit

---

## Contributing

Contributions, issues, and feature requests are welcome.

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a **Pull Request**

Please follow the existing code style and ensure `npm run build` passes before submitting.

---

## License

This project is licensed under the **ISC License**. See [LICENSE](./LICENSE) for details.

---

<div align="center">
  <sub>Built with ❤️ using React 19 + Gemini 2.5 Flash</sub>
</div>


