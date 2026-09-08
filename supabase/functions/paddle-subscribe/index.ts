// Studio Sensei — start a Paddle Billing hosted checkout for Pro ($10/mo USD).
// Paddle is the Merchant of Record. Requires an authenticated caller; the
// Paddle API key and price ID live server-side and never reach the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PADDLE_API_BASE = Deno.env.get("PADDLE_API_BASE") ?? "https://api.paddle.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");
    const PADDLE_PRICE_ID = Deno.env.get("PADDLE_PRICE_ID");
    if (!PADDLE_API_KEY) {
      return json({ error: "PADDLE_API_KEY is not configured on this function" }, 500);
    }
    if (!PADDLE_PRICE_ID) {
      return json({ error: "PADDLE_PRICE_ID is not configured on this function" }, 500);
    }

    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);
    const user = userData.user;
    const email = user.email ?? "";
    if (!email) return json({ error: "Account has no email address" }, 400);

    const body = await req.json().catch(() => null);
    const callbackUrl =
      typeof body?.callback_url === "string" && body.callback_url.trim()
        ? body.callback_url.trim()
        : `${Deno.env.get("APP_ORIGIN") ?? "https://studio-sensei.lovable.app"}/upgrade`;

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Already a paying member? Don't start a second checkout.
    const { data: existing } = await admin
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "past_due", "paused"])
      .maybeSingle();
    if (existing) return json({ already_subscribed: true });

    // Record the intent. The webhook flips this to "active" on transaction.completed.
    await admin.from("subscriptions").insert({
      user_id: user.id,
      email,
      status: "pending",
      paddle_price_id: PADDLE_PRICE_ID,
    });

    // Resolve (or create) the Paddle customer for this email.
    let customerId: string | null = null;
    const lookup = await fetch(
      `${PADDLE_API_BASE}/customers?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${PADDLE_API_KEY}` } },
    );
    if (lookup.ok) {
      const lookupData = await lookup.json().catch(() => null);
      customerId = lookupData?.data?.[0]?.id ?? null;
    }
    if (!customerId) {
      const createRes = await fetch(`${PADDLE_API_BASE}/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const createData = await createRes.json().catch(() => null);
      if (!createRes.ok || !createData?.data?.id) {
        return json(
          { error: createData?.error?.detail || `Paddle customer create failed (HTTP ${createRes.status})` },
          502,
        );
      }
      customerId = createData.data.id;
    }

    // Create the transaction with a hosted checkout. A recurring price makes
    // Paddle spin up the subscription on first payment.
    const txnRes = await fetch(`${PADDLE_API_BASE}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id: PADDLE_PRICE_ID, quantity: 1 }],
        customer_id: customerId,
        custom_data: { user_id: user.id, plan: "pro", studio_sensei: true },
        checkout: { url: callbackUrl },
      }),
    });
    const txnData = await txnRes.json().catch(() => null);
    if (!txnRes.ok || !txnData?.data?.checkout?.url) {
      return json(
        { error: txnData?.error?.detail || `Paddle checkout failed (HTTP ${txnRes.status})` },
        502,
      );
    }

    await admin
      .from("subscriptions")
      .update({ paddle_transaction_id: txnData.data.id ?? null, paddle_customer_id: customerId })
      .eq("user_id", user.id)
      .eq("status", "pending");

    return json({
      checkout_url: txnData.data.checkout.url,
      transaction_id: txnData.data.id,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
