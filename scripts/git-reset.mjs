import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.log("用法: node scripts/git-reset.mjs <commit-hash>");
    console.log("执行 soft reset 到指定 commit，保留修改在工作区。");
    process.exit(1);
  }

  // 显示当前 HEAD
  const head = await git.resolveRef({ fs, dir, ref: "HEAD" });
  console.log("=== 当前 HEAD ===");
  console.log(`  ${head}`);

  console.log(`\n=== Soft reset 到 ${target} ===`);
  await git.reset({ fs, dir, ref: target });

  const newHead = await git.resolveRef({ fs, dir, ref: "HEAD" });
  console.log(`  新 HEAD: ${newHead}`);

  // 显示最近几条 log
  const commits = await git.log({ fs, dir, depth: 5 });
  console.log("\n=== Recent Log (top 5) ===");
  for (const c of commits) {
    const marker = c.oid === newHead ? " ← HEAD" : "";
    console.log(`  ${c.oid.slice(0, 8)} ${c.commit.message.trim().split("\n")[0]}${marker}`);
  }

  console.log("\n✅ Soft reset 完成。修改保留在工作区，需要的话可再手动删除。");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
