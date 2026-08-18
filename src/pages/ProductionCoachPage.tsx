import { useNavigate } from "react-router-dom";
import { Sliders, ArrowLeft, ArrowRight, Plus, RefreshCw, Upload, Flag, Lightbulb, Mic2, Music, Layers, Sparkles } from "lucide-react";
import { phaseTip } from "@/lib/phase-guidance";
import { CoachPage } from "@/components/CoachPage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProject } from "@/context/ProjectContext";
import { useTrackSession } from "@/context/TrackSessionContext";
import { useProductionPhase } from "@/hooks/use-production-phase";
import { stashChatPrompt } from "@/lib/knowledge-handoff";
import { makeScope } from "@/lib/chat-scope";
import { ProductionTools } from "@/components/ProductionTools";


import { supabase } from "@/integrations/supabase/client";
import {
  buildAddElementPrompt,
  buildRebouncePrompt,
  buildArrangePrompt,
  buildBeatPhasePrompt,
  buildBodyPhasePrompt,
  buildVocalsPrompt,
  buildVocalRecordPrompt,
  buildVocalTunePrompt,
  buildVocalStackPrompt,
  buildVocalCleanPrompt,
  detectSketch,
  PRODUCTION_PHASES,
  SKETCH_LABEL,
} from "@/lib/production-phase";
import type { ProductionPhase } from "@/lib/production-phase";

