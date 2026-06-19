import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wrench, MessageCircle, Disc3, Music2, Sliders, Volume2, Crown, Layers, ListChecks, UploadCloud,
  Mic, Speaker, Sparkles, TrendingUp, Trash2, KeyRound, AudioLines,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StudioSetupCard } from "@/components/StudioSetupCard";
import { SetupChecklistCard } from "@/components/SetupChecklistCard";
import { PluginInventoryCard } from "@/components/PluginInventoryCard";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";
import { CoachThisTrackButton } from "@/components/CoachThisTrackButton";
import { supabase } from "@/integrations/supabase/client";

const FEATURES = [
  { to: "/chat", icon: MessageCircle, title: "Sensei Chat", desc: "Ask anything about your sound." },
  { to: "/quick", icon: Wrench, title: "Quick Fixes", desc: "One-tap engineer solutions." },
  { to: "/problems", icon: Disc3, title: "Mix Problems", desc: "Identify & solve common issues." },
  { to: "/genre", icon: Music2, title: "Genre Mode", desc: "Tailored advice per genre." },
  { to: "/production", icon: Sliders, title: "Production Coach", desc: "Beats, arrangement, groove." },
  { to: "/mixing", icon: Volume2, title: "Mixing Coach", desc: "EQ, compression, balance." },
  { to: "/mastering", icon: Crown, title: "Mastering Coach", desc: "Loudness, polish, export." },
  { to: "/key", icon: KeyRound, title: "Key Detection", desc: "Lock root + align everything." },
  { to: "/chains", icon: Layers, title: "Plugin Chains", desc: "FL Studio chain templates." },
  { to: "/checklist", icon: ListChecks, title: "Session Checklist", desc: "Track every stage." },
  { to: "/upload", icon: UploadCloud, title: "Upload Audio", desc: "Reference your file." },
];

interface RecentAudio {
  id: string;
  file_name: string;
  detected_key: string | null;
  bpm: number | null;
  lufs_estimate: number | null;
  peak_db: number | null;
  detected_issues: any;
  created_at: string;
}

export default function Dashboard() {
  const { projectName, genre, stage, progress, savedAdvice, checklist, removeAdvice } = useSession();
  const { user } = useAuth();
  const [recentAudio, setRecentAudio] = useState<RecentAudio[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("audio_analysis_reports")
      .select("id, file_name, detected_key, bpm, lufs_estimate, peak_db, detected_issues, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentAudio((data as RecentAudio[]) ?? []));
  }, [user]);

  const stats = [
    { label: "Genre", value: genre, icon: Music2 },
    { label: "Stage", value: stage, icon: Sliders },
    { label: "Tasks Done", value: `${checklist.filter(c => c.done).length}/${checklist.length}`, icon: ListChecks },
    { label: "Saved Tips", value: savedAdvice.length, icon: Sparkles },
  ];

  return (
    <div className="container max-w-7xl py-10 px-4 md:px-8">
      <PageHeader
        eyebrow="Studio Sensei"
        title={`Welcome back to ${projectName}`}
        description="Your Path to Professional Sound. From Idea to International Standard. No Guesswork. Just Hits."
        icon={<Crown className="w-6 h-6" />}
        action={
          <Button asChild size="lg" className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold">
            <Link to="/chat"><MessageCircle className="w-4 h-4 mr-2" /> Open Sensei Chat</Link>
          </Button>
        }
      />

      <StudioSetupCard />
      <SetupChecklistCard />
      <PluginInventoryCard />
      <ActiveTrackChip />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="studio-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</span>
              <s.icon className="w-4 h-4 text-primary/70" />
            </div>
            <div className="text-xl font-bold text-foreground truncate">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <Card className="studio-card-gold p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Session Progress
            </h3>
            <p className="text-sm text-muted-foreground">From idea to international standard</p>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl font-bold text-gold tabular-nums">{progress}%</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Complete</div>
          </div>
        </div>
        <Progress value={progress} className="h-2 bg-secondary" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {checklist.slice(0, 8).map((c) => (
            <div key={c.id} className={`text-xs flex items-center gap-2 ${c.done ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${c.done ? "bg-primary" : "bg-muted-foreground/30"}`} />
              <span className="truncate">{c.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick access grid */}
      <div className="mb-8">
        <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Studio Tools
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to}>
              <Card className="studio-card p-4 h-full hover:border-primary/40 hover:-translate-y-0.5 transition-all group cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-center justify-center mb-3 group-hover:bg-gradient-gold group-hover:border-transparent transition-all">
                  <f.icon className="w-5 h-5 text-primary group-hover:text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-snug">{f.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent audio analyses */}
      <div className="mb-8">
        <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
          <AudioLines className="w-5 h-5 text-primary" /> Recent Audio Analyses
        </h2>
        {recentAudio.length === 0 ? (
          <Card className="studio-card p-8 text-center">
            <AudioLines className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No analyses yet. Upload a track and Sensei will diagnose it.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/upload"><UploadCloud className="w-4 h-4 mr-2" /> Upload audio</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {recentAudio.map((a) => {
              const issueCount = Array.isArray(a.detected_issues) ? a.detected_issues.length : 0;
              return (
                <Card key={a.id} className="studio-card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-sm line-clamp-1 flex-1">{a.file_name}</h4>
                    <Badge variant={issueCount > 0 ? "destructive" : "secondary"} className="text-[10px]">
                      {issueCount} issue{issueCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div><span className="text-foreground/70">Key</span> · {a.detected_key ?? "—"}</div>
                    <div><span className="text-foreground/70">BPM</span> · {a.bpm ?? "—"}</div>
                    <div><span className="text-foreground/70">LUFS</span> · {a.lufs_estimate ?? "—"}</div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-2">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                  <CoachThisTrackButton reportId={a.id} fileName={a.file_name} />
                </Card>
              );
            })}
          </div>
        )}
      </div>


      {/* Saved advice */}
      <div>
        <h2 className="font-display text-xl font-bold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Saved Advice
        </h2>
        {savedAdvice.length === 0 ? (
          <Card className="studio-card p-8 text-center">
            <Mic className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No saved tips yet. Chat with Sensei and save the gems.</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {savedAdvice.map((a) => (
              <Card key={a.id} className="studio-card p-4 group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-sm text-primary line-clamp-1 flex-1">{a.title}</h4>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removeAdvice(a.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{a.content.replace(/[#*]/g, "")}</p>
                <div className="text-[10px] text-muted-foreground/60 mt-2">{new Date(a.timestamp).toLocaleString()}</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="mt-12 text-center text-xs text-muted-foreground/60 border-t border-border pt-6">
        <Speaker className="w-4 h-4 inline mr-1" /> Built for FL Studio producers chasing international sound.
      </div>
    </div>
  );
}
