function sendAiMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Extension messaging failed."));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "AI request failed."));
        return;
      }
      resolve(response.result);
    });
  });
}

function streamAiMessage(message, { onStart, onChunk, onDone, signal } = {}) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: "__ai_stream__" });
    let settled = false;
    let abortHandler = null;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (signal && abortHandler) {
        try { signal.removeEventListener("abort", abortHandler); } catch {}
      }
      try { port.disconnect(); } catch {}
      fn(value);
    };

    port.onMessage.addListener((payload) => {
      if (!payload) return;
      if (payload.type === "start") {
        onStart?.(payload.meta || null);
        return;
      }
      if (payload.type === "chunk") {
        onChunk?.(payload.chunk || "", payload.meta || null);
        return;
      }
      if (payload.type === "done") {
        onDone?.(payload.result || null);
        finish(resolve, payload.result || null);
        return;
      }
      if (payload.type === "error") {
        finish(reject, new Error(payload.error || "AI streaming failed."));
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      const message = chrome.runtime.lastError?.message || "AI stream disconnected.";
      finish(reject, new Error(message));
    });

    if (signal) {
      abortHandler = () => {
        finish(reject, new Error("AI stream cancelled."));
      };
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    port.postMessage(message);
  });
}

export function getAiSettings() {
  return sendAiMessage({ type: "__ai_get_settings__" });
}

export function saveAiSettings(value) {
  return sendAiMessage({ type: "__ai_save_settings__", value });
}

export function summarize(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "summarize", text, options });
}

export function summarizeStream(text, options = {}, handlers = {}) {
  return streamAiMessage({ type: "__ai_stream_run__", op: "summarize", text, options }, handlers);
}

export function translate(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "translate", text, options });
}

export function translateStream(text, options = {}, handlers = {}) {
  return streamAiMessage({ type: "__ai_stream_run__", op: "translate", text, options }, handlers);
}

export function extract(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "extract", text, options });
}

export function proofread(text) {
  return sendAiMessage({ type: "__ai_run__", op: "proofread", text });
}

export function rewrite(text, options = {}) {
  const normalizedOptions =
    typeof options === "string"
      ? { format: options }
      : options;

  return sendAiMessage({ type: "__ai_run__", op: "rewrite", text, options: normalizedOptions });
}

export function rewriteStream(text, options = {}, handlers = {}) {
  const normalizedOptions =
    typeof options === "string"
      ? { format: options }
      : options;

  return streamAiMessage({ type: "__ai_stream_run__", op: "rewrite", text, options: normalizedOptions }, handlers);
}

export function write(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "write", text, options });
}

export function writeStream(text, options = {}, handlers = {}) {
  return streamAiMessage({ type: "__ai_stream_run__", op: "write", text, options }, handlers);
}
