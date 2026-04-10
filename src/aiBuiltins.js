// src/aiBuiltins.js — Gemini 1.5 Flash API backend

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

/* ── Key helpers ── */
export async function getApiKey() {
  return new Promise((resolve) =>
    chrome.storage.local.get({ gemini_api_key: "" }, (s) =>
      resolve(s.gemini_api_key || "")
    )
  );
}
export async function saveApiKey(key) {
  return new Promise((resolve) =>
    chrome.storage.local.set({ gemini_api_key: key }, resolve)
  );
}

/* ── Core fetch ── */
async function gemini(prompt, apiKey, { temperature = 0.7, maxTokens = 2048 } = {}) {
  if (!apiKey) throw new Error("NO_API_KEY");

  const res = await fetch(GEMINI_URL(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });

  if (!res.ok) {
    let msg = `Gemini API error (${res.status})`;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    // surface a friendlier message for common errors
    if (res.status === 400) msg = "Invalid request. Check your API key.";
    if (res.status === 403) msg = "API key invalid or not authorized. Check ⚙️ Settings.";
    if (res.status === 429) msg = "Rate limit hit. Wait a moment and try again.";
    throw new Error(msg);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

/* ── Summarize ── */
export async function summarize(text, { words, length } = {}) {
  const key = await getApiKey();
  const hint =
    typeof words === "number" && words > 0
      ? `in approximately ${words} words`
      : length === "short"
      ? "in 2–3 sentences"
      : length === "long"
      ? "in a detailed, thorough paragraph"
      : "in a concise paragraph (4–6 sentences)";

  return gemini(
    `Summarize the following text ${hint}. Return only the summary — no preamble, no labels:\n\n${text}`,
    key
  );
}

/* ── Translate ── */
export async function translate(text, { from = "auto", to = "en" } = {}) {
  const key = await getApiKey();
  const fromHint = from && from !== "auto" ? ` from ${from}` : "";
  return gemini(
    `Translate the following text${fromHint} to ${to}. Return only the translated text — no explanation, no preamble:\n\n${text}`,
    key
  );
}

/* ── Proofread ── */
export async function proofread(text) {
  const key = await getApiKey();
  const raw = await gemini(
    `Proofread the following text. Fix grammar, spelling, punctuation, and clarity. ` +
    `Return ONLY a JSON object (no markdown fences) with exactly two fields:\n` +
    `{ "correctedText": "<fixed text>", "changes": ["<description of change 1>", ...] }\n\n` +
    `Text:\n${text}`,
    key,
    { temperature: 0.2 }
  );

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned);
  } catch {
    // If Gemini didn't return valid JSON, treat the whole response as corrected text
    return { correctedText: raw, changes: [] };
  }
}

/* ── Rewrite ── */
const REWRITE_PROMPTS = {
  "paragraph":
    "Rewrite the following text as a clean, well-structured paragraph. Preserve the core meaning. Return only the rewritten text:",
  "key-points":
    "Extract and list the key points from the following text as concise bullet points (use • as bullet). Return only the bullet list:",
  "table":
    "Convert the following text into a concise Markdown table with clear column headers. Return only the Markdown table:",
  "tone:formal":
    "Rewrite the following text in a formal, professional tone. Preserve meaning. Return only the rewritten text:",
  "tone:neutral":
    "Rewrite the following text in a neutral, clear tone. Preserve meaning. Return only the rewritten text:",
  "tone:casual":
    "Rewrite the following text in a casual, friendly, conversational tone. Return only the rewritten text:",
};

export async function rewrite(text, mode = "paragraph") {
  const key = await getApiKey();
  const prompt = REWRITE_PROMPTS[mode] || REWRITE_PROMPTS["paragraph"];
  return gemini(`${prompt}\n\n${text}`, key, { temperature: 0.6 });
}

/* ── Write ── */
export async function write(taskPrompt, { tone = "neutral" } = {}) {
  const key = await getApiKey();
  return gemini(
    `Write high-quality content based on the following prompt. Use a ${tone} tone. ` +
    `Return only the written content — no meta-commentary:\n\n${taskPrompt}`,
    key,
    { temperature: 0.8, maxTokens: 4096 }
  );
}
