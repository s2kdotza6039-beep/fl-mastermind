// Per-message thumbs rating (D24). Session-local only for now — analytics
// wiring ships in a later batch. Keyed by stable message content hash.
const PREFIX = "sensei.msg.rating.";

export type MessageRating = "up" | "down";

export function loadMessageRating(messageKey: string): MessageRating | null {
  try {
    const raw = localStorage.getItem(PREFIX + messageKey);
    return raw === "up" || raw === "down" ? raw : null;
  } catch { return null; }
}

export function storeMessageRating(messageKey: string, rating: MessageRating | null) {
  try {
    if (rating) localStorage.setItem(PREFIX + messageKey, rating);
    else localStorage.removeItem(PREFIX + messageKey);
  } catch { /* ignore */ }
}
