import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound, Music2, Wand2, Mic, Activity, ArrowRight, ArrowLeft, RotateCcw,
  Sparkles, Check, UploadCloud, Loader2, FileAudio, AlertTriangle, Music,
  Play, Pause,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SenseiChat } from "@/components/SenseiChat";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { decodeToMonoWav } from "@/lib/audio-decode";
import { diatonicChords, suggestedProgressions, type Note, type Scale } from "@/lib/music-theory";

const NOTES: Note[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALE_INTERVALS: Record<Scale, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
};

const FLAT_NAMES: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb",
};

const CONFIDENCE_THRESHOLD = 50;
const CHECKLIST_STORAGE_KEY = "studio-sensei-key-checklist-v1";

function relativeKey(root: Note, scale: Scale): string {
  const idx = NOTES.indexOf(root);
  if (scale === "Minor") return `${NOTES[(idx + 3) % 12]} Major`;
  return `${NOTES[(idx + 9) % 12]} Minor`;
}

function scaleNotes(root: Note, scale: Scale): string[] {
  const idx = NOTES.indexOf(root);
  return SCALE_INTERVALS[scale].map((step) => NOTES[(idx + step) % 12]);
}

const STEPS = [
  { id: 0, label: "Pick Source", icon: Music2 },
  { id: 1, label: "Auto-Detect", icon: UploadCloud },
  { id: 2, label: "Manual Tune", icon: Wand2 },
  { id: 3, label: "Confirm", icon: Check },
  { id: 4, label: "Chords", icon: Music },
  { id: 5, label: "Align 808s", icon: Activity },
  { id: 6, label: "Align Melodies", icon: KeyRound },
  { id: 7, label: "Align Vocals", icon: Mic },
  { id: 8, label: "Sensei Review", icon: Sparkles },
];

type Source = "beat" | "melody" | "vocal" | "unknown";

const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "beat", label: "Full Beat / Loop", hint: "Use Edison on the master to capture 4–8 bars" },
  { id: "melody", label: "Melody / Sample", hint: "Drop the loop into Edison or Piano Roll" },
  { id: "vocal", label: "Vocal Take", hint: "Use Pitcher to read the sung note" },
  { id: "unknown", label: "I'm not sure", hint: "Sensei will guide you from scratch" },
];

const ACCEPT_AUDIO = ".wav,.mp3,.m4a,.ogg,.flac,.aac,audio/*";
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

interface UploadResult {
  filename: string;
  durationSec: number;
  confidence: number;
  previewUrl: string;
}

