import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Crown, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

const emailSchema = z.string().trim().email("Invalid email").max(255);
const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[0-9]/, "Add a number");
const displayNameSchema = z.string().trim().min(1).max(60).optional();

export default function AuthPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { isAuthed, loading } = useAuth();
  const from = (loc.state as any)?.from || "/";

  useEffect(() => {
    if (!loading && isAuthed) nav(from, { replace: true });
  }, [isAuthed, loading, nav, from]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="studio-card-gold w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-gradient-gold flex items-center justify-center glow-gold">
            <Crown className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-gold">Studio Sensei</h1>
            <p className="text-xs text-muted-foreground">Sign in to your studio</p>
          </div>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid grid-cols-2 mb-6">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin"><SignInForm /></TabsContent>
          <TabsContent value="signup"><SignUpForm /></TabsContent>
        </Tabs>
        <p className="text-[10px] text-muted-foreground/70 text-center mt-6 leading-relaxed">
          By continuing you accept the{" "}
          <Link to="/terms" className="underline">Terms</Link> and{" "}
          <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </Card>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    if (!password) return toast.error("Password required");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: ev.data, password });
    setBusy(false);
    if (error) {
      // log suspicious if too many: handled in edge function later. Here just surface.
      toast.error(error.message);
      try {
        await supabase.from("security_alerts").insert({
          severity: "low",
          alert_type: "failed_signin",
          message: `Failed sign-in for ${ev.data}`,
          metadata: { email: ev.data },
        });
      } catch {}
    } else {
      toast.success("Welcome back");
    }
  }

  async function reset() {
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(ev.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Reset link sent — check your inbox");
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(result.error.message || "Google sign-in failed");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="si-pass">Password</Label>
        <PasswordInput id="si-pass" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
      <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-primary underline w-full text-center">
        Forgot password?
      </button>
    </form>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ev = emailSchema.safeParse(email);
    if (!ev.success) return toast.error(ev.error.issues[0].message);
    const pv = passwordSchema.safeParse(password);
    if (!pv.success) return toast.error(pv.error.issues[0].message);
    const nv = displayNameSchema.safeParse(name || undefined);
    if (!nv.success) return toast.error("Invalid display name");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: ev.data,
      password: pv.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: nv.data || ev.data.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Account created — check your email to verify.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="su-name">Display name</Label>
        <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </div>
      <div>
        <Label htmlFor="su-email">Email</Label>
        <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="su-pass">Password</Label>
        <PasswordInput id="su-pass" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} autoComplete="new-password" required />
        <p className="text-[10px] text-muted-foreground mt-1">8+ chars, upper, lower, number. Checked against known breaches.</p>
      </div>
      <Button type="submit" className="w-full bg-gradient-gold text-primary-foreground" disabled={busy}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account
      </Button>
    </form>
  );
}
