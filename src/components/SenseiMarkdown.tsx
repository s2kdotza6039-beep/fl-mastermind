import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, UploadCloud, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChatChecks, saveChatChecks, type ChatChecks } from "@/lib/chat-checks";

interface SenseiMarkdownProps {
  content: string;
  className?: string;
  /** Stable ID per message so checkbox state is keyed correctly */
  messageId?: string;
  /** Which chat scope this message lives in — drives the "next step" button. */
  scope?: string;
}

/** Count GFM task-list items in markdown so we know when a checklist is complete. */
function countTasks(content: string): { total: number } {
  const matches = content.match(/^\s*[-*]\s+\[( |x|X)\]/gm);
  return { total: matches ? matches.length : 0 };
}

export const SenseiMarkdown = ({ content, className, messageId = "msg", scope }: SenseiMarkdownProps) => {
  const navigate = useNavigate();
  const [checked, setChecked] = useState<ChatChecks>(() => loadChatChecks(messageId));
  const taskTotal = useMemo(() => countTasks(content).total, [content]);
  const itemCounter = { n: 0 };

  const checkedCount = useMemo(() => {
    // only count keys that belong to THIS message's checklist items
    return Object.values(checked).filter(Boolean).length;
  }, [checked]);

  const allDone = taskTotal > 0 && checkedCount >= taskTotal;

  // When the final box is ticked, tell the chat to demand proof (a new bounce).
  useEffect(() => {
    if (allDone) {
      try { console.info("[SenseiProof] proof-required", { messageId, taskTotal, scope }); } catch {}
      window.dispatchEvent(new CustomEvent("sensei:proof-required", { detail: { messageId } }));
    }
  }, [allDone, messageId, taskTotal, scope]);

  const goUpload = () => {
    // Route to upload; the loop/re-bounce continuation picks up from there.
    navigate("/upload");
  };
  const goContinue = () => {
    if (scope?.startsWith("PRODUCTION")) navigate("/production");
    else if (scope === "MASTERING") navigate("/mastering");
    else if (scope === "PUBLISH") navigate("/publish");
    else navigate("/mixing");
  };

  return (
    <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-display font-bold text-gold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-display font-bold text-gold mt-4 mb-2">{children}</h2>,
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-primary mt-3 mb-1.5 flex items-center gap-2">{children}</h3>
          ),
          p: ({ children }) => <p className="text-foreground/90 leading-relaxed mb-2">{children}</p>,
          ul: ({ children }) => <ul className="space-y-1 mb-2 text-foreground/90 list-none pl-0">{children}</ul>,
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 mb-2 text-foreground/90">{children}</ol>
          ),
          li: ({ children, ...props }) => {
            const isTask = (props as { className?: string }).className?.includes("task-list-item");
            if (isTask) {
              const id = `${messageId}-${itemCounter.n++}`;
              const isChecked = checked[id] ?? false;
              const filtered = Array.isArray(children)
                ? children.filter((c) => {
                    if (typeof c === "object" && c !== null && "type" in c) {
                      const t = (c as { type?: unknown }).type;
                      return t !== "input";
                    }
                    return true;
                  })
                : children;
              return (
                <li className="list-none">
                  <button
                    type="button"
                    onClick={() =>
                      setChecked((p) => {
                        const next = { ...p, [id]: !p[id] };
                        saveChatChecks(messageId, next);
                        return next;
                      })
                    }
                    className={cn(
                      "w-full text-left flex items-start gap-2.5 p-2 -mx-1 rounded-md transition-colors",
                      "hover:bg-primary/5",
                      isChecked && "bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all",
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-primary/40 bg-transparent group-hover:border-primary",
                      )}
                    >
                      {isChecked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </span>
                    <span className={cn("text-sm leading-relaxed", isChecked && "line-through text-muted-foreground")}>
                      {filtered}
                    </span>
                  </button>
                </li>
              );
            }
            return <li className="leading-relaxed list-disc list-inside ml-1">{children}</li>;
          },
          strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs font-mono">{children}</code>
          ),
          hr: () => <hr className="border-border my-3" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      {/* R14.4 — when the WHOLE checklist is ticked, Sensei asks for proof and
          gives the clean next step instead of leaving the producer stranded. */}
      {allDone && (
        <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-foreground">
            ✅ Checklist complete. Now show Sensei the proof — upload the new version so he can re-analyze:
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goUpload}
              className="inline-flex items-center gap-1.5 rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <UploadCloud className="w-3.5 h-3.5" /> Upload new version
            </button>
            <button
              type="button"
              onClick={goContinue}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:text-primary"
            >
              Continue coaching <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
