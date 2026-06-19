import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  getAudioSettings,
  loadScopeFromProfile,
  setAudioScope,
  syncScopeToProfile,
  toggleAudioMuted,
} from "@/lib/audio-settings";

/**
 * Wires global audio behaviour:
 *  - Shift+M keyboard shortcut to mute/unmute startup sound
 *  - Pulls scope from user profile on sign-in (cross-device sync)
 *  - Pushes local scope if profile is empty
 */
export function AudioGlobalBindings() {
  const { user } = useAuth();

  // Keyboard shortcut: Shift+M toggles mute (ignores when typing in inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "M" && e.key !== "m") return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      e.preventDefault();
      const muted = toggleAudioMuted();
      toast(muted ? "Startup sound muted" : "Startup sound unmuted", {
        description: "Shift+M to toggle",
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Cross-device scope sync
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const remote = await loadScopeFromProfile(user.id);
      if (cancelled) return;
      if (!remote) {
        // Profile has no value → seed from local preference.
        await syncScopeToProfile(getAudioSettings().scope);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Re-push scope when changed elsewhere (setAudioScope already syncs, but keep belt-and-suspenders for cross-tab updates via storage event)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "studio-sensei-audio-scope" && e.newValue) {
        const v = e.newValue;
        if (v === "session" || v === "first-visit") setAudioScope(v);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return null;
}
