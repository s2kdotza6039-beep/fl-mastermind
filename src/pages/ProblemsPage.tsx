import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Disc3 } from "lucide-react";

const PROBLEMS = [
  { label: "Vocal muddy", prompt: "My vocal sounds muddy. Diagnose and fix with FL Studio's Fruity Parametric EQ 2." },
  { label: "Vocal harsh", prompt: "My vocal is harsh and piercing in the 3k–7k range. Walk me through taming it." },
  { label: "Vocal buried", prompt: "My vocal is buried under the beat. Help me bring it forward without losing balance." },
  { label: "808 weak", prompt: "My 808 is weak. Show me how to add weight and presence in FL Studio." },
  { label: "Kick & 808 clashing", prompt: "My kick and 808 are clashing. Walk me through frequency separation and sidechain in FL Studio." },
  { label: "Drums not hitting", prompt: "My drums aren't hitting. Show me how to make them punchy with Fruity Compressor and Maximus." },
  { label: "Mix flat", prompt: "My mix sounds flat with no depth. Help me add stereo width, panning, and movement." },
  { label: "Mix crowded", prompt: "My mix is too crowded. Help me carve space and reduce frequency masking." },
  { label: "Too much reverb", prompt: "My mix has too much reverb and sounds washed out. Help me clean it up." },
  { label: "Master too quiet", prompt: "My master is too quiet compared to commercial tracks. Help me get competitive loudness without distortion." },
  { label: "Master distorting", prompt: "My master is distorting on the limiter. Walk me through fixing the gain structure." },
];

export default function ProblemsPage() {
  const [prompt, setPrompt] = useState<string>();

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Diagnose & Fix"
        title="Mix Problem Selector"
        description="Select your symptom. Sensei prescribes the cure with exact FL Studio settings."
        icon={<Disc3 className="w-6 h-6" />}
      />

      {!prompt ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROBLEMS.map((p) => (
            <button key={p.label} onClick={() => setPrompt(p.prompt)} className="text-left">
              <Card className="studio-card p-4 hover:border-destructive/40 hover:bg-destructive/5 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-destructive/60 group-hover:animate-pulse-gold flex-shrink-0" />
                  <span className="font-semibold text-sm">{p.label}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={() => setPrompt(undefined)} className="mb-4">← Back to problems</Button>
          <Card className="studio-card overflow-hidden h-[70vh] flex flex-col">
            <SenseiChat initialPrompt={prompt} />
          </Card>
        </>
      )}
    </div>
  );
}
