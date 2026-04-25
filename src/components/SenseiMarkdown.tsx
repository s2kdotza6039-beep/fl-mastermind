import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export const SenseiMarkdown = ({ content, className }: { content: string; className?: string }) => (
  <div className={cn("prose prose-invert prose-sm max-w-none", className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-display font-bold text-gold mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-display font-bold text-gold mt-4 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold text-primary mt-3 mb-1.5 flex items-center gap-2">{children}</h3>,
        p: ({ children }) => <p className="text-foreground/90 leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 text-foreground/90">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 text-foreground/90">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
        code: ({ children }) => <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs font-mono">{children}</code>,
        hr: () => <hr className="border-border my-3" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">{children}</blockquote>
        ),
      }}
    >{content}</ReactMarkdown>
  </div>
);
