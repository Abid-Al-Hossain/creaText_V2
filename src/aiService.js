import {
  ALLOWED_GEMINI_MODELS,
  ALLOWED_GROQ_MODELS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  getGroqModelLabel,
  getGroqModelOption,
  GROQ_MODEL_OPTIONS,
  GPT_OSS_MODELS,
  OPENROUTER_FREE_MODEL,
} from "./providerCatalog";

const PROVIDER_META = {
  gemini: {
    label: "Gemini",
    keyStorage: "gemini_api_key",
  },
  groq: {
    label: "Groq",
    keyStorage: "groq_api_key",
  },
  openrouter: {
    label: "OpenRouter",
    keyStorage: "openrouter_api_key",
  },
};

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_RATE_LIMIT_STORAGE_KEY = "groq_rate_limit_state";

const PROOFREAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    correctedText: { type: "string" },
    changes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["correctedText", "changes"],
};

function storageGetMany(defaults) {
  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (store) => resolve(store || defaults));
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumberHeader(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getGroqRateLimitSnapshot(headers, model) {
  const remainingRequests = parseNumberHeader(headers.get("x-ratelimit-remaining-requests"));
  const remainingTokens = parseNumberHeader(headers.get("x-ratelimit-remaining-tokens"));
  const limitRequests = parseNumberHeader(headers.get("x-ratelimit-limit-requests"));
  const limitTokens = parseNumberHeader(headers.get("x-ratelimit-limit-tokens"));
  const resetRequests = headers.get("x-ratelimit-reset-requests") || "";
  const resetTokens = headers.get("x-ratelimit-reset-tokens") || "";

  if (
    remainingRequests === null &&
    remainingTokens === null &&
    limitRequests === null &&
    limitTokens === null &&
    !resetRequests &&
    !resetTokens
  ) {
    return null;
  }

  return {
    model,
    limitRequests,
    remainingRequests,
    resetRequests,
    limitTokens,
    remainingTokens,
    resetTokens,
    updatedAt: Date.now(),
  };
}

function saveGroqRateLimitSnapshot(headers, model) {
  const snapshot = getGroqRateLimitSnapshot(headers, model);
  if (!snapshot) return Promise.resolve();
  return storageSet({ [GROQ_RATE_LIMIT_STORAGE_KEY]: snapshot });
}

function getFriendlyError(provider, status, apiMessage) {
  const label = PROVIDER_META[provider]?.label || "AI";
  if (status === 401 || status === 403) return `${label} API key invalid or not authorized. Check Settings.`;
  if (status === 429) return `${label} rate limit hit. Wait a moment and try again.`;
  if (status >= 500) return `${label} server error (${status}). ${apiMessage || "Try again in a moment."}`;
  return apiMessage || `${label} API error (${status})`;
}

function normalizeGeminiModel(model) {
  return ALLOWED_GEMINI_MODELS.has(model) ? model : DEFAULT_GEMINI_MODEL;
}

function normalizeGroqModel(model) {
  return ALLOWED_GROQ_MODELS.has(model) ? model : DEFAULT_GROQ_MODEL;
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function getGroqMaxCompletionTokens(model, prompt, requestedMaxTokens) {
  if (!GPT_OSS_MODELS.has(model)) return requestedMaxTokens;
  const estimatedPromptTokens = estimateTokens(prompt);
  if (estimatedPromptTokens > 5000) return Math.min(requestedMaxTokens, 384);
  if (estimatedPromptTokens > 4000) return Math.min(requestedMaxTokens, 640);
  if (estimatedPromptTokens > 3000) return Math.min(requestedMaxTokens, 1024);
  return requestedMaxTokens;
}

function getGroqTooLargeError(model) {
  const label = getGroqModelLabel(model);
  return `This input is likely too large for ${label} on current Groq free-tier limits. Try Llama 4 Scout for larger text.`;
}

function getGeminiUrl(model, key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

function getGeminiStreamUrl(model, key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
}

function getModeProvider(mode) {
  if (mode === "speed") return "groq";
  if (mode === "best_effort") return "openrouter";
  return "gemini";
}

function getGeminiCandidateText(candidate) {
  return candidate?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";
}

function getGeminiFinishReasonError(finishReason) {
  const reason = String(finishReason || "").toUpperCase();
  if (!reason || reason === "STOP") return "";
  if (reason === "MAX_TOKENS") return "Response was truncated by Gemini. Try a shorter input.";
  if (reason === "SAFETY") return "Response was blocked by Gemini safety filters.";
  if (reason === "RECITATION") return "Response was blocked due to recitation limits.";
  return `Gemini stopped with finish reason: ${finishReason}.`;
}

function getOpenAiFinishReasonError(finishReason, providerLabel) {
  const reason = String(finishReason || "").toLowerCase();
  if (!reason || reason === "stop") return "";
  if (reason === "length") return `Response was truncated by ${providerLabel}. Try a shorter input.`;
  if (reason === "content_filter") return `Response was blocked by ${providerLabel} safety filters.`;
  if (reason === "tool_calls") return `${providerLabel} returned tool calls instead of text output.`;
  return `${providerLabel} stopped with finish reason: ${finishReason}.`;
}

function getOpenAiMessageText(message) {
  if (typeof message?.content === "string") return message.content.trim();
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function isRetriableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function isProviderPolicyBlock(message) {
  return /blocked|safety|recitation|refused|content filter|content_filter/i.test(String(message || ""));
}

function shouldTryNextProvider(error) {
  if (!error) return false;
  if (error.retriable) return true;
  if (isProviderPolicyBlock(error.message)) return false;
  return true;
}

function trimErrorMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim();
}

function buildBestEffortError(failures) {
  if (!failures.length) return new Error("Best Effort could not run because no provider key is saved.");
  if (failures.length === 1) return new Error(failures[0].message);

  // Deduplicate: keep only the last failure per provider to avoid noisy repeated Groq entries
  const byProvider = {};
  for (const f of failures) byProvider[f.provider] = f;
  const deduped = Object.values(byProvider);

  if (deduped.length === 1) return new Error(deduped[0].message);

  const summary = deduped
    .map((f) => `${PROVIDER_META[f.provider]?.label || f.provider}: ${trimErrorMessage(f.message)}`)
    .join(" | ");
  return new Error(`Best Effort exhausted all saved providers. ${summary}`);
}

async function withRetries(work, { retries = 2, delays = [500, 1200] } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await work(attempt);
    } catch (error) {
      lastError = error;
      if (!error?.retriable || attempt === retries) break;
      await sleep(delays[attempt] ?? delays[delays.length - 1] ?? 800);
    }
  }
  throw lastError;
}

async function generateGeminiText(prompt, apiKey, options = {}) {
  const model = normalizeGeminiModel(options.model);
  const generationConfig = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  };

  if (options.responseMimeType) generationConfig.responseMimeType = options.responseMimeType;
  if (options.responseSchema) generationConfig.responseSchema = options.responseSchema;
  if (options.responseJsonSchema) generationConfig.responseJsonSchema = options.responseJsonSchema;

  const data = await withRetries(async () => {
    let res;
    try {
      res = await fetch(getGeminiUrl(model, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      });
    } catch {
      const error = new Error("Gemini network request failed. Check your connection, VPN, or firewall.");
      error.retriable = true;
      throw error;
    }

    if (!res.ok) {
      let apiMessage = "";
      try {
        const err = await res.json();
        apiMessage = err?.error?.message || "";
      } catch {}
      const error = new Error(getFriendlyError("gemini", res.status, apiMessage));
      error.retriable = isRetriableStatus(res.status);
      throw error;
    }

    return res.json();
  });

  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Prompt blocked by Gemini: ${data.promptFeedback.blockReason}.`);
  }

  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidate response.");

  const finishReasonError = getGeminiFinishReasonError(candidate.finishReason);
  if (finishReasonError) throw new Error(finishReasonError);

  const text = getGeminiCandidateText(candidate);
  if (!text) throw new Error("Gemini returned an empty response.");

  return { text, actualModel: model };
}

async function generateGroqText(prompt, apiKey, options = {}) {
  const model = normalizeGroqModel(options.model || DEFAULT_GROQ_MODEL);
  const messages = [];
  if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: prompt });

  const maxCompletionTokens = getGroqMaxCompletionTokens(model, prompt, options.maxTokens ?? 2048);
  if (GPT_OSS_MODELS.has(model) && estimateTokens(prompt) + maxCompletionTokens > 7600) {
    throw new Error(getGroqTooLargeError(model));
  }

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_completion_tokens: maxCompletionTokens,
  };

  if (options.responseFormat) body.response_format = options.responseFormat;

  const data = await withRetries(async () => {
    let res;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      const error = new Error("Groq network request failed. Check your connection, VPN, or firewall.");
      error.retriable = true;
      throw error;
    }

    await saveGroqRateLimitSnapshot(res.headers, body.model);

    if (!res.ok) {
      let apiMessage = "";
      try {
        const err = await res.json();
        apiMessage = err?.error?.message || err?.message || "";
      } catch {}
      if (/too big|too large|request too/i.test(apiMessage) && GPT_OSS_MODELS.has(model)) {
        const error = new Error(getGroqTooLargeError(model));
        error.retriable = false;
        throw error;
      }
      const error = new Error(getFriendlyError("groq", res.status, apiMessage));
      error.retriable = isRetriableStatus(res.status);
      throw error;
    }

    return res.json();
  });

  const choice = data?.choices?.[0];
  if (!choice) throw new Error("Groq returned no completion choice.");

  const finishReasonError = getOpenAiFinishReasonError(choice.finish_reason, "Groq");
  if (finishReasonError) throw new Error(finishReasonError);

  const refusal = choice?.message?.refusal;
  if (refusal) throw new Error(`Groq refused the request: ${refusal}`);

  const text = getOpenAiMessageText(choice?.message);
  if (!text) throw new Error("Groq returned an empty response.");

  return { text, actualModel: model };
}

async function generateOpenRouterText(prompt, apiKey, options = {}) {
  const body = {
    model: options.model || OPENROUTER_FREE_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
    provider: {
      allow_fallbacks: true,
      require_parameters: Boolean(options.responseFormat),
    },
  };

  if (options.responseFormat) body.response_format = options.responseFormat;

  const data = await withRetries(async () => {
    let res;
    try {
      res = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://github.com/Abid-Al-Hossain/creaText_V2",
          "X-OpenRouter-Title": "CreaText V2",
        },
        body: JSON.stringify(body),
      });
    } catch {
      const error = new Error("OpenRouter network request failed. Check your connection, VPN, or firewall.");
      error.retriable = true;
      throw error;
    }

    if (!res.ok) {
      let apiMessage = "";
      try {
        const err = await res.json();
        apiMessage = err?.error?.message || err?.message || "";
      } catch {}
      const error = new Error(getFriendlyError("openrouter", res.status, apiMessage));
      error.retriable = isRetriableStatus(res.status);
      throw error;
    }

    return res.json();
  });

  const choice = data?.choices?.[0];
  if (!choice) throw new Error("OpenRouter returned no completion choice.");

  const finishReasonError = getOpenAiFinishReasonError(choice.finish_reason, "OpenRouter");
  if (finishReasonError) throw new Error(finishReasonError);

  const refusal = choice?.message?.refusal;
  if (refusal) throw new Error(`OpenRouter refused the request: ${refusal}`);

  const text = getOpenAiMessageText(choice?.message);
  if (!text) throw new Error("OpenRouter returned an empty response.");

  return { text, actualModel: data?.model || body.model };
}

async function readSseStream(response, { signal, onData }) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming response body is unavailable.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const eventText of events) {
      const dataLines = eventText
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      if (!dataLines.length) continue;
      const payload = dataLines.join("\n");
      if (payload === "[DONE]") return;
      onData(payload);
    }
  }

  if (buffer.trim()) {
    const dataLines = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const payload of dataLines) {
      if (payload === "[DONE]") return;
      onData(payload);
    }
  }
}

function getDeltaFromAggregate(nextText, state) {
  const safeNext = String(nextText || "");
  const previous = state.text || "";
  if (!safeNext) return "";
  if (safeNext.startsWith(previous)) {
    state.text = safeNext;
    return safeNext.slice(previous.length);
  }
  state.text = previous + safeNext;
  return safeNext;
}

async function streamGeminiText(prompt, apiKey, options = {}, handlers = {}) {
  const model = normalizeGeminiModel(options.model);
  const generationConfig = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  };
  const state = { text: "" };

  let res;
  try {
    res = await fetch(getGeminiStreamUrl(model, apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: handlers.signal,
    });
  } catch {
    const error = new Error("Gemini network request failed. Check your connection, VPN, or firewall.");
    error.retriable = true;
    throw error;
  }

  if (!res.ok) {
    let apiMessage = "";
    try {
      const err = await res.json();
      apiMessage = err?.error?.message || "";
    } catch {}
    const error = new Error(getFriendlyError("gemini", res.status, apiMessage));
    error.retriable = isRetriableStatus(res.status);
    throw error;
  }

  handlers.onStart?.({ provider: "gemini", model });

  await readSseStream(res, {
    signal: handlers.signal,
    onData(payload) {
      const data = JSON.parse(payload);
      if (data?.promptFeedback?.blockReason) {
        throw new Error(`Prompt blocked by Gemini: ${data.promptFeedback.blockReason}.`);
      }
      const candidate = data?.candidates?.[0];
      if (!candidate) return;
      const finishReasonError = getGeminiFinishReasonError(candidate.finishReason);
      if (finishReasonError) throw new Error(finishReasonError);
      const delta = getDeltaFromAggregate(getGeminiCandidateText(candidate), state);
      if (delta) handlers.onChunk?.(delta, { provider: "gemini", model });
    },
  });

  if (!state.text.trim()) throw new Error("Gemini returned an empty response.");
  return { text: state.text, actualModel: model };
}

async function streamOpenAiCompatibleText(url, provider, prompt, apiKey, options = {}, handlers = {}) {
  const model =
    provider === "groq"
      ? normalizeGroqModel(options.model || DEFAULT_GROQ_MODEL)
      : (options.model || OPENROUTER_FREE_MODEL);

  const body = {
    model,
    messages: [],
    temperature: options.temperature ?? 0.7,
    stream: true,
  };

  if (provider === "groq") {
    if (options.systemPrompt) body.messages.push({ role: "system", content: options.systemPrompt });
    body.messages.push({ role: "user", content: prompt });
    body.max_completion_tokens = getGroqMaxCompletionTokens(model, prompt, options.maxTokens ?? 2048);
    if (GPT_OSS_MODELS.has(model) && estimateTokens(prompt) + body.max_completion_tokens > 7600) {
      throw new Error(getGroqTooLargeError(model));
    }
  } else {
    body.messages = [{ role: "user", content: prompt }];
    body.max_tokens = options.maxTokens ?? 2048;
    body.provider = {
      allow_fallbacks: true,
      require_parameters: false,
    };
  }

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(provider === "openrouter"
          ? {
              "HTTP-Referer": "https://github.com/Abid-Al-Hossain/creaText_V2",
              "X-OpenRouter-Title": "CreaText V2",
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch {
    const error = new Error(`${PROVIDER_META[provider].label} network request failed. Check your connection, VPN, or firewall.`);
    error.retriable = true;
    throw error;
  }

  if (provider === "groq") {
    await saveGroqRateLimitSnapshot(res.headers, body.model);
  }

  if (!res.ok) {
    let apiMessage = "";
    try {
      const err = await res.json();
      apiMessage = err?.error?.message || err?.message || "";
    } catch {}
    if (provider === "groq" && /too big|too large|request too/i.test(apiMessage) && GPT_OSS_MODELS.has(model)) {
      const error = new Error(getGroqTooLargeError(model));
      error.retriable = false;
      throw error;
    }
    const error = new Error(getFriendlyError(provider, res.status, apiMessage));
    error.retriable = isRetriableStatus(res.status);
    throw error;
  }

  const actualModel = provider === "openrouter" ? (res.headers.get("x-openrouter-model") || model) : model;
  handlers.onStart?.({ provider, model: actualModel });

  let text = "";
  await readSseStream(res, {
    signal: handlers.signal,
    onData(payload) {
      const data = JSON.parse(payload);
      const choice = data?.choices?.[0];
      if (!choice) return;
      const finishReasonError = getOpenAiFinishReasonError(choice.finish_reason, PROVIDER_META[provider].label);
      if (finishReasonError) throw new Error(finishReasonError);
      const refusal = choice?.message?.refusal || choice?.delta?.refusal;
      if (refusal) throw new Error(`${PROVIDER_META[provider].label} refused the request: ${refusal}`);
      const delta = typeof choice?.delta?.content === "string" ? choice.delta.content : "";
      if (!delta) return;
      text += delta;
      handlers.onChunk?.(delta, { provider, model: actualModel });
    },
  });

  if (!text.trim()) throw new Error(`${PROVIDER_META[provider].label} returned an empty response.`);
  return { text, actualModel };
}

async function getRuntimeConfig() {
  const store = await storageGetMany({
    ai_provider_mode: "accuracy",
    ai_accuracy_model: DEFAULT_GEMINI_MODEL,
    ai_speed_model: DEFAULT_GROQ_MODEL,
    gemini_api_key: "",
    groq_api_key: "",
    openrouter_api_key: "",
  });
  const mode = ["accuracy", "speed", "best_effort"].includes(store.ai_provider_mode)
    ? store.ai_provider_mode
    : "accuracy";

  return {
    mode,
    provider: getModeProvider(mode),
    accuracyModel: normalizeGeminiModel(store.ai_accuracy_model),
    speedModel: normalizeGroqModel(store.ai_speed_model),
    geminiApiKey: String(store.gemini_api_key || "").trim(),
    groqApiKey: String(store.groq_api_key || "").trim(),
    openrouterApiKey: String(store.openrouter_api_key || "").trim(),
  };
}

async function runTextWithProvider(provider, apiKey, prompt, options = {}) {
  if (provider === "groq") return generateGroqText(prompt, apiKey, options);
  if (provider === "openrouter") return generateOpenRouterText(prompt, apiKey, options);
  return generateGeminiText(prompt, apiKey, options);
}

async function streamTextWithProvider(provider, apiKey, prompt, options = {}, handlers = {}) {
  if (provider === "groq") {
    return streamOpenAiCompatibleText(GROQ_CHAT_URL, "groq", prompt, apiKey, options, handlers);
  }
  if (provider === "openrouter") {
    return streamOpenAiCompatibleText(OPENROUTER_CHAT_URL, "openrouter", prompt, apiKey, options, handlers);
  }
  return streamGeminiText(prompt, apiKey, options, handlers);
}

function getBestEffortAttempts(runtime) {
  const attempts = [];

  if (runtime.geminiApiKey) {
    attempts.push({ provider: "gemini", apiKey: runtime.geminiApiKey, model: runtime.accuracyModel });
  }

  if (runtime.groqApiKey) {
    // Expand all Groq models — each has its own separate TPM/RPD quota bucket.
    // User's selected model goes first, then the remaining catalog models in order.
    const allGroqModels = GROQ_MODEL_OPTIONS.map((opt) => opt.value);
    const orderedGroqModels = [
      runtime.speedModel,
      ...allGroqModels.filter((m) => m !== runtime.speedModel),
    ];
    for (const model of orderedGroqModels) {
      attempts.push({ provider: "groq", apiKey: runtime.groqApiKey, model });
    }
  }

  if (runtime.openrouterApiKey) {
    attempts.push({ provider: "openrouter", apiKey: runtime.openrouterApiKey, model: OPENROUTER_FREE_MODEL });
  }

  return attempts;
}

async function runBestEffortText(runtime, prompt, options = {}) {
  const attempts = getBestEffortAttempts(runtime);
  if (!attempts.length) throw new Error("NO_PROVIDER_CHAIN:best_effort");

  const failures = [];
  for (const attempt of attempts) {
    try {
      const res = await runTextWithProvider(attempt.provider, attempt.apiKey, prompt, {
        ...options,
        model: attempt.model,
      });
      return {
        text: res.text,
        meta: {
          provider: attempt.provider,
          model: res.actualModel || attempt.model,
          bestEffort: true,
          attempted: failures.map((failure) => failure.provider),
        },
      };
    } catch (error) {
      failures.push({
        provider: attempt.provider,
        message: error?.message || "Unknown error",
      });
      if (!shouldTryNextProvider(error)) throw buildBestEffortError(failures);
    }
  }

  throw buildBestEffortError(failures);
}

async function generateText(prompt, options = {}) {
  const runtime = await getRuntimeConfig();
  if (runtime.mode === "best_effort") {
    return runBestEffortText(runtime, prompt, options);
  }

  const apiKey = runtime.provider === "groq" ? runtime.groqApiKey : runtime.geminiApiKey;
  if (!apiKey) throw new Error(`NO_API_KEY:${runtime.provider}`);

  try {
    const res = await runTextWithProvider(runtime.provider, apiKey, prompt, {
      ...options,
      model: runtime.provider === "gemini" ? runtime.accuracyModel : runtime.speedModel,
    });
    return {
      text: res.text,
      meta: {
        provider: runtime.provider,
        model: res.actualModel || (runtime.provider === "gemini" ? runtime.accuracyModel : runtime.speedModel),
      },
    };
  } catch (error) {
    const shouldFallback =
      runtime.provider === "gemini" &&
      runtime.groqApiKey &&
      /Gemini (server error \((502|503|504)\)|network request failed)/i.test(error?.message || "");

    if (!shouldFallback) throw error;

    const res = await runTextWithProvider("groq", runtime.groqApiKey, prompt, {
      ...options,
      model: runtime.speedModel,
    });
    return {
      text: res.text,
      meta: { provider: "groq", fallbackFrom: "gemini", model: res.actualModel || runtime.speedModel },
    };
  }
}

const SUMMARIZE_FORMAT_HINT = {
  paragraph: "Format the summary as a clean, flowing paragraph.",
  list:      "Format the summary as a list.",
  table:     "Format the summary as a Markdown table with two columns: Topic and Detail.",
  tldr:      "Format the summary as a single ultra-brief TL;DR sentence, prefixed with \"TL;DR:\".",
};

function normalizeListFormat(format, listType, listStyle) {
  const nextFormat = format === "points" ? "list" : format;
  const nextListType = listType || "unordered";
  const nextListStyle = listStyle || (nextListType === "ordered" ? "number" : "dash");
  return { format: nextFormat, listType: nextListType, listStyle: nextListStyle };
}

function getListInstruction(listType) {
  return listType === "ordered"
    ? "Format as an ordered list."
    : "Format as an unordered list.";
}

function getListStyleInstruction(listType, listStyle) {
  if (listType === "ordered") {
    switch (listStyle) {
      case "lower-alpha": return "Use lower alphabetic markers (a., b., c.).";
      case "upper-alpha": return "Use upper alphabetic markers (A., B., C.).";
      case "lower-roman": return "Use lower Roman numerals (i., ii., iii.).";
      case "upper-roman": return "Use upper Roman numerals (I., II., III.).";
      default: return "Use numeric markers (1., 2., 3.).";
    }
  }

  switch (listStyle) {
    case "asterisk": return "Use asterisk markers (*) for each item.";
    case "plus": return "Use plus markers (+) for each item.";
    case "dash": return "Use dash markers (-) for each item.";
    default: return "Use dash markers (-) for each item.";
  }
}

async function generateTextStream(prompt, options = {}, handlers = {}) {
  const runtime = await getRuntimeConfig();
  if (runtime.mode === "best_effort") throw new Error("STREAM_UNSUPPORTED:best_effort");

  const provider = runtime.provider;
  const apiKey = provider === "groq" ? runtime.groqApiKey : runtime.geminiApiKey;
  if (!apiKey) throw new Error(`NO_API_KEY:${provider}`);

  let emitted = false;
  const streamHandlers = {
    signal: handlers.signal,
    onStart: handlers.onStart,
    onChunk(chunk, meta) {
      emitted = true;
      handlers.onChunk?.(chunk, meta);
    },
  };

  try {
    const res = await streamTextWithProvider(provider, apiKey, prompt, {
      ...options,
      model: provider === "gemini" ? runtime.accuracyModel : runtime.speedModel,
    }, streamHandlers);
    return {
      text: res.text,
      meta: {
        provider,
        model: res.actualModel || (provider === "gemini" ? runtime.accuracyModel : runtime.speedModel),
      },
    };
  } catch (error) {
    const shouldFallback =
      !emitted &&
      provider === "gemini" &&
      runtime.groqApiKey &&
      /Gemini (server error \((502|503|504)\)|network request failed)/i.test(error?.message || "");

    if (!shouldFallback) throw error;

    const res = await streamTextWithProvider("groq", runtime.groqApiKey, prompt, {
      ...options,
      model: runtime.speedModel,
    }, {
      signal: handlers.signal,
      onStart: handlers.onStart,
      onChunk: handlers.onChunk,
    });
    return {
      text: res.text,
      meta: { provider: "groq", fallbackFrom: "gemini", model: res.actualModel || runtime.speedModel },
    };
  }
}

function getNestedListInstruction() {
  return "If a list contains sub-items, indent each nested list level clearly under its parent item using standard markdown-style nesting.";
}

async function summarize(text, { words, length, format, listType, listStyle, tone } = {}) {
  const normalized = normalizeListFormat(format, listType, listStyle);
  const finalFormat = normalized.format;
  const finalListType = normalized.listType;
  const lengthHint =
    typeof words === "number" && words > 0
      ? `in approximately ${words} words`
      : length === "short"
        ? "in 2-3 sentences"
        : length === "long"
          ? "in a detailed, thorough paragraph"
          : "in a concise paragraph (4-6 sentences)";

  const formatHint =
    finalFormat === "list"
      ? `${getListInstruction(finalListType)} ${getListStyleInstruction(finalListType, normalized.listStyle)} ${getNestedListInstruction()}`
      : (SUMMARIZE_FORMAT_HINT[finalFormat] || SUMMARIZE_FORMAT_HINT.paragraph);
  const toneHint   = REWRITE_TONE_HINTS[tone]      || "";

  return generateText(
    `Summarize the following text ${lengthHint}. ${formatHint}${toneHint ? ` ${toneHint}` : ""} Return only the summary with no preamble or labels:\n\n${text}`
  );
}

async function summarizeStream(text, { words, length, format, listType, listStyle, tone } = {}, handlers = {}) {
  const normalized = normalizeListFormat(format, listType, listStyle);
  const finalFormat = normalized.format;
  const finalListType = normalized.listType;
  const lengthHint =
    typeof words === "number" && words > 0
      ? `in approximately ${words} words`
      : length === "short"
        ? "in 2-3 sentences"
        : length === "long"
          ? "in a detailed, thorough paragraph"
          : "in a concise paragraph (4-6 sentences)";

  const formatHint =
    finalFormat === "list"
      ? `${getListInstruction(finalListType)} ${getListStyleInstruction(finalListType, normalized.listStyle)} ${getNestedListInstruction()}`
      : (SUMMARIZE_FORMAT_HINT[finalFormat] || SUMMARIZE_FORMAT_HINT.paragraph);
  const toneHint = REWRITE_TONE_HINTS[tone] || "";

  return generateTextStream(
    `Summarize the following text ${lengthHint}. ${formatHint}${toneHint ? ` ${toneHint}` : ""} Return only the summary with no preamble or labels:\n\n${text}`,
    {},
    handlers
  );
}

async function translate(text, { from = "auto", to = "en" } = {}) {
  const fromHint = from && from !== "auto" ? ` from ${from}` : "";
  return generateText(
    `Translate the following text${fromHint} to ${to}. Return only the translated text with no explanation:\n\n${text}`
  );
}

async function translateStream(text, { from = "auto", to = "en" } = {}, handlers = {}) {
  const fromHint = from && from !== "auto" ? ` from ${from}` : "";
  return generateTextStream(
    `Translate the following text${fromHint} to ${to}. Return only the translated text with no explanation:\n\n${text}`,
    {},
    handlers
  );
}

const EXTRACT_PRESET_PROMPTS = {
  keyfacts: "Extract the most important factual points.",
  entities: "Extract the key people, organizations, places, and notable items.",
  contacts: "Extract contact details such as names, roles, companies, email addresses, phone numbers, and links.",
  actionitems: "Extract action items, owners, deadlines, and follow-ups.",
  timeline: "Extract timeline events, dates, and what happened.",
  faq: "Extract the content into concise question-and-answer pairs.",
  custom: "Extract only the fields explicitly requested by the user.",
};

const EXTRACT_FORMAT_HINTS = {
  table: "Return the extracted information as a concise Markdown table with clear column headers.",
  json: "Return the extracted information as valid JSON only, with no markdown fences or commentary.",
  list: "Return the extracted information as a list.",
};

async function extract(text, { preset = "keyfacts", fields = "", format = "table", listType, listStyle } = {}) {
  const normalized = normalizeListFormat(format, listType, listStyle);
  const finalFormat = normalized.format;
  const finalListType = normalized.listType;
  const presetInstruction = EXTRACT_PRESET_PROMPTS[preset] || EXTRACT_PRESET_PROMPTS.keyfacts;
  let formatInstruction =
    finalFormat === "list"
      ? `${getListInstruction(finalListType)} ${getListStyleInstruction(finalListType, normalized.listStyle)} ${getNestedListInstruction()}`
      : (EXTRACT_FORMAT_HINTS[finalFormat] || EXTRACT_FORMAT_HINTS.table);
  if (preset === "faq") {
    if (finalFormat === "table") {
      formatInstruction = "Return a Markdown table with two columns: Question and Answer.";
    } else if (finalFormat === "json") {
      formatInstruction = "Return a JSON array of objects with keys: question, answer. No markdown fences.";
    } else if (finalFormat === "list") {
      formatInstruction =
        finalListType === "ordered"
          ? "Return FAQ pairs in this exact pattern:\n1. Q: ...\n   A: ...\nRepeat with 2., 3., etc."
          : "Return FAQ pairs in this exact pattern:\n* Q: ...\n  A: ...\nRepeat for each pair. Use * only for the question line.";
    }
  }
  const fieldInstruction =
    preset === "custom" && String(fields || "").trim()
      ? `Extract these fields only: ${String(fields).trim()}.`
      : String(fields || "").trim()
        ? `Prioritize these fields if they are available: ${String(fields).trim()}.`
        : "";

  return generateText(
    `${presetInstruction} ${fieldInstruction} ${formatInstruction} Omit anything that is not supported by the source text. Return only the extracted output with no preamble:\n\n${text}`,
    { temperature: 0.2, maxTokens: 4096 }
  );
}

function parseProofreadJson(raw, provider) {
  let source = String(raw || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) source = fenced[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${PROVIDER_META[provider].label} returned invalid proofread JSON.`);
  }

  return {
    correctedText: typeof parsed?.correctedText === "string" ? parsed.correctedText : "",
    changes: Array.isArray(parsed?.changes) ? parsed.changes.map(String) : [],
  };
}

