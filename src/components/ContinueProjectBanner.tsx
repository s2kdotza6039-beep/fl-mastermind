import { Link } from "react-router-dom";
import { ArrowRight, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProject } from "@/context/ProjectContext";

/** "Welcome back — continue {project}" banner shown on the dashboard. */
export const ContinueProjectBanner = () => {
  const { activeProject } = useProject();
  if (!activeProject) return null;

  const lastPage = activeProject.last_opened_page && activeProject.last_opened_page !== "/"
    ? activeProject.last_opened_page
    : "/projects/" + activeProject.id;

  const lastActivity = new Date(activeProject.last_activity_at);
  const daysAgo = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  const when =
    daysAgo === 0 ? "today" :
    daysAgo === 1 ? "yesterday" :
    daysAgo < 30 ? `${daysAgo} days ago` :
    lastActivity.toLocaleDateString();

  return (
    <Card className="studio-card-gold p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0">
          <FolderOpen className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Welcome back</div>
          <h3 className="font-display text-lg font-bold text-gold truncate">{activeProject.name}</h3>
          <p className="text-xs text-muted-foreground">
            Last worked on {when}
            {activeProject.genre ? ` · ${activeProject.genre}` : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button asChild variant="outline" size="sm">
          <Link to={`/projects/${activeProject.id}`}>View project</Link>
        </Button>
        <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground hover:opacity-90">
          <Link to={lastPage}>
            Continue <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Link>
        </Button>
      </div>
    </Card>
  );
};
