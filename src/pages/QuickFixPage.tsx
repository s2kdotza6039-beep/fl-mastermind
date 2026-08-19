import { useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Mic, Speaker, Sparkles, Volume2, Scale, Crown, UploadCloud } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";
import { UploadAndAskCard } from "@/components/UploadAndAskCard";
import { cn } from "@/lib/utils";

const PATCHER = "Use Patcher if it beats stock and explain why (exact plugin order + key values).";

const ACTIONS = [
  { label: "Fix My Vocal", icon: Mic, prompt: `Help me fix my vocal. It needs to sit professionally in the mix. Walk me through the FL Studio chain step by step. ${PATCHER}` },
  { label: "Fix My 808", icon: Speaker, prompt: `My 808 is weak and not translating. Show me how to make it powerful and clean in FL Studio. ${PATCHER}` },
  { label: "Clean My Mix", icon: Sparkles, prompt: `My mix sounds cluttered. Walk me through cleaning it up in FL Studio with EQ, panning, and bus routing. ${PATCHER}` },
  { label: "Make It Loud", icon: Volume2, prompt: `How do I make my track loud and competitive without distortion? Use Maximus and Fruity Limiter properly. ${PATCHER}` },
  { label: "Balance My Beat", icon: Scale, prompt: `Help me balance my beat — kick, snare, hats, melody, 808 — using FL Studio mixer. ${PATCHER}` },
  { label: "Master My Song", icon: Crown, prompt: `Walk me through mastering my song in FL Studio start to finish for international standard. ${PATCHER}` },
];

export default function QuickFixPage() {
  const [prompt, setPrompt] = useState<string>();
  const askRef = useRef<HTMLDivElement | null>(null);
  const [flash, setFlash] = useState(false);

  const jumpToAsk = () => {
    askRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  };

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="One-Tap Engineer"
        title="Quick Fixes"
        description="Tap a button. Get a full step-by-step solution from Sensei — or upload your track and ask anything."
        icon={<Wrench className="w-6 h-6" />}
      />
      <ActiveTrackChip />

      {!prompt ? (
        <>
          <div ref={askRef} className={cn("rounded-xl transition-shadow", flash && "ring-2 ring-primary")}>
            <UploadAndAskCard />
          </div>

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

            <Card
              onClick={jumpToAsk}
              className="studio-card p-6 cursor-pointer border-amber-500/40 bg-amber-500/5 hover:border-primary/50 hover:-translate-y-1 transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
                <UploadCloud className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="font-display text-lg font-bold mb-1">Upload &amp; Ask Anything</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">
                Load the bounce Sensei is coaching on and ask production tips, effects or FL Studio how-to.
              </p>
            </Card>
          </div>
        </>
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
