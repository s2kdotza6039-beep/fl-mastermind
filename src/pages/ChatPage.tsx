import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";
import { takeChatPrompt } from "@/lib/knowledge-handoff";
import { useProject } from "@/context/ProjectContext";

export default function ChatPage() {
  // One-shot handoff from the chord generator / playbook / upload continuation.
  const [handoff] = useState<string | null>(() => takeChatPrompt());
  const { activeProject } = useProject();

  return (
    <div className="container max-w-5xl py-6 px-4 md:px-8 h-full flex flex-col overflow-hidden">
      <PageHeader
        eyebrow="Live Coaching"
        title="Sensei Chat"
        description="Ask anything. Mix problems, plugin chains, key detection, mastering — get engineer-grade answers."
        icon={<MessageCircle className="w-6 h-6" />}
      />
      <ActiveTrackChip />
      <Card className="studio-card overflow-hidden flex flex-col min-h-[480px] max-h-[calc(100dvh-11rem)]">
        {/* R12 — per-song isolation: a full remount on project switch. */}
        <SenseiChat key={activeProject?.id ?? "no-project"} initialPrompt={handoff ?? undefined} />
      </Card>
    </div>
  );
}
