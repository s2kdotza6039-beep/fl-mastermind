import { Link } from "react-router-dom";
import { Boxes, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePluginInventory } from "@/context/PluginInventoryContext";

export function PluginInventoryCard() {
  const { inventory, loading, isComplete } = usePluginInventory();
  if (loading) return null;

  if (!isComplete) {
    return (
      <Card className="studio-card-gold p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center glow-gold flex-shrink-0">
          <Boxes className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-foreground">Add your plugin inventory</h3>
          <p className="text-sm text-muted-foreground">
            So Sensei can recommend the right tools you actually own.
          </p>
        </div>
        <Button asChild className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          <Link to="/plugin-inventory">Add Plugins <ArrowRight className="w-4 h-4 ml-2" /></Link>
        </Button>
      </Card>
    );
  }

  const n = inventory?.native_plugins.length ?? 0;
  const t = inventory?.third_party_plugins.length ?? 0;
  const c = inventory?.custom_plugins.length ?? 0;

  return (
    <Card className="studio-card p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-foreground mb-1">Plugin Inventory</h3>
            <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <div><span className="text-muted-foreground/60">Native:</span> <span className="text-foreground">{n}</span></div>
              <div><span className="text-muted-foreground/60">Third-party:</span> <span className="text-foreground">{t}</span></div>
              <div><span className="text-muted-foreground/60">Custom:</span> <span className="text-foreground">{c}</span></div>
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/plugin-inventory">Update Plugin Inventory</Link>
        </Button>
      </div>
    </Card>
  );
}
