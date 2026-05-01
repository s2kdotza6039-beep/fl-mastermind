import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "paid" | "free";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isPaid: boolean;
  isAuthed: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((r: any) => r.role as AppRole);
}

async function logActivity(userId: string | null, eventType: string, metadata: Record<string, any> = {}) {
  try {
    if (!userId) return;
    await supabase.from("activity_logs").insert({
      user_id: userId,
      event_type: eventType,
      metadata,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    /* swallow */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listener first (per Lovable rule)
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);

      if (sess?.user) {
        // defer to avoid deadlock
        setTimeout(() => {
          fetchRoles(sess.user.id).then(setRoles);
          if (event === "SIGNED_IN") logActivity(sess.user.id, "signed_in");
        }, 0);
      } else {
        setRoles([]);
      }
    });

    // 2. Then session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchRoles(sess.user.id).then(setRoles);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      roles,
      loading,
      isAdmin: roles.includes("admin"),
      isPaid: roles.includes("paid") || roles.includes("admin"),
      isAuthed: !!user,
      signOut: async () => {
        if (user) await logActivity(user.id, "signed_out");
        await supabase.auth.signOut();
      },
      refreshRoles: async () => {
        if (user) setRoles(await fetchRoles(user.id));
      },
    }),
    [user, session, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { logActivity };
