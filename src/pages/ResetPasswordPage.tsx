import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Crown, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/);

export default function ResetPasswordPage() {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = passwordSchema.safeParse(pw);
    if (!v.success) return toast.error("Password too weak (8+, upper, lower, number)");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: v.data });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated");
      nav("/", { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="studio-card-gold w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-gradient-gold flex items-center justify-center"><Crown className="w-6 h-6 text-primary-foreground" /></div>
          <div>
            <h1 className="font-display text-xl font-bold text-gold">Reset password</h1>
            <p className="text-xs text-muted-foreground">Choose a new password</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="np">New password</Label>
            <div className="relative">
              <Input id="np" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={128} autoComplete="new-password" required className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1" aria-label={show ? "Hide password" : "Show password"} tabIndex={-1}>
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
