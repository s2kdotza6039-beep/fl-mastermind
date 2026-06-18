// Minimal RFC4180-ish CSV parser — handles quoted fields, escaped quotes,
// commas inside quotes, and CRLF line endings. Skips lines starting with `#`.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => {
    if (row.length || cell) { pushCell(); rows.push(row); row = []; }
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { pushCell(); i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { pushRow(); i++; continue; }
    cell += c; i++;
  }
  if (cell || row.length) pushRow();
  // Drop comment lines (starting with #) and fully empty rows
  return rows.filter((r) => !(r.length === 1 && r[0].trim().startsWith("#")) && !r.every((v) => !v.trim()));
}
