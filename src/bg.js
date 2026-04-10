import { handleAiMessage } from "./geminiService";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled"], (store) => {
    if (typeof store.enabled === "undefined") chrome.storage.local.set({ enabled: true });
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type?.startsWith("__ai_")) return undefined;

  handleAiMessage(message)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Unknown AI error." }));

  return true;
});
