// src/content.jsx
import stylesText from "./style.css?inline";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  summarize, translate, rewrite, proofread, write,
  getApiKey, saveApiKey,
} from "./aiBuiltins";

/* ------------ Config ------------ */
const defaultPos = { left: null, right: 24, top: null, bottom: 24, width: 720, height: 580 };
const defaultTheme = {
  bg: "", border: "", accent: "", text: "", bubble: 46,
  bgRaw: "", borderRaw: "", accentRaw: "", textRaw: ""
};
const defaultFeatures = { summarize: true, translate: true, proofread: true, rewrite: true, write: false };

const THEME_PRESETS = {
  default:  { bg: "rgba(13,17,28,.98)",    border: "rgba(255,255,255,.09)", accent: "#818cf8", text: "#e2e8f0" },
  ocean:    { bg: "rgba(8,18,32,.97)",     border: "#1e3a5f",              accent: "#60a5fa", text: "#e6f2ff" },
  forest:   { bg: "rgba(11,20,16,.97)",    border: "#1c3b33",              accent: "#34d399", text: "#e8f5f0" },
  midnight: { bg: "rgba(12,12,18,.97)",    border: "#262a40",              accent: "#a78bfa", text: "#f3f4f6" },
  sunrise:  { bg: "rgba(255,248,240,.97)", border: "#ffd8b5",              accent: "#fb923c", text: "#2b1a10" },
  lavender: { bg: "rgba(248,245,255,.97)", border: "#d9ccff",              accent: "#7c3aed", text: "#231b3a" },
};

const FEATURES_META = {
  summarize: { icon: "◈", label: "Summarize", desc: "Condense text to key points" },
  translate:  { icon: "⇆", label: "Translate",  desc: "Convert to any language"      },
  proofread:  { icon: "◎", label: "Proofread",  desc: "Fix grammar & spelling"       },
  rewrite:    { icon: "↺", label: "Rewrite",    desc: "Restructure & rephrase"       },
  write:      { icon: "✎", label: "Write",      desc: "Generate from a prompt"       },
};

/* ------------ Spring presets ------------ */
const SPRING_SNAPPY = { type: "spring", stiffness: 320, damping: 24 };
const SPRING_SOFT   = { type: "spring", stiffness: 220, damping: 22 };

/* ------------ Storage hook ------------ */
function useStorage(key, initial) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    try {
      chrome.storage.local.get({ [key]: initial }, s => setVal(s[key]));
    } catch { /* Context invalid */ }
  }, [key]);
  useEffect(() => {
    const l = (c) => { if (key in c) setVal(c[key].newValue); };
    try {
      chrome.storage.local.onChanged.addListener(l);
      return () => { try { chrome.storage.local.onChanged.removeListener(l); } catch {} };
    } catch { return () => {}; }
  }, [key]);
  const save = useCallback((next) => chrome.storage.local.set({ [key]: next }), [key]);
  return [val, save];
}

/* ------------ Helpers ------------ */
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function isColorLike(s) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) || /^rgb/i.test(s) || /^hsl/i.test(s); }
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
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
function ResultCard({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  return (
    <motion.div className="fai-result"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}>
      <div className="fai-result-text">{text}</div>
      <button className={`fai-copy-btn${copied ? " fai-copy-btn--copied" : ""}`}
        onClick={handleCopy} title="Copy to clipboard" aria-label="Copy result">
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </motion.div>
  );
}

