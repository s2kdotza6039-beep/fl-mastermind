import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Shield, Lock, KeyRound, Users, Activity, EyeOff, Gauge, FileLock2, Database, ShieldCheck } from "lucide-react";

import { BETA_CONFIG } from "@/lib/beta-config";

const ITEMS = [
  { icon: KeyRound, title: "Authentication", body: "Sign in with email + password or Google. Passwords are never stored in plain text — they are hashed using industry-standard algorithms." },
  { icon: Lock, title: "Encryption", body: "Everything in transit is protected by TLS 1.2+. Stored data is encrypted at rest by our cloud infrastructure (AES-256)." },
  { icon: Database, title: "Backend Security", body: "We run on managed cloud infrastructure with continuous patching, isolated databases, and access controls on every table." },
  { icon: ShieldCheck, title: "Row-Level Security (RLS)", body: "Every database table that holds your data is protected so only you can read or change your rows. Other users cannot see your tracks, analyses or sessions." },
  { icon: Users, title: "Role-Based Access", body: "Admin features are gated by a dedicated role. Only verified Studio Sensei admins can reach admin tools, and never read your audio analysis details." },
  { icon: Activity, title: "Audit Logging", body: "Account events (sign-ins, role changes, security alerts) are logged so suspicious activity can be detected and reviewed." },
  { icon: EyeOff, title: "Private by Default", body: "Your uploads, analyses and sessions are private to your account. Nothing is published, indexed or shared without you explicitly choosing to." },
  { icon: FileLock2, title: "Signed Access", body: "When private files need to be loaded, they are served via short-lived signed URLs — links expire and cannot be guessed or replayed." },
  { icon: Gauge, title: "Rate Limiting & Abuse Protection", body: `Automated traffic and credential-stuffing attempts are throttled. Beta limits per minute: chat ${BETA_CONFIG.rateLimits.chat.free}/${BETA_CONFIG.rateLimits.chat.paid} (free/paid), key detection ${BETA_CONFIG.rateLimits.keyDetect.free}/${BETA_CONFIG.rateLimits.keyDetect.paid}. Hitting a limit shows a friendly retry message.` },
  { icon: Database, title: "Data Retention", body: `Deleted audio analyses are kept in a recoverable state for ${BETA_CONFIG.deletedAudioRetentionDays} days, then permanently purged. Account deletion removes your data immediately.` },
  { icon: Shield, title: "Admin Monitoring", body: "A small admin team reviews security alerts and abuse reports. We disclose material incidents on the public status page in line with applicable law." },
];

export default function SecurityPage() {
  return (
    <div className="container max-w-4xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Security"
        title="How Studio Sensei Protects You"
        description="A plain-language summary of the safeguards we use to keep your account, your music and your data safe."
        icon={<Shield className="w-6 h-6" />}
      />

      <p className="text-xs text-muted-foreground mb-6">
        This page is maintained by the Studio Sensei team to answer common security and privacy questions.
        It describes current, enabled controls — not a certification or audit result.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {ITEMS.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="studio-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary">
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="font-display font-bold text-sm">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        See also: <Link to="/ownership" className="text-primary hover:underline">Ownership Policy</Link>{" · "}
        <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>{" · "}
        <Link to="/terms" className="text-primary hover:underline">Terms</Link>{" · "}
        <Link to="/status" className="text-primary hover:underline">System Status</Link>
      </p>
    </div>
  );
}
