import { ReactNode } from "react";

export const PageHeader = ({
  eyebrow, title, description, icon, action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
    <div className="flex items-start gap-4">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
      )}
      <div>
        {eyebrow && (
          <div className="text-[11px] tracking-[0.2em] uppercase text-primary/80 font-semibold mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground leading-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);
