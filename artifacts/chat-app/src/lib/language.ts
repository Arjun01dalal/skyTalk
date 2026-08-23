import type { Message } from "@workspace/api-client-react";

// Languages a customer can pick before starting a chat. Codes must match the
// backend's SUPPORTED_LANGUAGES map (api-server/src/lib/translate.ts).
export const SUPPORTED_LANGUAGES: { code: string; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
];

export function languageLabel(code?: string | null): string {
  const l = SUPPORTED_LANGUAGES.find((x) => x.code === code);
  return l ? l.name : code || "English";
}

// Staff (agents/admins) always read the English rendition when one exists.
export function staffText(msg: Pick<Message, "content" | "contentEn">): string | null | undefined {
  return msg.contentEn ?? msg.content;
}
