import { Crown } from "lucide-react";
import { CoachPage } from "@/components/CoachPage";

export default function MasteringCoachPage() {
  return (
    <CoachPage
      eyebrow="International Standard"
      title="Mastering Coach"
      description="Loud, clean, polished — ready for streaming platforms worldwide."
      icon={Crown}
      topics={[
        { label: "Headroom prep", prompt: "How much headroom should I leave before mastering? Walk me through prepping the mix in FL Studio." },
        { label: "EQ balance on master", prompt: "Coach me on master bus EQ with Fruity Parametric EQ 2 — what frequencies to shape." },
        { label: "Master compression", prompt: "Walk me through gentle master bus compression with Fruity Compressor or Maximus multiband." },
        { label: "Multiband with Maximus", prompt: "Teach me how to use Maximus for multiband compression and limiting on the master." },
        { label: "Limiting & loudness", prompt: "How do I push loudness with Fruity Limiter to hit -8 to -10 LUFS without distortion?" },
        { label: "Stereo enhancement", prompt: "How do I widen the master with Stereo Shaper while keeping the low end mono?" },
        { label: "Reference matching", prompt: "Walk me through reference-track matching in FL Studio for an international sound." },
        { label: "Export settings", prompt: "What export settings should I use in FL Studio for streaming, distribution, and CDQ?" },
      ]}
    />
  );
}