async function runProofreadRaw(provider, apiKey, model, prompt) {
  if (provider === "gemini") {
    const res = await generateGeminiText(prompt, apiKey, {
      temperature: 0.2,
      model,
      responseMimeType: "application/json",
      responseJsonSchema: PROOFREAD_SCHEMA,
    });
    return { raw: res.text, actualModel: res.actualModel };
  }

  if (provider === "groq") {
    const groqModel = getGroqModelOption(model);
    const res = await generateGroqText(prompt, apiKey, {
      model,
      temperature: 0.2,
      responseFormat:
        groqModel.structuredOutput === "json_schema"
          ? {
              type: "json_schema",
              json_schema: {
                name: "proofread_response",
                strict: false,
                schema: PROOFREAD_SCHEMA,
              },
            }
          : { type: "json_object" },
    });
    return { raw: res.text, actualModel: res.actualModel };
  }

  const res = await generateOpenRouterText(prompt, apiKey, {
    model,
    temperature: 0.2,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "proofread_response",
        strict: false,
        schema: PROOFREAD_SCHEMA,
      },
    },
  });
  return { raw: res.text, actualModel: res.actualModel };
}

async function proofread(text) {
  const runtime = await getRuntimeConfig();
  const prompt =
    "Proofread the following text. Fix grammar, spelling, punctuation, and clarity. " +
    "Return the corrected text and a list of concrete changes. Return JSON only.\n\n" +
    `Text:\n${text}`;

  if (runtime.mode === "best_effort") {
    const attempts = getBestEffortAttempts(runtime);
    if (!attempts.length) throw new Error("NO_PROVIDER_CHAIN:best_effort");

    const failures = [];
    for (const attempt of attempts) {
      try {
        const res = await runProofreadRaw(attempt.provider, attempt.apiKey, attempt.model, prompt);
        return {
          ...parseProofreadJson(res.raw, attempt.provider),
          meta: {
            provider: attempt.provider,
            model: res.actualModel || attempt.model,
            bestEffort: true,
            attempted: failures.map((failure) => failure.provider),
          },
        };
      } catch (error) {
        failures.push({
          provider: attempt.provider,
          message: error?.message || "Unknown error",
        });
        if (!shouldTryNextProvider(error)) throw buildBestEffortError(failures);
      }
    }

    throw buildBestEffortError(failures);
  }

  const apiKey = runtime.provider === "groq" ? runtime.groqApiKey : runtime.geminiApiKey;
  if (!apiKey) throw new Error(`NO_API_KEY:${runtime.provider}`);

  let response;
  let meta = {
    provider: runtime.provider,
    model: runtime.provider === "gemini" ? runtime.accuracyModel : runtime.speedModel,
  };
  try {
    response = await runProofreadRaw(
      runtime.provider,
      apiKey,
      runtime.provider === "gemini" ? runtime.accuracyModel : runtime.speedModel,
      prompt
    );
  } catch (error) {
    const shouldFallback =
      runtime.provider === "gemini" &&
      runtime.groqApiKey &&
      /Gemini (server error \((502|503|504)\)|network request failed)/i.test(error?.message || "");

    if (!shouldFallback) throw error;
    response = await runProofreadRaw("groq", runtime.groqApiKey, runtime.speedModel, prompt);
    meta = { provider: "groq", fallbackFrom: "gemini", model: response.actualModel || runtime.speedModel };
  }

  return {
    ...parseProofreadJson(response.raw, meta.provider),
    meta,
  };
}

