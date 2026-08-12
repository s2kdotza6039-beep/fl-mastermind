/**
 * R11.5 — Paperwork. Deterministic markdown documents built from data the app
 * already measured. Zero AI, zero network: the producer can hand these to a
 * distributor, a collaborator, or their future self.
 */
import type { ReleasePlan } from "@/lib/release";

export interface PaperworkProject {
  name?: string | null;
  genre?: string | null;
  artist?: string | null;
  fileName?: string | null;
}

const VERDICT_MARK: Record<string, string> = { pass: "[x]", warn: "[!]", fail: "[ ]" };

function head(title: string, project: PaperworkProject): string[] {
  return [
    `# ${title}`,
    "",
    `- Project: ${project.name?.trim() || "Untitled"}`,
    `- Artist: ${project.artist?.trim() || "—"}`,
    `- Genre: ${project.genre?.trim() || "—"}`,
    `- Bounce: ${project.fileName?.trim() || "—"}`,
    `- Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
}

/** The final pre-release checklist, gate by gate. */
export function buildMixChecklistMarkdown(plan: ReleasePlan, project: PaperworkProject): string {
  const lines = [
    ...head("Final mix & master checklist", project),
    `## Destination: ${plan.platform.label} (${plan.platform.lufs} LUFS · ceiling ${plan.platform.ceilingDb} dBTP)`,
    "",
    plan.headline,
    "",
    "## Gates",
    "",
  ];
  for (const g of plan.gates) {
    lines.push(`- ${VERDICT_MARK[g.verdict] ?? "[ ]"} **${g.label}** — ${g.detail}`);
    if (g.fix) lines.push(`  - Fix: ${g.fix}`);
  }
  lines.push(
    "",
    "## Export doctrine",
    "",
    `- File → Export → Wave · 24-bit · 44.1 kHz · true-peak ceiling ${plan.platform.ceilingDb} dBTP`,
    `- ${plan.fails} failing gate(s), ${plan.warns} note(s).`,
    "",
  );
  return lines.join("\n");
}

/** Release notes: what to hand a distributor alongside the master. */
export function buildReleaseNotesMarkdown(plan: ReleasePlan, project: PaperworkProject): string {
  const m = plan.master;
  const lines = [
    ...head("Release notes", project),
    "## Master measurements",
    "",
    `- Integrated loudness: ${m?.lufs != null ? `${m.lufs} LUFS` : "—"}`,
    `- True peak: ${m?.peakDb != null ? `${m.peakDb} dBTP` : "—"}`,
    `- Dynamic range: ${m?.dr != null ? `${m.dr} dB` : "—"}`,
    `- Stereo width: ${m?.width != null ? `${m.width}` : "—"}`,
    "",
    "## Delivery",
    "",
    `- Target platform: ${plan.platform.label} (${plan.platform.lufs} LUFS)`,
    `- Ready to ship: ${plan.ready ? "yes" : "not yet"}${plan.clean ? " (all gates clean)" : ""}`,
    "",
    "## Metadata to supply",
    "",
    "- Track title:",
    "- Primary artist / featured artists:",
    "- Songwriter & producer splits (%):",
    "- ISRC:",
    "- UPC/EAN:",
    "- Explicit content: yes / no",
    "- Release date:",
    "- Cover art: 3000x3000 px JPG/PNG",
    "",
  ];
  return lines.join("\n");
}

/** Trigger a client-side .md download. */
export function downloadMarkdown(fileName: string, markdown: string): void {
  const safe = fileName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "document.md";
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safe.endsWith(".md") ? safe : `${safe}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
