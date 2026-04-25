import { useSession, type Genre, type Stage } from "@/context/SessionContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

const GENRES: Genre[] = ["Hip-hop", "Trap", "Kwaito", "Amapiano", "Afrobeat", "R&B", "Drill", "House", "Gospel", "Pop"];
const STAGES: Stage[] = ["Beat Creation", "Recording", "Mixing", "Mastering", "Final Polish"];

export const SessionHeader = () => {
  const { projectName, setProjectName, genre, setGenre, stage, setStage, progress } = useSession();

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value.slice(0, 60))}
        className="h-8 max-w-[200px] bg-transparent border-transparent hover:border-border focus-visible:border-primary text-sm font-medium"
      />
      <Select value={genre} onValueChange={(v) => setGenre(v as Genre)}>
        <SelectTrigger className="h-8 w-[130px] bg-secondary border-border text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
        <SelectTrigger className="h-8 w-[150px] bg-secondary border-border text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="hidden md:flex items-center gap-2 ml-auto">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Session</span>
        <Progress value={progress} className="w-32 h-1.5" />
        <span className="text-xs font-mono text-primary tabular-nums">{progress}%</span>
      </div>
    </div>
  );
};