const REWRITE_FORMAT_PROMPTS = {
  paragraph: "Rewrite the following text as a clean, well-structured paragraph. Preserve the core meaning.",
  list:      "Rewrite the following text as a list. Preserve the core meaning.",
  table:     "Convert the following text into a concise Markdown table with clear column headers.",
  tldr:      "Condense the following text into a single TL;DR sentence, prefixed with \"TL;DR:\".",
};

const REWRITE_TONE_HINTS = {
  formal:  "Use a formal, professional tone.",
  neutral: "Use a neutral, clear tone.",
  casual:  "Use a casual, friendly, conversational tone.",
};

const PAGE_CHAT_CONTEXT_CHAR_LIMIT = 24000;
const PAGE_CHAT_HISTORY_LIMIT = 8;
const PAGE_CHAT_MESSAGE_CHAR_LIMIT = 1200;
const PAGE_CHAT_TOOL_RESULT_CHAR_LIMIT = 4000;
const PAGE_CHAT_TOOL_PLAN_CHAR_LIMIT = 5000;
const PAGE_CHAT_MAX_TOOL_CALLS_PER_STEP = 3;
const PAGE_CHAT_MAX_TOOL_STEPS = 3;
const PAGE_CHAT_MAX_CITATIONS = 4;
const PAGE_CHAT_MAX_REWRITE_HISTORY = 6;
const PAGE_CHAT_LENGTH_HINTS = {
  short: "Keep the answer brief and direct, around 2-4 sentences unless a short list is clearer.",
  medium: "Keep the answer concise but useful, with enough detail to support the answer clearly.",
  long: "Give a more detailed answer, but stay grounded in the page and avoid filler.",
};
const PAGE_ANALYSIS_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "to", "of", "in", "on", "for", "from", "by", "with", "as", "at", "into", "about", "over",
  "is", "are", "was", "were", "be", "been", "being", "it", "its", "they", "them", "their",
  "he", "she", "his", "her", "you", "your", "we", "our", "i", "my", "me", "not", "no", "do",
  "does", "did", "done", "can", "could", "should", "would", "will", "may", "might", "must",
  "have", "has", "had", "also", "such", "other", "more", "most", "some", "any", "all", "each",
  "which", "what", "when", "where", "who", "whom", "whose", "how", "why", "there", "here",
  "used", "use", "using", "between", "within", "into", "out", "up", "down", "only",
]);
const PAGE_ADULT_WORDS = [
  "adult", "porn", "porno", "pornography", "sex", "sexual", "sexy", "nude", "nudes",
  "boob", "boobs", "breast", "breasts", "penis", "vagina", "dick", "cock", "pussy",
  "fuck", "fucking", "shit", "bitch", "asshole", "bastard", "whore", "slut", "nipple",
  "fetish", "explicit", "nsfw",
];
const PAGE_ENTITY_STOP_WORDS = new Set([
  "The", "This", "That", "These", "Those", "A", "An", "And", "Or", "But", "If", "Then",
  "When", "Where", "Why", "How", "What", "Who", "Whose", "Which", "In", "On", "At",
  "To", "From", "Of", "For", "By", "With", "As", "It", "Its", "They", "Their", "We",
  "Our", "You", "Your", "He", "She", "His", "Her", "I", "My",
]);
const PAGE_CHAT_TOOLS = [
  {
    name: "page_stats",
    description: "Use for exact page-level counts and broad document statistics such as total words, unique words, section counts, heading counts, and top words.",
    parameters: {},
  },
  {
    name: "word_frequency",
    description: "Use when the user asks for the most-used words, top words, common words, or ranked word frequencies. Scope can be 'content' or 'all'.",
    parameters: {
      scope: { type: "string", enum: ["content", "all"], description: "Choose 'content' to exclude common stop words, or 'all' to include them." },
      limit: { type: "integer", description: "How many ranked words to return, between 1 and 25." },
    },
  },
  {
    name: "keyword_count",
    description: "Use for exact counts of a specific word or phrase, including direct questions like 'how many times does X appear'.",
    parameters: {
      keyword: { type: "string", description: "The exact word or phrase to count on the page." },
    },
  },
  {
    name: "relevant_passages",
    description: "Use to retrieve the most relevant passages for semantic questions, evidence gathering, contradictions, explanations, or support for an answer.",
    parameters: {
      query: { type: "string", description: "The search query or topic to match against page passages." },
      limit: { type: "integer", description: "How many passages to return, between 1 and 8." },
    },
  },
  {
    name: "japanese_token_stats",
    description: "Use for approximate Japanese-script token counts and top Japanese token frequencies.",
    parameters: {},
  },
  {
    name: "profanity_scan",
    description: "Use when the user asks whether the page contains adult, explicit, NSFW, profane, or sexual words.",
    parameters: {},
  },
  {
    name: "section_index",
    description: "Use to inspect the page outline and section headings before drilling into specific parts of the document.",
    parameters: {},
  },
  {
    name: "section_lookup",
    description: "Use when the user asks about a specific section, heading, chapter, topic area, or where something appears on the page.",
    parameters: {
      query: { type: "string", description: "A heading name, section topic, or phrase to match against section headings and section text." },
      limit: { type: "integer", description: "How many matching sections to return, between 1 and 6." },
    },
  },
  {
    name: "quote_search",
    description: "Use to find exact or near-exact quoted phrases, specific wording, or whether a phrase appears on the page.",
    parameters: {
      query: { type: "string", description: "The exact quote or phrase to search for." },
      limit: { type: "integer", description: "How many matches to return, between 1 and 8." },
    },
  },
  {
    name: "entity_scan",
    description: "Use for quick extraction of likely named entities such as people, organizations, places, and titled phrases from the page text.",
    parameters: {
      limit: { type: "integer", description: "How many entities to return, between 1 and 20." },
    },
  },
  {
    name: "table_index",
    description: "Use to inspect which tables exist on the page, their captions, column headers, and row counts.",
    parameters: {},
  },
  {
    name: "table_lookup",
    description: "Use when the user asks about a specific table, a table caption, a row in a table, or structured values that likely live in a table.",
    parameters: {
      query: { type: "string", description: "The table topic, caption, row subject, or value to search for." },
      limit: { type: "integer", description: "How many matching tables to return, between 1 and 4." },
    },
  },
];

