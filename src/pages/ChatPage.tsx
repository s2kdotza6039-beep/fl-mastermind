import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";

export default function ChatPage() {
  return (
    <div className="container max-w-5xl py-8 px-4 md:px-8 h-full flex flex-col">
      <PageHeader
        eyebrow="Live Coaching"
        title="Sensei Chat"
        description="Ask anything. Mix problems, plugin chains, key detection, mastering — get engineer-grade answers."
        icon={<MessageCircle className="w-6 h-6" />}
      />
      <Card className="studio-card flex-1 overflow-hidden flex flex-col min-h-[600px]">
        <SenseiChat />
      </Card>
    </div>
  );
}
