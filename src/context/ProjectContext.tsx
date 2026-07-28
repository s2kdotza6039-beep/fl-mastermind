// Active-project state, last-opened restoration, safe session switching.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  listProjects,
  getProject,
  getMostRecentProject,
  createProject,
  updateProject as updateProjectDb,
  deleteProject as deleteProjectDb,
  touchLastOpened,
  type Project,
} from "@/lib/project-memory";
import { EVT_TRACK_ACTIVATED, requestTrackActivation } from "@/lib/project-track-events";
import { toast } from "sonner";

const ACTIVE_KEY = "studio-sensei-active-project-id";

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  refresh: () => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  create: (patch: { name: string; description?: string; genre?: string }) => Promise<Project | null>;
  update: (id: string, patch: Partial<Project>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const loc = useLocation();
  const lastTouchedPage = useRef<string>("");
  const lastRestoreKey = useRef<string>("");

  // Ask the track layer to restore a project's last-opened track (deduped —
  // refresh() runs on every auth-identity change, and we only want one
  // restore request per project+report combination).
  const restoreProjectTrack = (p: Project | null) => {
    const reportId = p?.last_opened_audio_report_id;
    if (!p || !reportId) return;
    const key = `${p.id}:${reportId}`;
    if (lastRestoreKey.current === key) return;
    lastRestoreKey.current = key;
    requestTrackActivation(reportId);
  };

  // The track layer announces which report became active — persist it on the
  // active project so future sign-ins restore THIS project's track rather
  // than whichever track was used last globally.
  useEffect(() => {
    if (!activeProject) return;
    const handler = (e: Event) => {
      const reportId = (e as CustomEvent<{ reportId?: string }>).detail?.reportId;
      if (!reportId || reportId === activeProject.last_opened_audio_report_id) return;
      touchLastOpened(activeProject.id, { audioReportId: reportId }).catch(() => {});
    };
    window.addEventListener(EVT_TRACK_ACTIVATED, handler);
    return () => window.removeEventListener(EVT_TRACK_ACTIVATED, handler);
  }, [activeProject]);

  const refresh = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    setLoading(true);
    try {
      const list = await listProjects(user.id);
      setProjects(list);

      // Restore stored active project, else fall back to most-recent.
      const storedId = localStorage.getItem(ACTIVE_KEY);
      let active: Project | null = null;
      if (storedId) {
        active = list.find((p) => p.id === storedId) ?? null;
        if (!active) {
          // Stored project deleted — recover gracefully.
          localStorage.removeItem(ACTIVE_KEY);
        }
      }
      if (!active) {
        active = await getMostRecentProject(user.id);
      }
      if (!active && list.length > 0) {
        active = list[0];
      }
      // If still no projects exist (legacy edge case), auto-create one.
      if (!active && user) {
        try {
          active = await createProject(user.id, {
            name: "My First Project",
            description: "Sensei will remember this session for you.",
          });
          setProjects([active]);
        } catch {/* ignore */}
      }
      setActiveProject(active);
      if (active) localStorage.setItem(ACTIVE_KEY, active.id);
      // Per-project track memory: ask the track layer to restore the track
      // this project was last working on (no-op if none was recorded).
      restoreProjectTrack(active);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Persist last-opened page whenever the route changes for the active project.
  useEffect(() => {
    if (!activeProject) return;
    if (lastTouchedPage.current === loc.pathname) return;
    lastTouchedPage.current = loc.pathname;
    touchLastOpened(activeProject.id, { page: loc.pathname }).catch(() => {});
  }, [loc.pathname, activeProject]);

  const switchProject = useCallback(async (id: string) => {
    // Safe switch: validate the target exists before clearing state.
    const next = await getProject(id);
    if (!next) {
      toast.error("That project is no longer available.");
      await refresh();
      return;
    }
    setActiveProject(next);
    localStorage.setItem(ACTIVE_KEY, next.id);
    await touchLastOpened(next.id, { page: loc.pathname });
    // Restore THIS project's track (each project remembers its own).
    restoreProjectTrack(next);
  }, [loc.pathname, refresh]);

  const create: ProjectContextValue["create"] = async (patch) => {
    if (!user) return null;
    try {
      const proj = await createProject(user.id, patch);
      await refresh();
      await switchProject(proj.id);
      return proj;
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create project");
      return null;
    }
  };

  const update: ProjectContextValue["update"] = async (id, patch) => {
    await updateProjectDb(id, patch);
    await refresh();
  };

  const remove: ProjectContextValue["remove"] = async (id) => {
    await deleteProjectDb(id);
    if (activeProject?.id === id) {
      localStorage.removeItem(ACTIVE_KEY);
      setActiveProject(null);
    }
    await refresh();
  };

  return (
    <ProjectContext.Provider
      value={{ projects, activeProject, loading, refresh, switchProject, create, update, remove }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
};
