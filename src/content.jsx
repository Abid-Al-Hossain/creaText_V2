// src/content.jsx
import stylesText from "./style.css?inline";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  DEFAULT_GROQ_MODEL as SHARED_DEFAULT_GROQ_MODEL,
  DEFAULT_GEMINI_MODEL as SHARED_DEFAULT_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS as ACCURACY_MODEL_OPTIONS,
  GROQ_MODEL_OPTIONS as SPEED_MODEL_OPTIONS,
  getGroqModelLabel,
} from "./providerCatalog";
import {
  summarize, translate, rewrite, proofread, write,
  getAiSettings, saveAiSettings,
} from "./aiBuiltins";

/* ------------ Config ------------ */
const defaultPos = { left: null, right: 24, top: null, bottom: 24, width: 720, height: 580 };
const defaultTheme = {
  bg: "", border: "", accent: "", text: "", bubble: 46,
  bgRaw: "", borderRaw: "", accentRaw: "", textRaw: ""
};
const defaultFeatures = { summarize: true, translate: true, proofread: true, rewrite: true, write: true, pageinsight: true };
const defaultPaneState = {
  summarize: { input: "", opts: { summaryMode: "words", words: 120, length: "medium" } },
  translate: { input: "", opts: { lang: "en" } },
  proofread: { input: "", opts: {} },
  rewrite: { input: "", opts: { format: "paragraph", tone: "neutral" } },
  write: { input: "", opts: { tone: "neutral" } },
  pageinsight: { input: "", opts: { summaryMode: "length", length: "medium", words: 200, format: "paragraph", tone: "neutral" } },
};
const MIN_DRAWER_WIDTH = 560;
const MIN_DRAWER_HEIGHT = 400;
const MIN_EDITOR_PANE_HEIGHT = 180;
const MIN_RESULTS_PANE_HEIGHT = 140;
const SPLITTER_HEIGHT = 12;
const MIN_SIDE_EDITOR_WIDTH = 320;
const MIN_SIDE_RESULTS_WIDTH = 300;
const SIDE_SPLITTER_SIZE = 12;

const THEME_PRESETS = {
  default:  { bg: "rgba(13,17,28,.98)",    border: "rgba(255,255,255,.09)", accent: "#818cf8", text: "#e2e8f0" },
  ocean:    { bg: "rgba(8,18,32,.97)",     border: "#1e3a5f",              accent: "#60a5fa", text: "#e6f2ff" },
  forest:   { bg: "rgba(11,20,16,.97)",    border: "#1c3b33",              accent: "#34d399", text: "#e8f5f0" },
  midnight: { bg: "rgba(12,12,18,.97)",    border: "#262a40",              accent: "#a78bfa", text: "#f3f4f6" },
  sunrise:  { bg: "rgba(255,248,240,.97)", border: "#ffd8b5",              accent: "#fb923c", text: "#2b1a10" },
  lavender: { bg: "rgba(248,245,255,.97)", border: "#d9ccff",              accent: "#7c3aed", text: "#231b3a" },
};

const FEATURES_META = {
  summarize: { icon: "\u25C8", label: "Summarize", desc: "Condense text to key points" },
  translate: { icon: "\u21C4", label: "Translate", desc: "Convert to any language" },
  proofread: { icon: "\u25CE", label: "Proofread", desc: "Fix grammar & spelling" },
  rewrite: { icon: "\u21BA", label: "Rewrite", desc: "Restructure & rephrase" },
  write: { icon: "\u270E", label: "Write", desc: "Generate from a prompt" },
  pageinsight: { icon: "\u2295", label: "Page Insight", desc: "Summarize this page's content" },
};

const AI_MODE_META = {
  accuracy: {
    label: "Accuracy",
    provider: "gemini",
    providerLabel: "Gemini",
    providerBadge: "Accuracy \u00B7 Gemini",
    keyLabel: "Gemini API Key",
    keyPlaceholder: "Paste your Gemini API key here...",
    keyLink: "https://aistudio.google.com/app/apikey",
    keyLinkLabel: "Get free Gemini key ->",
  },
  speed: {
    label: "Speed",
    provider: "groq",
    providerLabel: "Groq",
    providerBadge: "Speed \u00B7 Groq",
    keyLabel: "Groq API Key",
    keyPlaceholder: "Paste your Groq API key here...",
    keyLink: "https://console.groq.com/keys",
    keyLinkLabel: "Get Groq key ->",
  },
  best_effort: {
    label: "Best Effort",
    provider: "openrouter",
    providerLabel: "OpenRouter",
    providerBadge: "Best Effort \u00B7 Auto",
    keyLabel: "OpenRouter API Key",
    keyPlaceholder: "Paste your OpenRouter API key here...",
    keyLink: "https://openrouter.ai/settings/keys",
    keyLinkLabel: "Get OpenRouter key ->",
  },
};
const SPRING_SNAPPY = { type: "spring", stiffness: 320, damping: 24 };
const SPRING_SOFT   = { type: "spring", stiffness: 220, damping: 22 };

/* ------------ Storage hook ------------ */
function useStorage(key, initial) {
  const [val, setVal] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      chrome.storage.local.get({ [key]: initial }, s => {
        setVal(s[key]);
        setReady(true);
      });
    } catch {
      setReady(true);
    }
  }, [key]);
  useEffect(() => {
    const l = (c) => { if (key in c) setVal(c[key].newValue); };
    try {
      chrome.storage.local.onChanged.addListener(l);
      return () => { try { chrome.storage.local.onChanged.removeListener(l); } catch {} };
    } catch { return () => {}; }
  }, [key]);
  const save = useCallback((next) => new Promise((resolve) => {
    setVal(next);
    chrome.storage.local.set({ [key]: next }, resolve);
  }), [key]);
  return [val, save, ready];
}

/* ------------ Helpers ------------ */
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function isColorLike(s) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) || /^rgb/i.test(s) || /^hsl/i.test(s); }
function getTextColorScheme(color) {
  if (!color) return "dark";
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.display = "none";
  document.documentElement.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const rgb = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return "dark";

  const r = Number(rgb[1]);
  const g = Number(rgb[2]);
  const b = Number(rgb[3]);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? "light" : "dark";
}
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function isTransientProviderFailure(message) {
  const text = String(message || "");
  return (
    /server error \((502|503|504)\)/i.test(text) ||
    /network request failed/i.test(text)
  );
}

function isGroqModelTooLarge(message) {
  return /likely too large for .*Groq free-tier limits/i.test(String(message || ""));
}

function formatLastUpdated(timestamp) {
  if (!timestamp) return "No data yet";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "No data yet";
  }
}

function scrapePageContent() {
  const noisy = new Set(["SCRIPT", "STYLE", "NAV", "HEADER", "FOOTER", "ASIDE", "NOSCRIPT", "IFRAME", "BUTTON", "SELECT"]);
  const contentEl =
    document.querySelector("article") ||
    document.querySelector("[role='main']") ||
    document.querySelector("main") ||
    document.body;

  function getText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    if (noisy.has(node.tagName)) return "";
    if (node.id === "fai-root-mount") return "";
    if (node.getAttribute?.("aria-hidden") === "true") return "";
    const isBlock = /^(P|DIV|H[1-6]|LI|TD|TH|BLOCKQUOTE|PRE|SECTION|ARTICLE|MAIN|DETAILS|SUMMARY)$/.test(node.tagName);
    const parts = Array.from(node.childNodes).map(getText).join("");
    return isBlock ? `\n${parts}\n` : parts;
  }

  try {
    const raw = getText(contentEl || document.body);
    return raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

function getSpeedModelLabel(value) {
  return (SPEED_MODEL_OPTIONS.find((option) => option.value === value) || {}).label || value || "Groq";
}

function getAccuracyModelLabel(value) {
  return (ACCURACY_MODEL_OPTIONS.find((option) => option.value === value) || {}).label || value || "Gemini";
}

function getProviderLabel(provider) {
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "groq") return "Groq";
  return "Gemini";
}