const PhaseDesk = () => {
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { active } = useTrackSession();
  const { phase, setPhase, saving } = useProductionPhase();

  const meta = PRODUCTION_PHASES.find((p) => p.id === phase) ?? PRODUCTION_PHASES[0];
  const guess = detectSketch({
    tonalFlatness: (active as any)?.tonal_flatness ?? null,
    stereoWidth: active?.stereo_width ?? null,
  });
  const ctx = {
    projectName: activeProject?.name ?? null,
    genre: activeProject?.genre ?? null,
    fileName: (active as any)?.file_name ?? null,
    guess,
  };

  const ask = (prompt: string) => {
    // R14.2 — production coaching opens the Production chat for this phase.
    const scope = makeScope("PRODUCTION", phase);
    stashChatPrompt(prompt, scope);
    navigate(`/chat?scope=${encodeURIComponent(scope)}`);
  };


  const rebounce = async () => {
    let scoreAfter: number | null = null;
    let scoreBefore: number | null = null;
    let resolvedThisRound: string[] = [];
    let stillOpen: string[] = [];

    if (activeProject?.id) {
      const [scoresRes, issuesRes] = await Promise.all([
        supabase
          .from("project_scores")
          .select("mix_score, created_at")
          .eq("project_id", activeProject.id)
          .order("created_at", { ascending: false })
          .limit(2),
        supabase
          .from("project_issues")
          .select("title, status")
          .eq("project_id", activeProject.id)
          .limit(50),
      ]);
      const scores = scoresRes.data ?? [];
      scoreAfter = scores[0]?.mix_score ?? null;
      scoreBefore = scores[1]?.mix_score ?? null;
      const issues = issuesRes.data ?? [];
      resolvedThisRound = issues.filter((i) => i.status === "resolved").map((i) => i.title);
      stillOpen = issues.filter((i) => i.status !== "resolved").map((i) => i.title);
    }

    ask(
      buildRebouncePrompt({
        ...ctx,
        phase,
        scoreBefore,
        scoreAfter,
        resolvedThisRound,
        stillOpen,
      }),
    );
  };

  return (
    <Card className="studio-card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-gradient-gold text-primary-foreground">{meta.label}</Badge>
            {meta.id === "VOCALS" && <Badge variant="outline" className="border-amber-400/50 text-amber-700 text-[10px]">OPTIONAL</Badge>}
            <span className="text-xs text-muted-foreground">Production phase</span>
          </div>
          <p className="text-sm text-muted-foreground">{meta.blurb}</p>
        </div>
        <span className="text-[11px] text-muted-foreground max-w-[220px] text-right">
          {active ? SKETCH_LABEL[guess] : "No bounce loaded yet."}
        </span>
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">{phaseTip(phase as ProductionPhase, activeProject?.genre)}</p>
      </div>


      <div className="flex flex-wrap gap-2">
        {phase === "BEAT" && (
          <>
            {active ? (
              <Button size="sm" onClick={() => ask(buildBeatPhasePrompt(ctx))}>
                Coach me on this beat
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate("/upload")}>
                <Upload className="w-4 h-4 mr-1" /> Load a beat bounce
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { void rebounce(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> I re-bounced — review it
            </Button>
            <Button size="sm" variant="outline" onClick={() => ask(buildAddElementPrompt(ctx))}>
              <Plus className="w-4 h-4 mr-1" /> Add element / improve beat
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => setPhase("BODY")}>
              Continue to Body <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </>
        )}

        {phase === "BODY" && (
          <>
            <Button size="sm" onClick={() => ask(buildBodyPhasePrompt(ctx))}>
              Coach the body (chords/melody)
            </Button>
            <Button size="sm" variant="outline" onClick={() => { void rebounce(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> I re-bounced — review it
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPhase("BEAT")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Beat
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => setPhase("ARRANGE")}>
              Continue to Arrange <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </>
        )}

        {phase === "ARRANGE" && (
          <>
            <Button size="sm" onClick={() => ask(buildArrangePrompt(ctx))}>
              Arrange the song
            </Button>
            <Button size="sm" variant="outline" onClick={() => { void rebounce(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> I re-bounced — review it
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPhase("BODY")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Body
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => setPhase("VOCALS")}>
              <Mic2 className="w-4 h-4 mr-1" /> Vocals (Optional)
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => setPhase("DONE")}>
              <Flag className="w-4 h-4 mr-1" /> Finish → open Mixing
            </Button>
          </>
        )}

        {phase === "VOCALS" && (
          <>
            <Button size="sm" onClick={() => ask(buildVocalsPrompt(ctx))}>
              <Mic2 className="w-4 h-4 mr-1" /> Coach my vocals
            </Button>
            <Button size="sm" variant="outline" onClick={() => ask(buildVocalRecordPrompt(ctx))}>
              <Music className="w-4 h-4 mr-1" /> Record takes
            </Button>
            <Button size="sm" variant="outline" onClick={() => ask(buildVocalTunePrompt(ctx))}>
              <Sparkles className="w-4 h-4 mr-1" /> Tune & timing
            </Button>
            <Button size="sm" variant="outline" onClick={() => ask(buildVocalStackPrompt(ctx))}>
              <Layers className="w-4 h-4 mr-1" /> Stack doubles/harmonies
            </Button>
            <Button size="sm" variant="outline" onClick={() => ask(buildVocalCleanPrompt(ctx))}>
              Clean & prep for mix
            </Button>
            <Button size="sm" variant="outline" onClick={() => { void rebounce(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> I re-bounced vocal — review it
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPhase("ARRANGE")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Arrange
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => setPhase("DONE")}>
              <Flag className="w-4 h-4 mr-1" /> Vocals done → Mixing
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPhase("DONE")} className="text-muted-foreground">
              Skip vocals (instrumental)
            </Button>
          </>
        )}

        {phase === "DONE" && (
          <>
            <Button size="sm" onClick={() => navigate("/mixing")}>
              Start Mixing <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setPhase("ARRANGE")}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Arrange
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => setPhase("VOCALS")}>
              <Mic2 className="w-4 h-4 mr-1" /> Back to Vocals
            </Button>
          </>
        )}
      </div>
      {phase === "VOCALS" && (
        <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          🎙️ Vocals is optional. Instrumental? Hit “Skip vocals”. Got vocals? Work the 5 coaching options above, then hit “Vocals done → Mixing”.
        </p>
      )}
      {phase === "ARRANGE" && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Got vocals? Click <span className="font-semibold text-amber-700">Vocals (Optional)</span> to lay, tune and stack them. No vocals? Click Finish.
        </p>
      )}
    </Card>
  );
};

export default function ProductionCoachPage() {
  return (
    <CoachPage
      eyebrow="Build the Beat"
      title="Production Coach"
      description="From blank canvas to a beat that hits — and voices that cut."
      icon={Sliders}
      above={<><PhaseDesk /><ProductionTools /></>}
      topics={[
        { label: "Instrument selection", prompt: "Coach me on choosing instruments for my beat. Help me pick sounds that work together for my genre." },
        { label: "Drum selection & layering", prompt: "Walk me through selecting and layering drums in FL Studio for a punchy, professional sound." },
        { label: "Arrangement & song structure", prompt: "Help me arrange my song. Explain intro, verse, chorus, bridge, breakdown — what works in modern music." },
        { label: "Spacing & frequency planning", prompt: "Teach me how to plan frequency space so every element has room to breathe in the mix." },
        { label: "Groove & swing", prompt: "How do I add groove and swing to my beat in FL Studio so it doesn't feel robotic?" },
        { label: "Key detection & melody alignment", prompt: "Walk me through detecting the key of my beat using FL Studio (Edison, Piano Roll, Tuner) and aligning 808s, melodies, and vocals." },
        { label: "Vocal recording & comping", prompt: "Coach me on recording clean lead vocal takes in FL Studio — mic technique, Edison, takes and comping." },
        { label: "Vocal tuning & timing", prompt: "How do I tune and time-correct vocals gently with NewTone, NewTime and Pitcher without sounding robotic?" },
      ]}
    />
  );
}
