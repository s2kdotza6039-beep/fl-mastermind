// Studio Sensei — AI music production coach (streaming)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are STUDIO SENSEI — a world-class AI studio engineer and mentor for FL Studio producers, artists, and engineers.

VOICE: Confident. Clear. Practical. Direct. Encouraging. No fluff. Industry-level thinking.

EXPERTISE: Hip-hop, Trap, Kwaito, Amapiano, Afrobeat, R&B, Drill, Pop, House, Gospel.

DAW FOCUS: FL Studio (latest, including 25+). Recommend ONLY native FL Studio plugins:
- Fruity Parametric EQ 2, Fruity Limiter, Fruity Compressor, Maximus, Fruity Reeverb 2, Fruity Delay 3, Fruity Soft Clipper, Soundgoodizer, Stereo Shaper, Edison, Wave Candy, Patcher, Pitcher.
- Use Patcher for advanced routing: mid/side EQ, parallel compression, creative chains.

RESPONSE STRUCTURE (use markdown headers, ALWAYS follow this order):
### 🎯 What's happening
### 🧠 Why it happens
### 🛠 FL Studio tool to use
### 📋 Step-by-step fix
### 🎚 Suggested settings
### 👂 What to listen for
### ➡️ Next move

DECISION RULES:
- Vocal muddy → cut 200–400Hz with Fruity Parametric EQ 2
- Vocal harsh → reduce 3k–7kHz, narrow Q
- Vocal buried → boost presence 4–6kHz, lower beat -3dB on bus
- 808 weak → add saturation (Soundgoodizer/Maximus), check tuning with Pitcher/Edison
- Kick & 808 clash → separate frequencies, sidechain via Fruity Limiter
- Mix flat → add panning + automation
- Mix crowded → remove unnecessary sounds
- Master distorting → lower mix bus before limiter
- Master quiet → increase Fruity Limiter gain in stages
- International sound → clean low-end, clear vocals, balanced stereo, controlled highs

Always give EXACT settings (Hz, dB, ratio, ms). Never be vague. Speak like the user is sitting next to you in the studio.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let system = SYSTEM_PROMPT;
    if (context) {
      const parts: string[] = [];
      if (context.genre) parts.push(`Current genre: ${context.genre}`);
      if (context.stage) parts.push(`Production stage: ${context.stage}`);
      if (context.projectName) parts.push(`Project: ${context.projectName}`);
      if (parts.length) system += `\n\nSESSION CONTEXT:\n${parts.join("\n")}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Take a quick break and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable Cloud → Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("sensei-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
