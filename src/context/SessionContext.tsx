import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Genre =
  | "Hip-hop" | "Trap" | "Kwaito" | "Amapiano" | "Afrobeat"
  | "R&B" | "Drill" | "House" | "Gospel" | "Pop";

export type Stage =
  | "Beat Creation" | "Recording" | "Mixing" | "Mastering" | "Final Polish";

export interface SavedAdvice {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface SessionContextValue {
  projectName: string;
  setProjectName: (n: string) => void;
  genre: Genre;
  setGenre: (g: Genre) => void;
  stage: Stage;
  setStage: (s: Stage) => void;
  progress: number;
  savedAdvice: SavedAdvice[];
  saveAdvice: (a: Omit<SavedAdvice, "id" | "timestamp">) => void;
  removeAdvice: (id: string) => void;
  checklist: ChecklistItem[];
  toggleChecklist: (id: string) => void;
  resetChecklist: () => void;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "1", label: "Beat ready", done: false },
  { id: "2", label: "Vocals recorded", done: false },
  { id: "3", label: "Gain staging done", done: false },
  { id: "4", label: "EQ cleanup done", done: false },
  { id: "5", label: "Compression done", done: false },
  { id: "6", label: "Effects balanced", done: false },
  { id: "7", label: "Stereo space created", done: false },
  { id: "8", label: "Master ready", done: false },
];

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = "studio-sensei-session-v1";

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [projectName, setProjectName] = useState("Untitled Session");
  const [genre, setGenre] = useState<Genre>("Hip-hop");
  const [stage, setStage] = useState<Stage>("Beat Creation");
  const [savedAdvice, setSavedAdvice] = useState<SavedAdvice[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.projectName) setProjectName(data.projectName);
        if (data.genre) setGenre(data.genre);
        if (data.stage) setStage(data.stage);
        if (Array.isArray(data.savedAdvice)) setSavedAdvice(data.savedAdvice);
        if (Array.isArray(data.checklist)) setChecklist(data.checklist);
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ projectName, genre, stage, savedAdvice, checklist }),
    );
  }, [projectName, genre, stage, savedAdvice, checklist]);

  const saveAdvice: SessionContextValue["saveAdvice"] = (a) => {
    setSavedAdvice((prev) => [
      { ...a, id: crypto.randomUUID(), timestamp: Date.now() },
      ...prev,
    ].slice(0, 30));
  };

  const removeAdvice = (id: string) =>
    setSavedAdvice((prev) => prev.filter((a) => a.id !== id));

  const toggleChecklist = (id: string) =>
    setChecklist((prev) =>
      prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    );

  const resetChecklist = () =>
    setChecklist(DEFAULT_CHECKLIST.map((c) => ({ ...c, done: false })));

  const progress = Math.round(
    (checklist.filter((c) => c.done).length / checklist.length) * 100,
  );

  return (
    <SessionContext.Provider
      value={{
        projectName, setProjectName,
        genre, setGenre,
        stage, setStage,
        progress,
        savedAdvice, saveAdvice, removeAdvice,
        checklist, toggleChecklist, resetChecklist,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
};
