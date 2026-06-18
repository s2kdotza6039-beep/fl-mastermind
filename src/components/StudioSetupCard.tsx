import { Link } from "react-router-dom";
import { Sliders, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStudioSetup } from "@/context/StudioSetupContext";

export function StudioSetupCard() {
  const { setup, loading, isComplete } = useStudioSetup();
  if (loading) return null;

  if (!isComplete) {
    return (
      <Card className="studio-card-gold p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center glow-gold flex-shrink-0">
          <Sliders className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-foreground">Complete your FL Studio setup</h3>
          <p className="text-sm text-muted-foreground">
            So Studio Sensei can give advice that matches your exact DAW.
          </p>
        </div>
        <Button asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          <Link to="/studio-setup">Set Up My FL Studio <ArrowRight className="w-4 h-4 ml-2" /></Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="studio-card p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-foreground mb-1">FL Studio Setup</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <div><span className="text-muted-foreground/60">Version:</span> <span className="text-foreground">{setup?.fl_version}</span></div>
              <div><span className="text-muted-foreground/60">Edition:</span> <span className="text-foreground">{setup?.fl_edition}</span></div>
              <div><span className="text-muted-foreground/60">Genre:</span> <span className="text-foreground">{setup?.main_genre}</span></div>
              <div><span className="text-muted-foreground/60">Skill:</span> <span className="text-foreground">{setup?.skill_level}</span></div>
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/studio-setup">Update Setup</Link>
        </Button>
      </div>
    </Card>
  );
}
