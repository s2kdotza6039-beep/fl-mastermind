// Stream Studio Sensei chat from edge function
import { supabase } from "@/integrations/supabase/client";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface ChatContext {
  /** D19 multilingual advisor language code (BCP-47, closed allowlist). */
  advisorLanguage?: string;
  mode?: "guided" | "quick";
  /** R9: pre-matched FL procedure reference text (client-side matcher, D23). */
  procedures?: string;
  genre?: string;
  stage?: string;
  projectName?: string;
  flVersion?: string;
  flEdition?: string;
  mainUse?: string;
  mainGenre?: string;
  skillLevel?: string;
  nativePlugins?: string[];
  thirdPartyPlugins?: string[];
  customPlugins?: string[];
  // Audio analysis (from Upload page)
  audio?: {
    fileName: string;
    fileFormat?: string;
    durationSec?: number;
    sampleRate?: number;
    bitRate?: number;
    channels?: number;
    peakDb?: number;
    rmsDb?: number;
    lufsEstimate?: number;
    dynamicRangeDb?: number;
    stereoWidth?: number;
    stereoWidthLabel?: string;
    bpm?: number | null;
    detectedKey?: string | null;
    bands?: { low: number; lowMid: number; mid: number; highMid: number; high: number };
    issues?: Array<{ severity: string; title: string; detail: string; recommendation: string }>;
    recommendations?: string[];
  };
  // Long-term project memory passed to Sensei so it remembers the song.
  projectMemory?: {
    projectName: string;
    projectGenre: string | null;
    projectDescription: string | null;
    openIssueCount: number;
    resolvedAdviceCount: number;
    trackVersionCount: number;
    currentTrackFileName: string | null;
    pendingAdviceTitles: string[];
    recentAdvice: Array<{ title: string; status: string; created_at: string }>;
  };
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sensei-chat`;

export async function streamSenseiChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
  onRateLimit,
}: {
  messages: ChatMsg[];
  context?: ChatContext;
  onDelta: (d: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  /** Optional: invoked instead of onError when the server returns 429. */
  onRateLimit?: (info: { retryAfterSec: number; message: string }) => void;
}) {
  // Require an authenticated session — protects content from anonymous scraping.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    onError("Please sign in to chat with Sensei.");
    return;
  }

  let resp: Response;
  try {
    resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ messages, context }),
    });
  } catch {
    onError("Network error reaching Studio Sensei. Check your connection.");
    return;
  }

  if (!resp.ok || !resp.body) {
    let msg = "Sensei is unavailable right now.";
    try {
      const data = await resp.json();
      if (data?.error) msg = data.error;
    } catch {}
    if (resp.status === 429) {
      const retry = Number(resp.headers.get("Retry-After")) || 30;
      const { friendlyRateLimitMessage } = await import("./beta-config");
      const friendly = friendlyRateLimitMessage(retry);
      if (onRateLimit) {
        onRateLimit({ retryAfterSec: retry, message: friendly });
        return;
      }
      msg = friendly;
    }
    if (resp.status === 402) msg = "AI credits exhausted. Add funds in Lovable Cloud workspace settings.";
    onError(msg);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const c = parsed.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }

  if (buffer.trim()) {
    for (let raw of buffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (!raw.startsWith("data: ")) continue;
      const json = raw.slice(6).trim();
      if (json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const c = parsed.choices?.[0]?.delta?.content;
        if (c) onDelta(c);
      } catch {}
    }
  }

  onDone();
}