function truncateForPrompt(text, maxChars) {
  const source = String(text || "").trim();
  if (!source || source.length <= maxChars) return source;
  return `${source.slice(0, maxChars).trim()}\n\n[Content truncated for context size]`;
}

function normalizePageChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
    .slice(-PAGE_CHAT_HISTORY_LIMIT)
    .map((entry) => ({
      role: entry.role,
      text: truncateForPrompt(entry.text, PAGE_CHAT_MESSAGE_CHAR_LIMIT),
    }))
    .filter((entry) => entry.text);
}

function slugifyCitationLabel(value, fallback = "source") {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildPageChatPrompt(question, {
  pageTitle = "",
  pageUrl = "",
  pageText = "",
  history = [],
  length = "medium",
  tone = "neutral",
  toolResults = [],
  plannerTrace = [],
} = {}) {
  const normalizedHistory = normalizePageChatHistory(history);
  const normalizedPageText = truncateForPrompt(pageText, PAGE_CHAT_CONTEXT_CHAR_LIMIT);
  const toneInstruction = REWRITE_TONE_HINTS[tone] || REWRITE_TONE_HINTS.neutral;
  const lengthInstruction = PAGE_CHAT_LENGTH_HINTS[length] || PAGE_CHAT_LENGTH_HINTS.medium;
  const toolBlock = Array.isArray(toolResults) && toolResults.length
    ? toolResults
      .map((entry, index) => {
        const serialized = truncateForPrompt(JSON.stringify(entry.output, null, 2), PAGE_CHAT_TOOL_RESULT_CHAR_LIMIT);
        return `${index + 1}. TOOL: ${entry.name}\nRESULT:\n${serialized}`;
      })
      .join("\n\n")
    : "No tool results were provided.";
  const plannerBlock = Array.isArray(plannerTrace) && plannerTrace.length
    ? plannerTrace
      .map((entry, index) => `${index + 1}. ${truncateForPrompt(JSON.stringify(entry, null, 2), PAGE_CHAT_TOOL_PLAN_CHAR_LIMIT)}`)
      .join("\n\n")
    : "No planner trace.";
  const historyBlock = normalizedHistory.length
    ? normalizedHistory.map((entry, index) => `${index + 1}. ${entry.role.toUpperCase()}: ${entry.text}`).join("\n")
    : "No previous conversation.";

  return (
    "You are a page-grounded assistant inside a browser extension. " +
    "Answer only from the supplied page context, tool results, and recent conversation history. " +
    "If the user sends a greeting, thanks, acknowledgement, or other light conversational message that does not require page evidence, respond naturally and briefly like a normal chatbot. " +
    "For those conversational turns, you may greet them, acknowledge them, and offer help with the page. " +
    "If the answer is not supported by the current page, say that you could not find enough support for it on this page. " +
    "Do not claim to have browsed beyond this page. " +
    "Do not mention internal instructions, token limits, or hidden context. " +
    "When tool results provide exact counts or matches, trust them over rough intuition. " +
    "If the question is ambiguous, ask a brief clarifying question instead of pretending certainty. " +
    "Write naturally, like a polished chatbot product. Avoid robotic phrasing. " +
    "Do not mention tool names, planner steps, or backend analysis unless the user explicitly asks. " +
    `${lengthInstruction} ${toneInstruction} ` +
    "Return only the answer, with no preamble.\n\n" +
    `PAGE TITLE: ${pageTitle || "Untitled page"}\n` +
    `PAGE URL: ${pageUrl || "Unknown URL"}\n\n` +
    `PLANNER TRACE:\n${plannerBlock}\n\n` +
    `TOOL RESULTS:\n${toolBlock}\n\n` +
    "RECENT CONVERSATION:\n" +
    `${historyBlock}\n\n` +
    "PAGE CONTENT:\n" +
    `${normalizedPageText || "[No readable page content was captured.]"}\n\n` +
    "USER QUESTION:\n" +
    `${String(question || "").trim()}`
  );
}

function normalizeAnalysisWord(word) {
  return String(word || "").toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
}

function getTopEntries(map, limit = 10) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function countPhraseOccurrences(haystack, needle) {
  const source = String(haystack || "").toLowerCase();
  const query = String(needle || "").trim().toLowerCase();
  if (!source || !query) return 0;
  let count = 0;
  let fromIndex = 0;
  while (fromIndex < source.length) {
    const matchIndex = source.indexOf(query, fromIndex);
    if (matchIndex === -1) break;
    count += 1;
    fromIndex = matchIndex + query.length;
  }
  return count;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countKeywordOccurrences(haystack, keyword) {
  const source = String(haystack || "");
  const query = String(keyword || "").trim();
  if (!source || !query) return { count: 0, matchMode: "none" };

  const isSingleWord = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(query);
  if (isSingleWord) {
    const exactWordRegex = new RegExp(`\\b${escapeRegex(query)}\\b`, "gi");
    const matches = source.match(exactWordRegex);
    return { count: matches ? matches.length : 0, matchMode: "exact_word_case_insensitive" };
  }

  return {
    count: countPhraseOccurrences(source, query),
    matchMode: "substring_case_insensitive",
  };
}

function sanitizeQueryTerms(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !PAGE_ANALYSIS_STOP_WORDS.has(term));
}

function normalizeEvidenceText(text) {
  return String(text || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBestMatches(items, query, limit, getText) {
  const terms = sanitizeQueryTerms(query);
  if (!terms.length) return [];
  return items
    .map((item) => {
      const text = String(getText(item) || "");
      const lower = text.toLowerCase();
      const exactPhraseBoost = lower.includes(String(query || "").trim().toLowerCase()) ? 4 : 0;
      const termScore = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
      return { item, score: termScore + exactPhraseBoost };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function extractEntities(source) {
  const matches = source.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,3}\b/g) || [];
  const counts = new Map();
  matches.forEach((raw) => {
    const entity = String(raw || "").trim();
    if (!entity || PAGE_ENTITY_STOP_WORDS.has(entity)) return;
    counts.set(entity, (counts.get(entity) || 0) + 1);
  });
  return counts;
}

function buildPageToolContext(pageText, pageDocument = {}) {
  const source = String(pageText || "");
  const englishWords = (source.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [])
    .map(normalizeAnalysisWord)
    .filter(Boolean);
  const wordCounts = new Map();
  const contentWordCounts = new Map();
  englishWords.forEach((word) => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    if (word.length >= 3 && !PAGE_ANALYSIS_STOP_WORDS.has(word)) {
      contentWordCounts.set(word, (contentWordCounts.get(word) || 0) + 1);
    }
  });

  const japaneseTokens = source.match(/[一-龯々ぁ-ゟ゠-ヿー]+/gu) || [];
  const sentences = source
    .split(/[.!?。！？]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const japaneseTokensNormalized = source.match(/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー]+/gu) || japaneseTokens;
  const normalizedSentences = source
    .split(/[.!?。！？]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const sections = Array.isArray(pageDocument.sections) ? pageDocument.sections.filter((section) => section?.text) : [];
  const headings = Array.isArray(pageDocument.headings) ? pageDocument.headings.filter((heading) => heading?.text) : [];
  const paragraphsFromBlocks = Array.isArray(pageDocument.blocks)
    ? pageDocument.blocks.filter((block) => block?.type === "block" && block.text).map((block) => block.text)
    : [];
  const tables = Array.isArray(pageDocument.tables) ? pageDocument.tables.filter((table) => Array.isArray(table?.rows) || Array.isArray(table?.headers)) : [];
  const paragraphs = paragraphsFromBlocks.length
    ? paragraphsFromBlocks
    : source.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const entityCounts = extractEntities(source);
  const chunks = [];

  sections.forEach((section, index) => {
    const chunkId = `section:${index + 1}:${slugifyCitationLabel(section.heading, `section-${index + 1}`)}`;
    chunks.push({
      id: chunkId,
      type: "section",
      label: section.heading || `Section ${index + 1}`,
      level: section.level || 0,
      text: section.text,
    });
  });

  if (!chunks.length) {
    paragraphs.forEach((paragraph, index) => {
      chunks.push({
        id: `paragraph:${index + 1}`,
        type: "paragraph",
        label: `Paragraph ${index + 1}`,
        level: 0,
        text: paragraph,
      });
    });
  }

  tables.forEach((table, index) => {
    const tableLabel = table.caption || `Table ${index + 1}`;
    const headers = ensureArray(table.headers);
    const rows = ensureArray(table.rows);
    chunks.push({
      id: `table:${index + 1}:${slugifyCitationLabel(tableLabel, `table-${index + 1}`)}`,
      type: "table",
      label: tableLabel,
      level: 0,
      text: normalizeEvidenceText([
        tableLabel,
        headers.length ? `Columns: ${headers.join(", ")}` : "",
        rows.length ? `Rows: ${rows.length}` : "",
      ].filter(Boolean).join(". ")),
      headers,
      rows,
    });
  });

  return {
    source,
    englishWords,
    wordCounts,
    contentWordCounts,
    japaneseTokens: japaneseTokensNormalized,
    sentences: normalizedSentences,
    sections,
    headings,
    paragraphs,
    tables,
    chunks,
    entityCounts,
  };
}

function executePageTool(name, rawArgs, context) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

  if (name === "page_stats") {
    return {
      englishWordTotal: context.englishWords.length,
      uniqueEnglishWordTotal: new Set(context.englishWords).size,
      japaneseTokenTotal: context.japaneseTokens.length,
      uniqueJapaneseTokenTotal: new Set(context.japaneseTokens).size,
      sentenceCount: context.sentences.length,
      paragraphCount: context.paragraphs.length,
      sectionCount: context.sections.length,
      headingCount: context.headings.length,
      topWords: getTopEntries(context.wordCounts, 10),
      topContentWords: getTopEntries(context.contentWordCounts, 10),
    };
  }

  if (name === "word_frequency") {
    const scope = args.scope === "content" ? "content" : "all";
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
    return {
      scope,
      items: getTopEntries(scope === "all" ? context.wordCounts : context.contentWordCounts, limit),
    };
  }

  if (name === "keyword_count") {
    const keyword = String(args.keyword || "").trim();
    const frequency = countKeywordOccurrences(context.source, keyword);
    return {
      keyword,
      count: frequency.count,
      matchMode: frequency.matchMode,
    };
  }

  if (name === "relevant_passages") {
    const query = String(args.query || "").trim();
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 8);
    const ranked = findBestMatches(
      context.chunks.filter((chunk) => chunk.type !== "table"),
      query,
      limit,
      (chunk) => `${chunk.label}\n${chunk.text}`
    );
    return {
      query,
      passages: ranked.map((chunk) => ({
        sourceId: chunk.id,
        label: chunk.label,
        type: chunk.type,
        text: truncateForPrompt(chunk.text, 700),
      })),
    };
  }

  if (name === "japanese_token_stats") {
    const topJapaneseTokens = getTopEntries(
      context.japaneseTokens.reduce((map, token) => {
        map.set(token, (map.get(token) || 0) + 1);
        return map;
      }, new Map()),
      20
    );
    return {
      japaneseTokenTotal: context.japaneseTokens.length,
      uniqueJapaneseTokenTotal: new Set(context.japaneseTokens).size,
      topJapaneseTokens,
    };
  }

  if (name === "profanity_scan") {
    const matches = PAGE_ADULT_WORDS
      .map((word) => ({ word, count: countPhraseOccurrences(context.source, word) }))
      .filter((entry) => entry.count > 0)
      .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word));
    return {
      matches,
      foundAny: matches.length > 0,
    };
  }

  if (name === "section_index") {
    return {
      headings: context.headings.slice(0, 80),
      sections: context.sections.slice(0, 20).map((section) => ({
        heading: section.heading,
        level: section.level,
        preview: truncateForPrompt(section.text, 220),
      })),
    };
  }

  if (name === "section_lookup") {
    const query = String(args.query || "").trim();
    const limit = Math.min(Math.max(Number(args.limit) || 4, 1), 6);
    const matches = findBestMatches(
      context.sections,
      query,
      limit,
      (section) => `${section.heading}\n${section.text}`
    ).map((section) => ({
      sourceId: context.chunks.find((chunk) => chunk.type === "section" && chunk.label === section.heading)?.id || `section:${slugifyCitationLabel(section.heading, "section")}`,
      heading: section.heading,
      level: section.level,
      text: truncateForPrompt(section.text, 1200),
    }));
    return { query, matches };
  }

  if (name === "quote_search") {
    const query = String(args.query || "").trim();
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 8);
    const exactChunks = context.chunks
      .filter((chunk) => chunk.text.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map((chunk) => ({
        sourceId: chunk.id,
        label: chunk.label,
        text: truncateForPrompt(chunk.text, 600),
      }));
    if (!exactChunks.length && query) {
      const fuzzyMatches = findBestMatches(context.chunks, query, limit, (chunk) => `${chunk.label}\n${chunk.text}`)
        .map((chunk) => ({
          sourceId: chunk.id,
          label: chunk.label,
          text: truncateForPrompt(chunk.text, 600),
        }));
      return { query, exact: false, matches: fuzzyMatches };
    }
    return { query, exact: true, matches: exactChunks };
  }

  if (name === "entity_scan") {
    const limit = Math.min(Math.max(Number(args.limit) || 12, 1), 20);
    return {
      entities: getTopEntries(context.entityCounts, limit).map(([entity, count]) => ({ entity, count })),
    };
  }

  if (name === "table_index") {
    return {
      tables: context.tables.slice(0, 20).map((table, index) => ({
        tableId: `table:${index + 1}`,
        caption: table.caption || `Table ${index + 1}`,
        headers: ensureArray(table.headers),
        rowCount: ensureArray(table.rows).length,
      })),
    };
  }

  if (name === "table_lookup") {
    const query = String(args.query || "").trim();
    const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 4);
    const matches = findBestMatches(
      context.tables.map((table, index) => ({ ...table, _index: index })),
      query,
      limit,
      (table) => [
        table.caption || `Table ${table._index + 1}`,
        ensureArray(table.headers).join(" "),
        ensureArray(table.rows).flat().join(" "),
      ].join("\n")
    ).map((table) => ({
      tableId: `table:${table._index + 1}`,
      sourceId: `table:${table._index + 1}:${slugifyCitationLabel(table.caption || `table-${table._index + 1}`)}`,
      caption: table.caption || `Table ${table._index + 1}`,
      headers: ensureArray(table.headers),
      rowCount: ensureArray(table.rows).length,
      sampleRows: ensureArray(table.rows).slice(0, 6),
    }));
    return { query, matches };
  }

  throw new Error(`Unknown page tool: ${name}`);
}

