import { Rocket } from "lucide-react";
import { CoachPage } from "@/components/CoachPage";
import { Card } from "@/components/ui/card";
import { ReleaseCard } from "@/components/ReleaseCard";

export default function PublishPage() {
  return (
    <CoachPage
      eyebrow="Ship It"
      title="Publish"
      description="The last door: gates, paperwork, and getting the song out."
      icon={Rocket}
      above={
        <>
          <ReleaseCard />
          <Card className="studio-card p-4 mb-6">
            <p className="text-xs text-muted-foreground">
              🥋 Sensei: publishing is admin, not art. Get the master past the gates above, download the
              paperwork, then work through the topics below one at a time — you only do this once per song.
            </p>
          </Card>
        </>
      }
      topics={[
        { label: "Export settings for release", prompt: "Walk me through the exact FL Studio export settings for a commercial release — format, bit depth, sample rate, dithering and true-peak ceiling." },
        { label: "Metadata, ISRC & UPC", prompt: "Explain track metadata for release: ISRC, UPC, artist naming, featured artists, explicit flags — what I need and where to get it." },
        { label: "Cover art & lyrics", prompt: "What are the cover art specs and lyric submission requirements for streaming platforms, and what gets a release rejected?" },
        { label: "Choosing a distributor", prompt: "Help me choose a music distributor. Compare the common options on fees, payout speed, and what an independent producer actually needs." },
        { label: "Release-date strategy", prompt: "Help me plan my release date and rollout: pre-save window, playlist pitching lead time, and what to do in the two weeks before release." },
        { label: "Splits & registration", prompt: "Explain songwriter/producer splits and where to register my song (PRO, publishing admin) so I actually get paid." },
      ]}
    />
  );
}
