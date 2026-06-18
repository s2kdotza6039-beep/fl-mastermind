import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Save, Loader2, Plus, X, Search } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { usePluginInventory } from "@/context/PluginInventoryContext";
import { NATIVE_PLUGINS, THIRD_PARTY_BRANDS } from "@/lib/plugin-inventory-constants";

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

  useEffect(() => {
    if (inventory) {
      setNative(inventory.native_plugins ?? []);
      setThird(inventory.third_party_plugins ?? []);
      setCustom(inventory.custom_plugins ?? []);
    }
  }, [inventory]);

  const toggle = (list: string[], setList: (v: string[]) => void, name: string) => {
    setList(list.includes(name) ? list.filter((n) => n !== name) : [...list, name]);
  };

  const addCustom = () => {
    const v = customDraft.trim();
    if (!v) return;
    if (v.length > 60) return toast.error("Plugin name too long.");
    if (custom.some((c) => c.toLowerCase() === v.toLowerCase())) {
      return toast.error("Already added.");
    }
    setCustom([...custom, v]);
    setCustomDraft("");
  };

  const filteredNative = useMemo(
    () => NATIVE_PLUGINS.filter((p) => p.toLowerCase().includes(nativeQuery.toLowerCase())),
    [nativeQuery],
  );
  const filteredThird = useMemo(
    () => THIRD_PARTY_BRANDS.filter((p) => p.toLowerCase().includes(thirdQuery.toLowerCase())),
    [thirdQuery],
  );

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
      <PageHeader
        eyebrow="Personalize Sensei"
        title="Tell Studio Sensei what plugins you own."
        description="Sensei will use this to recommend the best plugin chains and fixes using tools already in your studio."
        icon={<Boxes className="w-6 h-6" />}
      />

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
            <div className="flex gap-2 mb-3">
              <Input
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder="Plugin name…"
                maxLength={60}
              />
              <Button type="button" onClick={addCustom} variant="outline"><Plus className="w-4 h-4 mr-1" /> Add</Button>
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
