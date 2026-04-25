import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { useSession, type Genre } from "@/context/SessionContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

const GENRES: { name: Genre; vibe: string; emoji: string }[] = [
  { name: "Hip-hop", vibe: "Boom bap, soul, drums up front", emoji: "🎤" },
  { name: "Trap", vibe: "808s, hats, dark melodies", emoji: "🔥" },
  { name: "Kwaito", vibe: "Slow groove, deep bass, SA flavor", emoji: "🇿🇦" },
  { name: "Amapiano", vibe: "Log drums, shakers, jazzy chords", emoji: "🪘" },
  { name: "Afrobeat", vibe: "Percussion, vocals, infectious groove", emoji: "🌍" },
  { name: "R&B", vibe: "Lush vocals, smooth chords, space", emoji: "💜" },
  { name: "Drill", vibe: "Sliding 808s, dark, punchy", emoji: "⚡" },
  { name: "House", vibe: "4-on-floor, energy, stereo wide", emoji: "🏠" },
  { name: "Gospel", vibe: "Big vocals, organic, dynamic", emoji: "🙌" },
  { name: "Pop", vibe: "Polished, catchy, radio-ready", emoji: "✨" },
];

export default function GenrePage() {
  const { genre: currentGenre, setGenre } = useSession();
  const [active, setActive] = useState<Genre | null>(null);

  const ask = (g: Genre) => {
    setGenre(g);
    setActive(g);
  };

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Tailored Coaching"
        title="Genre Mode"
        description="Lock in your genre. Sensei adjusts mixing, mastering, and arrangement advice to match the sound of the culture."
        icon={<Music2 className="w-6 h-6" />}
      />

      {!active ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {GENRES.map((g) => (
            <button key={g.name} onClick={() => ask(g.name)} className="text-left">
              <Card className={cn(
                "studio-card p-4 h-full hover:border-primary/50 hover:-translate-y-0.5 transition-all",
                currentGenre === g.name && "border-primary/60 bg-gradient-gold-soft",
              )}>
                <div className="text-3xl mb-2">{g.emoji}</div>
                <h3 className="font-display font-bold text-base mb-1">{g.name}</h3>
                <p className="text-[11px] text-muted-foreground leading-snug">{g.vibe}</p>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={() => setActive(null)} className="mb-4">← Back to genres</Button>
          <Card className="studio-card overflow-hidden h-[70vh] flex flex-col">
            <SenseiChat initialPrompt={`Give me a complete production, mixing, and mastering blueprint for ${active}. Cover drums, bass, melodies, vocals, and overall mix character. Use FL Studio plugins.`} />
          </Card>
        </>
      )}
    </div>
  );
}
