// src/popup.jsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/* Retry sending a message to a tab until it lands or we give up.
   The content script may take a moment to mount React and register
   its onMessage listener, so we poll a few times. */
async function sendToTab(tabId, msg, { retries = 8, delayMs = 150 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, msg);
      return; // success
    } catch {
      // "Receiving end does not exist" — content script not ready yet
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function ensureContentScript(tabId) {
  // The content script is auto-injected via manifest on most pages.
  // This is a fallback for pages already open before the extension loaded.
  try {
    const mf = chrome.runtime.getManifest();
    const jsFiles = mf.content_scripts?.[0]?.js ?? [];
    for (const f of jsFiles) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [f],
        world: "ISOLATED",
      });
    }
  } catch {
    // Already injected, restricted page, etc. — ignore silently.
  }
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
      <div className="row">
        <div>
          <div style={{ fontWeight: 700 }}>CreaText</div>
          <div style={{ opacity: .8, fontSize: 12 }}>Toggle the floating bubble on pages</div>
        </div>
        <label>
          <input type="checkbox" checked={enabled} onChange={e => update(e.target.checked)} />
        </label>
      </div>
      <div className="row" style={{ gap: 8, padding: "12px 14px" }}>
        <button onClick={() => send("__open__")}>Show now</button>
        <button onClick={() => send("__open_settings__")}>Quick settings</button>
      </div>
      <div className="hint">Note: Won't show on chrome:// pages or the Web Store.</div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<Popup />);
