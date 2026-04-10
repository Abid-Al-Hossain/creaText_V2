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

export function getApiKey() {
  return sendAiMessage({ type: "__ai_get_api_key__" });
}

export function saveApiKey(key) {
  return sendAiMessage({ type: "__ai_save_api_key__", value: key });
}

export function summarize(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "summarize", text, options });
}

export function translate(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "translate", text, options });
}

export function proofread(text) {
  return sendAiMessage({ type: "__ai_run__", op: "proofread", text });
}

export function rewrite(text, mode = "paragraph") {
  return sendAiMessage({ type: "__ai_run__", op: "rewrite", text, options: { mode } });
}

export function write(text, options = {}) {
  return sendAiMessage({ type: "__ai_run__", op: "write", text, options });
}