export default function KeyDetectionPage() {
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("beat");
  const [root, setRoot] = useState<Note>("C");
  const [scale, setScale] = useState<Scale>("Minor");
  const [, setConfirmed] = useState(false);
  const [reviewPrompt, setReviewPrompt] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [lowConfidenceAck, setLowConfidenceAck] = useState(false);
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted checklist on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (raw) setDoneItems(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(doneItems));
    } catch { /* ignore */ }
  }, [doneItems]);

  // Free preview URL on unmount / replace
  useEffect(() => {
    return () => {
      if (uploadResult?.previewUrl) URL.revokeObjectURL(uploadResult.previewUrl);
    };
  }, [uploadResult?.previewUrl]);

  const notes = useMemo(() => scaleNotes(root, scale), [root, scale]);
  const rel = useMemo(() => relativeKey(root, scale), [root, scale]);
  const display = `${root}${FLAT_NAMES[root] ? ` / ${FLAT_NAMES[root]}` : ""} ${scale}`;
  const progress = Math.round((step / (STEPS.length - 1)) * 100);

  const reset = () => {
    if (uploadResult?.previewUrl) URL.revokeObjectURL(uploadResult.previewUrl);
    setStep(0);
    setSource("beat");
    setRoot("C");
    setScale("Minor");
    setConfirmed(false);
    setReviewPrompt(undefined);
    setUploadResult(null);
    setLowConfidenceAck(false);
  };

  const toggleItem = (id: string) =>
    setDoneItems((prev) => ({ ...prev, [id]: !prev[id] }));

  const clearChecklist = () => {
    setDoneItems({});
    toast.success("Checklist cleared");
  };

  const handleUpload = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large. Max 30 MB. Try a shorter loop.");
      return;
    }
    setUploading(true);
    setLowConfidenceAck(false);
    if (uploadResult?.previewUrl) URL.revokeObjectURL(uploadResult.previewUrl);
    setUploadResult(null);

    try {
      // Browser-side decode → mono WAV (handles MP3, M4A, OGG, FLAC, WAV)
      toast.loading("Decoding audio…", { id: "decode" });
      const decoded = await decodeToMonoWav(file);
      toast.dismiss("decode");

      const previewUrl = URL.createObjectURL(file);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detect-key`;
      const fd = new FormData();
      fd.append("file", new File([decoded.wavBlob], "decoded.wav", { type: "audio/wav" }));
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok) {
        URL.revokeObjectURL(previewUrl);
        toast.error(data.error ?? "Detection failed.");
        return;
      }
      setRoot(data.root as Note);
      setScale(data.scale as Scale);
      setUploadResult({
        filename: file.name,
        durationSec: decoded.durationSec,
        confidence: data.confidence,
        previewUrl,
      });
      toast.success(`Detected: ${data.root} ${data.scale} (${data.confidence}% confidence)`);
    } catch (e) {
      toast.dismiss("decode");
      toast.error(e instanceof Error ? e.message : "Decoding failed.");
    } finally {
      setUploading(false);
    }
  };

  const proceedFromDetect = () => {
    if (uploadResult && uploadResult.confidence < CONFIDENCE_THRESHOLD && !lowConfidenceAck) {
      // Surface confidence warning UI inside step 1 — handled by render below
      toast.warning("Low confidence — review the warning below.");
      return;
    }
    setStep(2);
  };

  const goReview = () => {
    setReviewPrompt(
      `I've identified my track key as ${display}. The diatonic notes are: ${notes.join(", ")}. Relative key: ${rel}.\n\n` +
        `Please give me a complete alignment plan for FL Studio:\n` +
        `1) How to lock my 808 to ${root} and the bassline notes I should stay on for ${scale.toLowerCase()} feel.\n` +
        `2) Which scale modes/chords (with Roman numerals) to use for melodies that won't clash.\n` +
        `3) How to tune/Pitcher my vocal so it sits inside ${display} without sounding robotic.\n` +
        `4) A sanity check for hooks that drift between ${display} and ${rel}.\n` +
        `5) 3 chord progression ideas in ${display} for verse, hook, and bridge.\n` +
        `Stick to native FL Studio plugins (Pitcher, Edison, Patcher, Fruity Parametric EQ 2).`,
    );
    setStep(8);
  };

  const showLowConfidence =
    !!uploadResult && uploadResult.confidence < CONFIDENCE_THRESHOLD && !lowConfidenceAck;

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
              Auto-Detect from Audio <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 1 — Auto-detect from upload */}
      {step === 1 && (
        <Card className="studio-card p-6 animate-fade-in-up space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold mb-1 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-primary" />
              Auto-detect key from audio
            </h2>
            <p className="text-sm text-muted-foreground">
              Drop in MP3, WAV, M4A, OGG, or FLAC. Sensei decodes it in your browser and reads the pitch profile.
            </p>
          </div>

          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleUpload(f);
            }}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
              uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_AUDIO}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            {uploading ? (
              <>
                <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
                <div className="font-semibold text-sm">Decoding & analyzing…</div>
                <div className="text-xs text-muted-foreground mt-1">Krumhansl-Schmuckler key estimation in progress</div>
              </>
            ) : uploadResult ? (
              <>
                <FileAudio className="w-10 h-10 text-primary mx-auto mb-3" />
                <div className="font-semibold text-sm truncate">{uploadResult.filename}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {uploadResult.durationSec}s analyzed · click to upload another
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <div className="font-semibold text-sm">Drop an audio file here, or click to browse</div>
                <div className="text-xs text-muted-foreground mt-1">
                  MP3 · WAV · M4A · OGG · FLAC · max 30 MB · first 30s analyzed
                </div>
              </>
            )}
          </div>

          {/* Audio preview player */}
          {uploadResult && (
            <PreviewPlayer src={uploadResult.previewUrl} filename={uploadResult.filename} />
          )}

          {uploadResult && (
            <div className="rounded-lg border border-primary/30 bg-gradient-gold-soft p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-primary/80">Detected Key</div>
                <div className="font-display text-2xl font-bold text-gold">{display}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Relative: {rel}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Confidence</div>
                <div
                  className={cn(
                    "font-display text-2xl font-bold tabular-nums",
                    uploadResult.confidence >= 70 ? "text-primary"
                      : uploadResult.confidence >= CONFIDENCE_THRESHOLD ? "text-gold"
                      : "text-destructive",
                  )}
                >
                  {uploadResult.confidence}%
                </div>
              </div>
            </div>
          )}

          {/* Low confidence warning */}
          {showLowConfidence && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-destructive">Low confidence — re-upload recommended</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Sensei isn't sure about this key ({uploadResult!.confidence}%). For an accurate read, try one of these:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>Bounce a <span className="text-foreground font-medium">longer section</span> (8–16 bars instead of 1–2)</li>
                    <li>Use a <span className="text-foreground font-medium">cleaner stem</span> — solo the melody, bass, or chord track</li>
                    <li>Mute drums and percussion before bouncing — they confuse pitch detection</li>
                    <li>Avoid sections with key changes, drops, or heavy FX tails</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setLowConfidenceAck(true)}>
                  Use it anyway
                </Button>
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-gold text-primary-foreground hover:opacity-90"
                >
                  <UploadCloud className="w-4 h-4 mr-2" /> Upload a better bounce
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Skip — Tune Manually
              </Button>
              <Button
                onClick={proceedFromDetect}
                disabled={!uploadResult || showLowConfidence}
                className="bg-gradient-gold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Use Detected Key <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2 — Manual tune */}
      {step === 2 && (
        <Card className="studio-card p-6 animate-fade-in-up space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold mb-1">Fine-tune the root note</h2>
            <p className="text-sm text-muted-foreground">
              Confirm or override the auto-detected key. FL Studio's native tools nail it fast — pick the path that matches your source.
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
              Root note
            </h3>
            <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5 mb-4">
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
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-widest text-muted-foreground">Scale</h3>
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

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
              Confirm <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3 — Confirm key */}
      {step === 3 && (
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
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Re-tune
            </Button>
            <Button
              onClick={() => {
                setConfirmed(true);
                setStep(4);
              }}
              className="bg-gradient-gold text-primary-foreground hover:opacity-90"
            >
              Verify Chord Progression <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4 — Chord progression verification */}
      {step === 4 && (
        <ChordsStep
          root={root}
          scale={scale}
          display={display}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}

      {/* STEP 5 — Align 808s */}
      {step === 5 && (
        <AlignStep
          stepKey="808s"
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
          doneItems={doneItems}
          toggleItem={toggleItem}
          onBack={() => setStep(4)}
          onNext={() => setStep(6)}
        />
      )}

      {/* STEP 6 — Align melodies */}
      {step === 6 && (
        <AlignStep
          stepKey="melodies"
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
          doneItems={doneItems}
          toggleItem={toggleItem}
          onBack={() => setStep(5)}
          onNext={() => setStep(7)}
        />
      )}

      {/* STEP 7 — Align vocals */}
      {step === 7 && (
        <AlignStep
          stepKey="vocals"
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
          doneItems={doneItems}
          toggleItem={toggleItem}
          onBack={() => setStep(6)}
          onNext={goReview}
          nextLabel="Get Sensei Review"
          footerExtra={
            <Button size="sm" variant="ghost" onClick={clearChecklist} className="text-xs text-muted-foreground">
              <RotateCcw className="w-3 h-3 mr-1.5" /> Clear saved checklist
            </Button>
          }
        />
      )}

      {/* STEP 8 — Sensei review */}
      {step === 8 && (
        <Card className="studio-card overflow-hidden h-[70vh] flex flex-col animate-fade-in-up">
          <SenseiChat initialPrompt={reviewPrompt} />
        </Card>
      )}
    </div>
  );
}

/* --- Audio preview player --- */

const PreviewPlayer = ({ src, filename }: { src: string; filename: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => setPlaying(false);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={toggle}
          className="w-10 h-10 rounded-full bg-gradient-gold text-primary-foreground flex items-center justify-center hover:opacity-90 transition flex-shrink-0"
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</div>
          <div className="text-sm font-semibold truncate">{filename}</div>
          <div className="text-xs text-muted-foreground">Confirm this is the section you want to key.</div>
        </div>
      </div>
      <audio ref={audioRef} src={src} controls className="w-full h-9" preload="metadata" />
    </div>
  );
};

/* --- Chord verification step --- */

interface ChordsStepProps {
  root: Note;
  scale: Scale;
  display: string;
  onBack: () => void;
  onNext: () => void;
}

const ChordsStep = ({ root, scale, display, onBack, onNext }: ChordsStepProps) => {
  const chords = useMemo(() => diatonicChords(root, scale), [root, scale]);
  const progressions = useMemo(() => suggestedProgressions(root, scale), [root, scale]);

  return (
    <Card className="studio-card p-6 animate-fade-in-up space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
          <Music className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold">Verify chord progression</h2>
          <p className="text-sm text-muted-foreground">
            These are the diatonic chords for <span className="text-primary font-semibold">{display}</span>.
            Play them in Piano Roll before alignment to make sure the key feels right.
          </p>
        </div>
      </div>

      {/* Diatonic chord table */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Diatonic chords (Roman numerals)
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {chords.map((c) => (
            <div
              key={c.numeral}
              className="rounded-md border border-border bg-card/50 p-3 hover:border-primary/40 transition"
            >
              <div className="flex items-baseline justify-between gap-1 mb-1">
                <span className="font-display text-lg font-bold text-gold">{c.numeral}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.function}</span>
              </div>
              <div className="text-base font-semibold text-primary">{c.symbol}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">{c.notes.join(" · ")}</div>
              <div className="text-[10px] text-muted-foreground mt-1">7th: <span className="text-foreground/80">{c.seventh}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested progressions */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Try these progressions in Piano Roll
        </div>
        <div className="space-y-2">
          {progressions.map((p) => (
            <div
              key={p.name}
              className="rounded-md border border-border bg-card/50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {p.numerals.join(" – ")}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.chords.map((ch, i) => (
                  <Badge key={`${ch}-${i}`} className="bg-primary/15 text-primary border-primary/30">
                    {ch}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FL Studio playback hint */}
      <div className="rounded-lg border border-primary/20 bg-gradient-gold-soft p-4 text-xs text-foreground/90 leading-relaxed">
        <div className="font-semibold text-sm text-primary mb-1">Play these in FL Studio</div>
        Open Piano Roll → keyboard ▾ → <span className="text-foreground font-medium">Helpers → Scale highlighting</span> → set to{" "}
        <span className="text-foreground font-medium">{root} {scale}</span>. Drop one chord per bar from the table above and loop the
        progression. If the chords feel right against your beat, your detected key is correct — proceed to alignment.
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onNext} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          Chords Sound Right — Align 808s <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
};

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
  const tag = scale === "Minor" ? ["i", "iv", "v"] : ["I", "IV", "V"];
  return `${tag[0]}=${n[0]}, ${tag[1]}=${n[3]}, ${tag[2]}=${n[4]}`;
}

interface AlignStepProps {
  stepKey: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  steps: string[];
  settings: [string, string][];
  doneItems: Record<string, boolean>;
  toggleItem: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  footerExtra?: React.ReactNode;
}

const AlignStep = ({
  stepKey, icon, title, subtitle, steps, settings,
  doneItems, toggleItem, onBack, onNext, nextLabel = "Next", footerExtra,
}: AlignStepProps) => {
  const total = steps.length;
  const completed = steps.filter((_, i) => doneItems[`${stepKey}-${i}`]).length;
  return (
    <Card className="studio-card p-6 animate-fade-in-up space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Progress</div>
          <div className="text-sm font-semibold text-primary tabular-nums">{completed} / {total}</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Action checklist (saved automatically)
        </div>
        <ul className="space-y-1.5">
          {steps.map((s, i) => {
            const id = `${stepKey}-${i}`;
            const done = !!doneItems[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggleItem(id)}
                  className={cn(
                    "w-full text-left flex items-start gap-3 p-3 rounded-md border transition-all",
                    done
                      ? "border-primary/30 bg-gradient-gold-soft"
                      : "border-border bg-card/40 hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "w-5 h-5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition",
                      done ? "bg-primary border-primary" : "border-primary/40",
                    )}
                  >
                    {done && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                  </span>
                  <span className={cn("text-sm leading-relaxed flex-1", done && "line-through text-muted-foreground")}>
                    {s}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

      <div className="flex items-center justify-between pt-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          {footerExtra}
        </div>
        <Button onClick={onNext} className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          {nextLabel} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
};
