import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Trash2, MessageCircle, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { stashChatPrompt } from "@/lib/knowledge-handoff";

export const LyricPadCard = ({ projectId, projectName, genre }: { projectId?: string | null; projectName?: string | null; genre?: string | null }) => {
  const navigate = useNavigate();
  const key = `sensei.lyrics.${projectId ?? "global"}`;
  const [lyrics, setLyrics] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { setLyrics(localStorage.getItem(key) ?? ""); } catch { setLyrics(""); }
  }, [key]);

  const save = () => {
    try {
      localStorage.setItem(key, lyrics);
      setSaved(true);
      toast.success("Lyrics saved — Sensei can see them when you ask.");
      setTimeout(() => setSaved(false), 2000);
    } catch { toast.error("Couldn't save — storage full."); }
  };

  const clear = () => {
    setLyrics("");
    try { localStorage.removeItem(key); } catch {}
    toast.success("Lyric pad cleared.");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(lyrics); toast.success("Lyrics copied"); } catch { toast.error("Copy failed — select manually."); }
  };

  const askSensei = (mode: "punch" | "flow" | "rhyme") => {
    const prompts: Record<string, string> = {
      punch: `Polish these lyrics for punch and memorability — keep the same story but tighten every line. Suggest 3 alternate punchlines for the hook.`,
      flow: `Coach the flow & syllable count for these lyrics to sit on this ${genre ?? "genre"} beat — mark where to breathe, where to double, where to leave space.`,
      rhyme: `Improve rhyme & cadence without sounding forced — keep it natural, add internal rhymes where they lift the energy.`,
    };
    stashChatPrompt(
      [
        projectName ? `Project: ${projectName}.` : "",
        genre ? `Genre: ${genre}.` : "",
        "LYRICS:",
        lyrics || "(lyric pad is empty — help me write from scratch for this beat)",
        "",
        prompts[mode],
        "Keep language simple, singable, and genre-true. Return the revised lyrics plus 1 FL Studio tip for recording them.",
      ].filter(Boolean).join("\n"),
      "PRODUCTION:VOCALS"
    );
    navigate("/chat?scope=PRODUCTION%3AVOCALS");
  };

  const words = lyrics.trim() ? lyrics.trim().split(/\s+/).length : 0;
  const lines = lyrics ? lyrics.split("\n").length : 0;

  return (
    <Card className="studio-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> 📝 Lyric Pad</h3>
        <span className="text-[11px] text-muted-foreground">{words} words · {lines} lines</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Write or paste your lyrics. Saved locally per project — Sensei reads them when you ask.</p>
      <Textarea
        value={lyrics}
        onChange={e => setLyrics(e.target.value)}
        placeholder={"Verse 1:\n... \nHook:\n... \nVerse 2:\n..."}
        rows={8}
        className="mt-3 font-mono text-xs"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={save} className="h-8 text-xs">{saved ? "✓ Saved" : "Save lyrics"}</Button>
        <Button size="sm" variant="outline" onClick={copy} className="h-8 text-xs"><Copy className="w-3 h-3 mr-1" /> Copy</Button>
        <Button size="sm" variant="ghost" onClick={clear} className="h-8 text-xs"><Trash2 className="w-3 h-3 mr-1" /> Clear</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => askSensei("punch")} className="h-7 text-[11px]"><MessageCircle className="w-3 h-3 mr-1" /> Make it punchier</Button>
        <Button size="sm" variant="outline" onClick={() => askSensei("flow")} className="h-7 text-[11px]">Fix my flow</Button>
        <Button size="sm" variant="outline" onClick={() => askSensei("rhyme")} className="h-7 text-[11px]">Tighten rhymes</Button>
      </div>
    </Card>
  );
};
