import { useEffect, useState } from "react";
import { Volume2, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getAudioSettings,
  setAudioEnabled,
  setAudioVolume,
  subscribeAudioSettings,
} from "@/lib/audio-settings";
import { playSenseiBootTone } from "@/lib/sensei-tone";

export default function SettingsPage() {
  const [settings, setSettings] = useState(getAudioSettings());

  useEffect(() => {
    return subscribeAudioSettings(() => setSettings(getAudioSettings()));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold text-gold">Settings</h1>
        <p className="text-sm text-muted-foreground">Personalize how Studio Sensei behaves.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-primary" />
            Audio
          </CardTitle>
          <CardDescription>
            Controls the ancient Chinese-inspired startup melody. Plays once per browser session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="startup-sound" className="text-base">Startup sound</Label>
              <p className="text-xs text-muted-foreground">
                Guqin, guzheng, xiao bamboo flute and soft temple bell on first load.
              </p>
            </div>
            <Switch
              id="startup-sound"
              checked={settings.enabled}
              onCheckedChange={(v) => setAudioEnabled(v)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Volume</Label>
              <span className="text-sm text-muted-foreground tabular-nums">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.volume * 100]}
              min={0}
              max={100}
              step={1}
              disabled={!settings.enabled}
              onValueChange={(v) => setAudioVolume((v[0] ?? 0) / 100)}
            />
          </div>

          <div className="pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              disabled={!settings.enabled}
              onClick={() => void playSenseiBootTone()}
            >
              <Play className="w-4 h-4 mr-2" />
              Preview startup sound
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Browsers require a click before audio can play — this button satisfies that.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
