// Multilingual Sensei (decision D19) — advisor language preference with a
// closed allowlist. Persists to localStorage; never enters the DB.
export interface AdvisorLanguage { code: string; label: string; native: string }

export const ADVISOR_LANGUAGES: AdvisorLanguage[] = [
  { code: "en", label: "English", native: "English" },
  { code: "zu", label: "isiZulu", native: "isiZulu" },
  { code: "xh", label: "isiXhosa", native: "isiXhosa" },
  { code: "st", label: "Sesotho", native: "Sesotho" },
  { code: "af", label: "Afrikaans", native: "Afrikaans" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "sw", label: "Swahili", native: "Kiswahili" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

export const ADVISOR_LANG_KEY = "sensei.advisorLanguage";
export const DEFAULT_ADVISOR_LANG = "en";

export function isAdvisorLanguage(code: string): boolean {
  return ADVISOR_LANGUAGES.some((l) => l.code === code);
}

export function loadAdvisorLanguage(): string {
  try {
    const raw = localStorage.getItem(ADVISOR_LANG_KEY);
    if (raw && isAdvisorLanguage(raw)) return raw;
  } catch { /* storage unavailable */ }
  return DEFAULT_ADVISOR_LANG;
}

export function storeAdvisorLanguage(code: string) {
  try {
    if (isAdvisorLanguage(code)) localStorage.setItem(ADVISOR_LANG_KEY, code);
    else localStorage.removeItem(ADVISOR_LANG_KEY);
  } catch { /* ignore */ }
}

/** BCP-47 tag for TTS utterance.lang (our codes are already valid BCP-47). */
export function advisorBcp47(code: string): string {
  return isAdvisorLanguage(code) ? code : DEFAULT_ADVISOR_LANG;
}
