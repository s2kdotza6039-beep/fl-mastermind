import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SenseiChat } from "@/components/SenseiChat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { ActiveTrackChip } from "@/components/ActiveTrackChip";

interface CoachPageProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  topics: { label: string; prompt: string }[];
}

export const CoachPage = ({ eyebrow, title, description, icon: Icon, topics }: CoachPageProps) => {
  const [prompt, setPrompt] = useState<string>();

  return (
    <div className="container max-w-6xl py-8 px-4 md:px-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} icon={<Icon className="w-6 h-6" />} />
      <ActiveTrackChip />


      {!prompt ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {topics.map((t) => (
            <button key={t.label} onClick={() => setPrompt(t.prompt)} className="text-left">
              <Card className="studio-card p-5 hover:border-primary/40 hover:bg-primary/5 transition-all group flex items-center justify-between">
                <span className="font-semibold">{t.label}</span>
                <span className="text-primary opacity-0 group-hover:opacity-100 transition">→</span>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={() => setPrompt(undefined)} className="mb-4">← Back</Button>
          <Card className="studio-card overflow-hidden h-[70vh] flex flex-col">
            <SenseiChat initialPrompt={prompt} />
          </Card>
        </>
      )}
    </div>
  );
};
