import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Bookmark, Sparkles, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/context/SessionContext";
import { useAuth } from "@/context/AuthContext";
import { useStudioSetup } from "@/context/StudioSetupContext";
import { streamSenseiChat, type ChatMsg } from "@/lib/sensei-api";
import { SenseiMarkdown } from "./SenseiMarkdown";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editionToTier, forbiddenPlugins, eligiblePlugins, tierLabel } from "@/lib/fl-plugin-eligibility";

interface SenseiChatProps {
  initialPrompt?: string;
  compact?: boolean;
}

export const SenseiChat = ({ initialPrompt, compact }: SenseiChatProps) => {
  const { genre, stage, projectName, saveAdvice } = useSession();
  const { isPaid } = useAuth();
  const { setup } = useStudioSetup();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const [eligibilityOpen, setEligibilityOpen] = useState(false);

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

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

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

    await streamSenseiChat({
      messages: next,
      context: {
        genre, stage, projectName,
        flVersion: setup?.fl_version ?? undefined,
        flEdition: setup?.fl_edition ?? undefined,
        mainUse: setup?.main_use ?? undefined,
        mainGenre: setup?.main_genre ?? undefined,
        skillLevel: setup?.skill_level ?? undefined,
      },
      onDelta: upsert,
      onDone: () => setLoading(false),
      onError: (msg) => {
        setLoading(false);
        toast.error(msg);
      },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className={cn("flex flex-col h-full", compact && "max-h-[600px]")}>
      {eligibility && (
        <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-start gap-2 text-xs">
          <Info className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-foreground">{eligibility.label}.</span>{" "}
            <span className="text-muted-foreground">{eligibility.reason}</span>
          </div>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 space-y-4">
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
                  <SenseiMarkdown content={m.content || "…"} messageId={`m-${i}`} />
                  {!loading && i === messages.length - 1 && m.content.length > 50 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 text-xs text-primary hover:bg-primary/10"
                      onClick={() => {
                        saveAdvice({
                          title: messages[i - 1]?.content.slice(0, 60) ?? "Saved advice",
                          content: m.content,
                        });
                        toast.success("Saved to your dashboard");
                      }}
                    >
                      <Bookmark className="w-3 h-3 mr-1" /> Save advice
                    </Button>
                  )}
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

      <form onSubmit={handleSubmit} className="border-t border-border p-4 bg-card/50 backdrop-blur">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Sensei anything... (Shift+Enter for new line)"
            rows={1}
            className="resize-none bg-input border-border focus-visible:ring-primary min-h-[44px]"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-gradient-gold text-primary-foreground hover:opacity-90 h-[44px] px-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
};
