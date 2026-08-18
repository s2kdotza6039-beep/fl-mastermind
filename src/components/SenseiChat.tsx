import { ADVISOR_LANGUAGES, loadAdvisorLanguage, storeAdvisorLanguage } from "@/lib/advisor-language";
import { loadMessageRating, storeMessageRating } from "@/lib/message-rating";
import { FL_PROCEDURES, matchProcedures, proceduresToContext } from "@/lib/fl-procedures";
import { useLoopLock } from "@/hooks/use-loop-lock";
import { decodeAudioToChannels, detectFormat, runAnalysisOnDecoded } from "@/lib/audio-analysis";
import { buildUploadAdvisePrompt, persistAnalyzedUpload } from "@/lib/coaching-runner";
import { CONTINUITY_OVERRIDE_ID, overrideIssue } from "@/lib/loop-guard";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShowMeMap } from "@/components/ShowMeMap";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CHAPTERS, chapterFromPath, chapterLabel, type ChatChapter } from "@/lib/chat-chapter";
import { makeScope, scopeLabel } from "@/lib/chat-scope";
import { useProductionPhase } from "@/hooks/use-production-phase";

import { Send, Loader2, Bookmark, Sparkles, Info, ChevronDown, ChevronUp, Boxes, Lock, ThumbsUp, ThumbsDown, Eye, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/context/SessionContext";
import { useAuth } from "@/context/AuthContext";
import { useStudioSetup } from "@/context/StudioSetupContext";
import { usePluginInventory } from "@/context/PluginInventoryContext";
import { useTrackSession } from "@/context/TrackSessionContext";
import { useProject } from "@/context/ProjectContext";
import { streamSenseiChat, type ChatMsg } from "@/lib/sensei-api";
import { SenseiMarkdown } from "./SenseiMarkdown";
import { RateLimitNotice } from "./RateLimitNotice";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editionToTier, forbiddenPlugins, eligiblePlugins, tierLabel } from "@/lib/fl-plugin-eligibility";
import { addAdvice, appendChatMessage, buildProjectAiContext, listChatMessages } from "@/lib/project-memory";
import { SpeechProvider, messageKey } from "@/lib/speech";
import { SpeechButton } from "./SpeechButton";
import { PlanCard } from "./PlanCard";

