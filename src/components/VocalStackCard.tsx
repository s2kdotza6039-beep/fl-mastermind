import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Layers, Copy, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

const DOUBLES = [
  "Chorus: double the entire hook — two takes, panned L12 / R12, both -6 dB under lead, tight timing.",
  "Verse: double only last word of each bar for emphasis — keeps verse intimate.",
  "Pre-chorus: single lead dry, add doubles only on the final 2 bars to lift into chorus.",
];

const HARMONIES = [
  "Chorus harmony: sing a 3rd above lead (if lead is C, harmony is E) — tuck -9 dB, pan ±18%, low-pass at 10 kHz.",
  "Bridge harmony: add a 5th below for tension (C → G below) — use only in bridge/outro.",
  "Call & response: harmony answers lead after the line (\"yeah\", \"oh\") — not on top of it.",
];

const ADLIBS = [
  "Ad-libs on the off-beat after line ends — pan hard, add delay throw (1/8 dotted, 20% mix).",
  "Stack 3 ad-lib layers: one centered dry, two panned hard with different reverb sends.",
  "Automate ad-libs: mute in verse, unleash in final chorus — 30% louder on last hook.",
];

export const VocalStackCard = ({ projectName, genre }: { projectName?: string | null; genre?: string | null }) => {
  const navigate = useNavigate();
  const ask = (kind: string) => {
    stashChatPrompt(
      [
        projectName ? `Project: ${projectName}.` : "",
        genre ? `Genre: ${genre}.` : "",
        `VOCALS Stacking — ${kind}. My lead is comped and tuned. Give me a stack map: which lines to double/harmonize, pan/level, and Playlist layout for FL Studio. Keep it genre-true for ${genre ?? "this beat"}.`,
      ].filter(Boolean).join(" "),
      "PRODUCTION:VOCALS"
    );
    navigate("/chat?scope=PRODUCTION%3AVOCALS");
  };

  return (
    <div className="space-y-4">
      <Card className="studio-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> 🎧 Stack Map — Doubles · Harmonies · Ad-libs</h3>
        <p className="text-xs text-muted-foreground mt-1">Lead is king. Everything else sits under it — never louder, never wider. Build the stack, don’t bury the song.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <h4 className="text-xs font-semibold flex items-center gap-1.5"><Copy className="w-3 h-3" /> Doubles</h4>
            <ul className="mt-2 space-y-1">
              {DOUBLES.map(d => <li key={d} className="text-[11px] text-muted-foreground leading-relaxed">• {d}</li>)}
            </ul>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => ask("Doubles")}><MessageCircle className="w-3 h-3 mr-1" /> Coach my doubles</Button>
          </div>
          <div>
            <h4 className="text-xs font-semibold flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Harmonies</h4>
            <ul className="mt-2 space-y-1">
              {HARMONIES.map(d => <li key={d} className="text-[11px] text-muted-foreground leading-relaxed">• {d}</li>)}
            </ul>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => ask("Harmonies")}><MessageCircle className="w-3 h-3 mr-1" /> Coach harmonies</Button>
          </div>
          <div>
            <h4 className="text-xs font-semibold flex items-center gap-1.5"><Layers className="w-3 h-3" /> Ad-libs</h4>
            <ul className="mt-2 space-y-1">
              {ADLIBS.map(d => <li key={d} className="text-[11px] text-muted-foreground leading-relaxed">• {d}</li>)}
            </ul>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => ask("Ad-libs")}><MessageCircle className="w-3 h-3 mr-1" /> Coach ad-libs</Button>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-[11px] text-muted-foreground"><span className="font-semibold text-primary">Playlist layout:</span> Lead on Playlist lane 1 (center), Doubles lanes 2–3 (L12/R12), Harmonies lanes 4–5 (±18%, low-pass), Ad-libs lanes 6–8 (hard-pan, delay throw). Color each lane — find them in 2 seconds.</p>
        </div>
      </Card>

      <Card className="studio-card p-4 border-amber-200 bg-amber-50/60">
        <h4 className="text-xs font-semibold text-amber-800">Vocal prep checklist before Mixing</h4>
        <ul className="mt-2 space-y-1 text-[11px] text-amber-900/80">
          <li>• De-noise breaths in Edison (noise profile → de-noise 20–30%), don’t gate the tail</li>
          <li>• De-ess with Fruity Convolver or spitfish-ish: 5–8 kHz, 3–4 dB only on sibilance</li>
          <li>• Light high-pass at 80 Hz, gentle cut at 350 Hz boxiness, no boosting yet</li>
          <li>• Bounce 24-bit WAV, peaks -6 dB, no limiter — Mixing needs headroom</li>
        </ul>
        <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px] border-amber-300" onClick={() => ask("Clean & prep for mixing — De-noise / De-ess / EQ prep with exact stock plugin settings")}>Clean for mix</Button>
      </Card>
    </div>
  );
};
