// src/bg.js — CreaText service worker (minimal — all AI calls go direct from content script)

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ enabled: true }, (s) => {
    if (s.enabled === undefined) chrome.storage.local.set({ enabled: true });
  });
});