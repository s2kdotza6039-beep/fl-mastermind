import { useMemo, useState } from "react";
import { KeyRound, Music2, Wand2, Mic, Activity, ArrowRight, ArrowLeft, RotateCcw, Sparkles, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SenseiChat } from "@/components/SenseiChat";
import { cn } from "@/lib/utils";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
type Note = typeof NOTES[number];
type Scale = "Major" | "Minor";

// Semitone offsets from root for each scale
const SCALE_INTERVALS: Record<Scale, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const FLAT_NAMES: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};

function relativeKey(root: Note, scale: Scale): string {
  const idx = NOTES.indexOf(root);
  if (scale === "Minor") {
    const rel = NOTES[(idx + 3) % 12];
    return `${rel} Major`;
  }
  const rel = NOTES[(idx + 9) % 12];
  return `${rel} Minor`;
}

function scaleNotes(root: Note, scale: Scale): string[] {
  const idx = NOTES.indexOf(root);
  return SCALE_INTERVALS[scale].map((step) => NOTES[(idx + step) % 12]);
}

const STEPS = [
  { id: 0, label: "Pick Source", icon: Music2 },
  { id: 1, label: "Detect Key", icon: Wand2 },
  { id: 2, label: "Confirm", icon: Check },
  { id: 3, label: "Align 808s", icon: Activity },
  { id: 4, label: "Align Melodies", icon: KeyRound },
  { id: 5, label: "Align Vocals", icon: Mic },
  { id: 6, label: "Sensei Review", icon: Sparkles },
];

type Source = "beat" | "melody" | "vocal" | "unknown";

const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "beat", label: "Full Beat / Loop", hint: "Use Edison on the master to capture 4–8 bars" },
  { id: "melody", label: "Melody / Sample", hint: "Drop the loop into Edison or Piano Roll" },
  { id: "vocal", label: "Vocal Take", hint: "Use Pitcher to read the sung note" },
  { id: "unknown", label: "I'm not sure", hint: "Sensei will guide you from scratch" },
];

