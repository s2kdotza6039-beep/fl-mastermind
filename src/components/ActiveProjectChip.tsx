import { FolderOpen, ChevronDown, Plus, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProject } from "@/context/ProjectContext";
import { Link, useNavigate } from "react-router-dom";

export const ActiveProjectChip = () => {
  const { projects, activeProject, switchProject, create } = useProject();
  const navigate = useNavigate();
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [busy, setBusy] = useState(false);

  if (!activeProject) {
    return (
      <Button asChild variant="outline" size="sm" className="h-8 text-xs">
        <Link to="/projects"><FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Projects</Link>
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs max-w-[200px]">
            <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-primary flex-shrink-0" />
            <span className="truncate">{activeProject.name}</span>
            <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Switch project
          </DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => switchProject(p.id)} className="flex justify-between gap-2">
              <span className="truncate">{p.name}</span>
              {p.id === activeProject.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpenNew(true)}>
            <Plus className="w-3.5 h-3.5 mr-2" /> New project
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/projects"><FolderOpen className="w-3.5 h-3.5 mr-2" /> Manage projects</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Sensei will remember this song between sessions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Project name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Untitled Song" />
            </div>
            <div>
              <Label>Genre (optional)</Label>
              <Input value={genre} onChange={(e) => setGenre(e.target.value.slice(0, 40))} placeholder="Amapiano" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button
              disabled={!name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                const p = await create({ name: name.trim(), genre: genre.trim() || undefined });
                setBusy(false);
                if (p) {
                  setName(""); setGenre(""); setOpenNew(false);
                  navigate("/upload");
                }
              }}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
