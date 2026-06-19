import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Check } from "lucide-react";

const POINTS = [
  "You keep 100% ownership of your music.",
  "Studio Sensei does not publish, distribute or sell your music.",
  "Studio Sensei only analyzes the audio you upload — for your coaching only.",
  "Your files remain private to your account.",
  "Protected by account-level security and Row-Level Security on every record.",
];

export function UploadTrustPanel() {
  return (
    <Card className="studio-card p-5 mb-4 border-primary/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <h3 className="font-display font-bold text-sm">Your Music Is Protected</h3>
      </div>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {POINTS.map((p) => (
          <li key={p} className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>{p}</span></li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        <Link to="/ownership" className="text-primary hover:underline">Ownership Policy</Link>
        <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        <Link to="/security" className="text-primary hover:underline">Security</Link>
      </div>
    </Card>
  );
}
