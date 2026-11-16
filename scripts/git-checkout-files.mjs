import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

async function main() {
  const targetCommit = process.argv[2];
  if (!targetCommit) {
    console.log("用法: node scripts/git-checkout-files.mjs <commit-hash> [file1 file2 ...]");
    process.exit(1);
  }

  const files = process.argv.slice(3);
  if (files.length === 0) {
    console.log("请指定要恢复的文件列表。");
    process.exit(1);
  }

  // 解析 commit hash
  let commitOid = targetCommit;
  try {
    commitOid = await git.resolveRef({ fs, dir, ref: targetCommit });
  } catch {
    try {
      const all = await git.log({ fs, dir, depth: 200 });
      const match = all.find((c) => c.oid.startsWith(targetCommit));
      if (match) commitOid = match.oid;
      else throw new Error("找不到该 commit");
    } catch (e) {
      console.error(`无法解析 ${targetCommit}: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`=== 从 commit ${commitOid.slice(0, 8)} 恢复 ${files.length} 个文件 ===`);

  // 获取 commit 对象拿到 tree
  const commit = await git.readCommit({ fs, dir, oid: commitOid });
  const treeOid = commit.commit.tree;

  // 构建文件路径 -> blob oid 映射
  const fileMap = {};
  await git.walk({
    fs,
    dir,
    trees: [treeOid],
    map: async (filepath, [entry]) => {
      if (filepath && !filepath.endsWith("/")) {
        fileMap[filepath] = entry.oid;
      }
    }
  });

  for (const filepath of files) {
    try {
      const blobOid = fileMap[filepath];
      if (!blobOid) {
        console.log(`  ❌ ${filepath}: 在该 commit 中不存在`);
        continue;
      }
      const blob = await git.readBlob({ fs, dir, oid: blobOid });
      const content = new TextDecoder().decode(blob.blob);
      const fullPath = path.join(dir, filepath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
      console.log(`  ✅ ${filepath}`);
    } catch (err) {
      console.log(`  ❌ ${filepath}: ${err.message}`);
    }
  }
  console.log("\n完成。");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
