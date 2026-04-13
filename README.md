# 💠 CreaText V2

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Version](https://img.shields.io/badge/Version-2.0.0-purple.svg)]()
[![Manifest](https://img.shields.io/badge/Manifest-V3-green.svg)]()

**CreaText V2** is a premium, lightweight AI writing toolkit injected directly into your browser. Designed for professionals who need high-performance AI tools without the distraction of switching tabs, it offers a seamless, floating interface that lives where you write.

---

## ✨ Features at a Glance

A carefully curated suite of tools designed for the modern web:

-   **◈ Summarize**: Instant condensation of long-form content into paragraphs, lists, or tables.
-   **◈ Translate**: Context-aware translation supporting 30+ common languages.
-   **◈ Proofread**: Deep grammatical auditing with clear change logs and structural corrections.
-   **◈ Rewrite**: Dynamic rephrasing with independent control over **Format** (TL;DR, Table, Bullets) and **Tone**.
-   **◈ Write**: Direct AI generation from simple prompts.
-   **◈ Page Insight**: Intelligent web scraping that summarizes the active page's core value.

---

## 🛠️ Performance Architecture

CreaText is built on an **Honest Provider System**. Unlike other extensions, we don't hide API limitations or invent quota predictions.

### Three Intelligent Modes
1.  **🎯 Accuracy (Gemini)**: Uses Google's state-of-the-art models (Flash 2.5/3, Pro) for high-reasoning tasks.
2.  **⚡ Speed (Groq)**: Leverages LPU™ technology for near-instantaneous text generation using Llama 3 and GPT-OSS models.
3.  **🛡️ Best Effort**: A robust fallback chain that exhausts Gemini, then cycles through all available Groq models, into OpenRouter to ensure your request finishes.

### Transparent Quota Tracking
Get raw, unedited snapshots of your Groq rate limits (RPD/TPM) directly from the response headers. No predictions, just facts.

---

## 💎 Design & UX

-   **Floating Draggable Panel**: Moves with you. Stays out of the way.
-   **Shadow DOM Isolation**: UI styling that remains pristine, regardless of the host website's CSS.
-   **Wide Layout Split-View**: Side-by-side input/output comparison with a draggable vertical splitter.
-   **Responsive Drawer**: Resizable from all edges and corners with snappy, spring-based animations.
-   **Draft Preservation**: Your text stays where you left it, even when switching tools or adjusting settings.
-   **Modern Theming**: Choose from Oceanic, Forest, Midnight, or Sunrise presets, or build your own custom palette.

---

## 🚀 Getting Started

### 1. Installation
```bash
git clone https://github.com/Abid-Al-Hossain/creaText_V2.git
cd creaText_V2
npm install
npm run build
```

### 2. Loading the Extension
1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.

### 3. Setup your Keys
CreaText is **Privacy First**. You bring your own keys; we never see them.
- **Gemini**: [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Groq**: [Groq Console](https://console.groq.com/keys)
- **OpenRouter**: [OpenRouter Settings](https://openrouter.ai/settings/keys)

---

## 📖 Technical Stack

-   **Frontend**: React + Vite
-   **Logic**: Manifest V3 Service Workers
-   **Styling**: Vanilla CSS (Premium Design System)
-   **Animations**: Framer Motion
-   **Persistence**: `chrome.storage.local`

---

## ⚖️ Product Ethics

CreaText follows a strict **No-Bluff Policy**:
- ❌ No fake quota predictions.
- ❌ No hidden semantic-altering chunking.
- ❌ No "pretend" success states on empty returns.
- ✅ Full transparency on provider errors and safety blocks.

---

## 📄 License
Licensed under the **ISC License**. Free to use, modify, and distribute.
