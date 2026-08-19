import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, Loader2, Sparkles, HelpCircle, X } from "lucide-react";
import { decodeAudioToChannels, detectFormat, runAnalysisOnDecoded } from "@/lib/audio-analysis";
import { buildUploadAdvisePrompt, persistAnalyzedUpload } from "@/lib/coaching-runner";
import { stashChatPrompt } from "@/lib/knowledge-handoff";
import { patcherAdvantage } from "@/lib/fl-plugin-eligibility";
import { useAuth } from "@/context/AuthContext";
import { useProject } from "@/context/ProjectContext";
import { useTrackSession } from "@/context/TrackSessionContext";

const SCOPE = "PRODUCTION:BEAT";

const PATCHER_HINT = [
  "PLUGIN RULE: consider Patcher chains, not just single stock plugins.",
  `If a Patcher chain beats the stock plugin, say so and explain WHY. Reference: ${patcherAdvantage("effect")}`,
  "Give the exact plugin order, the key knob values, and one A/B test I can run in FL Studio.",
].join("\n");

export const UploadAndAskCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProject } = useProject();
  const { setActiveReport, refreshRecent } = useTrackSession();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  const goTextOnly = (q: string) => {
    stashChatPrompt(
      [
        q.trim(),
        activeProject?.name ? `Project: ${activeProject.name}.` : "",
        activeProject?.genre ? `Genre: ${activeProject.genre}.` : "",
        "",
        PATCHER_HINT,
      ]
        .filter(Boolean)
        .join("\n"),
      SCOPE,
    );
    navigate(`/chat?scope=${SCOPE}`);
  };

  const submit = async () => {
    const q = question.trim();
    if (!file) {
      if (!q) return;
      goTextOnly(q);
      return;
    }
    if (!user) {
      toast.error("Sign in first so Sensei can file this under your name.");
      return;
    }
    setBusy(true);
    try {
      toast.info(`Sensei is listening to "${file.name}"…`);
      const decoded = await decodeAudioToChannels(file);
      const res = await runAnalysisOnDecoded(decoded, {
        name: file.name,
        format: detectFormat(file),
        sizeBytes: file.size,
      });
      const outcome = await persistAnalyzedUpload({
        userId: user.id,
        activeProject: activeProject ? { id: activeProject.id, genre: activeProject.genre } : null,
        res,
        setActiveReport,
      });
      await refreshRecent();
      if (!outcome.reportId) {
        toast.error(outcome.error ?? "Could not save the analysis.");
        return;
      }
      if (outcome.kind === "foreign") {
        toast.warning(
          outcome.reasons.length
            ? `Sensei paused — this doesn't sound like the same beat (${outcome.reasons.join(" · ")}).`
            : "Sensei paused — this doesn't sound like the same beat.",
        );
        return;
      }
      stashChatPrompt(
        [
          buildUploadAdvisePrompt(file.name, res, outcome.story),
          "",
          q ? `MY QUESTION: ${q}` : "MY QUESTION: what should I do next on this track, and which effect chain gets me there?",
          "",
          PATCHER_HINT,
        ].join("\n"),
        SCOPE,
      );
      navigate(`/chat?scope=${SCOPE}`);
    } catch (err: any) {
      console.warn("Upload & Ask failed:", err?.message ?? err);
      toast.error(err?.message ?? "Could not analyze that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="upload-ask-card" className="studio-card mb-6 space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-bold">Upload Your Track &amp; Ask Sensei Anything</h3>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
          For the track Sensei is coaching on
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Effects, sound design, or plain FL Studio how-to — load the bounce Sensei should hear, ask your
        question, and he answers against your own audio (and tells you when a Patcher chain beats the
        stock plugin).
        {activeProject?.name ? <> Active project: <strong>{activeProject.name}</strong>.</> : null}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <UploadCloud className="mr-1 h-4 w-4" /> Choose audio
        </Button>
        {file && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Loaded: <strong className="text-foreground">{file.name}</strong>
            <button
              type="button"
              aria-label="Clear selected file"
              className="text-muted-foreground hover:text-primary"
              onClick={() => setFile(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            setFile(f);
          }}
        />
      </div>

      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        aria-label="Your question for Sensei"
        placeholder="How do I make my lead wider with Patcher? My 808 is muddy — what Patcher chain beats Maximus?"
        className="resize-none bg-input text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-gradient-gold text-primary-foreground hover:opacity-90"
          disabled={busy || (!file && !question.trim())}
          onClick={submit}
        >
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-1 h-4 w-4" />}
          Upload Track + Ask Sensei
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => goTextOnly("Give me creative effect ideas for the track I'm working on — exact FL Studio chains, stock or Patcher, and when each one fits.")}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Effect ideas
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => goTextOnly("FL Studio Q&A: answer my questions about how FL Studio works — exact menus, shortcuts and click paths.")}
        >
          <HelpCircle className="mr-1 h-3.5 w-3.5" /> FL Studio Q&amp;A
        </Button>
      </div>
    </Card>
  );
};
