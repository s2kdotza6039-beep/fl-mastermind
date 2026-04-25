import { Volume2 } from "lucide-react";
import { CoachPage } from "@/components/CoachPage";

export default function MixingCoachPage() {
  return (
    <CoachPage
      eyebrow="Engineer the Sound"
      title="Mixing Coach"
      description="Step-by-step guidance to a clean, balanced, professional mix."
      icon={Volume2}
      topics={[
        { label: "Gain staging", prompt: "Walk me through proper gain staging in FL Studio mixer from individual tracks to the master." },
        { label: "EQ cleanup (subtractive)", prompt: "Teach me subtractive EQ in FL Studio — what to cut on each track type and why." },
        { label: "Compression fundamentals", prompt: "Explain compression with Fruity Compressor and Maximus — exact settings for vocals, drums, bass." },
        { label: "Panning & stereo image", prompt: "How do I pan instruments and use Stereo Shaper to build a wide, balanced stereo image?" },
        { label: "Effects (reverb, delay)", prompt: "Coach me on using Fruity Reeverb 2 and Fruity Delay 3 to add depth without washing out the mix." },
        { label: "Bus routing & groups", prompt: "Show me how to set up bus routing in FL Studio mixer — drum bus, vocal bus, instrument bus, master." },
        { label: "Automation", prompt: "Teach me automation techniques in FL Studio that bring a mix to life." },
        { label: "Final balance", prompt: "How do I final-balance a mix before mastering? Reference checks, mono check, low-end discipline." },
        { label: "Patcher: Mid/Side EQ", prompt: "Walk me through building a Mid/Side EQ chain in Patcher with Fruity Parametric EQ 2." },
        { label: "Patcher: Parallel compression", prompt: "Walk me through setting up parallel compression with Patcher and Fruity Compressor for drums and vocals." },
      ]}
    />
  );
}
