// Watermark text exports so they trace back to Studio Sensei + the user.
import { supabase } from "@/integrations/supabase/client";

export async function watermarkExport(body: string, kind: string): Promise<string> {
  let user = "anonymous";
  let userId = "—";
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      user = data.user.email || data.user.id;
      userId = data.user.id;
    }
  } catch {}
  const stamp = new Date().toISOString();
  const header = [
    `========================================================`,
    `  STUDIO SENSEI — ${kind.toUpperCase()}`,
    `  © ${new Date().getFullYear()} Studio Sensei. All rights reserved.`,
    `  Licensed for personal studio use only.`,
    `  No copying, no resale, no reverse engineering.`,
    `  Issued to : ${user}`,
    `  User ID   : ${userId}`,
    `  Generated : ${stamp}`,
    `========================================================`,
    ``,
  ].join("\n");
  const footer = [
    ``,
    `--------------------------------------------------------`,
    `End of export · Studio Sensei · Trace ${userId.slice(0, 8)}-${Date.now().toString(36)}`,
    `--------------------------------------------------------`,
  ].join("\n");
  return header + body + footer;
}
