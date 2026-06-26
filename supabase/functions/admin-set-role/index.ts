// Admin-only edge function for assigning/removing user roles.
// Client cannot write to public.user_roles directly (RLS + grants + trigger guard).
// This function verifies the caller is an admin, then uses the service role to mutate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["admin", "paid", "free"]);
const ALLOWED_ACTIONS = new Set(["add", "remove"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Missing Authorization bearer token" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Caller-scoped client validates JWT and lets us call has_role as the user.
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

    const { data: isAdmin, error: roleErr } = await asUser.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const userId = body?.user_id;
    const role = body?.role;
    const action = body?.action;

    if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return json({ error: "Invalid user_id" }, 400);
    }
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return json({ error: "Invalid role" }, 400);
    }
    if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    // Guardrail: do not let an admin demote themselves out of admin (avoid lockout).
    if (action === "remove" && role === "admin" && userId === userData.user.id) {
      return json({ error: "Refusing to remove your own admin role" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    if (action === "add") {
      const { error } = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) return json({ error: error.message }, 500);
    }

    return json({ ok: true });
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
