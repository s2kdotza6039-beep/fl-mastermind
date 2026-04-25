import { useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileAudio, X, Sparkles } from "lucide-react";
import { SenseiChat } from "@/components/SenseiChat";
import { toast } from "sonner";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [described, setDescribed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.type.startsWith("audio/") && !/\.(wav|mp3|aiff|flac)$/i.test(f.name)) {
      toast.error("Please upload a WAV or MP3 file");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File too large (max 50MB)");
      return;
    }
    setFile(f);
  };

  return (
    <div className="container max-w-4xl py-8 px-4 md:px-8">
      <PageHeader
        eyebrow="Audio Reference"
        title="Upload Your Track"
        description="Upload your WAV or MP3 to analyze. Audio AI engine launching soon — for now, describe what you hear and Sensei will diagnose."
        icon={<UploadCloud className="w-6 h-6" />}
      />

      {!file ? (
        <Card
          className="studio-card-gold p-12 text-center border-2 border-dashed border-primary/30 cursor-pointer hover:border-primary/60 transition"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.aiff,.flac"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <UploadCloud className="w-14 h-14 mx-auto mb-4 text-primary" />
          <h3 className="font-display text-xl font-bold mb-2">Drop your audio file here</h3>
          <p className="text-sm text-muted-foreground mb-4">WAV, MP3, AIFF, FLAC — up to 50MB</p>
          <Button className="bg-gradient-gold text-primary-foreground hover:opacity-90">Choose file</Button>
        </Card>
      ) : (
        <Card className="studio-card p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0">
                <FileAudio className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{file.name}</h3>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setFile(null); setDescribed(false); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <audio controls src={URL.createObjectURL(file)} className="w-full mt-4" />

          <div className="mt-5 p-4 rounded-lg bg-gradient-gold-soft border border-primary/20 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-primary mb-1">Audio analysis engine — coming soon</p>
              <p className="text-muted-foreground text-xs">For now, describe what you hear in the chat below and Sensei will diagnose and prescribe the fix.</p>
            </div>
          </div>

          {!described && (
            <Button onClick={() => setDescribed(true)} className="w-full mt-4 bg-gradient-gold text-primary-foreground hover:opacity-90">
              Describe what you hear
            </Button>
          )}
        </Card>
      )}

      {file && described && (
        <Card className="studio-card overflow-hidden h-[60vh] flex flex-col">
          <SenseiChat initialPrompt={`I uploaded a track called "${file.name}". I want to describe what I hear and get your diagnosis. Ask me what specifically I'm hearing so you can guide me to the fix.`} />
        </Card>
      )}
    </div>
  );
}
