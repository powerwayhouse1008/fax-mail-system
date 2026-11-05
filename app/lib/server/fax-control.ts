import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type FaxStats = {
  enabled: boolean;
  document: number;
  template: number;
  failed: number;
  updatedAt: string | null;
};

const filePath = path.join(process.cwd(), "data", "fax-control.json");
const defaults: FaxStats = { enabled: true, document: 0, template: 0, failed: 0, updatedAt: null };

export async function readFaxStats(): Promise<FaxStats> {
  try {
    return { ...defaults, ...(JSON.parse(await readFile(filePath, "utf8")) as Partial<FaxStats>) };
  } catch {
    return defaults;
  }
}

async function writeFaxStats(stats: FaxStats) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
}

export async function setFaxEnabled(enabled: boolean) {
  const stats = { ...(await readFaxStats()), enabled, updatedAt: new Date().toISOString() };
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