function getResultModelLabel(meta) {
  if (!meta?.model) return getProviderLabel(meta?.provider);
  if (meta.provider === "groq") return `${getProviderLabel(meta.provider)} \u00B7 ${getSpeedModelLabel(meta.model)}`;
  if (meta.provider === "gemini") return `${getProviderLabel(meta.provider)} \u00B7 ${getAccuracyModelLabel(meta.model)}`;
  return `${getProviderLabel(meta.provider)} \u00B7 ${meta.model}`;
}

function getGroqQuotaHint(groqQuota) {
  if (!groqQuota) return "";
  return "Groq exposes separate counters in response headers: requests are organization-level RPD, tokens are TPM. These reset hints are independent, so one timer reaching zero does not mean all requests are blocked or unlocked.";
}

function splitMarkdownRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line) {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function normalizeMarkdownCell(cell) {
  return String(cell || "")
    .replace(/^\*\*(.*?)\*\*$/u, "$1")
    .replace(/^__(.*?)__$/u, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .trim();
}

function parseMarkdownTable(text) {
  const lines = String(text || "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 3 || !lines[0].includes("|") || !isMarkdownTableSeparator(lines[1])) return null;

  const headers = splitMarkdownRow(lines[0]).map(normalizeMarkdownCell);
  if (headers.length < 2) return null;

  const rows = lines
    .slice(2)
    .filter((line) => line.includes("|"))
    .map((line) => {
      const cells = splitMarkdownRow(line).map(normalizeMarkdownCell);
      return headers.map((_, idx) => cells[idx] || "");
    });

  if (!rows.length) return null;
  return { headers, rows };
}

/* ------------ Color Swatch ------------ */
function ColorSwatch({ label, color, onOpen }) {
  return (
    <div className="fai-color">
      <span className="fai-label">{label}</span>
      <button type="button" className="fai-color-swatch" style={{ background: color || "#4b5563" }}
        onClick={onOpen} aria-label={`${label} color`} title={`${label} color`} />
    </div>
  );
}

/* ------------ Color Modal ------------ */
function ColorModal({ open, label, value, rawValue, onLive, onConfirm, onClear, onCancel }) {
  const [text, setText] = useState(rawValue || value || "");
  const [pick, setPick] = useState(isColorLike(value) ? value : "#4b5563");
  const boxRef = useRef(null);

  useEffect(() => { setText(rawValue || value || ""); setPick(isColorLike(value) ? value : "#4b5563"); }, [open, value, rawValue]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fai-modal"
          onMouseDown={(e) => { if (!boxRef.current?.contains(e.target)) onCancel(); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}>
          <motion.div ref={boxRef} className="fai-modal-box" role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={SPRING_SNAPPY}
            onMouseDown={e => e.stopPropagation()}>
            <div className="fai-modal-title">{label}</div>
            <div className="fai-pop-row" style={{ marginTop: 10 }}>
              <input type="color" className="fai-color-native"
                value={isColorLike(pick) ? pick : "#4b5563"}
                onChange={(e) => { const c = e.target.value; setPick(c); setText(c); onLive(c, c); }}
                aria-label={`${label} color picker`} />
              <input className="fai-color-text" placeholder="#hex or rgb()" value={text}
                onChange={(e) => { const t = e.target.value; setText(t); if (isColorLike(t)) { setPick(t); onLive(t, t); } }}
                onFocus={(e) => e.target.select()} />
            </div>
            <div className="fai-pop-actions">
              <button className="fai-pop-btn" onClick={onClear}>Clear</button>
              <div style={{ flex: 1 }} />
              <button className="fai-pop-btn" onClick={onCancel}>Cancel</button>
              <button className="fai-pop-btn fai-pop-btn--done" onClick={onConfirm}>Done</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------ Result Card ------------ */
function ResultCard({ text, meta }) {
  const [copied, setCopied] = useState(false);
  const table = parseMarkdownTable(text);
  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  return (
    <motion.div className="fai-result"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}>
      {meta?.bestEffort && (
        <div className="fai-result-meta">
          Responded via <b>{getResultModelLabel(meta)}</b>
        </div>
      )}
      {table ? (
        <div className="fai-result-table-wrap">
          <table className="fai-result-table">
            <thead>
              <tr>
                {table.headers.map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="fai-result-text">{text}</div>
      )}
      <button className={`fai-copy-btn${copied ? " fai-copy-btn--copied" : ""}`}
        onClick={handleCopy} title="Copy to clipboard" aria-label="Copy result">
        {copied ? "Copied" : "Copy"}
      </button>
    </motion.div>
  );
}

/* ------------ App ------------ */
function App() {
  const [enabled, setEnabled, enabledReady] = useStorage("enabled", true);
  const [pos, setPos]         = useStorage("fai_pos", defaultPos);
  const [theme, setTheme]     = useStorage("fai_theme", defaultTheme);
  const [features, setFeatures] = useStorage("fai_features", defaultFeatures);
  const [preset, setPreset]   = useStorage("fai_theme_preset", "default");
  const [aiMode, setAiMode]   = useStorage("ai_provider_mode", "accuracy");
  const [accuracyModel, setAccuracyModel] = useStorage("ai_accuracy_model", SHARED_DEFAULT_GEMINI_MODEL);
  const [speedModel, setSpeedModel] = useStorage("ai_speed_model", SHARED_DEFAULT_GROQ_MODEL);

  const [active, setActive]           = useState("summarize");
  const [open, setOpen]               = useState(false);
  const [status, setStatus]           = useState({ text: "", loading: false });
  const [fallbackNotice, setFallbackNotice] = useState(null);
  const [results, setResults]         = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [drafts, setDrafts]           = useState(defaultPaneState);
  const [paneHeight, setPaneHeight]   = useState(320);
  const [sidePaneWidth, setSidePaneWidth] = useState(520);
  const [hiddenWidePane, setHiddenWidePane] = useState(null);

  const setStatusMsg = (text, loading = false) => setStatus({ text, loading });
  const drawerRef = useRef(null);
  const workspaceRef = useRef(null);
  const runTokenRef = useRef(0);
  const activeRef = useRef(active);
  const showSettingsRef = useRef(showSettings);
  const lastRunRef = useRef(null);
  const splitDragRef = useRef(null);
  const sideSplitDragRef = useRef(null);
  const hasResults = results.length > 0;
  const useSideBySideResults = (pos.width || defaultPos.width) >= 1040;
  const isInputPaneHidden = useSideBySideResults && hiddenWidePane === "input";
  const isOutputPaneHidden = useSideBySideResults && hiddenWidePane === "output";
  const showInputPane = !useSideBySideResults || !isInputPaneHidden;
  const showOutputPane = !useSideBySideResults || !isOutputPaneHidden;

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);

  const getClampedSidePaneWidth = useCallback((nextWidth) => {
    const workspace = workspaceRef.current;
    if (!workspace) return nextWidth;
    const maxWidth = Math.max(
      MIN_SIDE_EDITOR_WIDTH,
      workspace.clientWidth - SIDE_SPLITTER_SIZE - MIN_SIDE_RESULTS_WIDTH
    );
    return clamp(nextWidth, MIN_SIDE_EDITOR_WIDTH, maxWidth);
  }, []);

  useEffect(() => {
    const handler = (msg) => {
      if (msg?.type === "__toggle__")        setEnabled(msg.enabled);
      if (msg?.type === "__open__")          { setEnabled(true); setOpen(true); runTokenRef.current += 1; }
      if (msg?.type === "__open_settings__") { setEnabled(true); setOpen(true); setShowSettings(true); runTokenRef.current += 1; }
    };
    try {
      chrome.runtime.onMessage.addListener(handler);
      return () => { try { chrome.runtime.onMessage.removeListener(handler); } catch {} };
    } catch {
      return () => {};
    }
  }, [setEnabled]);

  useEffect(() => {
    const merged = { ...defaultFeatures, ...features };
    const isLegacyDefault =
      features.summarize === true &&
      features.translate === true &&
      features.proofread === true &&
      features.rewrite === true &&
      features.write === false;

    if (isLegacyDefault || Object.keys(defaultFeatures).some((key) => typeof features[key] !== "boolean")) {
      setFeatures({ ...merged, write: true });
    }
  }, [features, setFeatures]);

  useEffect(() => {
    const enabledKeys = Object.keys(features).filter((key) => features[key]);
    if (!enabledKeys.length) {
      setFeatures(defaultFeatures);
      return;
    }
    if (!enabledKeys.includes(active)) setActive(enabledKeys[0]);
  }, [active, features, setFeatures]);

  const varStyle = (() => {
    if (preset === "custom") {
      const bg     = theme.bg     || THEME_PRESETS.default.bg;
      const border = theme.border || THEME_PRESETS.default.border;
      const accent = theme.accent || THEME_PRESETS.default.accent;
      const text   = theme.text   || THEME_PRESETS.default.text;
      const scheme = getTextColorScheme(text);
      const contrast = scheme === "light" ? "black" : "white";
      const surface = `color-mix(in srgb, ${bg} 92%, ${contrast} 8%)`;
      const surfaceCtrl = `color-mix(in srgb, ${bg} 86%, ${contrast} 14%)`;
      return {
        "--fai-bg": bg,
        "--fai-surface": surface,
        "--fai-surface-ctrl": surfaceCtrl,
        "--fai-surface-hi": `color-mix(in srgb, ${accent} 10%, transparent)`,
        "--fai-border": border, "--fai-accent": accent, "--fai-text": text,
        "--fai-border-hi": `color-mix(in srgb, ${border} 72%, ${text} 28%)`,
        "--fai-text-muted": `color-mix(in srgb, ${text} 56%, transparent)`,
        "--fai-sidebar-bg": `color-mix(in srgb, ${bg} 90%, ${contrast} 10%)`,
        "--fai-menu-bg": surfaceCtrl,
        "--fai-menu-hover": `color-mix(in srgb, ${accent} 18%, transparent)`,
        "--fai-color-scheme": scheme,
        "--fai-shadow": scheme === "light"
          ? "0 20px 52px rgba(44, 26, 84, .18), 0 4px 16px rgba(44, 26, 84, .12)"
          : "0 24px 64px rgba(0,0,0,.55), 0 4px 16px rgba(0,0,0,.35)",
        "--fai-bubble-size": `${Number(theme.bubble) || 46}px`,
      };
    }
    const presetScheme = ["sunrise", "lavender"].includes(preset) ? "light" : "dark";
    return {
      "--fai-color-scheme": presetScheme,
      "--fai-bubble-size": `${Number(theme.bubble) || 46}px`
    };
  })();

  /* --- Drag --- */
  const dragState = useRef(null);
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

  useEffect(() => {
    const clampToViewport = () => {
      if (!open) return;
      const p = posRef.current;
      const maxWidth = Math.max(240, window.innerWidth - 16);
      const maxHeight = Math.max(220, window.innerHeight - 16);
      const minWidth = Math.min(MIN_DRAWER_WIDTH, maxWidth);
      const minHeight = Math.min(MIN_DRAWER_HEIGHT, maxHeight);
      const width = clamp(p.width || 720, minWidth, maxWidth);
      const height = clamp(p.height || 580, minHeight, maxHeight);
      const baseLeft = p.left ?? (window.innerWidth - width - (p.right ?? 24));
      const baseTop = p.top ?? (window.innerHeight - height - (p.bottom ?? 24));
      const left = clamp(baseLeft, 8, Math.max(8, window.innerWidth - width - 8));
      const top = clamp(baseTop, 8, Math.max(8, window.innerHeight - height - 8));

      if (left !== p.left || top !== p.top || width !== p.width || height !== p.height || p.right !== null || p.bottom !== null) {
        setPos({ ...p, left, top, right: null, bottom: null, width, height });
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [open, setPos]);

  useEffect(() => {
    if (showSettings || useSideBySideResults) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const available = workspace.clientHeight - SPLITTER_HEIGHT;
    const maxPaneHeight = Math.max(MIN_EDITOR_PANE_HEIGHT, available - MIN_RESULTS_PANE_HEIGHT);
    const nextHeight = clamp(paneHeight, MIN_EDITOR_PANE_HEIGHT, maxPaneHeight);
    if (nextHeight !== paneHeight) setPaneHeight(nextHeight);
  }, [paneHeight, pos.height, showSettings, useSideBySideResults]);

  useEffect(() => {
    if (!useSideBySideResults || showSettings || hiddenWidePane) return;
    const nextWidth = getClampedSidePaneWidth(sidePaneWidth);
    if (nextWidth !== sidePaneWidth) setSidePaneWidth(nextWidth);
  }, [getClampedSidePaneWidth, hiddenWidePane, pos.width, showSettings, sidePaneWidth, useSideBySideResults]);

  const onDragStart = (e) => {
    if (e.target.closest(".fai-actions")) return;
    const target = e.currentTarget;
    const rect   = target.getBoundingClientRect();
    dragState.current = {
      dx: e.clientX - rect.left, dy: e.clientY - rect.top,
      isBubble: target.classList.contains("fai-bubble"),
      startX: e.clientX, startY: e.clientY,
    };
    window.addEventListener("pointermove", onDragging);
    window.addEventListener("pointerup", onDragEnd);
  };
  const onDragging = (e) => {
    if (!dragState.current) return;
    const p = posRef.current;
    const bubbleSize = Number(theme.bubble) || 46;
    const isBubble = dragState.current.isBubble;
    const width  = isBubble ? bubbleSize : (p.width  || 720);
    const height = isBubble ? bubbleSize : (p.height || 580);
    const left = clamp(e.clientX - dragState.current.dx, 8, window.innerWidth  - width  - 8);
    const top  = clamp(e.clientY - dragState.current.dy, 8, window.innerHeight - height - 8);
    setPos({ ...p, left, right: null, top, bottom: null });
  };
  const onDragEnd = (e) => {
    if (dragState.current) {
      const dx = Math.abs(e.clientX - dragState.current.startX);
      const dy = Math.abs(e.clientY - dragState.current.startY);
      if (dragState.current.isBubble && Math.sqrt(dx * dx + dy * dy) < 5) setOpen(true);
    }
    dragState.current = null;
    window.removeEventListener("pointermove", onDragging);
    window.removeEventListener("pointerup", onDragEnd);
  };

  /* --- Resize --- */
  const resizeState = useRef(null);
  const onResizeStart = (dir) => (e) => {
    e.stopPropagation();
    const rect = drawerRef.current?.getBoundingClientRect();
    if (!rect) return;
    resizeState.current = {
      dir,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
      startX: e.clientX, startY: e.clientY,
    };
    window.addEventListener("pointermove", onResizing);
    window.addEventListener("pointerup", onResizeEnd);
  };
  const onResizing = (e) => {
    if (!resizeState.current) return;
    const { dir, startLeft, startTop, startWidth, startHeight, startX, startY } = resizeState.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const viewportMinWidth = Math.min(MIN_DRAWER_WIDTH, Math.max(240, window.innerWidth - 16));
    const viewportMinHeight = Math.min(MIN_DRAWER_HEIGHT, Math.max(220, window.innerHeight - 16));

    let left = startLeft;
    let top = startTop;
    let width = startWidth;
    let height = startHeight;

    if (dir.includes("e")) {
      width = clamp(startWidth + dx, viewportMinWidth, window.innerWidth - startLeft - 8);
    }
    if (dir.includes("s")) {
      height = clamp(startHeight + dy, viewportMinHeight, window.innerHeight - startTop - 8);
    }
    if (dir.includes("w")) {
      left = clamp(startLeft + dx, 8, startLeft + startWidth - viewportMinWidth);
      width = startWidth - (left - startLeft);
    }
    if (dir.includes("n")) {
      top = clamp(startTop + dy, 8, startTop + startHeight - viewportMinHeight);
      height = startHeight - (top - startTop);
    }

    setPos({
      ...posRef.current,
      left,
      top,
      right: null,
      bottom: null,
      width,
      height,
    });
  };
  const onResizeEnd = () => {
    resizeState.current = null;
    window.removeEventListener("pointermove", onResizing);
    window.removeEventListener("pointerup", onResizeEnd);
  };

  const onPaneSplitMove = (e) => {
    const drag = splitDragRef.current;
    const workspace = workspaceRef.current;
    if (!drag || !workspace) return;
    const available = workspace.clientHeight - SPLITTER_HEIGHT;
    const maxPaneHeight = Math.max(MIN_EDITOR_PANE_HEIGHT, available - MIN_RESULTS_PANE_HEIGHT);
    const nextHeight = clamp(drag.startHeight + (e.clientY - drag.startY), MIN_EDITOR_PANE_HEIGHT, maxPaneHeight);
    setPaneHeight(nextHeight);
  };
  const onPaneSplitEnd = () => {
    splitDragRef.current = null;
    window.removeEventListener("pointermove", onPaneSplitMove);
    window.removeEventListener("pointerup", onPaneSplitEnd);
  };
  const onPaneSplitStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceRef.current) return;
    splitDragRef.current = { startY: e.clientY, startHeight: paneHeight };
    window.addEventListener("pointermove", onPaneSplitMove);
    window.addEventListener("pointerup", onPaneSplitEnd);
  };

  const onSideSplitMove = (e) => {
    const drag = sideSplitDragRef.current;
    if (!drag) return;
    setSidePaneWidth(getClampedSidePaneWidth(drag.startWidth + (e.clientX - drag.startX)));
  };
  const onSideSplitEnd = () => {
    sideSplitDragRef.current = null;
    window.removeEventListener("pointermove", onSideSplitMove);
    window.removeEventListener("pointerup", onSideSplitEnd);
  };
  const onSideSplitStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceRef.current || hiddenWidePane) return;
    sideSplitDragRef.current = { startX: e.clientX, startWidth: sidePaneWidth };
    window.addEventListener("pointermove", onSideSplitMove);
    window.addEventListener("pointerup", onSideSplitEnd);
  };

  const hideWidePane = (pane) => {
    setHiddenWidePane(pane);
  };
  const restoreWidePanes = () => {
    setHiddenWidePane(null);
  };

  const bubble      = Number(theme.bubble) || 46;
  const presetClass = (preset && preset !== "custom" && preset !== "default") ? `theme-${preset}` : "";
  const activeMeta  = FEATURES_META[active] || {};
  const aiMeta = AI_MODE_META[aiMode] || AI_MODE_META.accuracy;
  const accuracyModelMeta = ACCURACY_MODEL_OPTIONS.find((option) => option.value === accuracyModel) || ACCURACY_MODEL_OPTIONS[0];
  const speedModelMeta = SPEED_MODEL_OPTIONS.find((option) => option.value === speedModel) || SPEED_MODEL_OPTIONS[0];

  const updateDraft = useCallback((tool, next) => {
    setDrafts((prev) => ({
      ...prev,
      [tool]: {
        ...prev[tool],
        ...next,
        opts: {
          ...prev[tool]?.opts,
          ...(next.opts || {}),
        },
      },
    }));
  }, []);

  /* --- Run AI --- */
  const runOp = async (op, text, opts, { skipFallbackPrompt = false } = {}) => {
    lastRunRef.current = { op, text, opts };
    setFallbackNotice(null);
    if (op !== "pageinsight" && !text?.trim()) { setStatusMsg("Please enter some text."); setTimeout(() => setStatusMsg(""), 2000); return; }
    const token = ++runTokenRef.current;
    const labels = { summarize: "Summarizing", translate: "Translating", proofread: "Proofreading", rewrite: "Rewriting", write: "Writing", pageinsight: "Analyzing page" };
    setStatusMsg(`${labels[op] || "Processing"}...`, true);
    setResults([]);
    try {
      let result = "";
      let meta = null;
      if      (op === "summarize") {
        const summaryOpts = opts.summaryMode === "length"
          ? { length: opts.length }
          : { words: opts.words };
        const res = await summarize(text, summaryOpts);
        result = res?.text || "";
        meta = res?.meta || null;
      }
      else if (op === "translate") {
        const res = await translate(text, { to: opts.lang || "en" });
        result = res?.text || "";
        meta = res?.meta || null;
      }
      else if (op === "proofread") {
        const res = await proofread(text);
        const corrected = res?.correctedText || String(res);
        const changes   = Array.isArray(res?.changes) && res.changes.length
          ? "\n\nChanges:\n" + res.changes.map(c => `\u2022 ${c}`).join("\n") : "";
        result = corrected + changes;
        meta = res?.meta || null;
      }
      else if (op === "rewrite") {
        const res = await rewrite(text, { format: opts.format || "paragraph", tone: opts.tone || "neutral" });
        result = res?.text || "";
        meta = res?.meta || null;
      }
      else if (op === "write") {
        const res = await write(text, { tone: opts.tone || "neutral" });
        result = res?.text || "";
        meta = res?.meta || null;
      }
      else if (op === "pageinsight") {
        const pageText = scrapePageContent();
        if (!pageText || pageText.length < 50) throw new Error("Could not extract readable content from this page.");
        const summaryOpts = opts.summaryMode === "length" ? { length: opts.length } : { words: opts.words };
        const res = await summarize(pageText, { ...summaryOpts, format: opts.format || "paragraph", tone: opts.tone || "neutral" });
        result = res?.text || "";
        meta = res?.meta || null;
      }

      if (token !== runTokenRef.current || activeRef.current !== op || showSettingsRef.current) return;
      setResults([{ id: Date.now(), text: result, meta }]);
      if (meta?.bestEffort && meta?.attempted?.length) {
        const providerLabel = meta.provider === "openrouter" ? "OpenRouter" : meta.provider === "groq" ? "Groq" : "Gemini";
        setStatusMsg(`Best Effort finished via ${providerLabel}.`, false);
      } else if (meta?.fallbackFrom === "gemini" && meta?.provider === "groq") {
        setStatusMsg("Gemini was unavailable. Used Groq speed fallback.", false);
      } else {
        setStatusMsg("Done!");
      }
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err) {
      if (token !== runTokenRef.current || activeRef.current !== op || showSettingsRef.current) return;
      if (String(err.message || "").startsWith("NO_API_KEY:")) {
        const provider = String(err.message || "").split(":")[1];
        const providerLabel = provider === "groq" ? "Groq" : provider === "openrouter" ? "OpenRouter" : "Gemini";
        setStatusMsg(`Add your ${providerLabel} API key in Settings.`);
        setTimeout(() => setStatusMsg(""), 6000);
      } else if (String(err.message || "").startsWith("NO_PROVIDER_CHAIN:")) {
        setStatusMsg("Best Effort needs at least one saved Gemini, Groq, or OpenRouter key.");
        setTimeout(() => setStatusMsg(""), 6000);
      } else {
        setStatusMsg(`Error: ${err.message || "An error occurred."}`);
        if (!skipFallbackPrompt && aiMode === "accuracy" && isTransientProviderFailure(err.message)) {
          setFallbackNotice({
            kind: "provider-fallback",
            text: "Gemini is currently unstable. You can switch this run to Speed and use Groq instead.",
            actionLabel: "Use Speed fallback",
          });
        } else if (!skipFallbackPrompt && aiMode === "speed" && speedModel !== "meta-llama/llama-4-scout-17b-16e-instruct" && isGroqModelTooLarge(err.message)) {
          setFallbackNotice({
            kind: "switch-model",
            text: "This input is likely too large for the selected GPT-OSS model on current Groq free-tier limits.",
            actionLabel: "Use Llama 4 Scout",
          });
        }
        setTimeout(() => setStatusMsg(""), 6000);
      }
    }
  };

  const runWithSpeedFallback = async () => {
    const lastRun = lastRunRef.current;
    if (!lastRun) return;
    setFallbackNotice(null);
    setResults([]);
    setStatusMsg("Switching to Speed and retrying with Groq...", true);
    await setAiMode("speed");
    await runOp(lastRun.op, lastRun.text, lastRun.opts, { skipFallbackPrompt: true });
  };

  const switchToScoutAndRetry = async () => {
    const lastRun = lastRunRef.current;
    if (!lastRun) return;
    setFallbackNotice(null);
    setResults([]);
    setStatusMsg("Switching to Llama 4 Scout and retrying...", true);
    await setAiMode("speed");
    await setSpeedModel("meta-llama/llama-4-scout-17b-16e-instruct");
    await runOp(lastRun.op, lastRun.text, lastRun.opts, { skipFallbackPrompt: true });
  };

  const handleFallbackAction = () => {
    if (fallbackNotice?.kind === "switch-model") return switchToScoutAndRetry();
    return runWithSpeedFallback();
  };
  const stopKeyPropagation = (e) => {
    e.stopPropagation();
  };

  return !enabledReady || !enabled ? null : (
    <AnimatePresence mode="wait">
      {!open ? (
        <motion.div key="bubble"
          className={`fai-bubble ${presetClass}`}
          onPointerDown={onDragStart}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: "spring", stiffness: 420, damping: 20 }}
          style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom, ...varStyle }}
          title="Open CreaText">
          <div className="fai-bubble-inner">
            <span className="fai-bubble-logo">CT</span>
          </div>
        </motion.div>
      ) : (
        <motion.div key="drawer"
          ref={drawerRef}
          className={`fai-drawer ${presetClass}`}
          onKeyDownCapture={stopKeyPropagation}
          onKeyUpCapture={stopKeyPropagation}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          transition={SPRING_SOFT}
          style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom, width: pos.width, height: pos.height, ...varStyle }}>

          {/* Sidebar */}
          <div className="fai-sidebar">
            <div className="fai-head" onPointerDown={onDragStart}>
              <div className="fai-logo-mark">CT</div>
              <div className="fai-title">CreaText</div>
              <div className="fai-actions">
                <button className="fai-iconbtn" aria-label="Settings" title="Settings"
                  onClick={() => {
                    runTokenRef.current += 1;
                    setStatusMsg("");
                    setShowSettings(s => !s);
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                <button className="fai-iconbtn fai-iconbtn--close" aria-label="Close" title="Close"
                  onClick={() => {
                    runTokenRef.current += 1;
                    setStatusMsg("");
                    setOpen(false);
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="fai-nav">
              {Object.entries(features).filter(([, v]) => v).map(([k]) => {
                const meta = FEATURES_META[k] || {};
                const isActive = active === k && !showSettings;
                return (
                  <button key={k}
                    className={`fai-nav-item${isActive ? " active" : ""}`}
                    onClick={() => {
                      runTokenRef.current += 1;
                      setStatusMsg("");
                      setActive(k);
                      setShowSettings(false);
                      setResults([]);
                    }}>
                    <span className="fai-nav-icon">{meta.icon}</span>
                    <span className="fai-nav-label">{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="fai-sidebar-footer">
              <span className="fai-sidebar-badge">
                {aiMode === "accuracy"
                  ? `Accuracy \u00B7 ${accuracyModelMeta.shortLabel}`
                  : aiMode === "speed"
                    ? `Speed \u00B7 ${speedModelMeta.shortLabel}`
                    : "Best Effort \u00B7 Auto"}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="fai-body">
            {showSettings ? (
              <Settings
                aiMode={aiMode} setAiMode={setAiMode}
                accuracyModel={accuracyModel} setAccuracyModel={setAccuracyModel}
                speedModel={speedModel} setSpeedModel={setSpeedModel}
                theme={theme} setTheme={setTheme}
                preset={preset} setPreset={setPreset}
                bubble={bubble} features={features} setFeatures={setFeatures}
              />
            ) : (
              <>
                <div className="fai-feature-bar">
                  <span className="fai-feature-icon">{activeMeta.icon}</span>
                  <div>
                    <div className="fai-feature-name">{activeMeta.label}</div>
                    <div className="fai-feature-desc">{activeMeta.desc}</div>
                  </div>
                </div>
                <div className={`fai-workspace${useSideBySideResults ? " fai-workspace--split" : ""}`} ref={workspaceRef}>
                  {showInputPane && (
                    <div
                      className="fai-pane-shell"
                      style={useSideBySideResults
                        ? hiddenWidePane
                          ? undefined
                          : { flex: `0 0 ${getClampedSidePaneWidth(sidePaneWidth)}px`, width: getClampedSidePaneWidth(sidePaneWidth) }
                        : results.length > 0
                          ? { height: paneHeight, flex: "0 0 auto" }
                          : undefined}>
                      <div className={`fai-panel-shell${useSideBySideResults ? " fai-panel-shell--side" : ""}`}>
                        {useSideBySideResults && (
                          <div className="fai-panel-head">
                            <span className="fai-panel-title">Input</span>
                            <div className="fai-panel-actions">
                              <button
                                type="button"
                                className="fai-panel-btn"
                                onClick={() => hideWidePane("input")}
                                title="Hide input panel">
                                Hide
                              </button>
                            </div>
                          </div>
                        )}
                        <Pane
                          active={active}
                          draft={drafts[active] || defaultPaneState[active]}
                          onDraftChange={(next) => updateDraft(active, next)}
                          onRun={(input, opts) => runOp(active, input, opts)}
                        />
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {!useSideBySideResults && (
                      <motion.div
                        className="fai-pane-splitter"
                        onPointerDown={onPaneSplitStart}
                        title="Resize input and output sections"
                        aria-hidden="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}>
                        <span className="fai-pane-splitter-grip" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {useSideBySideResults && showInputPane && showOutputPane && (
                    <div
                      className="fai-pane-splitter fai-pane-splitter--vertical"
                      onPointerDown={onSideSplitStart}
                      title="Resize input and output panels"
                      aria-hidden="true">
                      <span className="fai-pane-splitter-grip fai-pane-splitter-grip--vertical" />
                    </div>
                  )}

                  {useSideBySideResults && isInputPaneHidden && (
                    <div className="fai-pane-collapsed-rail fai-pane-collapsed-rail--left">
                      <button
                        type="button"
                        className="fai-pane-restore-btn"
                        onClick={restoreWidePanes}
                        title="Show input panel">
                        Input
                      </button>
                    </div>
                  )}

                  {useSideBySideResults && isOutputPaneHidden && (
                    <div className="fai-pane-collapsed-rail fai-pane-collapsed-rail--right">
                      <button
                        type="button"
                        className="fai-pane-restore-btn"
                        onClick={restoreWidePanes}
                        title="Show output panel">
                        Output
                      </button>
                    </div>
                  )}

                  <AnimatePresence>
                    {showOutputPane && (
                      useSideBySideResults ? (
                        <motion.div
                          className="fai-results-shell"
                          aria-live="polite"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}>
                          <div className="fai-panel-head fai-panel-head--results">
                            <span className="fai-panel-title">Output</span>
                            <div className="fai-panel-actions">
                              <button
                                type="button"
                                className="fai-panel-btn"
                                onClick={() => hideWidePane("output")}
                                title="Hide output panel">
                                Hide
                              </button>
                            </div>
                          </div>
                          <div className="fai-results fai-results--side">
                            {hasResults
                              ? results.map(r => <ResultCard key={r.id} text={r.text} meta={r.meta} />)
                              : <div className="fai-results-empty">Output will appear here.</div>
                            }
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div className="fai-results" aria-live="polite"
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}>
                          {hasResults
                            ? results.map(r => <ResultCard key={r.id} text={r.text} meta={r.meta} />)
                            : <div className="fai-results-empty">Output will appear here.</div>
                          }
                        </motion.div>
                      )
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}

            <AnimatePresence>
              {fallbackNotice && (
                <motion.div className="fai-fallback-banner"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}>
                  <span className="fai-fallback-text">{fallbackNotice.text}</span>
                  <div className="fai-fallback-actions">
                    <button type="button" className="fai-fallback-btn" onClick={handleFallbackAction}>
                      {fallbackNotice.actionLabel}
                    </button>
                    <button
                      type="button"
                      className="fai-fallback-close"
                      onClick={() => setFallbackNotice(null)}
                      aria-label="Dismiss notice"
                      title="Dismiss notice">
                      {"\u00D7"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {status.text && (
                <motion.div className={`fai-status${status.loading ? " fai-status--loading" : ""}`}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
                  {status.text}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="fai-resize-handle fai-resize-handle--n" onPointerDown={onResizeStart("n")} />
            <div className="fai-resize-handle fai-resize-handle--e" onPointerDown={onResizeStart("e")} />
            <div className="fai-resize-handle fai-resize-handle--s" onPointerDown={onResizeStart("s")} />
            <div className="fai-resize-handle fai-resize-handle--w" onPointerDown={onResizeStart("w")} />
            <div className="fai-resize-handle fai-resize-handle--ne" onPointerDown={onResizeStart("ne")} />
            <div className="fai-resize-handle fai-resize-handle--nw" onPointerDown={onResizeStart("nw")} />
            <div className="fai-resize-handle fai-resize-handle--se" onPointerDown={onResizeStart("se")} />
            <div className="fai-resize-handle fai-resize-handle--sw" onPointerDown={onResizeStart("sw")} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------ Settings ------------ */
function Settings({ aiMode, setAiMode, accuracyModel, setAccuracyModel, speedModel, setSpeedModel, theme, setTheme, preset, setPreset, bubble, features, setFeatures }) {
  const [colorModal, setColorModal] = useState({ open: false, key: "", label: "" });
  const [apiKeys, setApiKeys] = useState({ gemini: "", groq: "", openrouter: "" });
  const [groqQuota] = useStorage("groq_rate_limit_state", null);
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const prevThemeRef = useRef(theme);
  const isCustom = preset === "custom";
  const enabledCount = Object.values(features).filter(Boolean).length;
  const aiMeta = AI_MODE_META[aiMode] || AI_MODE_META.accuracy;
  const currentProvider = aiMeta.provider;
  const currentKey = apiKeys[currentProvider] || "";
  const selectedAccuracyModel = ACCURACY_MODEL_OPTIONS.find((option) => option.value === accuracyModel) || ACCURACY_MODEL_OPTIONS[0];
  const selectedSpeedModel = SPEED_MODEL_OPTIONS.find((option) => option.value === speedModel) || SPEED_MODEL_OPTIONS[0];
  const quotaMatchesSelectedSpeedModel = !groqQuota?.model || groqQuota.model === speedModel;

  useEffect(() => {
    getAiSettings().then((settings) => {
      setApiKeys({
        gemini: settings?.geminiApiKey || "",
        groq: settings?.groqApiKey || "",
        openrouter: settings?.openrouterApiKey || "",
      });
    });
  }, []);
  useEffect(() => { setKeySaved(false); }, [aiMode, currentKey]);

  const handleSaveKey = async () => {
    await saveAiSettings(
      currentProvider === "gemini"
        ? { geminiApiKey: currentKey.trim() }
        : currentProvider === "groq"
          ? { groqApiKey: currentKey.trim() }
          : { openrouterApiKey: currentKey.trim() }
    );
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2500);
  };

  const setThemeField = (key, color, raw) => {
    if (!isCustom) return;
    const next = { ...theme };
    next[key] = color || "";
    next[`${key}Raw`] = raw ?? next[`${key}Raw`] ?? "";
    setTheme(next);
  };

  const onPresetChange = (name) => {
    if (name === "custom") {
      if (!theme.bg && !theme.border && !theme.accent && !theme.text && !theme.bgRaw && !theme.borderRaw && !theme.accentRaw && !theme.textRaw) {
        const base = THEME_PRESETS.default;
        setTheme({ ...theme, bg: base.bg, border: base.border, accent: base.accent, text: base.text,
          bgRaw: base.bg, borderRaw: base.border, accentRaw: base.accent, textRaw: base.text });
      }
    }
    setPreset(name);
  };

  const openModal = (key, label) => { if (!isCustom) return; prevThemeRef.current = { ...theme }; setColorModal({ open: true, key, label }); };
  const closeModal = () => setColorModal({ open: false, key: "", label: "" });
  const cancelModal = () => { setTheme(prevThemeRef.current); closeModal(); };

  const setTextTone = (tone) => {
    if (!isCustom) return;
    const map = { black: "#111111", white: "#ffffff", ash: "#cbd5e1" };
    const val = map[tone] || "";
    setTheme({ ...theme, text: val, textRaw: val });
  };
  const currentTone = (() => {
    const t = (theme.text || theme.textRaw || "").toLowerCase().replace(/\s+/g, "");
    if (t === "#111111") return "black";
    if (t === "#ffffff") return "white";
    return "ash";
  })();

  const rangePercent = Math.round(((bubble - 32) / (56 - 32)) * 100);
  const onBubbleChange = (e) => {
    const v = Number(e.target.value);
    e.target.style.setProperty("--val", `${Math.round(((v - 32) / 24) * 100)}%`);
    setTheme({ ...theme, bubble: v });
  };

  return (
    <div className="fai-settings">
      <div className="fai-settings-section">
        <div className="fai-settings-section-title">AI Connection</div>
        <div className="fai-settings-stack">
          <div className="fai-segment" role="group" aria-label="AI mode">
            <button type="button" className={`fai-segment-btn${aiMode === "accuracy" ? " active" : ""}`} aria-pressed={aiMode === "accuracy"} onClick={() => setAiMode("accuracy")}>Accuracy</button>
            <button type="button" className={`fai-segment-btn${aiMode === "speed" ? " active" : ""}`} aria-pressed={aiMode === "speed"} onClick={() => setAiMode("speed")}>Speed</button>
            <button type="button" className={`fai-segment-btn${aiMode === "best_effort" ? " active" : ""}`} aria-pressed={aiMode === "best_effort"} onClick={() => setAiMode("best_effort")}>Best Effort</button>
          </div>
          <div className="hint">Accuracy uses <b>Gemini</b>. Speed uses <b>Groq</b>. Best Effort tries your saved <b>Gemini</b> key first, then <b>Groq</b>, then <b>OpenRouter free</b>.</div>
          <div className="hint">Technical failures, rate limits, and request-size failures can fail over automatically. Safety/refusal blocks do not.</div>
        </div>
        <div className="fai-apikey-label">
          <span>{aiMeta.keyLabel}</span>
          <a href={aiMeta.keyLink} target="_blank" rel="noreferrer" className="fai-apikey-link">{aiMeta.keyLinkLabel}</a>
        </div>
        <div className="fai-apikey-row">
          <input className="fai-apikey-input" type={showKey ? "text" : "password"}
            placeholder={aiMeta.keyPlaceholder} value={currentKey}
            onChange={e => setApiKeys((prev) => ({ ...prev, [currentProvider]: e.target.value }))}
            onFocus={e => e.target.select()}
            spellCheck={false} aria-label={aiMeta.keyLabel} />
          <button className="fai-eye-btn" type="button" onClick={() => setShowKey(v => !v)} title={showKey ? "Hide key" : "Show key"}>{showKey ? "Hide" : "Show"}</button>
          <button className={`fai-pop-btn${keySaved ? " fai-pop-btn--done" : ""}`} style={{ whiteSpace: "nowrap" }} onClick={handleSaveKey}>{keySaved ? "Saved" : "Save"}</button>
        </div>
        {aiMode === "accuracy" && (
          <>
            <div className="fai-settings-row" style={{ marginTop: 10 }}>
              <label className="fai-settings-label">Model</label>
              <select value={accuracyModel} onChange={e => setAccuracyModel(e.target.value)} className="fai-select" aria-label="Accuracy model">
                {ACCURACY_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.pickerLabel || option.label}</option>)}
              </select>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{selectedAccuracyModel.note}</div>
            <div className="hint">All three use the same Gemini API key. 2.5 Flash is still the safest default.</div>
          </>
        )}
        {aiMode === "speed" && (
          <>
            <div className="fai-settings-row" style={{ marginTop: 10 }}>
              <label className="fai-settings-label">Model</label>
              <select value={speedModel} onChange={e => setSpeedModel(e.target.value)} className="fai-select" aria-label="Speed model">
                {SPEED_MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.pickerLabel || option.label}</option>)}
              </select>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>{selectedSpeedModel.note}</div>
            <div className="hint">More capable models are not always better on Groq free plans; GPT-OSS models hit tighter TPM limits than Llama 4 Scout.</div>
            <div className="fai-quota-card" style={{ marginTop: 12 }}>
              <div className="fai-quota-title">Live Groq quota</div>
              {!quotaMatchesSelectedSpeedModel && (
                <div className="hint" style={{ marginBottom: 8 }}>
                  Selected model is <b>{selectedSpeedModel.label}</b>, but this quota snapshot is still from <b>{getGroqModelLabel(groqQuota?.model)}</b>. Run one Speed request to refresh the quota for the selected model.
                </div>
              )}
              {groqQuota ? (
                <>
                  <div className="fai-quota-grid">
                    <div className="fai-quota-item">
                      <span className="fai-quota-label">RPD left</span>
                      <span className="fai-quota-value">{groqQuota.remainingRequests ?? "-"}{groqQuota.limitRequests != null ? ` / ${groqQuota.limitRequests}` : ""}</span>
                    </div>
                    <div className="fai-quota-item">
                      <span className="fai-quota-label">TPM left</span>
                      <span className="fai-quota-value">{groqQuota.remainingTokens ?? "-"}{groqQuota.limitTokens != null ? ` / ${groqQuota.limitTokens}` : ""}</span>
                    </div>
                    <div className="fai-quota-item">
                      <span className="fai-quota-label">RPD reset hint</span>
                      <span className="fai-quota-value">{groqQuota.resetRequests || "Unknown"}</span>
                    </div>
                    <div className="fai-quota-item">
                      <span className="fai-quota-label">TPM reset hint</span>
                      <span className="fai-quota-value">{groqQuota.resetTokens || "Unknown"}</span>
                    </div>
                  </div>
                  <div className="hint" style={{ marginTop: 8 }}>Raw header snapshot only. No countdowns or predictions are inferred by the extension.</div>
                  <div className="hint" style={{ marginTop: 8 }}>Snapshot model: <b>{getGroqModelLabel(groqQuota.model || selectedSpeedModel.value)}</b> \u00B7 Updated {formatLastUpdated(groqQuota.updatedAt)}</div>
                </>
              ) : (
                <div className="hint">Run one request in Speed mode to load live Groq quota from response headers.</div>
              )}
            </div>
          </>
        )}
        {aiMode === "best_effort" && (
          <div className="fai-quota-card" style={{ marginTop: 12 }}>
            <div className="fai-quota-title">Best Effort order</div>
            <div className="hint" style={{ marginTop: 8 }}>1. Gemini</div>
            <div className="hint" style={{ marginTop: 4 }}>2. Groq — all models, your selected model first:</div>
            {[speedModel, ...SPEED_MODEL_OPTIONS.map((o) => o.value).filter((v) => v !== speedModel)].map((v) => {
              const meta = SPEED_MODEL_OPTIONS.find((o) => o.value === v);
              return (
                <div key={v} className="hint" style={{ paddingLeft: 14 }}>
                  {"\u2022"} {meta?.label || v}{v === speedModel ? " \u00B7 selected" : ""}
                </div>
              );
            })}
            <div className="hint" style={{ marginTop: 4 }}>3. OpenRouter \u00B7 openrouter/free</div>
            <div className="hint" style={{ marginTop: 8 }}>Saved keys: Gemini <b>{apiKeys.gemini ? "yes" : "no"}</b> \u00B7 Groq <b>{apiKeys.groq ? "yes" : "no"}</b> \u00B7 OpenRouter <b>{apiKeys.openrouter ? "yes" : "no"}</b></div>
          </div>
        )}
      </div>

      <div className="fai-settings-divider" />

      <div className="fai-settings-section">
        <div className="fai-settings-section-title">Appearance</div>
        <div className="fai-settings-row">
          <label className="fai-settings-label">Theme</label>
          <select value={preset} onChange={e => onPresetChange(e.target.value)} className="fai-select" aria-label="Choose theme">
            <option value="default">Default</option>
            <option value="ocean">Ocean</option>
            <option value="forest">Forest</option>
            <option value="midnight">Midnight</option>
            <option value="sunrise">Sunrise</option>
            <option value="lavender">Lavender</option>
            <option value="custom">Custom</option>
          </select>
          <button type="button" onClick={() => onPresetChange("default")} className="fai-reset-btn" title="Reset to default">Reset</button>
        </div>
        <div className="fai-settings-row" style={{ marginTop: 10 }}>
          <label className="fai-settings-label">Bubble size</label>
          <input className="fai-range" type="range" min="32" max="56" value={bubble} onChange={onBubbleChange} style={{ flex: 1, ["--val"]: `${rangePercent}%` }} />
          <span style={{ opacity: .75, fontSize: 12, minWidth: 32, textAlign: "right" }}>{bubble}px</span>
        </div>
        {isCustom && (
          <>
            <div className="fai-grid" style={{ marginTop: 12 }}>
              <ColorSwatch label="Panel" color={theme.bg || theme.bgRaw} onOpen={() => openModal("bg", "Panel Color")} />
              <ColorSwatch label="Border" color={theme.border || theme.borderRaw} onOpen={() => openModal("border", "Border Color")} />
              <ColorSwatch label="Accent" color={theme.accent || theme.accentRaw} onOpen={() => openModal("accent", "Accent Color")} />
            </div>
            <div className="fai-settings-row" style={{ marginTop: 10 }}>
              <label className="fai-settings-label">Text color</label>
              <select value={currentTone} onChange={e => setTextTone(e.target.value)} className="fai-select" aria-label="Text color">
                <option value="black">Black</option>
                <option value="white">White</option>
                <option value="ash">Ash</option>
              </select>
            </div>
            <ColorModal open={colorModal.open} label={colorModal.label}
              value={theme[colorModal.key] || ""} rawValue={theme[`${colorModal.key}Raw`] || ""}
              onLive={(c, raw) => setThemeField(colorModal.key, c, raw)}
              onConfirm={closeModal}
              onClear={() => { setThemeField(colorModal.key, "", ""); closeModal(); }}
              onCancel={cancelModal} />
          </>
        )}
        {!isCustom && <div className="hint" style={{ marginTop: 6 }}>Switch to <b>Custom</b> to edit colors.</div>}
      </div>

      <div className="fai-settings-divider" />

      <div className="fai-settings-section">
        <div className="fai-settings-section-title">Features</div>
        <div className="fai-feature-toggles">
          {Object.keys(features).map(key => (
            <label key={key} className="fai-toggle-item">
              <input type="checkbox" checked={!!features[key]} disabled={enabledCount === 1 && !!features[key]} onChange={e => setFeatures({ ...features, [key]: e.target.checked })} />
              <span>{FEATURES_META[key]?.icon || ""} {FEATURES_META[key]?.label || (key[0].toUpperCase() + key.slice(1))}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
/* ------------ Pane ------------ */
function Pane({ active, draft, onDraftChange, onRun }) {
  const [busy, setBusy] = useState(false);
  const input = draft?.input ?? "";
  const opts = draft?.opts ?? defaultPaneState[active]?.opts ?? {};

  const setOpts = (next) => onDraftChange({ opts: next });

  const run = async () => {
    setBusy(true);
    try {
      await onRun(input, opts);
    } finally {
      setBusy(false);
    }
  };

  const OptsUI = {
    summarize: (
      <div className="fai-opts-group">
        <div className="fai-segment" role="group" aria-label="Summarize mode">
          <button
            type="button"
            className={`fai-segment-btn${opts.summaryMode === "words" ? " active" : ""}`}
            aria-pressed={opts.summaryMode === "words"}
            onClick={() => setOpts({ ...opts, summaryMode: "words" })}>
            By words
          </button>
          <button
            type="button"
            className={`fai-segment-btn${opts.summaryMode === "length" ? " active" : ""}`}
            aria-pressed={opts.summaryMode === "length"}
            onClick={() => setOpts({ ...opts, summaryMode: "length" })}>
            By length
          </button>
        </div>
        {opts.summaryMode === "words" ? (
          <label className="fai-opt-label">
            Target words
            <input type="number" className="fai-opt-input fai-opt-input--num"
              min="30" max="800" value={opts.words}
              onChange={e => setOpts({ ...opts, words: Number(e.target.value) || 30 })} />
          </label>
        ) : (
          <label className="fai-opt-label">
            Length
            <select className="fai-select fai-opt-select" value={opts.length}
              onChange={e => setOpts({ ...opts, length: e.target.value })}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>
        )}
      </div>
    ),
    translate: (
      <label className="fai-opt-label">
        Translate to
        <input type="text" className="fai-opt-input" style={{ width: 90 }}
          value={opts.lang} placeholder="e.g. fr, es, bn"
          onChange={e => setOpts({ ...opts, lang: e.target.value })} />
      </label>
    ),
    proofread: (
      <span className="fai-opts-hint">Checks grammar, spelling &amp; punctuation automatically</span>
    ),
    rewrite: (
      <div className="fai-opts-group">
        <label className="fai-opt-label">
          Format
          <select className="fai-select fai-opt-select" value={opts.format || "paragraph"}
            onChange={e => setOpts({ ...opts, format: e.target.value })}>
            <option value="paragraph">Paragraph</option>
            <option value="points">Bullet Points</option>
            <option value="table">Table</option>
            <option value="tldr">TL;DR</option>
          </select>
        </label>
        <span className="fai-opts-sep">&middot;</span>
        <label className="fai-opt-label">
          Tone
          <select className="fai-select fai-opt-select" value={opts.tone || "neutral"}
            onChange={e => setOpts({ ...opts, tone: e.target.value })}>
            <option value="formal">Formal</option>
            <option value="neutral">Neutral</option>
            <option value="casual">Casual</option>
          </select>
        </label>
      </div>
    ),
    write: (
      <label className="fai-opt-label">
        Tone
        <select className="fai-select fai-opt-select" value={opts.tone}
          onChange={e => setOpts({ ...opts, tone: e.target.value })}>
          <option value="formal">Formal</option>
          <option value="neutral">Neutral</option>
          <option value="casual">Casual</option>
        </select>
      </label>
    ),
    pageinsight: (
      <div className="fai-opts-group">
        <div className="fai-segment" role="group" aria-label="Summary mode">
          <button
            type="button"
            className={`fai-segment-btn${opts.summaryMode === "words" ? " active" : ""}`}
            aria-pressed={opts.summaryMode === "words"}
            onClick={() => setOpts({ ...opts, summaryMode: "words" })}>
            By words
          </button>
          <button
            type="button"
            className={`fai-segment-btn${opts.summaryMode === "length" ? " active" : ""}`}
            aria-pressed={opts.summaryMode === "length"}
            onClick={() => setOpts({ ...opts, summaryMode: "length" })}>
            By length
          </button>
        </div>
        {opts.summaryMode === "words" ? (
          <label className="fai-opt-label">
            Target words
            <input type="number" className="fai-opt-input fai-opt-input--num"
              min="30" max="800" value={opts.words}
              onChange={e => setOpts({ ...opts, words: Number(e.target.value) || 30 })} />
          </label>
        ) : (
          <label className="fai-opt-label">
            Length
            <select className="fai-select fai-opt-select" value={opts.length}
              onChange={e => setOpts({ ...opts, length: e.target.value })}>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>
        )}
        <span className="fai-opts-sep">&middot;</span>
        <label className="fai-opt-label">
          Format
          <select className="fai-select fai-opt-select" value={opts.format || "paragraph"}
            onChange={e => setOpts({ ...opts, format: e.target.value })}>
            <option value="paragraph">Paragraph</option>
            <option value="points">Bullet Points</option>
            <option value="table">Table</option>
            <option value="tldr">TL;DR</option>
          </select>
        </label>
        <span className="fai-opts-sep">&middot;</span>
        <label className="fai-opt-label">
          Tone
          <select className="fai-select fai-opt-select" value={opts.tone || "neutral"}
            onChange={e => setOpts({ ...opts, tone: e.target.value })}>
            <option value="formal">Formal</option>
            <option value="neutral">Neutral</option>
            <option value="casual">Casual</option>
          </select>
        </label>
      </div>
    ),
  }[active];

  return (
    <div className="fai-pane">
      <div className="fai-opts-bar">{OptsUI}</div>
      {active === "pageinsight" ? (
        <div className="fai-page-info-card">
          <div className="fai-page-info-icon">{"\u2295"}</div>
          <div className="fai-page-info-body">
            <div className="fai-page-info-title">{document.title || "Untitled page"}</div>
            <div className="fai-page-info-domain">
              {(() => { try { return new URL(window.location.href).hostname; } catch { return window.location.hostname || ""; } })()}
            </div>
          </div>
          <div className="fai-page-info-badge">Live</div>
        </div>
      ) : (
        <textarea
          className="fai-input"
          value={input}
          onChange={(e) => onDraftChange({ input: e.target.value })}
          placeholder={active === "write" ? "Describe what you want written..." : "Paste or type your text here..."}
          disabled={busy}
        />
      )}
      <motion.button
        className={`fai-run-btn${busy ? " fai-run-btn--busy" : ""}`}
        onClick={run}
        disabled={busy}
        aria-label={active === "pageinsight" ? "Analyze page" : `Run ${active}`}
        whileTap={!busy ? { scale: 0.97 } : {}}
        whileHover={!busy ? { scale: 1.01 } : {}}>
        {busy
          ? <><span className="fai-spinner" />{active === "pageinsight" ? "Analyzing..." : "Processing..."}</>
          : <>{active === "pageinsight" ? "Analyze Page" : "Run"} {"\u203A"}</>}
      </motion.button>
    </div>
  );
}

/* ------------ Mount ------------ */
(() => {
  const id = "fai-root-mount";
  if (document.getElementById(id)) return;
  const host = document.createElement("div");
  host.id = id;

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = stylesText;

  const mount = document.createElement("div");
  mount.className = "fai-root";

  shadow.append(style, mount);
  document.documentElement.appendChild(host);
  createRoot(mount).render(<App />);
})();



