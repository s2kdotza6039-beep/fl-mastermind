import { useMemo } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadResume,
  splitSentences,
  stripForSpeech,
  useSpeech,
} from "@/lib/speech";

const RATES = [1, 1.25, 1.5];

interface SpeechButtonProps {
  id: string;
  text: string;
}

export const SpeechButton = ({ id, text }: SpeechButtonProps) => {
  const {
    supported,
    state,
    speakingFor,
    progress,
    rate,
    setRate,
    voices,
    voiceURI,
    setVoiceURI,
    speak,
    pause,
    resume,
    stop,
  } = useSpeech();
  const isMine = speakingFor === id;

  // Validate any saved resume point against the CURRENT content — if the
  // message text changed, the old position is meaningless.
  const resumePos = useMemo(() => {
    if (isMine) return null;
    const pos = loadResume(id);
    if (!pos) return null;
    const total = splitSentences(stripForSpeech(text)).length;
    return pos.total === total ? pos : null;
  }, [id, text, isMine, state]);

  const rateButton = (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 px-1.5 text-[10px] text-muted-foreground hover:text-primary"
      title="Playback speed"
      onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
    >
      {rate}x
    </Button>
  );

  const voiceSelect = (
    <select
      className="h-7 max-w-[7.5rem] rounded-md border border-border bg-transparent px-1 text-[10px] text-muted-foreground hover:text-primary"
      title="Voice/accent (pronunciation only — the LANGUAGE selector sits next to the chat box)"
      aria-label="Voice"
      value={voiceURI ?? ""}
      onChange={(e) => setVoiceURI(e.target.value || null)}
    >
      <option value="">Auto voice</option>
      {voices.map((v) => (
        <option key={v.voiceURI} value={v.voiceURI}>
          {v.name}
        </option>
      ))}
    </select>
  );

  if (!isMine || state === "idle") {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          disabled={!supported}
          title="Listen to this answer"
          aria-label="Listen to this answer"
          className="h-7 w-7 text-primary hover:bg-primary/10"
          onClick={() => speak(id, text)}
        >
          <Volume2 className="w-3.5 h-3.5" />
        </Button>
        {resumePos && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            from {resumePos.sentence + 1}/{resumePos.total}
          </span>
        )}
        {rateButton}
        {voiceSelect}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {state === "playing" ? (
        <Button
          size="icon"
          variant="ghost"
          title="Pause"
          aria-label="Pause"
          className="h-7 w-7 text-primary hover:bg-primary/10"
          onClick={pause}
        >
          <Pause className="w-3.5 h-3.5" />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          title="Resume"
          aria-label="Resume"
          className="h-7 w-7 text-primary hover:bg-primary/10"
          onClick={resume}
        >
          <Play className="w-3.5 h-3.5" />
        </Button>
      )}
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {progress.current}/{progress.total}
      </span>
      <Button
        size="icon"
        variant="ghost"
        title="Stop"
        aria-label="Stop"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={stop}
      >
        <Square className="w-3.5 h-3.5" />
      </Button>
      {rateButton}
      {voiceSelect}
    </div>
  );
};
