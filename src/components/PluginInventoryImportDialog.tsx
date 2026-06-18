import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, FileText } from "lucide-react";
import { parseCsv } from "@/lib/csv-utils";
import { NATIVE_PLUGINS, THIRD_PARTY_BRANDS } from "@/lib/plugin-inventory-constants";
import { toast } from "sonner";

type Category = "ignore" | "native" | "third_party" | "custom";

interface Props {
  open: boolean;
  onClose: () => void;
  existing: { native: string[]; third: string[]; custom: string[] };
  onApply: (additions: { native: string[]; third: string[]; custom: string[] }) => void;
}

const ciIncludes = (list: readonly string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
const matchCanonical = (catalog: readonly string[], v: string) => catalog.find((c) => c.toLowerCase() === v.toLowerCase());

export function PluginInventoryImportDialog({ open, onClose, existing, onApply }: Props) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRows(null); setFileName(null); setMapping([]); setHasHeader(true);
  };

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("CSV too large (max 2MB).");
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) { toast.error("CSV is empty."); return; }
      setRows(parsed);
      setFileName(file.name);
      const cols = Math.max(...parsed.map((r) => r.length));
      // Guess: a column whose header contains keywords maps automatically
      const header = parsed[0].map((h) => h.toLowerCase());
      const guessed: Category[] = Array.from({ length: cols }, (_, i) => {
        const h = header[i] ?? "";
        if (/native|stock|fl[ _-]?studio/.test(h)) return "native";
        if (/third|brand|vst/.test(h)) return "third_party";
        if (/custom|plugin|name/.test(h)) return "custom";
        return "ignore";
      });
      setMapping(guessed);
    } finally {
      setBusy(false);
    }
  };

  const dataRows = useMemo(() => (rows ? (hasHeader ? rows.slice(1) : rows) : []), [rows, hasHeader]);

  const preview = useMemo(() => {
    const native: string[] = [], third: string[] = [], custom: string[] = [];
    const unknown: string[] = [];
    if (!rows) return { native, third, custom, unknown };
    dataRows.forEach((r) => {
      mapping.forEach((cat, colIdx) => {
        const raw = (r[colIdx] ?? "").trim().replace(/\s+/g, " ");
        if (!raw || cat === "ignore") return;
        if (cat === "native") {
          const canon = matchCanonical(NATIVE_PLUGINS, raw);
          if (canon) { if (!ciIncludes(native, canon) && !ciIncludes(existing.native, canon)) native.push(canon); }
          else unknown.push(`${raw} (native)`);
        } else if (cat === "third_party") {
          const canon = matchCanonical(THIRD_PARTY_BRANDS, raw);
          if (canon) { if (!ciIncludes(third, canon) && !ciIncludes(existing.third, canon)) third.push(canon); }
          else unknown.push(`${raw} (third-party)`);
        } else if (cat === "custom") {
          if (raw.length > 60) return;
          if (!ciIncludes(custom, raw) && !ciIncludes(existing.custom, raw) &&
              !ciIncludes(existing.native, raw) && !ciIncludes(existing.third, raw)) {
            custom.push(raw);
          }
        }
      });
    });
    return { native, third, custom, unknown };
  }, [rows, dataRows, mapping, existing]);

  const totalAdds = preview.native.length + preview.third.length + preview.custom.length;

  const apply = () => {
    if (totalAdds === 0) return toast.error("Nothing new to import — adjust column mapping.");
    onApply({ native: preview.native, third: preview.third, custom: preview.custom });
    toast.success(`Staged ${totalAdds} plugin${totalAdds === 1 ? "" : "s"} from ${fileName}. Click Save Inventory to persist.`);
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import plugin inventory from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV, then map each column to Native, Third-party, Custom, or Ignore. Unknown native/brand names are skipped (only canonical names are merged); custom names accept anything.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 transition">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {busy ? <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" /> : <Upload className="w-6 h-6 mx-auto text-primary" />}
            <p className="mt-2 text-sm font-medium">Choose a CSV file</p>
            <p className="text-xs text-muted-foreground">Up to 2MB. Lines starting with # are skipped.</p>
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              <span>{fileName} · {dataRows.length} data row{dataRows.length === 1 ? "" : "s"}</span>
              <label className="ml-auto flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                First row is header
              </label>
              <button onClick={reset} className="underline hover:text-foreground ml-2">Change file</button>
            </div>

            <div className="border border-border rounded-md overflow-x-auto max-h-72">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    {mapping.map((cat, i) => (
                      <th key={i} className="p-2 min-w-[150px]">
                        <Select value={cat} onValueChange={(v) => {
                          const next = mapping.slice(); next[i] = v as Category; setMapping(next);
                        }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ignore">Ignore</SelectItem>
                            <SelectItem value="native">Native</SelectItem>
                            <SelectItem value="third_party">Third-party</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        {hasHeader && (
                          <div className="mt-1 text-[10px] text-muted-foreground truncate normal-case">
                            {rows[0][i] ?? `Col ${i + 1}`}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 5).map((r, ri) => (
                    <tr key={ri} className="border-t border-border/40">
                      {mapping.map((_, ci) => (
                        <td key={ci} className="p-2 text-muted-foreground truncate max-w-[200px]">{r[ci] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {dataRows.length > 5 && (
                <div className="p-2 text-[10px] text-muted-foreground text-center border-t border-border/40">
                  Preview shows first 5 rows · {dataRows.length - 5} more
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-2 text-xs">
              <PreviewBox label="Native to add" items={preview.native} />
              <PreviewBox label="Third-party to add" items={preview.third} />
              <PreviewBox label="Custom to add" items={preview.custom} />
            </div>
            {preview.unknown.length > 0 && (
              <div className="text-[10px] text-amber-500/90">
                Skipped {preview.unknown.length} unknown name{preview.unknown.length === 1 ? "" : "s"}: {preview.unknown.slice(0, 5).join(", ")}{preview.unknown.length > 5 ? "…" : ""}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button onClick={apply} disabled={!rows || totalAdds === 0} className="bg-gradient-gold text-primary-foreground">
            Stage {totalAdds} import{totalAdds === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBox({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="border border-border rounded p-2 bg-muted/20">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label} ({items.length})</div>
      {items.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/60">—</p>
      ) : (
        <ul className="text-[11px] space-y-0.5 max-h-20 overflow-y-auto">
          {items.slice(0, 10).map((i) => <li key={i} className="truncate">· {i}</li>)}
          {items.length > 10 && <li className="text-muted-foreground/60">+{items.length - 10} more</li>}
        </ul>
      )}
    </div>
  );
}
