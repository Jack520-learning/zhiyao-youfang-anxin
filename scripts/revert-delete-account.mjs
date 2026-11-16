import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

const targetOid = "ad7895d885acb8020d8e74bf131e4c22b61897c8";

console.log("dir:", dir);
console.log("exists:", fs.existsSync(path.join(dir, ".git")));

const commit = await git.readObject({ fs, dir, oid: targetOid });
console.log("commit message:", commit.object.message.slice(0, 60));
console.log("tree oid:", commit.object.tree);

function listTree(treeOid, prefix = "", depth = 0) {
  return git.readObject({ fs, dir, oid: treeOid }).then((tree) => {
    for (const entry of tree.object) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (depth < 1 && entry.type === "tree") {
        console.log(`  ${fullPath}/`);
        listTree(entry.oid, fullPath, depth + 1);
      } else if (fullPath.includes("server") || fullPath.includes("useAppStore")) {
        console.log(`  ${fullPath} (${entry.type})`);
      }
    }
  });
}

await listTree(commit.object.tree);
