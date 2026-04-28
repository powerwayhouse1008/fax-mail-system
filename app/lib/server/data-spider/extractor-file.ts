import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractFromText } from "./extractor";

const execFileAsync = promisify(execFile);

const readTextByStrings = async (buffer: Buffer, filename: string) => {
  const workDir = await mkdtemp(join(tmpdir(), "spider-file-"));
  const filePath = join(workDir, filename.replace(/[^a-zA-Z0-9._-]/g, "-"));

  try {
    await writeFile(filePath, buffer);
    const { stdout } = await execFileAsync("strings", ["-n", "6", filePath], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const isSupported = (name: string) => /\.(pdf|xls|xlsx|doc|docx)$/i.test(name);

export async function extractFromFile(file: File) {
  if (!isSupported(file.name)) {
    throw new Error("Chỉ hỗ trợ file PDF, Excel (.xls/.xlsx), Word (.doc/.docx).");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let content = "";

  try {
    content = await readTextByStrings(buffer, file.name);
  } catch {
    content = buffer.toString("utf8");
  }

  if (!content.trim()) {
    throw new Error("Không đọc được nội dung từ file đã chọn.");
  }

  return extractFromText(content, {
    source: `file://${file.name}`,
    title: file.name,
    links: [],
  });
}
