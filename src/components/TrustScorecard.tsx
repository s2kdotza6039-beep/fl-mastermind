import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Lock, KeyRound, AudioLines, FileLock2 } from "lucide-react";

const ROWS = [
  { icon: ShieldCheck, label: "Ownership Protection", value: "You retain 100%" },
  { icon: Lock, label: "Data Privacy", value: "Private to your account" },
  { icon: KeyRound, label: "Account Security", value: "Hashed passwords · TLS" },
  { icon: AudioLines, label: "Analysis Protection", value: "RLS on every record" },
  { icon: FileLock2, label: "Session Security", value: "Signed, short-lived access" },
];

export function TrustScorecard() {
  const updated = new Date().toISOString().slice(0, 10);
  return (
    <Card className="studio-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" /> Trust &amp; Security Overview
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Updated {updated}</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {ROWS.map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-3 rounded border border-border bg-card/40">
            <div className="flex items-center gap-1.5 text-primary mb-1"><Icon className="w-3.5 h-3.5" /><span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span></div>
            <div className="text-xs font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        <Link to="/ownership" className="text-primary hover:underline">Ownership</Link>
        <Link to="/security" className="text-primary hover:underline">Security</Link>
        <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>
        <Link to="/terms" className="text-primary hover:underline">Terms</Link>
      </div>
    </Card>
  );
}
