import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "studio-sensei:beta-notice-dismissed:v1";

export function BetaNotice() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);
  if (hidden) return null;
  return (
    <Card className="studio-card-gold p-4 mb-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex gap-3 items-start">
        <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="font-display font-bold text-sm">Studio Sensei is in Beta</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You may run into occasional issues. Your feedback shapes what ships next — bug reports
            and ideas welcome.
          </p>
        </div>
      </div>
      <div className="flex gap-2 sm:flex-shrink-0">
        <Button asChild size="sm" variant="default">
          <Link to="/feedback"><MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Send feedback</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setHidden(true); }}
          aria-label="Dismiss beta notice"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}
