// Public RSS + JSON feed for /status incidents.
// Usage:
//   /functions/v1/status-feed            -> RSS (default)
//   /functions/v1/status-feed?format=rss -> RSS
//   /functions/v1/status-feed?format=json -> JSON Feed v1.1
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "rss").toLowerCase();
  const origin = req.headers.get("origin") ?? "https://studio-sensei.lovable.app";
  const siteUrl = `${origin.replace(/\/$/, "")}/status`;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("incidents")
    .select("id, title, body, severity, status, started_at, resolved_at, updated_at")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = data ?? [];

  if (format === "json") {
    const feed = {
      version: "https://jsonfeed.org/version/1.1",
      title: "Studio Sensei Status",
      home_page_url: siteUrl,
      feed_url: `${url.origin}${url.pathname}?format=json`,
      description: "Operational status and incident history for Studio Sensei.",
      items: rows.map((i: any) => ({
        id: i.id,
        url: `${siteUrl}#${i.id}`,
        title: `[${i.severity.toUpperCase()} · ${i.status}] ${i.title}`,
        content_text: i.body || i.title,
        date_published: i.started_at,
        date_modified: i.updated_at ?? i.resolved_at ?? i.started_at,
        tags: [i.severity, i.status],
      })),
    };
    return new Response(JSON.stringify(feed, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/feed+json; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  }

  // Default: RSS 2.0
  const items = rows
    .map((i: any) => {
      const link = `${siteUrl}#${i.id}`;
      const pub = new Date(i.updated_at ?? i.started_at).toUTCString();
      const desc = `[${i.severity.toUpperCase()} · ${i.status}] ${i.body ?? ""}`;
      return `    <item>
      <title>${xmlEscape(i.title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(i.id)}</guid>
      <pubDate>${pub}</pubDate>
      <category>${xmlEscape(i.severity)}</category>
      <category>${xmlEscape(i.status)}</category>
      <description>${xmlEscape(desc)}</description>
    </item>`;
    })
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Studio Sensei Status</title>
    <link>${xmlEscape(siteUrl)}</link>
    <description>Operational status and incident history for Studio Sensei.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(url.origin + url.pathname)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(rss, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
});
