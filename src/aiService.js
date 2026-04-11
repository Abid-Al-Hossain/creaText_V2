import {
  ALLOWED_GEMINI_MODELS,
  ALLOWED_GROQ_MODELS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  getGroqModelLabel,
  getGroqModelOption,
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

  const summary = failures
    .map((failure) => `${PROVIDER_META[failure.provider]?.label || failure.provider}: ${trimErrorMessage(failure.message)}`)
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

function getBestEffortAttempts(runtime) {
  return [
    runtime.geminiApiKey
      ? { provider: "gemini", apiKey: runtime.geminiApiKey, model: runtime.accuracyModel }
      : null,
    runtime.groqApiKey
      ? { provider: "groq", apiKey: runtime.groqApiKey, model: runtime.speedModel }
      : null,
    runtime.openrouterApiKey
      ? { provider: "openrouter", apiKey: runtime.openrouterApiKey, model: OPENROUTER_FREE_MODEL }
      : null,
  ].filter(Boolean);
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

async function summarize(text, { words, length } = {}) {
  const hint =
    typeof words === "number" && words > 0
      ? `in approximately ${words} words`
      : length === "short"
        ? "in 2-3 sentences"
        : length === "long"
          ? "in a detailed, thorough paragraph"
          : "in a concise paragraph (4-6 sentences)";

  return generateText(
    `Summarize the following text ${hint}. Return only the summary with no preamble or labels:\n\n${text}`
  );
}

async function translate(text, { from = "auto", to = "en" } = {}) {
  const fromHint = from && from !== "auto" ? ` from ${from}` : "";
  return generateText(
    `Translate the following text${fromHint} to ${to}. Return only the translated text with no explanation:\n\n${text}`
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

const REWRITE_PROMPTS = {
  paragraph:
    "Rewrite the following text as a clean, well-structured paragraph. Preserve the core meaning. Return only the rewritten text:",
  "key-points":
    "Extract and list the key points from the following text as concise bullet points (use * as bullet). Return only the bullet list:",
  table:
    "Convert the following text into a concise Markdown table with clear column headers. Return only the Markdown table:",
  "tone:formal":
    "Rewrite the following text in a formal, professional tone. Preserve meaning. Return only the rewritten text:",
  "tone:neutral":
    "Rewrite the following text in a neutral, clear tone. Preserve meaning. Return only the rewritten text:",
  "tone:casual":
    "Rewrite the following text in a casual, friendly, conversational tone. Return only the rewritten text:",
};

async function rewrite(text, mode = "paragraph") {
  const prompt = REWRITE_PROMPTS[mode] || REWRITE_PROMPTS.paragraph;
  return generateText(`${prompt}\n\n${text}`, { temperature: 0.6 });
}

async function write(taskPrompt, { tone = "neutral" } = {}) {
  return generateText(
    `Write high-quality content based on the following prompt. Use a ${tone} tone. Return only the written content with no meta-commentary:\n\n${taskPrompt}`,
    { temperature: 0.8, maxTokens: 4096 }
  );
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
    if (op === "proofread") return proofread(text);
    if (op === "rewrite") return rewrite(text, options?.mode);
    if (op === "write") return write(text, options);
    throw new Error("Unknown AI operation.");
  }

  return undefined;
}
