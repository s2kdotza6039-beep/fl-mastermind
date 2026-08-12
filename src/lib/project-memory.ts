// Project Memory — DB helpers for the long-term memory system.
// Keeps Studio Sensei aware of each producer's song between sessions.
import { supabase } from "@/integrations/supabase/client";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type AdviceStatus = "pending" | "applied" | "ignored" | "resolved";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  genre: string | null;
  status: ProjectStatus;
  last_opened_page: string | null;
  last_opened_track_version_id: string | null;
  last_opened_audio_report_id: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
  // R13 — production phase lives here (existing JSONB, no migration).
  session_notes?: any;
}

export interface ProjectAdvice {
  id: string;
  project_id: string;
  user_id: string;
  track_version_id: string | null;
  category: string | null;
  title: string;
  content: string;
  source_page: string | null;
  status: AdviceStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectTrackVersion {
  id: string;
  project_id: string;
  user_id: string;
  version_number: number;
  file_name: string;
  audio_report_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectChatMessage {
  id: string;
  project_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: any | null;
  source_page: string | null;
  scope: string | null;
  created_at: string;
}


export async function listProjects(userId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  return (data as Project) ?? null;
}

export async function createProject(
  userId: string,
  patch: { name: string; description?: string; genre?: string },
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, name: patch.name, description: patch.description, genre: patch.genre })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

/** Persist the user's last-seen state so we can restore on next visit. */
export async function touchLastOpened(
  projectId: string,
  patch: { page?: string; trackVersionId?: string | null; audioReportId?: string | null },
): Promise<void> {
  const upd: Partial<Project> = { last_activity_at: new Date().toISOString() };
  if (patch.page !== undefined) upd.last_opened_page = patch.page;
  if (patch.trackVersionId !== undefined) upd.last_opened_track_version_id = patch.trackVersionId;
  if (patch.audioReportId !== undefined) upd.last_opened_audio_report_id = patch.audioReportId;
  await supabase.from("projects").update(upd).eq("id", projectId);
}

/** Most-recently-active project for a user, used for resume-on-login. */
export async function getMostRecentProject(userId: string): Promise<Project | null> {
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Project) ?? null;
}

// ---------------- Advice ----------------
export async function listAdvice(projectId: string): Promise<ProjectAdvice[]> {
  const { data, error } = await supabase
    .from("project_advice")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectAdvice[];
}

export async function addAdvice(
  userId: string,
  projectId: string,
  patch: { title: string; content: string; category?: string; source_page?: string; track_version_id?: string },
): Promise<ProjectAdvice> {
  const { data, error } = await supabase
    .from("project_advice")
    .insert({
      user_id: userId,
      project_id: projectId,
      title: patch.title,
      content: patch.content,
      category: patch.category,
      source_page: patch.source_page,
      track_version_id: patch.track_version_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectAdvice;
}

export async function setAdviceStatus(id: string, status: AdviceStatus): Promise<void> {
  await supabase.from("project_advice").update({ status }).eq("id", id);
}

export async function deleteAdvice(id: string): Promise<void> {
  await supabase.from("project_advice").delete().eq("id", id);
}

// ---------------- Track versions ----------------
export async function listTrackVersions(projectId: string): Promise<ProjectTrackVersion[]> {
  const { data } = await supabase
    .from("project_track_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });
  return (data ?? []) as ProjectTrackVersion[];
}

export async function addTrackVersion(
  userId: string,
  projectId: string,
  patch: { file_name: string; audio_report_id?: string; notes?: string },
): Promise<ProjectTrackVersion> {
  const existing = await listTrackVersions(projectId);
  const nextVersion = (existing[0]?.version_number ?? 0) + 1;
  const { data, error } = await supabase
    .from("project_track_versions")
    .insert({
      user_id: userId,
      project_id: projectId,
      version_number: nextVersion,
      file_name: patch.file_name,
      audio_report_id: patch.audio_report_id,
      notes: patch.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectTrackVersion;
}

// ---------------- Chat memory ----------------
// NOTE: fetch the LATEST `limit` messages (descending) then reverse into
// chronological order. Previously this fetched ascending + limit, which
// returned the OLDEST messages — after 100+ messages in a project, the most
// recent conversation silently vanished from restores and from the AI prompt.
export async function listChatMessages(projectId: string, limit = 200): Promise<ProjectChatMessage[]> {
  const { data } = await supabase
    .from("project_chat_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as ProjectChatMessage[]).reverse();
}

export async function appendChatMessage(
  userId: string,
  projectId: string,
  msg: { role: "user" | "assistant" | "system"; content: string; source_page?: string },
): Promise<void> {
  const { error } = await supabase.from("project_chat_messages").insert({
    user_id: userId,
    project_id: projectId,
    role: msg.role,
    content: msg.content,
    source_page: msg.source_page,
  });
  // Never fail silently — "Sensei forgets" bugs hide in swallowed inserts.
  if (error) throw error;
}

/** Project context summary for AI prompts. */
export interface ProjectContextSummary {
  projectName: string;
  projectGenre: string | null;
  projectDescription: string | null;
  openIssueCount: number;
  resolvedAdviceCount: number;
  pendingAdviceTitles: string[];
  recentAdvice: Array<{ title: string; status: AdviceStatus; created_at: string }>;
  trackVersionCount: number;
  currentTrackFileName: string | null;
}

export async function buildProjectAiContext(project: Project): Promise<ProjectContextSummary> {
  const [advice, versions] = await Promise.all([
    listAdvice(project.id),
    listTrackVersions(project.id),
  ]);
  const open = advice.filter((a) => a.status === "pending");
  const resolved = advice.filter((a) => a.status === "resolved" || a.status === "applied");
  const current = versions[0] ?? null;
  return {
    projectName: project.name,
    projectGenre: project.genre,
    projectDescription: project.description,
    openIssueCount: open.length,
    resolvedAdviceCount: resolved.length,
    pendingAdviceTitles: open.slice(0, 8).map((a) => a.title),
    recentAdvice: advice.slice(0, 10).map((a) => ({
      title: a.title,
      status: a.status,
      created_at: a.created_at,
    })),
    trackVersionCount: versions.length,
    currentTrackFileName: current?.file_name ?? null,
  };
}