export default function KeyDetectionPage() {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("beat");
  const [root, setRoot] = useState<Note>("C");
  const [scale, setScale] = useState<Scale>("Minor");
  const [confirmed, setConfirmed] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState<string>();

  const notes = useMemo(() => scaleNotes(root, scale), [root, scale]);
  const rel = useMemo(() => relativeKey(root, scale), [root, scale]);
  const display = `${root}${FLAT_NAMES[root] ? ` / ${FLAT_NAMES[root]}` : ""} ${scale}`;
  const progress = Math.round((step / (STEPS.length - 1)) * 100);

  const reset = () => {
    setStep(0);
    setSource("beat");
    setRoot("C");
    setScale("Minor");
    setConfirmed(false);
    setReviewPrompt(undefined);
  };

  const goReview = () => {
    setReviewPrompt(
      `I've identified my track key as ${display}. The diatonic notes are: ${notes.join(", ")}. Relative key: ${rel}.\n\n` +
        `Please give me a complete alignment plan for FL Studio:\n` +
        `1) How to lock my 808 to ${root} and the bassline notes I should stay on for ${scale.toLowerCase()} feel.\n` +
        `2) Which scale modes/chords to use for melodies that won't clash.\n` +
        `3) How to tune/Pitcher my vocal so it sits inside ${display} without sounding robotic.\n` +
        `4) A sanity check for hooks that drift between ${display} and ${rel}.\n` +
        `Stick to native FL Studio plugins (Pitcher, Edison, Patcher, Fruity Parametric EQ 2).`,
    );
    setStep(6);
  };

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Key Detection Wizard"
        title="Lock your track to one key"
        description="Detect your root note and scale, then align 808s, melodies, and vocals using Edison, Piano Roll, and Pitcher."
        icon={<KeyRound className="w-6 h-6" />}
        action={
          step > 0 && (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-2" /> Restart
            </Button>
          )
        }
      />

      {/* Stepper */}
      <Card className="studio-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Step {step + 1} of {STEPS.length} — {STEPS[step].label}
          </div>
          <div className="text-xs text-primary font-semibold">{progress}%</div>
        </div>
        <Progress value={progress} className="h-1.5 bg-secondary mb-3" />
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <button
                key={s.id}
                onClick={() => i <= step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all",
                  active && "bg-gradient-gold text-primary-foreground",
                  done && !active && "text-primary hover:bg-primary/10",
                  !active && !done && "text-muted-foreground/60",
                )}
              >
                <Icon className="w-3 h-3" />
                {s.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* STEP 0 — Pick source */}
      {step === 0 && (
        <Card className="studio-card p-6 animate-fade-in-up">
          <h2 className="font-display text-xl font-bold mb-1">What are we keying?</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Pick the source you want Sensei to lock the track around.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={cn(
                  "text-left p-4 rounded-lg border transition-all",
                  source === s.id
                    ? "border-primary bg-gradient-gold-soft"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{s.label}</span>
                  {source === s.id && <Check className="w-4 h-4 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              Detect Key <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 1 — Detection how-to + manual entry */}
      {step === 1 && (
        <Card className="studio-card p-6 animate-fade-in-up space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">Detect the root note</h2>
            <p className="text-sm text-muted-foreground">
              FL Studio doesn't auto-key for you, but its native tools nail it fast. Pick the path that matches your source.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <DetectCard
              n="1"
              tool="Edison"
              copy={
                source === "vocal"
                  ? "Insert Edison on the vocal channel, record the held note, hit Tools → Detect Pitch."
                  : "Drop the loop into Edison, hit Tools → Detect Pitch Regions. The lowest stable note is usually root."
              }
            />
            <DetectCard
              n="2"
              tool="Piano Roll"
              copy="Open the bass/sample in Piano Roll. The most-used, longest note on strong beats is your root."
            />
            <DetectCard
              n="3"
              tool="Pitcher / Tuner"
              copy={
                source === "vocal"
                  ? "Add Pitcher on the vocal, set Detect mode. Watch the readout while the singer holds a note."
                  : "Bounce a single bass hit, drop Pitcher on it in Detect mode to read the exact pitch."
              }
            />
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-widest text-muted-foreground">
              Enter what you found
            </h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Root note</div>
                <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
                  {NOTES.map((n) => (
                    <button
                      key={n}
                      onClick={() => setRoot(n)}
                      className={cn(
                        "h-10 rounded-md text-sm font-bold transition-all",
                        root === n
                          ? "bg-gradient-gold text-primary-foreground glow-gold"
                          : "bg-secondary text-foreground hover:bg-primary/15 hover:text-primary",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Scale</div>
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  {(["Minor", "Major"] as Scale[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={cn(
                        "h-10 rounded-md text-sm font-semibold transition-all border",
                        scale === s
                          ? "bg-gradient-gold text-primary-foreground border-transparent"
                          : "bg-secondary text-foreground border-border hover:border-primary/40",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={() => setStep(2)} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              Confirm <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2 — Confirm key */}
      {step === 2 && (
        <Card className="studio-card-gold p-6 animate-fade-in-up">
          <div className="text-center mb-6">
            <div className="text-xs uppercase tracking-widest text-primary/80 mb-2">Detected Key</div>
            <div className="font-display text-5xl font-bold text-gold mb-2">{display}</div>
            <div className="text-sm text-muted-foreground">Relative: {rel}</div>
          </div>
          <div className="bg-card/50 border border-border rounded-lg p-4 mb-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Diatonic notes (safe zone)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {notes.map((n) => (
                <Badge key={n} className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                  {n}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Re-detect
            </Button>
            <Button
              onClick={() => {
                setConfirmed(true);
                setStep(3);
              }}
              className="bg-gradient-gold text-primary-foreground hover:opacity-90"
            >
              Lock Key & Align 808s <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3 — Align 808s */}
      {step === 3 && (
        <AlignStep
          icon={<Activity className="w-5 h-5" />}
          title="Align your 808s & sub bass"
          subtitle={`Lock every 808 hit to a note inside ${display}.`}
          steps={[
            `Open the 808 sample in the Channel Rack → Sampler. Set Root note to ${root}.`,
            `In Piano Roll, ghost-write the bassline using only: ${notes.slice(0, 4).join(", ")}.`,
            `Drop Pitcher on the 808 channel, set Key to ${root} and Scale to ${scale}. Mode = "Correct".`,
            `Check tuning with Edison → Tools → Detect Pitch on a long held note. It should read ${root}.`,
            `If the 808 sounds off-key on a phrase, transpose ±12 semitones — never out of scale.`,
          ]}
          settings={[
            ["Pitcher Key", root],
            ["Pitcher Scale", scale],
            ["Sampler Root", `${root}5`],
            ["Sub focus", "40–80 Hz"],
          ]}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {/* STEP 4 — Align melodies */}
      {step === 4 && (
        <AlignStep
          icon={<KeyRound className="w-5 h-5" />}
          title="Align melodies & samples"
          subtitle={`Force every melodic loop into ${display}.`}
          steps={[
            `In Piano Roll, click the keyboard ▾ menu → Helpers → Scale highlighting → ${root} ${scale}.`,
            `Any sample loop: drop it in Edison → Time → Pitch shift to match ${root}, then Tools → Detect Tempo to keep timing.`,
            `Chords stay diatonic. Use these triads: ${triadList(root, scale)}.`,
            `For tension, borrow from the relative ${rel} on the bridge — return to ${display} on the hook.`,
            `Mute everything except the lead and the 808 for one bar. If they fight, the lead is out of scale.`,
          ]}
          settings={[
            ["Piano Roll scale", `${root} ${scale}`],
            ["Safe triads", triadList(root, scale)],
            ["Borrow zone", rel],
          ]}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}

      {/* STEP 5 — Align vocals */}
      {step === 5 && (
        <AlignStep
          icon={<Mic className="w-5 h-5" />}
          title="Tune your vocals to key"
          subtitle={`Sit the vocal inside ${display} naturally — no robot artifacts.`}
          steps={[
            `Insert Pitcher on the vocal mixer track. Set Key = ${root}, Scale = ${scale}.`,
            `Mode = "Correct" for natural feel. Speed: 60–80% for melodic, 90–100% for trap auto-tune.`,
            `Set Formant to 0 to keep the natural voice. Dry/Wet at 100% for full correction.`,
            `For ad-libs: duplicate the channel, run a second Pitcher set HARD (Speed 100, Transition 0) for that "T-Pain" effect.`,
            `Sanity check: solo the vocal + 808. They should feel like the same song. If clashing, your vocal melody is leaving ${display}.`,
          ]}
          settings={[
            ["Pitcher Key", root],
            ["Pitcher Scale", scale],
            ["Speed (melodic)", "60–80%"],
            ["Speed (trap)", "90–100%"],
            ["Formant", "0"],
          ]}
          onBack={() => setStep(4)}
          onNext={goReview}
          nextLabel="Get Sensei Review"
        />
      )}

      {/* STEP 6 — Sensei review */}
      {step === 6 && (
        <Card className="studio-card overflow-hidden h-[70vh] flex flex-col animate-fade-in-up">
          <SenseiChat initialPrompt={reviewPrompt} />
        </Card>
      )}
    </div>
  );
}

/* --- helpers --- */

const DetectCard = ({ n, tool, copy }: { n: string; tool: string; copy: string }) => (
  <div className="rounded-lg border border-border bg-card/50 p-4">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-6 h-6 rounded-full bg-gradient-gold text-primary-foreground flex items-center justify-center text-xs font-bold">
        {n}
      </div>
      <div className="font-semibold text-sm text-primary">{tool}</div>
    </div>
    <p className="text-xs text-muted-foreground leading-relaxed">{copy}</p>
  </div>
);

function triadList(root: Note, scale: Scale): string {
  const n = scaleNotes(root, scale);
  // I, IV, V (or i, iv, v)
  const tag = scale === "Minor" ? ["i", "iv", "v"] : ["I", "IV", "V"];
  return `${tag[0]}=${n[0]}, ${tag[1]}=${n[3]}, ${tag[2]}=${n[4]}`;
}

interface AlignStepProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  steps: string[];
  settings: [string, string][];
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}

const AlignStep = ({ icon, title, subtitle, steps, settings, onBack, onNext, nextLabel = "Next" }: AlignStepProps) => (
  <Card className="studio-card p-6 animate-fade-in-up space-y-5">
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>

    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Step-by-step</div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </div>

    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Suggested settings</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {settings.map(([k, v]) => (
          <div key={k} className="rounded-md bg-secondary border border-border px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="text-sm font-semibold text-primary">{v}</div>
          </div>
        ))}
      </div>
    </div>

    <div className="flex justify-between pt-2">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Button onClick={onNext} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
        {nextLabel} <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  </Card>
);
