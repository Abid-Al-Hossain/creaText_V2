import { handleAiMessage, handleAiStream } from "./aiService";

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "__ai_stream__") return;

  const controller = new AbortController();
  let started = false;

  port.onDisconnect.addListener(() => {
    controller.abort();
  });

  port.onMessage.addListener((message) => {
    if (started || message?.type !== "__ai_stream_run__") return;
    started = true;

    handleAiStream(message, {
      signal: controller.signal,
      onStart(meta) {
        try { port.postMessage({ type: "start", meta }); } catch {}
      },
      onChunk(chunk, meta) {
        try { port.postMessage({ type: "chunk", chunk, meta }); } catch {}
      },
      onDone(result) {
        try { port.postMessage({ type: "done", result }); } catch {}
        try { port.disconnect(); } catch {}
      },
      onError(error) {
        try { port.postMessage({ type: "error", error: error?.message || "Unknown AI error." }); } catch {}
        try { port.disconnect(); } catch {}
      },
    });
  });
});
