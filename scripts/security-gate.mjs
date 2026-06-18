#!/usr/bin/env node
// Security gate — fails CI when new high/critical findings appear vs the baseline.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const scanPath = resolve(ROOT, "public/security-scan.json");
const baselinePath = resolve(ROOT, "scripts/security-baseline.json");

if (!existsSync(scanPath)) {
  console.error(`✗ Missing ${scanPath}`);
  process.exit(2);
}

const scan = JSON.parse(readFileSync(scanPath, "utf8"));
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : { allowed: [] };

const HIGH = new Set(["error", "critical", "high"]);
const acceptedStatuses = new Set(["fixed", "accepted", "ignored"]);

const newHighCritical = [];
for (const [scanner, payload] of Object.entries(scan.scanners || {})) {
  for (const f of payload.findings || []) {
    if (!HIGH.has(f.level)) continue;
    if (acceptedStatuses.has(f.status)) continue;
    const key = `${scanner}::${f.id}::${f.target || ""}`;
    const allowed = (baseline.allowed || []).includes(key);
    if (!allowed) newHighCritical.push({ scanner, ...f, key });
  }
}

if (newHighCritical.length > 0) {
  console.error("✗ Security gate failed — new high/critical findings:");
  for (const f of newHighCritical) {
    console.error(`  • [${f.scanner}] ${f.level.toUpperCase()} ${f.name} — ${f.target || "(no target)"}`);
    console.error(`    key: ${f.key}`);
  }
  console.error(
    "\nIf any of these are accepted risks, add their key to scripts/security-baseline.json (allowed array) with justification.",
  );
  process.exit(1);
}

console.log("✓ Security gate passed — no new high/critical findings.");
