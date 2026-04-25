// Stream Studio Sensei chat from edge function
export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface ChatContext {
  genre?: string;
  stage?: string;
  projectName?: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sensei-chat`;

export async function streamSenseiChat({
  messages,
  context,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMsg[];
  context?: ChatContext;
  onDelta: (d: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  let resp: Response;
  try {
    resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
    if (resp.status === 429) msg = "Too many requests. Wait a moment and try again.";
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
