export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const GEMINI_MODEL_OPTIONS = [
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "Stable default \u00B7 best free-tier balance",
    shortLabel: "2.5 Flash",
  },
  {
    value: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    note: "Best free-tier accuracy \u00B7 lower daily quota",
    shortLabel: "2.5 Pro",
  },
  {
    value: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    note: "Newer preview model \u00B7 strongest experimental option",
    shortLabel: "3 Flash Preview",
  },
];

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

export const GROQ_MODEL_OPTIONS = [
  {
    value: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    pickerLabel: "GPT-OSS 120B \u00B7 Most powerful",
    note: "Most powerful option here \u00B7 tighter TPM limits on free Groq",
    shortLabel: "GPT-OSS 120B",
    structuredOutput: "json_schema",
  },
  {
    value: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    pickerLabel: "Llama 3.3 70B \u00B7 Strong all-rounder",
    note: "Strong all-round text model \u00B7 JSON object mode only",
    shortLabel: "Llama 3.3 70B",
    structuredOutput: "json_object",
  },
  {
    value: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout",
    pickerLabel: "Llama 4 Scout \u00B7 Recommended long input",
    note: "Best fit for longer inputs on free Groq limits \u00B7 supports JSON Schema",
    shortLabel: "Llama 4 Scout",
    structuredOutput: "json_schema",
  },
  {
    value: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    pickerLabel: "GPT-OSS 20B \u00B7 Recommended speed",
    note: "Best for quick everyday text tasks \u00B7 supports JSON Schema",
    shortLabel: "GPT-OSS 20B",
    structuredOutput: "json_schema",
  },
];

export const OPENROUTER_FREE_MODEL = "openrouter/free";

export const GPT_OSS_MODELS = new Set(
  GROQ_MODEL_OPTIONS
    .filter((option) => option.value.startsWith("openai/gpt-oss"))
    .map((option) => option.value)
);

export const ALLOWED_GEMINI_MODELS = new Set(GEMINI_MODEL_OPTIONS.map((option) => option.value));
export const ALLOWED_GROQ_MODELS = new Set(GROQ_MODEL_OPTIONS.map((option) => option.value));

export function getGroqModelOption(model) {
  return GROQ_MODEL_OPTIONS.find((option) => option.value === model) || GROQ_MODEL_OPTIONS[0];
}

export function getGroqModelLabel(model) {
  return getGroqModelOption(model).label;
}

export function getGeminiModelOption(model) {
  return GEMINI_MODEL_OPTIONS.find((option) => option.value === model) || GEMINI_MODEL_OPTIONS[0];
}