/* ------------ App ------------ */
function App() {
  const [enabled, setEnabled] = useStorage("enabled", true);
  const [pos, setPos]         = useStorage("fai_pos", defaultPos);
  const [theme, setTheme]     = useStorage("fai_theme", defaultTheme);
  const [features, setFeatures] = useStorage("fai_features", defaultFeatures);
  const [preset, setPreset]   = useStorage("fai_theme_preset", "default");

  const [active, setActive]           = useState("summarize");
  const [open, setOpen]               = useState(false);
  const [status, setStatus]           = useState({ text: "", loading: false });
  const [results, setResults]         = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [paneKey, setPaneKey]         = useState(1);

  const setStatusMsg = (text, loading = false) => setStatus({ text, loading });

  useEffect(() => {
    const handler = (msg) => {
      if (msg?.type === "__toggle__")        setEnabled(msg.enabled);
      if (msg?.type === "__open__")          { setEnabled(true); setOpen(true); }
      if (msg?.type === "__open_settings__") { setEnabled(true); setOpen(true); setShowSettings(true); }
    };
    try {
      chrome.runtime.onMessage.addListener(handler);
      return () => { try { chrome.runtime.onMessage.removeListener(handler); } catch {} };
    } catch {
      return () => {};
    }
  }, [setEnabled]);

  const varStyle = (() => {
    if (preset === "custom") {
      const bg     = theme.bg     || THEME_PRESETS.default.bg;
      const border = theme.border || THEME_PRESETS.default.border;
      const accent = theme.accent || THEME_PRESETS.default.accent;
      const text   = theme.text   || THEME_PRESETS.default.text;
      return {
        "--fai-bg": bg, "--fai-surface": bg,
        "--fai-border": border, "--fai-accent": accent, "--fai-text": text,
        "--fai-bubble-size": `${Number(theme.bubble) || 46}px`,
      };
    }
    return { "--fai-bubble-size": `${Number(theme.bubble) || 46}px` };
  })();

  /* --- Drag --- */
  const dragState = useRef(null);
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);

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
  const onResizeStart = (e) => {
    e.stopPropagation();
    const p = posRef.current;
    resizeState.current = {
      startWidth: p.width || 720, startHeight: p.height || 580,
      startX: e.clientX, startY: e.clientY,
    };
    window.addEventListener("pointermove", onResizing);
    window.addEventListener("pointerup", onResizeEnd);
  };
  const onResizing = (e) => {
    if (!resizeState.current) return;
    const dx = e.clientX - resizeState.current.startX;
    const dy = e.clientY - resizeState.current.startY;
    setPos({ ...posRef.current,
      width:  Math.max(560, resizeState.current.startWidth  + dx),
      height: Math.max(400, resizeState.current.startHeight + dy),
    });
  };
  const onResizeEnd = () => {
    resizeState.current = null;
    window.removeEventListener("pointermove", onResizing);
    window.removeEventListener("pointerup", onResizeEnd);
  };

  const bubble      = Number(theme.bubble) || 46;
  const presetClass = (preset && preset !== "custom" && preset !== "default") ? `theme-${preset}` : "";
  const activeMeta  = FEATURES_META[active] || {};

  /* --- Run AI --- */
  const runOp = async (op, text, opts) => {
    if (!text?.trim()) { setStatusMsg("⚠️ Please enter some text."); setTimeout(() => setStatusMsg(""), 2000); return; }
    const labels = { summarize: "Summarizing", translate: "Translating", proofread: "Proofreading", rewrite: "Rewriting", write: "Writing" };
    setStatusMsg(`${labels[op] || "Processing"}…`, true);
    setResults([]);
    try {
      let result = "";
      if      (op === "summarize") {
        const summaryOpts = opts.summaryMode === "length"
          ? { length: opts.length }
          : { words: opts.words };
        result = await summarize(text, summaryOpts);
      }
      else if (op === "translate") { result = await translate(text, { to: opts.lang || "en" }); }
      else if (op === "proofread") {
        const res = await proofread(text);
        const corrected = res?.correctedText || String(res);
        const changes   = Array.isArray(res?.changes) && res.changes.length
          ? "\n\n📝 Changes:\n" + res.changes.map(c => `• ${c}`).join("\n") : "";
        result = corrected + changes;
      }
      else if (op === "rewrite") { result = await rewrite(text, opts.mode || "paragraph"); }
      else if (op === "write")   { result = await write(text, { tone: opts.tone || "neutral" }); }

      setResults([{ id: Date.now(), text: result }]);
      setStatusMsg("✅ Done!");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err) {
      if (err.message === "NO_API_KEY") {
        setStatusMsg("🔑 Add your Gemini API key in ⚙️ Settings.");
        setTimeout(() => setStatusMsg(""), 6000);
      } else {
        setStatusMsg(`❌ ${err.message || "An error occurred."}`);
        setTimeout(() => setStatusMsg(""), 6000);
      }
    }
  };

  return !enabled ? null : (
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
          className={`fai-drawer ${presetClass}`}
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          transition={SPRING_SOFT}
          style={{ left: pos.left, right: pos.right, top: pos.top, bottom: pos.bottom, width: pos.width, height: pos.height, ...varStyle }}>

          {/* ── Sidebar ── */}
          <div className="fai-sidebar">
            <div className="fai-head" onPointerDown={onDragStart}>
              <div className="fai-logo-mark">CT</div>
              <div className="fai-title">CreaText</div>
              <div className="fai-actions">
                <button className="fai-iconbtn" aria-label="Settings" title="Settings"
                  onClick={() => setShowSettings(s => !s)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                <button className="fai-iconbtn fai-iconbtn--close" aria-label="Close" title="Close"
                  onClick={() => setOpen(false)}>
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
                    onClick={() => { setActive(k); setShowSettings(false); setPaneKey(p => p + 1); setResults([]); }}>
                    <span className="fai-nav-icon">{meta.icon}</span>
                    <span className="fai-nav-label">{meta.label}</span>
                    {isActive && (
                      <motion.span className="fai-nav-indicator" layoutId="nav-indicator"
                        transition={SPRING_SNAPPY} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="fai-sidebar-footer">
              <span className="fai-sidebar-badge">Gemini 2.5</span>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="fai-body">
            {showSettings ? (
              <Settings
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
                <Pane key={paneKey} active={active}
                  onRun={(input, opts) => runOp(active, input, opts)} />
              </>
            )}

            <AnimatePresence>
              {results.length > 0 && (
                <motion.div className="fai-results" aria-live="polite"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}>
                  {results.map(r => <ResultCard key={r.id} text={r.text} />)}
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

            <div className="fai-resize" onPointerDown={onResizeStart} title="Resize" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------ Settings ------------ */
function Settings({ theme, setTheme, preset, setPreset, bubble, features, setFeatures }) {
  const [colorModal, setColorModal] = useState({ open: false, key: "", label: "" });
  const [apiKey, setApiKey]         = useState("");
  const [showKey, setShowKey]       = useState(false);
  const [keySaved, setKeySaved]     = useState(false);
  const prevThemeRef = useRef(theme);
  const isCustom = preset === "custom";

  useEffect(() => { getApiKey().then(k => setApiKey(k || "")); }, []);

  const handleSaveKey = async () => {
    await saveApiKey(apiKey.trim());
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
      const base = THEME_PRESETS.default;
      setTheme({ ...theme, bg: base.bg, border: base.border, accent: base.accent, text: base.text,
        bgRaw: base.bg, borderRaw: base.border, accentRaw: base.accent, textRaw: base.text });
    } else {
      setTheme({ ...theme, bg:"",border:"",accent:"",text:"",bgRaw:"",borderRaw:"",accentRaw:"",textRaw:"" });
    }
    setPreset(name);
  };

  const openModal  = (key, label) => { if (!isCustom) return; prevThemeRef.current = { ...theme }; setColorModal({ open: true, key, label }); };
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
      {/* API Key */}
      <div className="fai-settings-section">
        <div className="fai-settings-section-title">AI Connection</div>
        <div className="fai-apikey-label">
          <span>Gemini API Key</span>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="fai-apikey-link">
            Get free key ↗
          </a>
        </div>
        <div className="fai-apikey-row">
          <input className="fai-apikey-input" type={showKey ? "text" : "password"}
            placeholder="Paste your Gemini API key here…" value={apiKey}
            onChange={e => setApiKey(e.target.value)} onFocus={e => e.target.select()}
            spellCheck={false} aria-label="Gemini API key" />
          <button className="fai-eye-btn" type="button" onClick={() => setShowKey(v => !v)}
            title={showKey ? "Hide key" : "Show key"}>
            {showKey ? "🙈" : "👁️"}
          </button>
          <button className={`fai-pop-btn${keySaved ? " fai-pop-btn--done" : ""}`}
            style={{ whiteSpace: "nowrap" }} onClick={handleSaveKey}>
            {keySaved ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>

      <div className="fai-settings-divider" />

      {/* Theme */}
      <div className="fai-settings-section">
        <div className="fai-settings-section-title">Appearance</div>
        <div className="fai-settings-row">
          <label className="fai-settings-label">Theme</label>
          <select value={preset} onChange={e => onPresetChange(e.target.value)}
            className="fai-select" aria-label="Choose theme">
            <option value="default">Default</option>
            <option value="ocean">Ocean</option>
            <option value="forest">Forest</option>
            <option value="midnight">Midnight</option>
            <option value="sunrise">Sunrise</option>
            <option value="lavender">Lavender</option>
            <option value="custom">Custom</option>
          </select>
          <button type="button" onClick={() => onPresetChange("default")}
            className="fai-reset-btn" title="Reset to default">Reset</button>
        </div>

        <div className="fai-settings-row" style={{ marginTop: 10 }}>
          <label className="fai-settings-label">Bubble size</label>
          <input className="fai-range" type="range" min="32" max="56" value={bubble}
            onChange={onBubbleChange} style={{ flex: 1, ["--val"]: `${rangePercent}%` }} />
          <span style={{ opacity: .75, fontSize: 12, minWidth: 32, textAlign: "right" }}>{bubble}px</span>
        </div>

        {isCustom && (
          <>
            <div className="fai-grid" style={{ marginTop: 12 }}>
              <ColorSwatch label="Panel"  color={theme.bg     || theme.bgRaw}     onOpen={() => openModal("bg",     "Panel Color")} />
              <ColorSwatch label="Border" color={theme.border || theme.borderRaw} onOpen={() => openModal("border", "Border Color")} />
              <ColorSwatch label="Accent" color={theme.accent || theme.accentRaw} onOpen={() => openModal("accent", "Accent Color")} />
            </div>
            <div className="fai-settings-row" style={{ marginTop: 10 }}>
              <label className="fai-settings-label">Text color</label>
              <select value={currentTone} onChange={e => setTextTone(e.target.value)}
                className="fai-select" aria-label="Text color">
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

      {/* Features */}
      <div className="fai-settings-section">
        <div className="fai-settings-section-title">Features</div>
        <div className="fai-feature-toggles">
          {Object.keys(features).map(key => (
            <label key={key} className="fai-toggle-item">
              <input type="checkbox" checked={!!features[key]}
                onChange={e => setFeatures({ ...features, [key]: e.target.checked })} />
              <span>{FEATURES_META[key]?.icon || ""} {key[0].toUpperCase() + key.slice(1)}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------ Pane ------------ */
function Pane({ active, onRun }) {
  const taRef = useRef(null);
  const [opts, setOpts] = useState({
    summaryMode: "words",
    words: 120,
    length: "medium",
    lang: "en",
    tone: "neutral",
    mode: "paragraph",
  });
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    await onRun(taRef.current.value, opts);
    setBusy(false);
  };

  const OptsUI = {
    summarize: (
      <div className="fai-opts-group">
        <div className="fai-segment" role="tablist" aria-label="Summarize mode">
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
      <label className="fai-opt-label">
        Mode
        <select className="fai-select fai-opt-select" value={opts.mode}
          onChange={e => setOpts({ ...opts, mode: e.target.value })}>
          <option value="key-points">Key Points</option>
          <option value="paragraph">New Paragraph</option>
          <option value="table">Table</option>
          <option value="tone:formal">Tone: Formal</option>
          <option value="tone:neutral">Tone: Neutral</option>
          <option value="tone:casual">Tone: Casual</option>
        </select>
      </label>
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
  }[active];

  return (
    <div className="fai-pane">
      <div className="fai-opts-bar">{OptsUI}</div>
      <textarea
        className="fai-input"
        ref={taRef}
        placeholder={active === "write" ? "Describe what you want written…" : "Paste or type your text here…"}
        disabled={busy}
      />
      <motion.button
        className={`fai-run-btn${busy ? " fai-run-btn--busy" : ""}`}
        onClick={run}
        disabled={busy}
        aria-label={`Run ${active}`}
        whileTap={!busy ? { scale: 0.97 } : {}}
        whileHover={!busy ? { scale: 1.01 } : {}}>
        {busy
          ? <><span className="fai-spinner" />Processing…</>
          : <>Run  ›</>}
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
