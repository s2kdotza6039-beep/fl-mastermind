import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Check, X, FileLock2 } from "lucide-react";

const KEEP = [
  "You retain 100% ownership of every track, beat, stem and project you upload.",
  "You keep all copyright in your music.",
  "You keep all publishing rights.",
  "You keep all master rights.",
  "Uploading audio to Studio Sensei does not transfer ownership of any kind.",
];

const NEVER = [
  "Studio Sensei does not claim copyright in your music.",
  "Studio Sensei does not claim publishing rights.",
  "Studio Sensei does not claim master ownership.",
  "Studio Sensei does not distribute your music to any platform.",
  "Studio Sensei does not sell your music or licence it to third parties.",
  "Studio Sensei does not use your audio to train external AI models.",
];

export default function OwnershipPage() {
  return (
    <div className="container max-w-3xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Ownership"
        title="Your Music Remains Yours"
        description="Clear, plain-language ownership policy for everything you upload to Studio Sensei."
        icon={<ShieldCheck className="w-6 h-6" />}
      />

      <Card className="studio-card-gold p-6 mb-6">
        <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
          <Check className="w-5 h-5 text-primary" /> What you keep
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {KEEP.map((t) => (
            <li key={t} className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span>{t}</span></li>
          ))}
        </ul>
      </Card>

      <Card className="studio-card p-6 mb-6">
        <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
          <X className="w-5 h-5 text-destructive" /> What Studio Sensei never does
        </h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {NEVER.map((t) => (
            <li key={t} className="flex gap-2"><X className="w-4 h-4 text-destructive mt-0.5 shrink-0" /><span>{t}</span></li>
          ))}
        </ul>
      </Card>

      <Card className="studio-card p-6 mb-6">
        <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
          <FileLock2 className="w-5 h-5 text-primary" /> What Studio Sensei does with your audio
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Studio Sensei only processes audio to deliver the analysis and coaching features you
          actively use — loudness, dynamics, key, BPM, stereo width, frequency balance, and
          related production coaching.
        </p>
        <p className="text-sm text-muted-foreground mb-3">
          By uploading audio, you grant Studio Sensei a limited, revocable, non-exclusive licence
          to process that audio solely for the purpose of providing those services to you. This
          licence ends when you remove or archive the audio.
        </p>
        <p className="text-sm text-muted-foreground">
          You may remove or archive your uploaded content at any time, subject to the limits of
          your subscription plan. Removal deletes the associated analysis records from your
          account.
        </p>
      </Card>

      <p className="text-xs text-muted-foreground">
        See also: <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>{" · "}
        <Link to="/security" className="text-primary hover:underline">Security</Link>{" · "}
        <Link to="/terms" className="text-primary hover:underline">Terms</Link>
      </p>
    </div>
  );
}
