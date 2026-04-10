// src/popup.jsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/* Retry sendMessage until the content script's listener is ready */
async function sendToTab(tabId, msg, { retries = 8, delayMs = 150 } = {}) {
  for (let i = 0; i < retries; i++) {
    try { await chrome.tabs.sendMessage(tabId, msg); return; }
    catch { await new Promise(r => setTimeout(r, delayMs)); }
  }
}

async function ensureContentScript(tabId) {
  try {
    const mf = chrome.runtime.getManifest();
    const jsFiles = mf.content_scripts?.[0]?.js ?? [];
    for (const f of jsFiles) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [f], world: "ISOLATED" });
    }
  } catch {}
}

function Popup() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    chrome.storage.local.get({ enabled: true }, s => setEnabled(!!s.enabled));
  }, []);

  const update = async (v) => {
    await chrome.storage.local.set({ enabled: v });
    setEnabled(v);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await sendToTab(tab.id, { type: "__toggle__", enabled: v });
    } catch {}
  };

  const send = async (type) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:/i.test(tab.url || "")) return;
      await ensureContentScript(tab.id);
      await sendToTab(tab.id, { type });
    } catch {}
  };

  return (
    <>
      {/* Header */}
      <div className="popup-header">
        <div className="popup-logo">CT</div>
        <div className="popup-title-group">
          <div className="popup-title">CreaText</div>
          <div className="popup-sub">AI Writing Toolkit</div>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="popup-row">
        <span className="popup-row-label">Enable on this page</span>
        <label className="toggle-pill">
          <input type="checkbox" checked={enabled} onChange={e => update(e.target.checked)} />
          <span className="toggle-track" />
        </label>
      </div>

      {/* Action buttons */}
      <div className="popup-actions">
        <button className="popup-btn" onClick={() => send("__open__")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Show Now
        </button>
        <button className="popup-btn" onClick={() => send("__open_settings__")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>

      {/* Hint */}
      <div className="popup-hint">
        Won't show on <code style={{ fontSize: 10, opacity: .75 }}>chrome://</code> pages or the Web Store.
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<Popup />);
