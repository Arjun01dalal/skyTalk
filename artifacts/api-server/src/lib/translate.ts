import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const AI_MODEL = "gpt-5.6-luna";

// Languages offered to customers before a chat starts. Staff always work in English.
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
  te: "Telugu",
  ta: "Tamil",
};

export function languageName(code: string): string {
  return SUPPORTED_LANGUAGES[code] ?? code;
}

const TRANSLATE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("translation timed out")),
        TRANSLATE_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * One-call dual rendition for customer-authored text: returns the message in
 * the customer's language (`local`) and in English (`en`), regardless of the
 * language the customer actually typed in. Falls back to the original text.
 */
export async function translateDual(
  text: string,
  customerLang: string,
): Promise<{ local: string; en: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { local: text, en: text };
  try {
    const response = await withTimeout(openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a translation engine for a customer-support chat. The customer's chosen language is ${languageName(customerLang)}. Given the customer's message (which may be typed in any language, including transliterated/romanized text), respond ONLY with a JSON object: {"local": the message rendered in ${languageName(customerLang)}, "en": the message rendered in English}. Preserve meaning, tone, numbers, names, and codes. If the message is already in the target language, return it unchanged for that field.`,
        },
        { role: "user", content: trimmed },
      ],
    }));
    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as { local?: string; en?: string };
    return {
      local: parsed.local?.trim() || text,
      en: parsed.en?.trim() || text,
    };
  } catch (err) {
    logger.error({ err, customerLang }, "Dual translation failed; using original text");
    return { local: text, en: text };
  }
}

/**
 * Translate `text` into `targetLang` ("en" or a supported code).
 * Falls back to the original text on failure (logged) — a chat message must
 * never be dropped because translation was unavailable.
 */
export async function translateText(
  text: string,
  targetLang: string,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  try {
    // Bounded: a slow translation must not stall message delivery.
    const response = await withTimeout(openai.chat.completions.create({
      model: AI_MODEL,
      max_completion_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are a translation engine for a customer-support chat. Translate the user's message into ${languageName(targetLang)}. Preserve meaning, tone, numbers, names, codes, and formatting. If the message is already in ${languageName(targetLang)}, return it unchanged. Respond ONLY with the translated text — no quotes, no explanations.`,
        },
        { role: "user", content: trimmed },
      ],
    }));
    const out = response.choices[0]?.message?.content?.trim();
    return out || text;
  } catch (err) {
    logger.error({ err, targetLang }, "Translation failed; using original text");
    return text;
  }
}

// In-memory cache for UI-label translations (category names etc.). Keyed by
// `${lang}:${text}` — safe because labels are short and low-cardinality.
const labelCache = new Map<string, string>();
const LABEL_CACHE_MAX = 2000;
function labelCacheSet(key: string, value: string) {
  // Bounded: evict oldest entries so the cache can never grow without limit.
  if (labelCache.size >= LABEL_CACHE_MAX) {
    const oldest = labelCache.keys().next().value;
    if (oldest !== undefined) labelCache.delete(oldest);
  }
  labelCache.set(key, value);
}

/**
 * Translate a batch of short UI labels into `targetLang` with caching.
 * Falls back per-string to the original text on failure. One LLM call is made
 * for all cache misses together.
 */
export async function translateLabelsCached(
  texts: string[],
  targetLang: string,
): Promise<string[]> {
  if (targetLang === "en") return texts;
  const misses: string[] = [];
  for (const t of texts) {
    const trimmed = t.trim();
    if (trimmed && !labelCache.has(`${targetLang}:${trimmed}`) && !misses.includes(trimmed)) {
      misses.push(trimmed);
    }
  }
  if (misses.length > 0) {
    try {
      const response = await withTimeout(openai.chat.completions.create({
        model: AI_MODEL,
        max_completion_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You translate short customer-support UI labels into ${languageName(targetLang)}. Given a JSON object {"items": [strings]}, respond ONLY with {"items": [translated strings]} in the SAME order and length. Keep translations short and natural for buttons/headings. Preserve numbers, codes, emoji, and brand names.`,
          },
          { role: "user", content: JSON.stringify({ items: misses }) },
        ],
      }));
      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as { items?: string[] };
      if (Array.isArray(parsed.items) && parsed.items.length === misses.length) {
        misses.forEach((m, i) => {
          const out = parsed.items![i]?.trim();
          if (out) labelCacheSet(`${targetLang}:${m}`, out);
        });
      }
    } catch (err) {
      logger.error({ err, targetLang }, "Label batch translation failed; using originals");
    }
  }
  return texts.map((t) => labelCache.get(`${targetLang}:${t.trim()}`) ?? t);
}
