// Pure helpers for the ProjectDetailPage JSON export (kept side-effect free so
// they can be unit tested without a browser or database).

export interface ExportChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export function parseExportChecklist(raw: unknown): ExportChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c: any) => c && typeof c.id === "string" && typeof c.label === "string")
    .map((c: any) => ({ id: c.id, label: c.label, done: !!c.done }));
}

export function exportFileName(projectName: string): string {
  const slug =
    (projectName ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project";
  return `${slug}-studio-sensei-export.json`;
}

export function buildExportPayload(args: {
  project: any;
  versions: any[];
  scores: any[];
  issues: any[];
  plans: any[];
  advice: any[];
  exportedAt?: string;
}) {
  const { project } = args;
  const checklist = parseExportChecklist((project as any).checklist);
  return {
    app: "studio-sensei",
    exported_at: args.exportedAt ?? new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      genre: project.genre ?? null,
      status: project.status,
      goal: (project as any).goal ?? null,
      session_notes: (project as any).session_notes ?? null,
      created_at: project.created_at,
      checklist,
      checklist_progress: {
        done: checklist.filter((c) => c.done).length,
        total: checklist.length,
      },
    },
    versions: args.versions ?? [],
    scores: args.scores ?? [],
    issues: args.issues ?? [],
    plans: args.plans ?? [],
    advice: args.advice ?? [],
  };
}