function parseJsonResponse(raw, providerLabel = "AI") {
  let source = String(raw || "").trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) source = fenced[1].trim();
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${providerLabel} returned invalid JSON for the page-tool planner.`);
  }
}

async function rewritePageChatQuestion(question, history = []) {
  const normalizedHistory = normalizePageChatHistory(history).slice(-PAGE_CHAT_MAX_REWRITE_HISTORY);
  if (!normalizedHistory.length) {
    return {
      question: String(question || "").trim(),
      usedHistory: false,
    };
  }
  const prompt =
    "Rewrite the user's latest page-chat question into a standalone version when the history is needed to resolve references. " +
    "If the question is already standalone, keep it almost unchanged. " +
    "Return JSON only in this shape: {\"question\":\"...\",\"usedHistory\":true|false}.\n\n" +
    `RECENT CONVERSATION:\n${normalizedHistory.map((entry) => `${entry.role}: ${entry.text}`).join("\n")}\n\n` +
    `LATEST USER QUESTION:\n${String(question || "").trim()}`;
  const result = await generateText(prompt, {
    temperature: 0.1,
    maxTokens: 250,
    responseMimeType: "application/json",
    responseFormat: { type: "json_object" },
  });
  const parsed = parseJsonResponse(result?.text || "", "Follow-up rewriter");
  return {
    question: String(parsed?.question || question || "").trim(),
    usedHistory: Boolean(parsed?.usedHistory),
  };
}

function buildToolCatalogPrompt() {
  return PAGE_CHAT_TOOLS.map((tool) => {
    const params = Object.keys(tool.parameters || {}).length
      ? JSON.stringify(tool.parameters, null, 2)
      : "{}";
    return `TOOL ${tool.name}\nDESCRIPTION: ${tool.description}\nPARAMETERS: ${params}`;
  }).join("\n\n");
}

function serializeExecutedTools(executedTools) {
  if (!Array.isArray(executedTools) || !executedTools.length) return "No tools have been executed yet.";
  return executedTools.map((entry, index) => (
    `${index + 1}. ${entry.name}(${JSON.stringify(entry.args || {})})\n${truncateForPrompt(JSON.stringify(entry.output, null, 2), PAGE_CHAT_TOOL_RESULT_CHAR_LIMIT)}`
  )).join("\n\n");
}

function buildCitationCatalog(toolResults) {
  const citations = [];
  const pushCitation = (entry) => {
    if (!entry?.id || citations.some((citation) => citation.id === entry.id)) return;
    citations.push(entry);
  };

  (toolResults || []).forEach((tool) => {
    const output = tool?.output || {};
    ensureArray(output.passages).forEach((item) => {
      pushCitation({
        id: item.sourceId,
        label: item.label || item.sourceId,
        excerpt: truncateForPrompt(item.text, 320),
      });
    });
    ensureArray(output.matches).forEach((item) => {
      pushCitation({
        id: item.sourceId || item.tableId,
        label: item.heading || item.caption || item.label || item.sourceId || item.tableId,
        excerpt: truncateForPrompt(item.text || ensureArray(item.sampleRows).map((row) => row.join(" | ")).join("\n"), 320),
      });
    });
  });

  return citations.slice(0, 20);
}

function selectRelevantCitations(question, toolResults, maxCitations = PAGE_CHAT_MAX_CITATIONS) {
  const catalog = buildCitationCatalog(toolResults);
  const terms = sanitizeQueryTerms(question);
  if (!catalog.length) return [];
  const ranked = catalog
    .map((citation) => {
      const haystack = `${citation.label}\n${citation.excerpt}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { citation, score };
    })
    .sort((left, right) => right.score - left.score);
  return ranked
    .filter((entry, index) => entry.score > 0 || index < maxCitations)
    .slice(0, maxCitations)
    .map((entry) => entry.citation);
}

