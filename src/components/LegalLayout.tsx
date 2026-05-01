import { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Scale } from "lucide-react";

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Legal"
        title={title}
        description={`Last updated: ${updated}`}
        icon={<Scale className="w-6 h-6" />}
      />
      <article className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-h2:text-base prose-h2:mt-6 prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
        {children}
      </article>
    </div>
  );
}
