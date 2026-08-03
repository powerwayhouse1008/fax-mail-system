import fs from "fs";
import path from "path";

const root = process.cwd();
const tracePath = path.join(
  root,
  ".next",
  "server",
  "app",
  "api",
  "fax",
  "send",
  "route.js.nft.json",
);
const chromiumRoot = path.join(root, "node_modules", "@sparticuz", "chromium");
const includeDirs = [path.join(chromiumRoot, "bin"), path.join(chromiumRoot, "build")];

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};

if (fs.existsSync(tracePath)) {
  const trace = JSON.parse(fs.readFileSync(tracePath, "utf8"));
  const traceDir = path.dirname(tracePath);
  const files = new Set(trace.files || []);

  for (const directory of includeDirs) {
    for (const file of walk(directory)) {
      files.add(path.relative(traceDir, file).replace(/\\/g, "/"));
    }
  }

  trace.files = Array.from(files).sort();
  fs.writeFileSync(tracePath, `${JSON.stringify(trace)}\n`);
  console.log(
    `[patch-next-trace] included ${trace.files.filter((file) => file.includes("@sparticuz/chromium")).length} @sparticuz/chromium files`,
  );
}
