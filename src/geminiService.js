const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const PROOFREAD_SCHEMA = {
  type: "object",
  properties: {
    correctedText: { type: "string" },
    changes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["correctedText", "changes"],
};

function storageGet(key, fallback = "") {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: fallback }, (store) => resolve(store[key] ?? fallback));
  });
}

function storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function getFriendlyError(status, apiMessage) {
  if (status === 403) return "API key invalid or not authorized. Check Settings.";
  if (status === 429) return "Rate limit hit. Wait a moment and try again.";
  if (status >= 500) return "Gemini is temporarily unavailable. Try again in a moment.";
  return apiMessage || `Gemini API error (${status})`;
}

function getCandidateText(candidate) {
  return candidate?.content?.parts?.map((part) => part?.text || "").join("").trim() || "";
}

function getFinishReasonError(finishReason) {
  const reason = String(finishReason || "").toUpperCase();
  if (!reason || reason === "STOP") return "";
  if (reason === "MAX_TOKENS") return "Response was truncated by Gemini. Try a shorter input.";
  if (reason === "SAFETY") return "Response was blocked by Gemini safety filters.";
  if (reason === "RECITATION") return "Response was blocked due to recitation limits.";
  return `Gemini stopped with finish reason: ${finishReason}.`;
}

async function generateText(prompt, apiKey, options = {}) {
  if (!apiKey) throw new Error("NO_API_KEY");

  const generationConfig = {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens ?? 2048,
  };

  if (options.responseMimeType) generationConfig.responseMimeType = options.responseMimeType;
  if (options.responseSchema) generationConfig.responseSchema = options.responseSchema;
  if (options.responseJsonSchema) generationConfig.responseJsonSchema = options.responseJsonSchema;

  const res = await fetch(GEMINI_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });

  if (!res.ok) {
    let apiMessage = "";
    try {
      const err = await res.json();
      apiMessage = err?.error?.message || "";
    } catch {}
    throw new Error(getFriendlyError(res.status, apiMessage));
  }

  const data = await res.json();
  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Prompt blocked by Gemini: ${data.promptFeedback.blockReason}.`);
  }

  const candidate = data?.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidate response.");

  const finishReasonError = getFinishReasonError(candidate.finishReason);
  if (finishReasonError) throw new Error(finishReasonError);

  const text = getCandidateText(candidate);
  if (!text) throw new Error("Gemini returned an empty response.");

  return text;
}

async function summarize(text, { words, length } = {}) {
  const key = await storageGet("gemini_api_key", "");
  const hint =
    typeof words === "number" && words > 0
      ? `in approximately ${words} words`
      : length === "short"
      ? "in 2-3 sentences"
      : length === "long"
      ? "in a detailed, thorough paragraph"
      : "in a concise paragraph (4-6 sentences)";

  return generateText(
    `Summarize the following text ${hint}. Return only the summary with no preamble or labels:\n\n${text}`,
    key
  );
}

async function translate(text, { from = "auto", to = "en" } = {}) {
  const key = await storageGet("gemini_api_key", "");
  const fromHint = from && from !== "auto" ? ` from ${from}` : "";
  return generateText(
    `Translate the following text${fromHint} to ${to}. Return only the translated text with no explanation:\n\n${text}`,
    key
  );
}

async function proofread(text) {
  const key = await storageGet("gemini_api_key", "");
  const raw = await generateText(
    `Proofread the following text. Fix grammar, spelling, punctuation, and clarity. ` +
    `Return the corrected text and a list of concrete changes.\n\nText:\n${text}`,
    key,
    {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: PROOFREAD_SCHEMA,
    }
  );

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Gemini returned invalid proofread JSON.");
  }

  return {
    correctedText: typeof parsed?.correctedText === "string" ? parsed.correctedText : "",
    changes: Array.isArray(parsed?.changes) ? parsed.changes.map(String) : [],
  };
}

const REWRITE_PROMPTS = {
  paragraph:
    "Rewrite the following text as a clean, well-structured paragraph. Preserve the core meaning. Return only the rewritten text:",
  "key-points":
    "Extract and list the key points from the following text as concise bullet points (use • as bullet). Return only the bullet list:",
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
  const key = await storageGet("gemini_api_key", "");
  const prompt = REWRITE_PROMPTS[mode] || REWRITE_PROMPTS.paragraph;
  return generateText(`${prompt}\n\n${text}`, key, { temperature: 0.6 });
}

async function write(taskPrompt, { tone = "neutral" } = {}) {
  const key = await storageGet("gemini_api_key", "");
  return generateText(
    `Write high-quality content based on the following prompt. Use a ${tone} tone. Return only the written content with no meta-commentary:\n\n${taskPrompt}`,
    key,
    { temperature: 0.8, maxTokens: 4096 }
  );
}

export async function handleAiMessage(message) {
  if (message?.type === "__ai_get_api_key__") {
    return storageGet("gemini_api_key", "");
  }

  if (message?.type === "__ai_save_api_key__") {
    await storageSet("gemini_api_key", message.value || "");
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
