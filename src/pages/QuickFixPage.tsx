import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Mic, Speaker, Sparkles, Volume2, Scale, Crown } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";

const ACTIONS = [
  { label: "Fix My Vocal", icon: Mic, prompt: "Help me fix my vocal. It needs to sit professionally in the mix. Walk me through the FL Studio chain step by step." },
  { label: "Fix My 808", icon: Speaker, prompt: "My 808 is weak and not translating. Show me how to make it powerful and clean in FL Studio." },
  { label: "Clean My Mix", icon: Sparkles, prompt: "My mix sounds cluttered. Walk me through cleaning it up in FL Studio with EQ, panning, and bus routing." },
  { label: "Make It Loud", icon: Volume2, prompt: "How do I make my track loud and competitive without distortion? Use Maximus and Fruity Limiter properly." },
  { label: "Balance My Beat", icon: Scale, prompt: "Help me balance my beat — kick, snare, hats, melody, 808 — using FL Studio mixer." },
  { label: "Master My Song", icon: Crown, prompt: "Walk me through mastering my song in FL Studio start to finish for international standard." },
];

export default function QuickFixPage() {
  const [prompt, setPrompt] = useState<string>();

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="One-Tap Engineer"
        title="Quick Fixes"
        description="Tap a button. Get a full step-by-step solution from Sensei."
        icon={<Wrench className="w-6 h-6" />}
      />

      {!prompt ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ACTIONS.map((a) => (
            <Card
              key={a.label}
              onClick={() => setPrompt(a.prompt)}
              className="studio-card p-6 cursor-pointer hover:border-primary/50 hover:-translate-y-1 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-gold-soft border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-gradient-gold transition-all">
                <a.icon className="w-6 h-6 text-primary group-hover:text-primary-foreground" />
              </div>
              <h3 className="font-display text-lg font-bold mb-1">{a.label}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.prompt}</p>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={() => setPrompt(undefined)} className="mb-4">← Back to actions</Button>
          <Card className="studio-card overflow-hidden h-[70vh] flex flex-col">
            <SenseiChat initialPrompt={prompt} />
          </Card>
        </>
      )}
    </div>
  );
}