// Detect mentions of owned plugins in assistant text.
// Short brand names (≤3 chars) use word-boundary to avoid false matches.
type PriorityHit = { name: string; rule: "word-boundary" | "substring"; snippet: string };
function findPrioritized(text: string, owned: string[]): PriorityHit[] {
  if (!text || owned.length === 0) return [];
  const hits: PriorityHit[] = [];
  const seen = new Set<string>();
  for (const name of owned) {
    if (seen.has(name.toLowerCase())) continue;
    const n = name.toLowerCase();
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let match: RegExpExecArray | null = null;
    let rule: PriorityHit["rule"];
    if (n.length <= 3) {
      const re = new RegExp(`\\b${esc}\\b`, "i");
      match = re.exec(text);
      rule = "word-boundary";
    } else {
      const re = new RegExp(esc, "i");
      match = re.exec(text);
      rule = "substring";
    }
    if (match) {
      const start = Math.max(0, match.index - 25);
      const end = Math.min(text.length, match.index + match[0].length + 25);
      const snippet = (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
      hits.push({ name, rule, snippet });
      seen.add(n);
    }
  }
  return hits;
}


const MODE_KEY = "sensei.chat.mode";

interface SenseiChatProps {
  initialPrompt?: string;
  compact?: boolean;
  audioContext?: import("@/lib/sensei-api").ChatContext["audio"];
  /** R14.2 — per-stage chat; falls back to ?scope= then the route chapter/phase. */
  scope?: string;
}

export const SenseiChat = ({ initialPrompt, compact, audioContext, scope: scopeProp }: SenseiChatProps) => {
  const { genre, stage, projectName, saveAdvice } = useSession();
  const { isPaid, user } = useAuth();
  const { setup } = useStudioSetup();
  const { inventory, isComplete: inventoryComplete } = usePluginInventory();
  const { toChatAudio, setActiveReport, refreshRecent, active } = useTrackSession();
  const { activeProject, loading: projectLoading } = useProject();
  const loopLock = useLoopLock(activeProject?.id ?? null);
  // R14.4b + R15 — proof lock: after a checklist completes, Sensei demands proof (a new bounce).
  // R15 hardening: persisted per project so switching scope / navigating away keeps the lock,
  // plus dev logging so lock/unlock transitions are easy to diagnose.
  type ProofLock = ProofLockState;
  const [awaitingProof, setAwaitingProof] = useState<ProofLock | null>(() => loadProofLock(activeProject?.id ?? null));
  const proofReportId = (active as any)?.id ?? null;
  const lockedIsCurrentProject = awaitingProof ? (awaitingProof.projectId === (activeProject?.id ?? null)) : true;
  // Re-hydrate when the project resolves/changes (context loads async, component remounts on scope change).
  useEffect(() => {
    const stored = loadProofLock(activeProject?.id ?? null);
    setAwaitingProof((cur) => {
      if (cur && cur.projectId === (activeProject?.id ?? null)) return cur;
      if (stored) proofLog("restore", { lockedReportId: stored.lockedReportId, projectId: stored.projectId });
      return stored;
    });
  }, [activeProject?.id]);
  // Persist every transition.
  useEffect(() => {
    saveProofLock(activeProject?.id ?? null, awaitingProof);
  }, [awaitingProof, activeProject?.id]);
  useEffect(() => {
    if (!awaitingProof) return;
    // Extra guard: only unlock when a DIFFERENT report for the SAME project becomes active
    // and the same-beat guard is not flagging foreign. This prevents a foreign upload
    // that somehow still sets active from clearing the proof lock.
    if (shouldUnlockProof(awaitingProof, proofReportId, activeProject?.id ?? null, loopLock.lockKind ?? null)) {
      proofLog("unlock", { from: awaitingProof.lockedReportId, to: proofReportId, projectId: awaitingProof.projectId });
      setAwaitingProof(null);
    } else if (proofReportId && proofReportId !== awaitingProof.lockedReportId) {
      proofLog("unlock-blocked", {
        reason: loopLock.lockKind === "foreign" ? "foreign-beat" : !lockedIsCurrentProject ? "other-project" : "unknown",
        lockedId: awaitingProof.lockedReportId,
        attemptedId: proofReportId,
        lockKind: loopLock.lockKind ?? null,
      });
    }
  }, [proofReportId, awaitingProof, lockedIsCurrentProject, loopLock.lockKind, activeProject?.id]);

  // R13.5 — Sensei leads (route chapter), the producer steers (override).
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeChapter = chapterFromPath(location.pathname);
  const [chapterOverride, setChapterOverride] = useState<ChatChapter | null>(null);
  const chapter: ChatChapter = chapterOverride ?? routeChapter;
  const { phase } = useProductionPhase();
  const scope =
    (chapterOverride ? makeScope(chapterOverride, chapterOverride === "PRODUCTION" ? phase : null) : null) ??
    scopeProp ??
    searchParams.get("scope") ??
    makeScope(chapter, chapter === "PRODUCTION" ? phase : null);
  useEffect(() => {
    const onProof = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId?: string } | undefined;
      setAwaitingProof((cur) => {
        if (cur) return cur; // already locked
        const next: ProofLock = {
          lockedReportId: proofReportId || detail?.messageId || "proof",
          projectId: activeProject?.id ?? null,
          messageId: detail?.messageId ?? null,
        };
        try { console.info("[SenseiProof] proof-required", { messageId: next.messageId, lockedReportId: next.lockedReportId, projectId: next.projectId, scope }); } catch {}
        return next;
      });
    };
    window.addEventListener("sensei:proof-required", onProof as EventListener);
    return () => window.removeEventListener("sensei:proof-required", onProof as EventListener);
  }, [proofReportId, activeProject?.id, scope]);
  useEffect(() => { setChapterOverride(null); }, [routeChapter]);

  const [bounceHelpOpen, setBounceHelpOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overriding, setOverriding] = useState(false);

  // R10 — owner override: confirm the DNA change was intentional, log the
  // continuity.override marker on the newest report, and resume the composer.
  const confirmOverride = async () => {
    if (!activeProject) return;
    setOverriding(true);
    try {
      const { data, error } = await supabase
        .from("audio_analysis_reports")
        .select("id, detected_issues")
        .eq("project_id", activeProject.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No bounce to override yet.");
      const existing = Array.isArray(data.detected_issues) ? (data.detected_issues as any[]) : [];
      if (!existing.some((i: any) => i?.detector_id === CONTINUITY_OVERRIDE_ID)) {
        const { error: upErr } = await supabase
          .from("audio_analysis_reports")
          .update({ detected_issues: [...existing, overrideIssue()] as any })
          .eq("id", data.id);
        if (upErr) throw upErr;
      }
      setOverrideOpen(false);
      loopLock.refresh();
      toast.success("Override logged — coaching resumed. 🥋");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't log the override.");
    } finally {
      setOverriding(false);
    }
  };

  const exportWavProc = FL_PROCEDURES.find((p) => p.id === "export-wav");
  const knobFileRef = useRef<HTMLInputElement | null>(null);
  const [knobBusy, setKnobBusy] = useState(false);

  // R10.5 — the Option Knob: let Sensei hear a bounce WITHOUT leaving the chat.
  // Same pipeline, same guard: foreign beats land in the lock banner, confirmed
  // bounces get scored and Sensei immediately advises on them.
  const onKnobFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || knobBusy) return;
    if (!user) {
      toast.error("Sign in first so Sensei can file this under your name.");
      return;
    }
    setKnobBusy(true);
    try {
      toast.info(`Sensei is listening to "${f.name}"…`);
      const decoded = await decodeAudioToChannels(f);
      const res = await runAnalysisOnDecoded(decoded, {
        name: f.name,
        format: detectFormat(f),
        sizeBytes: f.size,
      });
      const outcome = await persistAnalyzedUpload({
        userId: user.id,
        activeProject: activeProject ? { id: activeProject.id, genre: activeProject.genre } : null,
        res,
        setActiveReport,
      });
      await refreshRecent();
      loopLock.refresh();
      if (!outcome.reportId) {
        toast.error(outcome.error ?? "Could not save the analysis.");
        return;
      }
      if (outcome.kind === "foreign") {
        toast.warning(outcome.reasons.length
          ? `Sensei paused — this doesn't sound like the same beat (${outcome.reasons.join(" · ")}).`
          : "Sensei paused — this doesn't sound like the same beat.");
        return; // the lock banner above carries the doors
      }
      toast.success("Sensei heard it — your new bounce is on record.");
      send(buildUploadAdvisePrompt(f.name, res, outcome.story));
    } catch (err: any) {
      console.warn("Option Knob upload failed:", err?.message ?? err);
      toast.error(err?.message ?? "Could not analyze that file.");
    } finally {
      setKnobBusy(false);
    }
  };
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [advisorLang, setAdvisorLang] = useState(loadAdvisorLanguage());
  const [ratings, setRatings] = useState<Record<string, "up" | "down" | null>>({});
  const [openMapFor, setOpenMapFor] = useState<string | null>(null);
  const [mode, setMode] = useState<"guided" | "quick">(() => {
    try { return localStorage.getItem(MODE_KEY) === "quick" ? "quick" : "guided"; } catch { return "guided"; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [rateLimit, setRateLimit] = useState<{ retryAfterSec: number; message: string; lastInput: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const ownedAll = useMemo(
    () =>
      inventoryComplete
        ? [
            ...(inventory?.native_plugins ?? []),
            ...(inventory?.third_party_plugins ?? []),
            ...(inventory?.custom_plugins ?? []),
          ]
        : [],
    [inventory, inventoryComplete],
  );

  const eligibility = useMemo(() => {
    if (!setup?.fl_edition) return null;
    const tier = editionToTier(setup.fl_edition);
    const blocked = forbiddenPlugins(tier);
    if (blocked.length === 0) return null; // full bundle — no gating to explain
    const preview = blocked.slice(0, 4).join(", ");
    const more = blocked.length > 4 ? ` +${blocked.length - 4} more` : "";
    return {
      tier,
      label: tierLabel(tier),
      blocked,
      allowed: eligiblePlugins(tier),
      reason:
        tier === "fruity"
          ? `Stock-only workflow — Sensei will skip ${preview}${more} and suggest Fruity Edition alternatives.`
          : tier === "unknown"
            ? `Edition not set — Sensei defaults to safe stock plugins until you confirm your edition.`
            : `Recommendations limited to plugins in your edition. Blocked: ${preview}${more}.`,
    };
  }, [setup?.fl_edition]);

  // Load persisted chat history for the active project (only when not in compact embed mode).
  useEffect(() => {
    // R12 — per-song isolation: wipe the board BEFORE the fetch resolves so a
    // previous project's chat can never bleed into the new one.
    setMessages([]);
    sentInitial.current = false;
    if (compact || !activeProject) { setHistoryLoaded(true); return; }
    let cancelled = false;
    setHistoryLoaded(false);
    listChatMessages(activeProject.id, 100, scope)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs.map((m) => ({ role: m.role === "system" ? "assistant" : m.role, content: m.content })));
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
    return () => { cancelled = true; };
  }, [activeProject?.id, compact, scope]);

  useEffect(() => {
    if (loopLock.lockKind) return; // R9.7 — while locked, nothing lands in the chat
    if (initialPrompt && !sentInitial.current && historyLoaded) {
      sentInitial.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, historyLoaded, loopLock.lockKind]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    if (awaitingProof) {
      try { console.info("[SenseiProof] locked-send-attempt", { lockedReportId: awaitingProof.lockedReportId, projectId: awaitingProof.projectId }); } catch {}
      toast.info("Sensei is waiting for your new bounce. Upload it (paperclip) to continue.");
      return;
    }
    // Don't let users send before their project memory has hydrated — a
    // message sent in that window was neither persisted nor given project
    // context, which read as "Sensei forgot everything".
    if (!compact && projectLoading) {
      toast.info("Restoring your project memory… one moment.");
      return;
    }
    setRateLimit(null);
    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    // Persist user turn to project memory.
    if (activeProject && user) {
      appendChatMessage(user.id, activeProject.id, { role: "user", content: trimmed, source_page: "chat", scope })
        .catch((e) => {
          console.warn("Failed to persist user message:", e?.message ?? e);
          toast.error("Message sent, but it could not be saved to project memory.");
        });
    }

    // Build long-term project memory for the AI (don't block on failure).
    let projectMemory: any = undefined;
    if (activeProject) {
      try { projectMemory = await buildProjectAiContext(activeProject); } catch {/* ignore */}
    }

    let acc = "";
    const upsert = (chunk: string) => {
      acc += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: acc } : m));
        }
        return [...prev, { role: "assistant", content: acc }];
      });
    };

    const procHits = matchProcedures(trimmed, 2);
    await streamSenseiChat({
      messages: next,
      context: {
        chapter, genre, stage, projectName: activeProject?.name ?? projectName,
        flVersion: setup?.fl_version ?? undefined,
        flEdition: setup?.fl_edition ?? undefined,
        mainUse: setup?.main_use ?? undefined,
        mainGenre: setup?.main_genre ?? undefined,
        skillLevel: setup?.skill_level ?? undefined,
        nativePlugins: inventoryComplete ? inventory?.native_plugins ?? undefined : undefined,
        thirdPartyPlugins: inventoryComplete ? inventory?.third_party_plugins ?? undefined : undefined,
        customPlugins: inventoryComplete ? inventory?.custom_plugins ?? undefined : undefined,
        advisorLanguage: advisorLang,
        mode,
        procedures: procHits.length ? proceduresToContext(procHits) : undefined,
        audio: audioContext ?? toChatAudio(),
        projectMemory,
      },
      onDelta: upsert,
      onDone: () => {
        setLoading(false);
        // Persist the assistant turn once streaming finishes.
        if (activeProject && user && acc.trim()) {
          appendChatMessage(user.id, activeProject.id, { role: "assistant", content: acc, source_page: "chat", scope })
            .catch((e) => {
              console.warn("Failed to persist assistant message:", e?.message ?? e);
              toast.error("Sensei's reply could not be saved to project memory.");
            });
        }
      },
      onError: (msg) => {
        setLoading(false);
        toast.error(msg);
      },
      onRateLimit: ({ retryAfterSec, message }) => {
        setLoading(false);
        // Roll back the user message so the retry button can resend it cleanly.
        setMessages((prev) => prev.slice(0, -1));
        setRateLimit({ retryAfterSec, message, lastInput: trimmed });
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <SpeechProvider>
    <div className={cn("flex flex-col h-full", compact && "max-h-[600px]")}>
      {eligibility && (
        <div className="border-b border-border bg-muted/30 text-xs">
          <button
            type="button"
            onClick={() => setEligibilityOpen((o) => !o)}
            aria-expanded={eligibilityOpen}
            title={`${eligibility.blocked.length} plugin${eligibility.blocked.length === 1 ? "" : "s"} blocked on ${eligibility.label}. Click to view full list.`}
            className="w-full px-4 py-2 flex items-start gap-2 text-left hover:bg-muted/50 transition-colors"
          >
            <Info className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">{eligibility.label}.</span>{" "}
              <span className="text-muted-foreground">{eligibility.reason}</span>
            </div>
            {eligibilityOpen ? (
              <ChevronUp className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
            )}
          </button>
          {eligibilityOpen && (
            <div className="px-4 pb-3 pt-1 grid sm:grid-cols-2 gap-3 border-t border-border/60">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-destructive/80 mb-1">
                  Blocked ({eligibility.blocked.length})
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {eligibility.blocked.map((p) => (
                    <li key={p} className="truncate">· {p}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-muted-foreground/80">
                  Sensei substitutes these with the closest allowed stock plugin and notes the upgrade path.
                </p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary/80 mb-1">
                  Allowed ({eligibility.allowed.length})
                </div>
                <ul className="space-y-0.5 text-muted-foreground max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {eligibility.allowed.map((p) => (
                    <li key={p} className="truncate">· {p}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Owned tools panel */}
      {inventoryComplete ? (
        ownedAll.length > 0 && (
          <div className="border-b border-border bg-muted/20 text-xs">
            <button
              type="button"
              onClick={() => setToolsOpen((o) => !o)}
              aria-expanded={toolsOpen}
              className="w-full px-4 py-2 flex items-start gap-2 text-left hover:bg-muted/40 transition-colors"
            >
              <Boxes className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-foreground">Your owned tools.</span>{" "}
                <span className="text-muted-foreground">
                  Sensei prioritizes {inventory?.native_plugins.length ?? 0} native ·{" "}
                  {inventory?.third_party_plugins.length ?? 0} third-party ·{" "}
                  {inventory?.custom_plugins.length ?? 0} custom plugin{ownedAll.length === 1 ? "" : "s"}.
                </span>
              </div>
              {toolsOpen ? (
                <ChevronUp className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              )}
            </button>
            {toolsOpen && (
              <div className="px-4 pb-3 pt-1 border-t border-border/60 space-y-2">
                {(["native_plugins", "third_party_plugins", "custom_plugins"] as const).map((k) => {
                  const list = inventory?.[k] ?? [];
                  if (list.length === 0) return null;
                  const label =
                    k === "native_plugins" ? "Native" : k === "third_party_plugins" ? "Third-party" : "Custom";
                  return (
                    <div key={k}>
                      <div className="text-[10px] uppercase tracking-widest text-primary/80 mb-1">{label} ({list.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {list.map((p) => (
                          <span key={p} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">{p}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="pt-1">
                  <Link to="/plugin-inventory" className="text-[10px] text-primary hover:underline">Update inventory →</Link>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="border-b border-border bg-muted/20 text-xs px-4 py-2 flex items-center gap-2">
          <Boxes className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground flex-1">
            Sensei doesn't know which plugins you own yet —{" "}
            <Link to="/plugin-inventory" className="text-primary hover:underline">add your inventory</Link>{" "}
            for tailored recommendations.
          </span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-4">
        {/* R13.5 — let the producer steer which chapter Sensei coaches. */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">Sensei as</span>
          {CHAPTERS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={chapter === c}
              onClick={() => setChapterOverride((prev) => (prev === c ? null : c))}
              className={`text-[11px] rounded-full px-2.5 py-1 border transition-colors ${
                chapter === c
                  ? "bg-gradient-gold text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {chapterLabel(c)}
            </button>
          ))}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Chat: {scopeLabel(scope)}
        </div>
        {scope === "MIXING" && <PlanCard />}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 animate-fade-in-up">
            <div className="w-16 h-16 rounded-2xl bg-gradient-gold flex items-center justify-center mb-4 glow-gold">
              <Sparkles className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="font-display text-2xl font-bold text-gold mb-2">Studio Sensei</h3>
            <p className="text-muted-foreground max-w-md text-sm">
              Ask anything. Mix problems, plugin chains, mastering, sound design — I've got you.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex animate-fade-in-up",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                m.role === "user"
                  ? "bg-gradient-gold text-primary-foreground rounded-br-sm"
                  : "studio-card rounded-bl-sm sensei-protected",
              )}
              onContextMenu={(e) => {
                if (m.role === "assistant") {
                  e.preventDefault();
                  toast("Sensei content is protected — © Studio Sensei");
                }
              }}
              onCopy={(e) => {
                if (m.role === "assistant" && !isPaid) {
                  e.preventDefault();
                  toast.info("Copying advice is a paid feature. Save it instead.");
                }
              }}
            >
              {m.role === "user" ? (
                <p className="text-sm leading-relaxed">{m.content}</p>
              ) : (
                <>
                  <SenseiMarkdown content={m.content || "…"} messageId={messageKey(m.content)} scope={scope} />
                  {(() => {
                    const hits = findPrioritized(m.content, ownedAll);
                    if (hits.length === 0) return null;
                    return (
                      <div className="mt-2 pt-2 border-t border-border/40">
                        <div className="text-[10px] uppercase tracking-widest text-primary/80 mb-1 flex items-center gap-1">
                          <Boxes className="w-3 h-3" /> Sensei prioritized from your inventory
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {hits.map((h) => (
                            <span
                              key={h.name}
                              title={`Matched by ${h.rule === "word-boundary" ? "whole-word match (short brand)" : "case-insensitive substring match"} — "${h.snippet}"`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 cursor-help"
                            >
                              {h.name}
                              <span className="ml-1 text-primary/60">· {h.rule === "word-boundary" ? "word" : "substr"}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 items-center flex-wrap">
                  {!loading && i === messages.length - 1 && m.content.length > 50 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 text-xs text-primary hover:bg-primary/10"
                      onClick={async () => {
                        const title = messages[i - 1]?.content.slice(0, 60) ?? "Saved advice";
                        saveAdvice({ title, content: m.content });
                        if (activeProject && user) {
                          try {
                            await addAdvice(user.id, activeProject.id, {
                              title, content: m.content, source_page: "chat",
                            });
                            toast.success(`Saved to "${activeProject.name}"`);
                            return;
                          } catch {/* fall through */}
                        }
                        toast.success("Saved to your dashboard");
                      }}
                    >
                      <Bookmark className="w-3 h-3 mr-1" /> Save advice
                    </Button>
                  )}
                  {!!m.content.trim() && (!loading || i < messages.length - 1) && (
                    isPaid ? (
                      <SpeechButton id={messageKey(m.content)} text={m.content} />
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 h-7 px-1.5 text-[10px] text-muted-foreground/70 select-none"
                        title="Voice reading is a Pro feature — upgrade to unlock"
                        aria-label="Voice reading is a Pro feature"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    )
                  )}
                  {!!m.content.trim() && (() => {
                    const mk = messageKey(m.content);
                    const current = mk in ratings ? ratings[mk] : loadMessageRating(mk);
                    const set = (r: "up" | "down") => {
                      const next = current === r ? null : r;
                      storeMessageRating(mk, next);
                      setRatings((prev) => ({ ...prev, [mk]: next }));
                    };
                    return (
                      <>
                        <Button
                          size="icon" variant="ghost" title="Rate this answer" aria-label="Helpful"
                          className={cn("h-7 w-7", current === "up" ? "text-primary" : "text-muted-foreground/60")}
                          onClick={() => set("up")}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" title="Rate this answer" aria-label="Not helpful"
                          className={cn("h-7 w-7", current === "down" ? "text-primary" : "text-muted-foreground/60")}
                          onClick={() => set("down")}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    );
                  })()}
                  {!!m.content.trim() && (() => {
                    const mk = messageKey(m.content);
                    const p = matchProcedures(m.content, 1)[0];
                    if (!p) return null;
                    const open = openMapFor === mk;
                    return (
                      <Button
                        size="icon" variant="ghost" title="Show me — animated FL steps" aria-label="Show me"
                        className={cn("h-7 w-7", open ? "text-primary" : "text-muted-foreground/60")}
                        onClick={() => setOpenMapFor(open ? null : mk)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    );
                  })()}
                  </div>
                  {openMapFor === messageKey(m.content) && (() => {
                    const p = matchProcedures(m.content, 1)[0];
                    return p ? <ShowMeMap procedure={p} onClose={() => setOpenMapFor(null)} /> : null;
                  })()}
                </>
              )}
            </div>
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start animate-fade-in-up">
            <div className="studio-card rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Sensei is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {rateLimit && (
        <div className="px-4 pb-2">
          <RateLimitNotice
            retryAfterSec={rateLimit.retryAfterSec}
            message={rateLimit.message}
            onRetry={() => {
              const text = rateLimit.lastInput;
              setRateLimit(null);
              send(text);
            }}
            onDismiss={() => setRateLimit(null)}
          />
        </div>
      )}

      {loopLock.lockKind && (
        <div className="px-4 pb-2">
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-foreground">
                  {loopLock.lockKind === "foreign"
                    ? "🥋 Sensei: hold on — I don't recognize this beat"
                    : "🥋 Sensei: fix steps done — time to re-bounce"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {loopLock.lockKind === "foreign"
                    ? `This upload's DNA doesn't match the project${loopLock.prevFileName ? ` (last confirmed: "${loopLock.prevFileName}")` : ""}: ${loopLock.reasons.join(" · ")}. Coaching is paused — load the correct bounce and I'll verify it instantly.`
                    : "I'm not guessing from old info, champ. Re-bounce your beat in FL Studio and upload it — coaching continues the moment I hear it."}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
                    <Link to="/upload">
                      ⬆ Upload {loopLock.lockKind === "foreign" ? "the correct beat" : "new bounce"}
                    </Link>
                  </Button>
                  {loopLock.lockKind === "rebounce" && exportWavProc && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setBounceHelpOpen((v) => !v)}>
                      <Eye className="w-3.5 h-3.5 mr-1" /> Show me how to bounce
                    </Button>
                  )}
                  {loopLock.lockKind === "foreign" && (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/projects">🆕 It's a new beat → new project</Link>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={overriding}
                        onClick={() => setOverrideOpen(true)}
                      >
                        ✅ Same beat — I changed it on purpose
                      </Button>
                    </>
                  )}
                  <Button type="button" size="sm" variant="ghost" onClick={loopLock.refresh}>
                    🔄 I've uploaded — check again
                  </Button>

                </div>
                {bounceHelpOpen && loopLock.lockKind === "rebounce" && exportWavProc && (
                  <div className="mt-3">
                    <ShowMeMap procedure={exportWavProc} onClose={() => setBounceHelpOpen(false)} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <AlertDialog open={overrideOpen} onOpenChange={(o) => !o && setOverrideOpen(false)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm this is the same song</AlertDialogTitle>
                <AlertDialogDescription>
                  {`Sensei heard a different DNA${loopLock.reasons.length ? `: ${loopLock.reasons.join(" · ")}` : ""}. Confirming logs an owner override on this bounce and resumes coaching right away.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={overriding}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={overriding}
                  onClick={(e) => { e.preventDefault(); confirmOverride(); }}
                >
                  {overriding ? "Logging…" : "Yes — resume coaching"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}


      {awaitingProof && (
        <div className="border-t border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 mt-0.5">🔒</span>
            <div className="flex-1">
              <p className="font-semibold">Sensei is waiting for <strong>proof</strong> — upload your new bounce to continue.</p>
              <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-amber-300/90 text-[11px]">
                <li>Same <strong>project</strong> & same <strong>song</strong> — a continuation, not a different track</li>
                <li>New bounce (re-export from FL Studio) — not the same file</li>
                <li>Upload via the <strong>📎 paperclip</strong> in this chat or <strong>/upload</strong></li>
              </ul>
              <p className="mt-1.5 text-[11px] text-amber-200/70">A wrong or foreign beat will keep this locked — Sensei checks beat DNA.</p>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="border-t border-border p-4 bg-card/50 backdrop-blur">
        <div className="flex gap-2 items-end">
          <select
            value={advisorLang}
            onChange={(e) => {
              setAdvisorLang(e.target.value);
              storeAdvisorLanguage(e.target.value);
            }}
            title="Answer language — Sensei replies and reads in this language"
            aria-label="Answer language"
            className="h-[44px] rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-primary"
          >
            {ADVISOR_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code.toUpperCase()} · {l.native}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const next = mode === "guided" ? "quick" : "guided";
              setMode(next);
              try { localStorage.setItem(MODE_KEY, next); } catch { /* ignore */ }
            }}
            title={mode === "guided" ? "Guided mode: full tutor answers. Click for Quick mode." : "Quick mode: short direct answers. Click for Guided mode."}
            aria-pressed={mode === "quick"}
            className="h-[44px] px-2 rounded-md border border-border text-[10px] font-medium text-muted-foreground hover:text-primary"
          >
            {mode === "guided" ? "Guided" : "⚡ Quick"}
          </button>
          <button
            type="button"
            onClick={() => knobFileRef.current?.click()}
            disabled={knobBusy}
            title="Let Sensei hear a bounce (MP3/WAV) — it goes through the same-beat check"
            aria-label="Let Sensei hear a bounce (MP3/WAV)"
            className="h-[44px] px-2 rounded-md border border-border text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            {knobBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={knobFileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg"
            className="hidden"
            onChange={onKnobFile}
          />
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={awaitingProof
              ? "🔒 Sensei is waiting for your new bounce — upload it using the paperclip…"
              : loopLock.lockKind === "foreign"
              ? "🔒 Beat not recognized — load the correct bounce above to continue…"
              : loopLock.lockKind === "rebounce"
                ? "🔒 Waiting for your new bounce — Sensei will verify it…"
                : projectLoading ? "Restoring project memory…" : "Ask Sensei anything... (Shift+Enter for new line)"}
            rows={1}
            className="resize-none bg-input border-border focus-visible:ring-primary min-h-[44px]"
            disabled={loading || projectLoading || loopLock.lockKind != null || !!awaitingProof}
          />
          <Button
            type="submit"
            disabled={loading || projectLoading || loopLock.lockKind != null || !!awaitingProof || !input.trim()}
            className="bg-gradient-gold text-primary-foreground hover:opacity-90 h-[44px] px-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
    </div>
    </SpeechProvider>
  );
};
