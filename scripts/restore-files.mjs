import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

const headOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
const headCommit = await git.readObject({ fs, dir, oid: headOid });
const parentOid = headCommit.object.parent[0];
console.log("HEAD =", headOid.slice(0, 10), "parent =", parentOid.slice(0, 10));

const parentCommit = await git.readObject({ fs, dir, oid: parentOid });
const treeOid = parentCommit.object.tree;

const targetFiles = new Set([
  "src/components/ReminderOverlay.tsx",
  "src/pages/HomePage.tsx"
]);

async function walkTree(oid, prefix = "") {
  const tree = await git.readObject({ fs, dir, oid });
  for (const entry of tree.object) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === "tree") {
      await walkTree(entry.oid, fullPath);
    } else if (entry.type === "blob" && targetFiles.has(fullPath)) {
      const blob = await git.readObject({ fs, dir, oid: entry.oid });
      const absPath = path.join(dir, fullPath);
      fs.writeFileSync(absPath, blob.object);
      console.log(`✅ Restored: ${fullPath}`);
    }
  }
}

await walkTree(treeOid);
