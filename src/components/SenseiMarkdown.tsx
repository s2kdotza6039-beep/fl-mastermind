import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadChatChecks, saveChatChecks } from "@/lib/chat-checks";

interface SenseiMarkdownProps {
  content: string;
  className?: string;
  /** Stable ID per message so checkbox state is keyed correctly */
  messageId?: string;
}

export const SenseiMarkdown = ({ content, className, messageId = "msg" }: SenseiMarkdownProps) => {
  // Fresh counter every render — render order is stable, so ids are stable.
  // (A memoized mutable counter drifts upward across renders and breaks keys.)
  const itemCounter = { n: 0 };
  const [checked, setChecked] = useState<Record<string, boolean>>(() => loadChatChecks(messageId));

  // R14.4b — Proof Lock: detect when every checkbox in this message is ticked
  // and tell the chat composer to demand a new bounce before continuing.
  const taskCount = useMemo(() => {
    const regex = /^\s*(?:[-*]|\d+\.)\s+\[\s*[xX ]\s*\]/gm;
    return Array.from(content.matchAll(regex)).length;
  }, [content]);

  const taskIds = useMemo(
    () => Array.from({ length: taskCount }, (_, i) => `${messageId}-${i}`),
    [taskCount, messageId],
  );

  const allDone = taskIds.length > 0 && taskIds.every((id) => checked[id]);

  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      window.dispatchEvent(new CustomEvent("sensei:proof-required", { detail: { messageId } }));
    }
    prevAllDone.current = allDone;
  }, [allDone, messageId]);

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
            // react-markdown + remark-gfm marks task list items
            const isTask = (props as { className?: string }).className?.includes("task-list-item");
            if (isTask) {
              const id = `${messageId}-${itemCounter.n++}`;
              const isChecked = checked[id] ?? false;
              // Strip the rendered raw checkbox; we render our own
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
    </div>
  );
};
