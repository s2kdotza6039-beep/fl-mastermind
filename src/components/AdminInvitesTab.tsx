import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mail, KeyRound, Loader2, Trash2, Plus, Copy, RotateCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Invite {
  id: string;
  email: string | null;
  code: string | null;
  used_at: string | null;
  used_by: string | null;
  expires_at: string | null;
  created_at: string;
}

function randomCode(len = 10) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

export function AdminInvitesTab() {
  const [rows, setRows] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("beta_invites")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setRows((data as Invite[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addEmail() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    const { error } = await supabase.from("beta_invites").insert({ email: trimmed });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEmail("");
    toast.success(`Invited ${trimmed}`);
    load();
  }

  async function addCode() {
    const code = randomCode();
    const { error } = await supabase.from("beta_invites").insert({ code });
    if (error) return toast.error(error.message);
    toast.success(`Code generated: ${code}`);
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("beta_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function rotateAllCodes() {
    if (!confirm("Revoke ALL unused invite codes and mint one fresh replacement code? Email allowlist entries are not affected.")) return;
    const { data, error } = await supabase.rpc("admin_rotate_beta_codes");
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(`Revoked ${row?.revoked_count ?? 0} code${row?.revoked_count === 1 ? "" : "s"} · New code: ${row?.new_code}`);
    load();
  }


  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast.success("Code copied"));
  }

  const pending = rows.filter((r) => !r.used_at);
  const used = rows.filter((r) => r.used_at);
  const validCodes = pending.filter((r) => r.code);

  return (
    <Card className="studio-card p-4 mt-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Mail className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Beta Invites</h3>
        <Badge variant="outline" className="text-[10px]">{pending.length} pending</Badge>
        <Badge variant="secondary" className="text-[10px]">{used.length} used</Badge>
        <Button
          size="sm"
          variant="destructive"
          className="ml-auto"
          onClick={rotateAllCodes}
          disabled={validCodes.length === 0}
          aria-label="Revoke all unused codes and mint a fresh one"
        >
          <RotateCw className="w-3.5 h-3.5 mr-1" /> Rotate &amp; revoke codes
        </Button>
      </div>

      {validCodes.length > 0 && (
        <Card className="p-3 border border-emerald-500/30 bg-emerald-500/5">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Currently valid codes ({validCodes.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {validCodes.map((c) => (
              <button
                key={c.id}
                onClick={() => copyCode(c.code!)}
                className="font-mono text-xs px-2 py-1 rounded border border-emerald-500/30 bg-background hover:bg-emerald-500/10 transition"
                title="Click to copy"
              >
                {c.code} <Copy className="w-3 h-3 inline ml-1 opacity-60" />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Card className="p-3 border-dashed">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Invite by email</h4>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
            <Button onClick={addEmail} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Add
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">User can sign up only with this email.</p>
        </Card>

        <Card className="p-3 border-dashed">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Generate invite code</h4>
          <Button onClick={addCode} variant="outline" className="w-full"><Plus className="w-3.5 h-3.5 mr-1" /> New code</Button>
          <p className="text-[10px] text-muted-foreground mt-1">One-time code. Any email may sign up with it.</p>
        </Card>
      </div>


      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No invites yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[50vh] overflow-auto">
          {rows.map((i) => (
            <div key={i.id} className="flex items-center gap-2 p-2 rounded border border-border text-xs">
              <div className="flex-1 min-w-0">
                {i.email && <div className="truncate">📧 {i.email}</div>}
                {i.code && (
                  <div className="flex items-center gap-1 font-mono">
                    🔑 {i.code}
                    <button onClick={() => copyCode(i.code!)} className="text-muted-foreground hover:text-primary" aria-label="Copy code">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {i.used_at ? (
                <Badge variant="secondary" className="text-[10px]">used</Badge>
              ) : (
                <Badge variant="default" className="text-[10px]">pending</Badge>
              )}
              <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                {new Date(i.created_at).toLocaleDateString()}
              </span>
              <Button size="icon" variant="ghost" onClick={() => remove(i.id)} aria-label="Delete invite">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
