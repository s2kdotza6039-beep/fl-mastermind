// Studio Sensei — Paddle Billing webhook.
// Verifies the Paddle-Signature header (HMAC-SHA256 over "ts:body" using the
// notification secret), records events idempotently, and grants/revokes the
// "paid" role based on subscription lifecycle events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };
const encoder = new TextEncoder();

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";

  const raw = await req.text();

  // 1) Verify signature when a secret is configured.
  if (WEBHOOK_SECRET) {
    const signature =
      req.headers.get("paddle-signature") ?? req.headers.get("Paddle-Signature") ?? "";
    if (!(await verifySignature(raw, signature, WEBHOOK_SECRET))) {
      return json({ error: "Invalid signature" }, 401);
    }
  } else {
    // No secret configured: accept the event but flag it loudly so the admin
    // knows webhook verification is off.
    const admin0 = createClient(SUPABASE_URL, SERVICE);
    await admin0.from("security_alerts").insert({
      severity: "high",
      alert_type: "webhook_unverified",
      message: "Paddle webhook received without PADDLE_WEBHOOK_SECRET configured.",
      metadata: { source: "paddle-webhook" },
    });
  }

  let event: {
    event_type?: string;
    notification_id?: string;
    data?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const type = event?.event_type ?? "";
  const data = (event?.data ?? {}) as Record<string, unknown>;
  const admin = createClient(SUPABASE_URL, SERVICE);

  // 2) Idempotency: Paddle retries webhooks, so skip events we already handled.
  const eventId = String(
    event?.notification_id ?? data.id ?? data.subscription_id ?? `${type}:unknown`,
  );
  const { data: dup } = await admin
    .from("billing_events")
    .select("id")
    .eq("event", type)
    .eq("event_id", eventId)
    .maybeSingle();
  if (dup) return json({ ok: true, deduped: true });

  await admin.from("billing_events").insert({
    event: type,
    event_id: eventId,
    reference: typeof data.id === "string" ? data.id : null,
    payload: data as unknown as Record<string, never>,
  });

  // 3) Extract identity fields.
  const customData = (data.custom_data ?? {}) as Record<string, unknown>;
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const email = String(customer.email ?? data.email ?? "").toLowerCase();
  const customerId = (data.customer_id ?? customer.id ?? null) as string | null;
  const subscriptionId = (data.subscription_id ?? null) as string | null;
  const txnId = (data.id ?? null) as string | null;
  const period = (data.current_billing_period ?? null) as Record<string, unknown> | null;
  const periodEnd = (period?.ends_at ?? null) as string | null;
  const items = (data.items ?? null) as Array<Record<string, unknown>> | null;
  const priceId = (items?.[0]?.price?.id ?? null) as string | null;

  // Resolve the Supabase user id: custom_data set at checkout first, then our
  // subscriptions table by customer/subscription/email.
  let userId = typeof customData.user_id === "string" ? customData.user_id : null;
  if (!userId && subscriptionId) {
    const { data: r } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_subscription_id", subscriptionId)
      .maybeSingle();
    userId = r?.user_id ?? null;
  }
  if (!userId && customerId) {
    const { data: r } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("paddle_customer_id", customerId)
      .maybeSingle();
    userId = r?.user_id ?? null;
  }
  if (!userId && email) {
    const { data: r } = await admin
      .from("subscriptions")
      .select("user_id")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    userId = r?.user_id ?? null;
  }

  // 4) Act on the event.
  const patch: Record<string, unknown> = {
    status: "active",
    paddle_customer_id: customerId,
    paddle_subscription_id: subscriptionId,
    paddle_price_id: priceId,
    current_period_end: periodEnd,
  };
  if (email) patch.email = email;
  if (type === "transaction.completed" && txnId) patch.paddle_transaction_id = txnId;

  if (type === "subscription.activated" || type === "transaction.completed") {
    if (userId) await grantPaid(admin, userId);
    if (subscriptionId) {
      await admin.from("subscriptions").update(patch).eq("paddle_subscription_id", subscriptionId);
    }
    if (txnId) {
      await admin.from("subscriptions").update(patch).eq("paddle_transaction_id", txnId);
    }
    if (userId) {
      await admin.from("subscriptions").update(patch).eq("user_id", userId).eq("status", "pending");
    }
    return json({ ok: true, granted: Boolean(userId) });
  }

  if (type === "subscription.canceled") {
    const cancelPatch = { status: "cancelled" as const };
    if (subscriptionId) {
      const { data: r } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("paddle_subscription_id", subscriptionId)
        .maybeSingle();
      const uid = userId ?? r?.user_id ?? null;
      if (uid) await revokePaid(admin, uid);
      await admin.from("subscriptions").update(cancelPatch).eq("paddle_subscription_id", subscriptionId);
    } else if (userId) {
      await revokePaid(admin, userId);
      await admin.from("subscriptions").update(cancelPatch).eq("user_id", userId).eq("status", "active");
    }
    return json({ ok: true, revoked: true });
  }

  if (type === "subscription.updated") {
    const status = (data.status ?? null) as string | null;
    if (status === "paused" || status === "past_due") {
      if (subscriptionId) {
        await admin.from("subscriptions").update({ status }).eq("paddle_subscription_id", subscriptionId);
      } else if (userId) {
        await admin.from("subscriptions").update({ status }).eq("user_id", userId).in("status", ["active"]);
      }
    }
    return json({ ok: true, recorded: true });
  }

  // Everything else is recorded only.
  return json({ ok: true, recorded: true });
});

async function grantPaid(admin: ReturnType<typeof createClient>, userId: string) {
  await admin
    .from("user_roles")
    .upsert({ user_id: userId, role: "paid" }, { onConflict: "user_id,role" });
}

async function revokePaid(admin: ReturnType<typeof createClient>, userId: string) {
  await admin.from("user_roles").delete().eq("user_id", userId).eq("role", "paid");
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  let ts = "";
  let h1 = "";
  for (const part of signature.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "ts") ts = v;
    if (k === "h1") h1 = v;
  }
  if (!ts || !h1) return false;
  const expected = await hmacSha256Hex(`${ts}:${rawBody}`, secret);
  return timingSafeEqual(expected, h1);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
