import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Mic, Speaker, Drum, Music, Sliders, Crown, Disc, Zap } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";

const TRACKS = [
  { id: "lead-vocal", label: "Lead Vocal", icon: Mic, prompt: "Give me a complete FL Studio plugin chain for a LEAD VOCAL — exact plugins in order, settings, and explain when to use Patcher for advanced routing." },
  { id: "adlibs", label: "Adlibs", icon: Mic, prompt: "Build me a FL Studio plugin chain for ADLIBS / background vocals — should sit behind the lead, wider, with character." },
  { id: "808", label: "808", icon: Speaker, prompt: "Give me a complete FL Studio plugin chain for an 808 BASS — saturation, EQ, compression, tuning. Cover translation on small speakers." },
  { id: "kick", label: "Kick", icon: Drum, prompt: "Build me a FL Studio plugin chain for a KICK drum — punchy, clean, doesn't fight the 808." },
  { id: "snare", label: "Snare", icon: Drum, prompt: "Build me a FL Studio plugin chain for a SNARE drum — crack, body, and tail with exact settings." },
  { id: "hihats", label: "Hi-hats", icon: Disc, prompt: "Build me a FL Studio plugin chain for HI-HATS — crisp, tight, panned correctly without sibilance." },
  { id: "melody", label: "Melody / Lead", icon: Music, prompt: "Give me a FL Studio plugin chain for a MELODY / lead synth — sit it nicely with vocals, add character." },
  { id: "full-beat", label: "Full Beat (Bus)", icon: Sliders, prompt: "Give me a FL Studio plugin chain for the FULL BEAT bus — glue compression, tonal shaping, before vocals get mixed in." },
  { id: "master", label: "Master Channel", icon: Crown, prompt: "Give me a complete FL Studio MASTER CHAIN for international-level loudness, clarity, and translation." },
];

export default function ChainBuilderPage() {
  const [prompt, setPrompt] = useState<string>();

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="FL Studio Native"
        title="Plugin Chain Builder"
        description="Pick a track type. Get the exact chain, order, and settings — including Patcher, Mid/Side, and parallel routing."
        icon={<Layers className="w-6 h-6" />}
      />

      {!prompt ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {TRACKS.map((t) => (
            <button key={t.id} onClick={() => setPrompt(t.prompt)} className="text-left">
              <Card className="studio-card p-5 hover:border-primary/50 hover:-translate-y-1 transition-all group h-full">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center group-hover:bg-gradient-gold transition-all">
                    <t.icon className="w-5 h-5 text-primary group-hover:text-primary-foreground" />
                  </div>
                  <Zap className="w-4 h-4 text-primary/40 group-hover:text-primary transition" />
                </div>
                <h3 className="font-display text-base font-bold">{t.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">FL Studio native chain</p>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={() => setPrompt(undefined)} className="mb-4">← Back to track types</Button>
          <Card className="studio-card overflow-hidden h-[70vh] flex flex-col">
            <SenseiChat initialPrompt={prompt} />
          </Card>
        </>
      )}
    </div>
  );
}
