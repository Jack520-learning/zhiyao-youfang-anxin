import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

const commits = await git.log({ fs, dir, depth: 100 });

console.log(`=== 提交历史记录（共 ${commits.length} 条）===\n`);

for (let i = 0; i < commits.length; i++) {
  const c = commits[i];
  const date = new Date(c.commit.author.timestamp * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const firstLine = c.commit.message.trim().split("\n")[0];
  const marker = i === 0 ? "← HEAD (最新)" : "";
  console.log(`  ${String(i + 1).padStart(3)}. ${c.oid.slice(0, 8)}  ${date}  ${firstLine}  ${marker}`);
}
