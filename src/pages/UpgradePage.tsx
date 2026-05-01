import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Crown, Check } from "lucide-react";

export default function UpgradePage() {
  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader eyebrow="Upgrade" title="Studio Sensei Paid" description="Unlock advanced plug-in chains and pro tools." icon={<Crown className="w-6 h-6" />} />
      <Card className="studio-card-gold p-8">
        <h3 className="font-display text-lg font-bold mb-3 text-gold">What you get</h3>
        <ul className="space-y-2 text-sm">
          {[
            "Advanced plug-in chains (Trap, Amapiano, Drill, R&B, Afrobeat)",
            "Full mixing & mastering coach with exact settings",
            "Watermarked PDF/TXT exports of Sensei advice",
            "Higher AI request limits",
            "Priority response queue",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /><span>{b}</span></li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-6 leading-relaxed">
          Currently upgrades are processed manually by the studio admin. Contact the admin to enable
          your paid access. Automated billing is coming soon.
        </p>
      </Card>
    </div>
  );
}
