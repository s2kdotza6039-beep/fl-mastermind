import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileText, Download, ClipboardList } from "lucide-react";
import { parseCsv } from "@/lib/csv-utils";
import { NATIVE_PLUGINS, THIRD_PARTY_BRANDS } from "@/lib/plugin-inventory-constants";
import { toast } from "sonner";

type Category = "ignore" | "native" | "third_party" | "custom";
type RowStatus = "added" | "skipped" | "duplicate" | "invalid";
interface RowReportEntry {
  row: number;
  column: string;
  category: Category;
  value: string;
  status: RowStatus;
  reason: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  existing: { native: string[]; third: string[]; custom: string[] };
  onApply: (
    additions: { native: string[]; third: string[]; custom: string[] },
    stats?: { source: string | null; rows: number; added: number; skipped: number; duplicate: number; invalid: number },
  ) => void;
}

const ciIncludes = (list: readonly string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
const matchCanonical = (catalog: readonly string[], v: string) => catalog.find((c) => c.toLowerCase() === v.toLowerCase());

const TEMPLATE_CSV = [
  "# Studio Sensei — Plugin Inventory Import Template",
  "# Fill in any column. Native and Third-party values must match Sensei's catalog (case-insensitive).",
  "# Custom accepts any plugin name (max 60 chars). Leave cells blank to skip.",
  "Native,Third-party,Custom",
  "Fruity Limiter,FabFilter,Serum",
  "Fruity Parametric EQ 2,Valhalla,Vital",
  "Maximus,iZotope,Kontakt 7",
  "",
].join("\n");

export function PluginInventoryImportDialog({ open, onClose, existing, onApply }: Props) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportFilter, setReportFilter] = useState<"all" | RowStatus>("all");

  const reset = () => {
    setRows(null); setFileName(null); setMapping([]); setHasHeader(true); setShowReport(false); setReportFilter("all");
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plugin-inventory-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded — fill it in and upload here.");
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

  // Build the per-row import report and the deduped additions side-by-side.
  const { preview, report } = useMemo(() => {
    const native: string[] = [], third: string[] = [], custom: string[] = [];
    const report: RowReportEntry[] = [];
    if (!rows) return { preview: { native, third, custom }, report };
    const headerRow = hasHeader ? rows[0] : null;
    const baseRowNum = hasHeader ? 2 : 1;

    dataRows.forEach((r, ri) => {
      const rowNumber = baseRowNum + ri;
      mapping.forEach((cat, colIdx) => {
        if (cat === "ignore") return;
        const raw = (r[colIdx] ?? "").trim().replace(/\s+/g, " ");
        const column = headerRow?.[colIdx]?.trim() || `Col ${colIdx + 1}`;
        if (!raw) return; // blank cells are silently skipped

        const baseEntry = { row: rowNumber, column, category: cat, value: raw };

        if (cat === "native") {
          const canon = matchCanonical(NATIVE_PLUGINS, raw);
          if (!canon) {
            report.push({ ...baseEntry, status: "invalid", reason: `Not found in Sensei's native plugin catalog.` });
            return;
          }
          if (ciIncludes(existing.native, canon)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already in your saved native inventory.` });
            return;
          }
          if (ciIncludes(native, canon)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already staged from an earlier row in this import.` });
            return;
          }
          native.push(canon);
          report.push({ ...baseEntry, value: canon, status: "added", reason: `Matched canonical "${canon}".` });
        } else if (cat === "third_party") {
          const canon = matchCanonical(THIRD_PARTY_BRANDS, raw);
          if (!canon) {
            report.push({ ...baseEntry, status: "invalid", reason: `Not in Sensei's third-party brand catalog.` });
            return;
          }
          if (ciIncludes(existing.third, canon)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already in your saved third-party brands.` });
            return;
          }
          if (ciIncludes(third, canon)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already staged from an earlier row.` });
            return;
          }
          third.push(canon);
          report.push({ ...baseEntry, value: canon, status: "added", reason: `Matched canonical "${canon}".` });
        } else {
          // custom
          if (raw.length > 60) {
            report.push({ ...baseEntry, status: "invalid", reason: `Name exceeds 60-character limit.` });
            return;
          }
          if (ciIncludes(existing.custom, raw)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already in your saved custom plugins.` });
            return;
          }
          if (ciIncludes(existing.native, raw) || ciIncludes(existing.third, raw)) {
            report.push({ ...baseEntry, status: "skipped", reason: `Conflicts with a native/third-party entry you already have.` });
            return;
          }
          if (ciIncludes(custom, raw)) {
            report.push({ ...baseEntry, status: "duplicate", reason: `Already staged from an earlier row.` });
            return;
          }
          custom.push(raw);
          report.push({ ...baseEntry, status: "added", reason: `Custom name accepted as-is.` });
        }
      });
    });

    return { preview: { native, third, custom }, report };
  }, [rows, dataRows, hasHeader, mapping, existing]);

  const totalAdds = preview.native.length + preview.third.length + preview.custom.length;
  const counts = useMemo(() => {
    const c = { added: 0, skipped: 0, duplicate: 0, invalid: 0 };
    report.forEach((r) => { c[r.status]++; });
    return c;
  }, [report]);

  const filteredReport = useMemo(
    () => (reportFilter === "all" ? report : report.filter((r) => r.status === reportFilter)),
    [report, reportFilter],
  );

  const downloadReport = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = "Row,Column,Category,Value,Status,Reason\n";
    const body = report.map((r) => [r.row, esc(r.column), r.category, esc(r.value), r.status, esc(r.reason)].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plugin-inventory-import-report-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const apply = () => {
    if (totalAdds === 0) return toast.error("Nothing new to import — adjust column mapping.");
    onApply({ native: preview.native, third: preview.third, custom: preview.custom });
    toast.success(`Staged ${totalAdds} plugin${totalAdds === 1 ? "" : "s"} from ${fileName}. Click Save Inventory to persist.`);
    reset();
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  const statusColor: Record<RowStatus, string> = {
    added: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    skipped: "bg-muted text-muted-foreground border-border",
    duplicate: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    invalid: "bg-destructive/15 text-destructive border-destructive/30",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import plugin inventory from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV, map each column to Native, Third-party, Custom, or Ignore, then review the per-row import report before staging.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
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
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Not sure what columns to use?</span>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV template
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <FileText className="w-3.5 h-3.5" />
              <span>{fileName} · {dataRows.length} data row{dataRows.length === 1 ? "" : "s"}</span>
              <label className="ml-auto flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                First row is header
              </label>
              <button onClick={reset} className="underline hover:text-foreground ml-2">Change file</button>
            </div>

            <div className="border border-border rounded-md overflow-x-auto max-h-60">
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

            {/* Import report */}
            <div className="border border-border rounded-md">
              <button
                type="button"
                onClick={() => setShowReport((v) => !v)}
                className="w-full flex items-center gap-2 p-2 text-xs font-medium hover:bg-muted/40 transition"
                aria-expanded={showReport}
              >
                <ClipboardList className="w-3.5 h-3.5 text-primary" />
                <span>Import report</span>
                <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${statusColor.added}`}>added {counts.added}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${statusColor.duplicate}`}>duplicate {counts.duplicate}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${statusColor.skipped}`}>skipped {counts.skipped}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${statusColor.invalid}`}>invalid {counts.invalid}</Badge>
                </div>
              </button>
              {showReport && (
                <div className="border-t border-border/60">
                  <div className="flex items-center gap-2 p-2 text-[10px] flex-wrap">
                    {(["all", "added", "duplicate", "skipped", "invalid"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setReportFilter(f)}
                        className={`px-2 py-0.5 rounded border ${reportFilter === f ? "bg-primary/15 text-primary border-primary/40" : "border-border text-muted-foreground hover:text-foreground"}`}
                      >
                        {f}
                      </button>
                    ))}
                    <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]" onClick={downloadReport} disabled={report.length === 0}>
                      <Download className="w-3 h-3 mr-1" /> Export report
                    </Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/30 sticky top-0">
                        <tr className="text-left">
                          <th className="p-1.5 font-medium">Row</th>
                          <th className="p-1.5 font-medium">Column</th>
                          <th className="p-1.5 font-medium">Value</th>
                          <th className="p-1.5 font-medium">Status</th>
                          <th className="p-1.5 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReport.length === 0 ? (
                          <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">No rows match this filter.</td></tr>
                        ) : (
                          filteredReport.map((r, i) => (
                            <tr key={i} className="border-t border-border/40">
                              <td className="p-1.5 font-mono">{r.row}</td>
                              <td className="p-1.5 truncate max-w-[120px]" title={r.column}>{r.column}</td>
                              <td className="p-1.5 truncate max-w-[160px]" title={r.value}>{r.value}</td>
                              <td className="p-1.5">
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] ${statusColor[r.status]}`}>{r.status}</span>
                              </td>
                              <td className="p-1.5 text-muted-foreground">{r.reason}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
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
