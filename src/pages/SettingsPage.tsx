import { useEffect, useState } from "react";
import { Volume2, Play, Activity, EyeOff, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  getAudioSettings,
  setAudioEnabled,
  setAudioVolume,
  setAudioScope,
  setPauseOnHidden,
  subscribeAudioSettings,
  resetFirstVisitFlag,
  clearUserInteracted,
} from "@/lib/audio-settings";
import {
  playSenseiBootTone,
  getAudioDiagnostics,
  subscribeAudioDiagnostics,
} from "@/lib/sensei-tone";

const REASON_LABEL: Record<string, string> = {
  "playing-or-ready": "Ready / playing",
  "autoplay-blocked-waiting-interaction": "Autoplay blocked — waiting for your first click or keypress",
  "already-played-this-session": "Already played this session",
  "already-played-first-visit": "Already played on first visit (won't play again on this device)",
  "disabled-in-settings": "Disabled in settings",
  "tab-hidden": "Tab was hidden — skipped to avoid surprise audio",
  unsupported: "Web Audio API not supported in this browser",
  idle: "Idle",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(getAudioSettings());
  const [diag, setDiag] = useState(getAudioDiagnostics());

  useEffect(() => subscribeAudioSettings(() => setSettings(getAudioSettings())), []);
  useEffect(() => subscribeAudioDiagnostics(() => setDiag(getAudioDiagnostics())), []);

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
            Controls the ancient Chinese-inspired startup melody.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="startup-sound" className="text-base">Startup sound</Label>
              <p className="text-xs text-muted-foreground">
                Guqin, guzheng, xiao bamboo flute and soft temple bell.
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

          <div className="space-y-3">
            <Label className="text-base">When should it play?</Label>
            <RadioGroup
              value={settings.scope}
              onValueChange={(v) => setAudioScope(v as "session" | "first-visit")}
              disabled={!settings.enabled}
              className="space-y-2"
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <RadioGroupItem value="session" id="scope-session" className="mt-1" />
                <div>
                  <div className="text-sm font-medium">Once per session</div>
                  <p className="text-xs text-muted-foreground">
                    Plays once each time you open the app in a new tab or window.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <RadioGroupItem value="first-visit" id="scope-first-visit" className="mt-1" />
                <div>
                  <div className="text-sm font-medium">Only on first visit</div>
                  <p className="text-xs text-muted-foreground">
                    Plays only the very first time you load Studio Sensei on this device.
                  </p>
                </div>
              </label>
            </RadioGroup>
            {settings.scope === "first-visit" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetFirstVisitFlag()}
                className="text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset first-visit flag (play again next load)
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <EyeOff className="w-4 h-4 mt-1 text-muted-foreground" />
              <div>
                <Label htmlFor="pause-hidden" className="text-base">
                  Pause if tab is hidden
                </Label>
                <p className="text-xs text-muted-foreground">
                  Skip or stop the startup sound when you switch tabs or minimize the window.
                </p>
              </div>
            </div>
            <Switch
              id="pause-hidden"
              checked={settings.pauseOnHidden}
              disabled={!settings.enabled}
              onCheckedChange={(v) => setPauseOnHidden(v)}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Audio diagnostics
          </CardTitle>
          <CardDescription>
            Real-time status of the browser's audio engine and why playback may be delayed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <DiagRow
            label="Web Audio supported"
            value={
              <Badge variant={diag.supported ? "default" : "destructive"}>
                {diag.supported ? "Yes" : "No"}
              </Badge>
            }
          />
          <DiagRow
            label="AudioContext state"
            value={
              <Badge variant={diag.contextState === "running" ? "default" : "secondary"}>
                {diag.contextState}
              </Badge>
            }
          />
          <DiagRow
            label="Unlocked (ready to autoplay)"
            value={
              <Badge variant={diag.unlocked ? "default" : "secondary"}>
                {diag.unlocked ? "Unlocked" : "Locked"}
              </Badge>
            }
          />
          <DiagRow
            label="Interaction remembered"
            value={
              <Badge variant={diag.interactionRemembered ? "default" : "secondary"}>
                {diag.interactionRemembered ? "Yes — future loads autoplay" : "No — needs gesture"}
              </Badge>
            }
          />
          <DiagRow
            label="Played this session"
            value={
              <Badge variant={diag.playedThisSession ? "default" : "secondary"}>
                {diag.playedThisSession ? "Yes" : "No"}
              </Badge>
            }
          />
          <DiagRow
            label="Played on first visit"
            value={
              <Badge variant={diag.playedFirstVisit ? "default" : "secondary"}>
                {diag.playedFirstVisit ? "Yes" : "No"}
              </Badge>
            }
          />
          <div className="pt-3 border-t border-border/50">
            <div className="text-xs uppercase text-muted-foreground mb-1">
              Current reason
            </div>
            <div className="text-sm">{REASON_LABEL[diag.reason] ?? diag.reason}</div>
            {diag.lastError && (
              <div className="text-xs text-destructive mt-2">
                Last error: {diag.lastError}
              </div>
            )}
          </div>
          {diag.interactionRemembered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearUserInteracted();
                setDiag(getAudioDiagnostics());
              }}
              className="text-xs"
            >
              Forget interaction (require a fresh gesture next load)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}