async function planPageChatStep(question, {
  history = [],
  executedTools = [],
  options = {},
} = {}) {
  const normalizedHistory = normalizePageChatHistory(history);
  const prompt =
    "You are the planning layer for a page-grounded chatbot. " +
    "Your job is to decide whether more page tools are needed before the assistant answers. " +
    "If the user's message is just a greeting, thanks, acknowledgement, or light conversational turn, do not use tools and choose answer. " +
    "Prefer tools for exact counts, exact phrase checks, page structure lookup, and evidence retrieval. " +
    "Do not ask for tools that have already been executed with the same arguments. " +
    "Choose at most 3 tool calls in this step. " +
    "Return JSON only with this schema: " +
    "{\"decision\":\"tools\"|\"answer\",\"reason\":\"short string\",\"toolCalls\":[{\"name\":\"tool_name\",\"args\":{}}]}. " +
    "If existing tool results are already enough, use decision='answer'.\n\n" +
    `AVAILABLE TOOLS:\n${buildToolCatalogPrompt()}\n\n` +
    `RECENT CONVERSATION:\n${normalizedHistory.map((entry) => `${entry.role}: ${entry.text}`).join("\n") || "No previous conversation."}\n\n` +
    `ALREADY EXECUTED TOOLS:\n${serializeExecutedTools(executedTools)}\n\n` +
    `USER QUESTION:\n${String(question || "").trim()}`;

  const result = await generateText(prompt, {
    temperature: 0.1,
    maxTokens: 700,
    ...options,
    responseMimeType: "application/json",
    responseFormat: { type: "json_object" },
  });
  const parsed = parseJsonResponse(result?.text || "", "Planner");
  const toolCalls = Array.isArray(parsed?.toolCalls) ? parsed.toolCalls : [];
  return {
    decision: parsed?.decision === "tools" ? "tools" : "answer",
    reason: String(parsed?.reason || "").trim(),
    toolCalls: toolCalls
      .filter((entry) => entry && typeof entry.name === "string")
      .slice(0, PAGE_CHAT_MAX_TOOL_CALLS_PER_STEP)
      .map((entry) => ({
        name: entry.name,
        args: entry.args && typeof entry.args === "object" ? entry.args : {},
      })),
  };
}

