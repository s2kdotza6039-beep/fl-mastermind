import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const SESSION_TIMEOUT_MS = 12_000;

function getOAuthError() {
  const sources = [window.location.search.replace(/^\?/, ""), window.location.hash.replace(/^#/, "")];
  for (const source of sources) {
    if (!source) continue;
    const params = new URLSearchParams(source);
    const message = params.get("error_description") || params.get("error");
    if (message) return decodeURIComponent(message);
  }
  return null;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(() => getOAuthError());

  useEffect(() => {
    if (error) return;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      navigate("/dashboard", { replace: true });
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) finish();
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (data.session?.user) {
        finish();
      } else if (sessionError && !settled) {
        setError(sessionError.message);
      }
    });

    const timeout = window.setTimeout(() => {
      if (!settled) {
        setError("Google sign-in completed, but no session was received. Please try signing in again.");
      }
    }, SESSION_TIMEOUT_MS);

    return () => {
      settled = true;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, [error, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="studio-card-gold w-full max-w-md p-8 text-center">
        {error ? (
          <>
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
            <h1 className="font-display text-xl font-bold">Google sign-in failed</h1>
            <p role="alert" className="mt-3 text-sm text-muted-foreground">{error}</p>
            <Button asChild className="mt-6 w-full">
              <Link to="/auth" replace>Return to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
            <h1 className="font-display text-xl font-bold">Opening your studio</h1>
            <p className="mt-3 text-sm text-muted-foreground">Waiting for Google to finish signing you in…</p>
          </>
        )}
      </Card>
    </div>
  );
}