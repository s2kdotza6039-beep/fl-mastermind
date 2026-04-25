import { Sliders } from "lucide-react";
import { CoachPage } from "@/components/CoachPage";

export default function ProductionCoachPage() {
  return (
    <CoachPage
      eyebrow="Build the Beat"
      title="Production Coach"
      description="From blank canvas to a beat that hits."
      icon={Sliders}
      topics={[
        { label: "Instrument selection", prompt: "Coach me on choosing instruments for my beat. Help me pick sounds that work together for my genre." },
        { label: "Drum selection & layering", prompt: "Walk me through selecting and layering drums in FL Studio for a punchy, professional sound." },
        { label: "Arrangement & song structure", prompt: "Help me arrange my song. Explain intro, verse, chorus, bridge, breakdown — what works in modern music." },
        { label: "Spacing & frequency planning", prompt: "Teach me how to plan frequency space so every element has room to breathe in the mix." },
        { label: "Groove & swing", prompt: "How do I add groove and swing to my beat in FL Studio so it doesn't feel robotic?" },
        { label: "Key detection & melody alignment", prompt: "Walk me through detecting the key of my beat using FL Studio (Edison, Piano Roll, Tuner) and aligning 808s, melodies, and vocals." },
      ]}
    />
  );
}