function dedupeToolCalls(toolCalls, executedTools) {
  const seen = new Set(
    (executedTools || []).map((entry) => `${entry.name}:${JSON.stringify(entry.args || {})}`)
  );
  return (toolCalls || []).filter((entry) => {
    const exists = PAGE_CHAT_TOOLS.some((tool) => tool.name === entry.name);
    if (!exists) return false;
    const key = `${entry.name}:${JSON.stringify(entry.args || {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function runPageChatAgent(question, options = {}) {
  const rewritten = await rewritePageChatQuestion(question, options.history || []);
  const toolContext = buildPageToolContext(options.pageText || "", options.pageDocument || {});
  const executedTools = [];
  const plannerTrace = [{
    step: 0,
    decision: "rewrite",
    reason: rewritten.usedHistory ? "Rewrote the follow-up into a standalone question." : "Question was already standalone.",
    rewrittenQuestion: rewritten.question,
  }];

  for (let step = 0; step < PAGE_CHAT_MAX_TOOL_STEPS; step += 1) {
    const plan = await planPageChatStep(rewritten.question, {
      history: options.history,
      executedTools,
    });
    const nextToolCalls = dedupeToolCalls(plan.toolCalls, executedTools);
    plannerTrace.push({
      step: step + 1,
      decision: plan.decision,
      reason: plan.reason,
      toolCalls: nextToolCalls,
    });
    if (plan.decision !== "tools" || !nextToolCalls.length) break;
    nextToolCalls.forEach((tool) => {
      executedTools.push({
        name: tool.name,
        args: tool.args,
        output: executePageTool(tool.name, tool.args, toolContext),
      });
    });
  }

  return {
    rewrittenQuestion: rewritten.question,
    toolResults: executedTools,
    plannerTrace,
  };
}

async function rewrite(text, { format = "paragraph", listType, listStyle, tone = "neutral" } = {}) {
  const normalized = normalizeListFormat(format, listType, listStyle);
  const finalFormat = normalized.format;
  const finalListType = normalized.listType;
  const formatInstruction =
    finalFormat === "list"
      ? `${getListInstruction(finalListType)} ${getListStyleInstruction(finalListType, normalized.listStyle)} ${getNestedListInstruction()}`
      : (REWRITE_FORMAT_PROMPTS[finalFormat] || REWRITE_FORMAT_PROMPTS.paragraph);
  const toneInstruction   = REWRITE_TONE_HINTS[tone]   || REWRITE_TONE_HINTS.neutral;
  return generateText(
    `${formatInstruction} ${toneInstruction} Return only the rewritten text:\n\n${text}`,
    { temperature: 0.6 }
  );
}

async function rewriteStream(text, { format = "paragraph", listType, listStyle, tone = "neutral" } = {}, handlers = {}) {
  const normalized = normalizeListFormat(format, listType, listStyle);
  const finalFormat = normalized.format;
  const finalListType = normalized.listType;
  const formatInstruction =
    finalFormat === "list"
      ? `${getListInstruction(finalListType)} ${getListStyleInstruction(finalListType, normalized.listStyle)} ${getNestedListInstruction()}`
      : (REWRITE_FORMAT_PROMPTS[finalFormat] || REWRITE_FORMAT_PROMPTS.paragraph);
  const toneInstruction = REWRITE_TONE_HINTS[tone] || REWRITE_TONE_HINTS.neutral;
  return generateTextStream(
    `${formatInstruction} ${toneInstruction} Return only the rewritten text:\n\n${text}`,
    { temperature: 0.6 },
    handlers
  );
}

async function write(taskPrompt, { tone = "neutral" } = {}) {
  return generateText(
    `Write high-quality content based on the following prompt. Use a ${tone} tone. Return only the written content with no meta-commentary:\n\n${taskPrompt}`,
    { temperature: 0.8, maxTokens: 4096 }
  );
}

async function writeStream(taskPrompt, { tone = "neutral" } = {}, handlers = {}) {
  return generateTextStream(
    `Write high-quality content based on the following prompt. Use a ${tone} tone. Return only the written content with no meta-commentary:\n\n${taskPrompt}`,
    { temperature: 0.8, maxTokens: 4096 },
    handlers
  );
}

async function pageChat(question, options = {}) {
  const agentState = await runPageChatAgent(question, options);
  const citations = selectRelevantCitations(agentState.rewrittenQuestion, agentState.toolResults);
  const response = await generateText(
    buildPageChatPrompt(agentState.rewrittenQuestion, { ...options, ...agentState }),
    { temperature: 0.35, maxTokens: 3072 }
  );
  return {
    ...response,
    meta: {
      ...(response?.meta || {}),
      rewrittenQuestion: agentState.rewrittenQuestion,
      toolsUsed: agentState.toolResults.map((entry) => entry.name),
      citations,
    },
  };
}

async function pageChatStream(question, options = {}, handlers = {}) {
  const agentState = await runPageChatAgent(question, options);
  const citations = selectRelevantCitations(agentState.rewrittenQuestion, agentState.toolResults);
  const response = await generateTextStream(
    buildPageChatPrompt(agentState.rewrittenQuestion, { ...options, ...agentState }),
    { temperature: 0.35, maxTokens: 3072 },
    handlers
  );
  return {
    ...response,
    meta: {
      ...(response?.meta || {}),
      rewrittenQuestion: agentState.rewrittenQuestion,
      toolsUsed: agentState.toolResults.map((entry) => entry.name),
      citations,
    },
  };
}

export async function handleAiMessage(message) {
  if (message?.type === "__ai_get_settings__") {
    const store = await storageGetMany({ gemini_api_key: "", groq_api_key: "", openrouter_api_key: "" });
    return {
      geminiApiKey: store.gemini_api_key || "",
      groqApiKey: store.groq_api_key || "",
      openrouterApiKey: store.openrouter_api_key || "",
    };
  }

  if (message?.type === "__ai_save_settings__") {
    const next = {};
    if (Object.prototype.hasOwnProperty.call(message.value || {}, "geminiApiKey")) {
      next.gemini_api_key = message.value.geminiApiKey || "";
    }
    if (Object.prototype.hasOwnProperty.call(message.value || {}, "groqApiKey")) {
      next.groq_api_key = message.value.groqApiKey || "";
    }
    if (Object.prototype.hasOwnProperty.call(message.value || {}, "openrouterApiKey")) {
      next.openrouter_api_key = message.value.openrouterApiKey || "";
    }
    await storageSet(next);
    return { ok: true };
  }

  if (message?.type === "__ai_run__") {
    const { op, text, options } = message;
    if (op === "summarize") return summarize(text, options);
    if (op === "translate") return translate(text, options);
    if (op === "extract") return extract(text, options);
    if (op === "proofread") return proofread(text);
    if (op === "rewrite") return rewrite(text, options);
    if (op === "write") return write(text, options);
    if (op === "pagechat") return pageChat(text, options);
    throw new Error("Unknown AI operation.");
  }

  return undefined;
}

export async function handleAiStream(message, handlers = {}) {
  const { op, text, options } = message || {};
  if (op === "summarize") {
    const result = await summarizeStream(text, options, handlers);
    handlers.onDone?.(result);
    return result;
  }
  if (op === "translate") {
    const result = await translateStream(text, options, handlers);
    handlers.onDone?.(result);
    return result;
  }
  if (op === "rewrite") {
    const result = await rewriteStream(text, options, handlers);
    handlers.onDone?.(result);
    return result;
  }
  if (op === "write") {
    const result = await writeStream(text, options, handlers);
    handlers.onDone?.(result);
    return result;
  }
  if (op === "pagechat") {
    const result = await pageChatStream(text, options, handlers);
    handlers.onDone?.(result);
    return result;
  }
  throw new Error("Unknown or unsupported AI streaming operation.");
}
