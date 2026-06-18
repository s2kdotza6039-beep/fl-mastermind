import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Save, Loader2, Plus, X, Search, CheckSquare, Square } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { usePluginInventory } from "@/context/PluginInventoryContext";
import { NATIVE_PLUGINS, THIRD_PARTY_BRANDS, CUSTOM_PLUGIN_SUGGESTIONS } from "@/lib/plugin-inventory-constants";

const sortKey = (a: string[]) => a.slice().map((x) => x.toLowerCase()).sort().join("|");

export default function PluginInventoryPage() {
  const navigate = useNavigate();
  const { inventory, loading, save } = usePluginInventory();
  const [native, setNative] = useState<string[]>([]);
  const [third, setThird] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [nativeQuery, setNativeQuery] = useState("");
  const [thirdQuery, setThirdQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [savedSnapshot, setSavedSnapshot] = useState<{ n: string; t: string; c: string } | null>(null);
  const [savedCompleted, setSavedCompleted] = useState<boolean>(false);

  useEffect(() => {
    if (inventory) {
      const n = inventory.native_plugins ?? [];
      const t = inventory.third_party_plugins ?? [];
      const c = inventory.custom_plugins ?? [];
      setNative(n);
      setThird(t);
      setCustom(c);
      setSavedSnapshot({ n: sortKey(n), t: sortKey(t), c: sortKey(c) });
    }
  }, [inventory]);

  const dirty = useMemo(() => {
    if (!savedSnapshot) return native.length + third.length + custom.length > 0;
    return (
      savedSnapshot.n !== sortKey(native) ||
      savedSnapshot.t !== sortKey(third) ||
      savedSnapshot.c !== sortKey(custom)
    );
  }, [native, third, custom, savedSnapshot]);

  const isDuplicate = (name: string) => {
    const n = name.trim().toLowerCase();
    return (
      native.some((x) => x.toLowerCase() === n) ||
      third.some((x) => x.toLowerCase() === n) ||
      custom.some((x) => x.toLowerCase() === n)
    );
  };

  const toggle = (list: string[], setList: (v: string[]) => void, name: string) => {
    setList(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
  };

  const addCustom = (raw?: string) => {
    const v = (raw ?? customDraft).trim().replace(/\s+/g, " ");
    if (!v) return;
    if (v.length > 60) return toast.error("Plugin name too long.");
    if (isDuplicate(v)) {
      toast.error("Already in your inventory");
      setCustomDraft("");
      setShowSuggestions(false);
      return;
    }
    setCustom([...custom, v]);
    setCustomDraft("");
    setShowSuggestions(false);
  };

  const filteredNative = useMemo(
    () => NATIVE_PLUGINS.filter((p) => p.toLowerCase().includes(nativeQuery.toLowerCase())),
    [nativeQuery],
  );
  const filteredThird = useMemo(
    () => THIRD_PARTY_BRANDS.filter((p) => p.toLowerCase().includes(thirdQuery.toLowerCase())),
    [thirdQuery],
  );

  const customSuggestions = useMemo(() => {
    const q = customDraft.trim().toLowerCase();
    if (!q) return [];
    return CUSTOM_PLUGIN_SUGGESTIONS
      .filter((p) => p.toLowerCase().includes(q) && !isDuplicate(p))
      .slice(0, 6);
  }, [customDraft, native, third, custom]);

  const onSave = async () => {
    setSaving(true);
    const { error } = await save({
      native_plugins: native,
      third_party_plugins: third,
      custom_plugins: custom,
    });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Plugin inventory saved. Sensei will now recommend tools you actually own.");
    navigate("/");
  };

  return (
    <div className="container max-w-4xl py-10 px-4 md:px-8">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <PageHeader
            eyebrow="Personalize Sensei"
            title="Tell Studio Sensei what plugins you own."
            description="Sensei will use this to recommend the best plugin chains and fixes using tools already in your studio."
            icon={<Boxes className="w-6 h-6" />}
          />
        </div>
        {inventory?.inventory_completed && (
          <div className="pt-2 shrink-0">
            {dirty ? (
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
                Unsaved changes
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-primary/15 text-primary border border-primary/30">
                Inventory saved
              </span>
            )}
          </div>
        )}
      </div>


      {loading ? (
        <Card className="studio-card p-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Native */}
          <Card className="studio-card-gold p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-bold">FL Studio Native Plugins</h2>
                <p className="text-xs text-muted-foreground">Tick the stock plugins included with your FL Studio install.</p>
              </div>
              <Badge variant="secondary">{native.length} / {NATIVE_PLUGINS.length}</Badge>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={nativeQuery} onChange={(e) => setNativeQuery(e.target.value)} placeholder="Search native plugins…" className="pl-9" />
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredNative.map((p) => (
                <label key={p} className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer text-sm">
                  <Checkbox checked={native.includes(p)} onCheckedChange={() => toggle(native, setNative, p)} />
                  <span className="truncate">{p}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* Third-party */}
          <Card className="studio-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-bold">Third-Party Plugin Brands</h2>
                <p className="text-xs text-muted-foreground">Tick the brands you have at least one plugin from.</p>
              </div>
              <Badge variant="secondary">{third.length} / {THIRD_PARTY_BRANDS.length}</Badge>
            </div>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input value={thirdQuery} onChange={(e) => setThirdQuery(e.target.value)} placeholder="Search brands…" className="pl-9" />
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {filteredThird.map((p) => (
                <label key={p} className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/40 cursor-pointer text-sm">
                  <Checkbox checked={third.includes(p)} onCheckedChange={() => toggle(third, setThird, p)} />
                  <span className="truncate">{p}</span>
                </label>
              ))}
            </div>
          </Card>

          {/* Custom */}
          <Card className="studio-card p-6">
            <h2 className="font-display text-lg font-bold mb-1">Custom Plugins</h2>
            <p className="text-xs text-muted-foreground mb-4">Add any specific plugin Sensei should know about (e.g. "Serum", "Kontakt 7").</p>
            <div className="relative mb-3">
              <div className="flex gap-2">
                <Input
                  value={customDraft}
                  onChange={(e) => { setCustomDraft(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                  placeholder="Plugin name… (suggestions appear as you type)"
                  maxLength={60}
                />
                <Button type="button" onClick={() => addCustom()} variant="outline"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
              {showSuggestions && customSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-[88px] mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
                  {customSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); addCustom(s); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {custom.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {custom.map((c) => (
                  <Badge key={c} variant="outline" className="pl-3 pr-1 py-1 gap-1">
                    {c}
                    <button
                      type="button"
                      onClick={() => setCustom(custom.filter((x) => x !== c))}
                      aria-label={`Remove ${c}`}
                      className="ml-1 p-0.5 rounded hover:bg-muted"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => navigate("/")}>Cancel</Button>
            <Button
              onClick={onSave}
              disabled={saving}
              className="bg-gradient-gold text-primary-foreground hover:opacity-90 glow-gold"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Inventory
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
