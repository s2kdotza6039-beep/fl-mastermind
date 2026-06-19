import { useEffect, useState } from "react";
import { Volume2, Play, Activity, EyeOff, RotateCcw, VolumeX, Keyboard, FlaskConical, Cloud } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getAudioSettings,
  setAudioEnabled,
  setAudioVolume,
  setAudioScope,
  setPauseOnHidden,
  setAudioMuted,
  subscribeAudioSettings,
  resetFirstVisitFlag,
  clearUserInteracted,
} from "@/lib/audio-settings";
import {
  playSenseiBootTone,
  testSenseiBootTone,
  getAudioDiagnostics,
  subscribeAudioDiagnostics,
  REASON_INFO,
  type AudioTestResult,
} from "@/lib/sensei-tone";

export default function SettingsPage() {
  const [settings, setSettings] = useState(getAudioSettings());
  const [diag, setDiag] = useState(getAudioDiagnostics());
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<AudioTestResult | null>(null);

  useEffect(() => subscribeAudioSettings(() => setSettings(getAudioSettings())), []);
  useEffect(() => subscribeAudioDiagnostics(() => setDiag(getAudioDiagnostics())), []);

  const runTest = async () => {
    setTesting(true);
    const r = await testSenseiBootTone();
    setLastTest(r);
    setTesting(false);
    if (r.blocked) {
      toast.error("Startup sound was blocked by autoplay", { description: r.message });
    } else if (r.attempted) {
      toast.success("Startup sound played", { description: r.message });
    } else {
      toast.warning(r.message);
    }
  };

  const reasonInfo = REASON_INFO[diag.reason];

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

          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
            <div className="flex items-start gap-2">
              <VolumeX className="w-4 h-4 mt-1 text-muted-foreground" />
              <div>
                <Label htmlFor="muted" className="text-base">Mute</Label>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Keyboard className="w-3 h-3" />
                  Shortcut: <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Shift</kbd>+<kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">M</kbd>
                  — works during playback too
                </p>
              </div>
            </div>
            <Switch
              id="muted"
              checked={settings.muted}
              onCheckedChange={(v) => setAudioMuted(v)}
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
            <div className="flex items-center gap-2">
              <Label className="text-base">When should it play?</Label>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Cloud className="w-3 h-3" />
                Synced to your profile
              </Badge>
            </div>
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

          <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!settings.enabled}
              onClick={() => void playSenseiBootTone()}
            >
              <Play className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={() => void runTest()}
            >
              <FlaskConical className="w-4 h-4 mr-2" />
              {testing ? "Testing…" : "Test (detect autoplay block)"}
            </Button>
          </div>
          {lastTest && (
            <div
              className={`text-xs rounded-md p-3 border ${
                lastTest.blocked
                  ? "border-destructive/50 bg-destructive/10 text-destructive-foreground"
                  : "border-primary/30 bg-primary/5"
              }`}
            >
              <div className="font-medium">
                {lastTest.blocked ? "❌ Blocked by autoplay policy" : "✅ Playback succeeded"}
              </div>
              <div className="mt-1">Reason code: <code>{REASON_INFO[lastTest.reason].code}</code></div>
              <div>AudioContext state: <code>{lastTest.contextState}</code></div>
              <div className="mt-1">{lastTest.message}</div>
            </div>
          )}
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
          <DiagRow label="Web Audio supported" value={<Badge variant={diag.supported ? "default" : "destructive"}>{diag.supported ? "Yes" : "No"}</Badge>} />
          <DiagRow label="AudioContext state" value={<Badge variant={diag.contextState === "running" ? "default" : "secondary"}>{diag.contextState}</Badge>} />
          <DiagRow label="Unlocked (ready to autoplay)" value={<Badge variant={diag.unlocked ? "default" : "secondary"}>{diag.unlocked ? "Unlocked" : "Locked"}</Badge>} />
          <DiagRow label="Interaction remembered" value={<Badge variant={diag.interactionRemembered ? "default" : "secondary"}>{diag.interactionRemembered ? "Yes — future loads autoplay" : "No — needs gesture"}</Badge>} />
          <DiagRow label="Currently muted" value={<Badge variant={diag.muted ? "destructive" : "secondary"}>{diag.muted ? "Muted" : "Live"}</Badge>} />
          <DiagRow label="Played this session" value={<Badge variant={diag.playedThisSession ? "default" : "secondary"}>{diag.playedThisSession ? "Yes" : "No"}</Badge>} />
          <DiagRow label="Played on first visit" value={<Badge variant={diag.playedFirstVisit ? "default" : "secondary"}>{diag.playedFirstVisit ? "Yes" : "No"}</Badge>} />
          <DiagRow label="Retry attempts" value={<Badge variant="secondary">{diag.retryAttempts}</Badge>} />
          {diag.nextRetryInMs !== null && (
            <DiagRow
              label="Next retry in"
              value={<Badge variant="outline" className="tabular-nums">{(diag.nextRetryInMs / 1000).toFixed(1)}s</Badge>}
            />
          )}

          <div className="pt-3 border-t border-border/50">
            <div className="text-xs uppercase text-muted-foreground mb-1">Current reason</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">{reasonInfo.code}</Badge>
              <span className="text-sm">{reasonInfo.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-medium text-foreground">Suggested fix: </span>
              {reasonInfo.fix}
            </p>
            {diag.lastError && (
              <div className="text-xs text-destructive mt-2">Last error: {diag.lastError}</div>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              All reason codes
            </summary>
            <div className="mt-2 space-y-1.5 pl-2">
              {Object.entries(REASON_INFO).map(([key, info]) => (
                <div key={key} className="border-l-2 border-border/50 pl-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{info.code}</Badge>
                    <span>{info.label}</span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{info.fix}</p>
                </div>
              ))}
            </div>
          </details>

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
