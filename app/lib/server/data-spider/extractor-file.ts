import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { extname, join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { extractManyFromTextRows } from "./extractor";

const execFileAsync = promisify(execFile);

const normalizeText = (input: string) =>
  input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

 const normalizeOneLine = (input: string) =>
  input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

 const decodeEntities = (input: string) =>
  input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));

const stripXml = (xml: string) =>
  decodeEntities(xml)
    .replace(/<w:tab\/?\s*>/g, "\t")
    .replace(/<w:br\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/row>/gi, "\n")
    .replace(/\s+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

const readTextByStrings = async (filePath: string) => {
  const variants = [
    ["-n", "2", filePath],
    ["-e", "l", "-n", "2", filePath],
    ["-e", "b", "-n", "2", filePath],
  ];

  const chunks = await Promise.all(
    variants.map(async (args) => {
      try {
        const { stdout } = await execFileAsync("strings", args, { maxBuffer: 16 * 1024 * 1024 });
        return stdout;
      } catch {
        return "";
      }
    }),
  );

  return normalizeText(chunks.join("\n"));
};

const readZipXmlContent = async (filePath: string, ext: string) => {
  const { stdout: listStdout } = await execFileAsync("unzip", ["-Z1", filePath], {
    maxBuffer: 16 * 1024 * 1024,
  });

  const entries = listStdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const xmlEntries =
    ext === ".docx"
      ? entries.filter((entry) => /^word\/(document|header|footer|footnotes|endnotes).*\.xml$/i.test(entry))
      : entries.filter((entry) => /^xl\/(sharedStrings|worksheets\/sheet\d+|workbook).*\.xml$/i.test(entry));

  if (!xmlEntries.length) {
    return "";
  }

  const chunks = await Promise.all(
    xmlEntries.map(async (entry) => {
      try {
        const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], {
          maxBuffer: 16 * 1024 * 1024,
        });
        return stripXml(stdout);
      } catch {
        return "";
      }
    }),
  );

  return normalizeText(chunks.join("\n"));
};

const readTextFromFile = async (filePath: string, ext: string, buffer: Buffer) => {
  if ([".docx", ".xlsx"].includes(ext)) {
    const zipText = await readZipXmlContent(filePath, ext);
    if (zipText) return zipText;
  }

  const stringsText = await readTextByStrings(filePath);
  if (stringsText) return stringsText;

 return normalizeOneLine(buffer.toString("utf8"));
};

const isSupported = (name: string) => /\.(pdf|xls|xlsx|doc|docx)$/i.test(name);

export async function extractFromFile(file: File) {
  if (!isSupported(file.name)) {
    throw new Error("Chỉ hỗ trợ file PDF, Excel (.xls/.xlsx), Word (.doc/.docx).");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workDir = await mkdtemp(join(tmpdir(), "spider-file-"));
  const filePath = join(workDir, file.name.replace(/[^a-zA-Z0-9._-]/g, "-"));

  try {
    await writeFile(filePath, buffer);
    const content = await readTextFromFile(filePath, extname(file.name).toLowerCase(), buffer);

    if (!content.trim()) {
      throw new Error("Không đọc được nội dung từ file đã chọn.");
    }

   return extractManyFromTextRows(content, {
      source: `file://${file.name}`,
      title: file.name,
      links: [],
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
