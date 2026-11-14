import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);

const forbiddenFiles = tracked.filter(
  (file) => /(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example"
);
const patterns = [
  /\bsk-[A-Za-z0-9_-]{24,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g
];
const findings = [];

for (const file of tracked) {
  if (
    file === "package-lock.json" ||
    /\.(png|jpe?g|gif|gz|wasm)$/i.test(file)
  ) {
    continue;
  }
  let content = "";
  try {
    content = await readFile(join(root, file), "utf8");
  } catch {
    continue;
  }
  if (patterns.some((pattern) => pattern.test(content))) {
    findings.push(file);
  }
}

if (forbiddenFiles.length || findings.length) {
  console.error("Secret safety check failed.");
  if (forbiddenFiles.length) {
    console.error(`Tracked environment files: ${forbiddenFiles.join(", ")}`);
  }
  if (findings.length) {
    console.error(`Possible secrets found in: ${findings.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Secret safety check passed for ${tracked.length} tracked files.`);
