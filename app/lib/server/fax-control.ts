import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { supabaseRestRequest } from "./supabase-rest";

export type FaxStats = {
  enabled: boolean;
  mode: "server" | "nexlink";
  document: number;
  template: number;
  failed: number;
  updatedAt: string | null;
};

const filePath = path.join(process.cwd(), "data", "fax-control.json");
const defaults: FaxStats = { enabled: true, mode: "server", document: 0, template: 0, failed: 0, updatedAt: null };

type FaxControlRow = {
  id: string;
  enabled: boolean;
  mode: "server" | "nexlink";
  document: number;
  template: number;
  failed: number;
  updated_at: string | null;
};

const hasSupabase = () => Boolean(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
);

async function readSupabaseFaxStats(): Promise<FaxStats | null> {
  if (!hasSupabase()) return null;
  const rows = await supabaseRestRequest<FaxControlRow[]>("/fax_control?id=eq.singleton&select=*");
  const row = rows[0];
  return row
    ? { enabled: row.enabled, mode: row.mode, document: row.document, template: row.template, failed: row.failed, updatedAt: row.updated_at }
    : null;
}

export async function readFaxStats(): Promise<FaxStats> {
  try {
    const stats = await readSupabaseFaxStats();
    if (stats) return stats;
  } catch {
    // Local development can continue using the JSON store when Supabase is unavailable.
  }
  try {
    return { ...defaults, ...(JSON.parse(await readFile(filePath, "utf8")) as Partial<FaxStats>) };
  } catch {
    return defaults;
  }
}

async function writeFaxStats(stats: FaxStats) {
  if (hasSupabase()) {
    await supabaseRestRequest("/fax_control", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        id: "singleton",
        enabled: stats.enabled,
        mode: stats.mode,
        document: stats.document,
        template: stats.template,
        failed: stats.failed,
        updated_at: stats.updatedAt,
      }),
    });
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
}

export async function setFaxEnabled(enabled: boolean) {
  const stats = { ...(await readFaxStats()), enabled, updatedAt: new Date().toISOString() };
  await writeFaxStats(stats);
  return stats;
}

export async function setFaxMode(mode: "server" | "nexlink") {
  const stats = { ...(await readFaxStats()), mode, updatedAt: new Date().toISOString() };
  await writeFaxStats(stats);
  return stats;
}

export async function recordFaxResult(kind: "document" | "template", success: boolean) {
  const stats = await readFaxStats();
  if (success) stats[kind] += 1;
  else stats.failed += 1;
  stats.updatedAt = new Date().toISOString();
  await writeFaxStats(stats);
}
