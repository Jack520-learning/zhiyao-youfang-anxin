import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..");

async function main() {
  // Show status
  console.log("=== Git Status ===");
  const status = await git.statusMatrix({ fs, dir });
  const modified = [];
  const deleted = [];
  const added = [];
  const untracked = [];

  for (const [filepath, head, worktree, stage] of status) {
    if (head === 0 && worktree === 0 && stage === 0) {
      // Clean tracked file, skip
      if (head === 0) untracked.push(filepath);
    } else if (head === 0 && stage === 0 && worktree === 2) {
      untracked.push(filepath);
    } else if (head === 1 && worktree === 0 && stage === 0) {
      // unchanged
    } else if (worktree === 0) {
      deleted.push(filepath);
    } else if (head === 0) {
      added.push(filepath);
    } else {
      modified.push(filepath);
    }
  }

  console.log("\n=== Untracked files (new) ===");
  untracked.forEach((f) => console.log(`  + ${f}`));

  console.log("\n=== Modified files ===");
  modified.forEach((f) => console.log(`  M ${f}`));

  console.log("\n=== Deleted files ===");
  deleted.forEach((f) => console.log(`  D ${f}`));

  // Ignore node_modules and dist
  const IGNORE_DIRS = ["node_modules", "dist", ".vite"];
  const allChanges = [...added, ...modified, ...deleted, ...untracked].filter(
    (f) => !IGNORE_DIRS.some((dir) => f.startsWith(dir + "/") || f === dir)
  );

  if (allChanges.length === 0) {
    console.log("\n✅ No changes to commit.");
    return;
  }

  console.log(`\n=== Total changes to stage: ${allChanges.length} files ===`);

  // Stage all files
  for (const filepath of allChanges) {
    try {
      await git.add({ fs, dir, filepath });
    } catch (err) {
      console.log(`  ⚠️ Could not stage ${filepath}: ${err.message}`);
    }
  }

  // Check if config has user info
  let user = {};
  try {
    user = {
      name: (await git.getConfig({ fs, dir, path: "user.name" })) || "Developer",
      email:
        (await git.getConfig({ fs, dir, path: "user.email" })) ||
        "developer@localhost"
    };
  } catch {
    user = { name: "Developer", email: "developer@localhost" };
  }

  // Last commit info
  let lastCommit = null;
  try {
    const commits = await git.log({ fs, dir, depth: 1 });
    if (commits.length > 0) {
      lastCommit = commits[0];
      console.log(`\n=== Last commit ===`);
      console.log(`  Hash: ${lastCommit.oid}`);
      console.log(`  Date: ${lastCommit.commit.author.timestamp}`);
      console.log(`  Message: ${lastCommit.commit.message.trim()}`);
    }
  } catch (err) {
    console.log(`\n  No previous commits: ${err.message}`);
  }

  const commitMessage = process.argv[2] || "feat: improve sidebar drag, speech synthesis, and account persistence";
  console.log(`\n=== New Commit ===`);
  console.log(`  Message: ${commitMessage}`);
  console.log(`  Author: ${user.name} <${user.email}>`);

  const sha = await git.commit({
    fs,
    dir,
    message: commitMessage,
    author: { name: user.name, email: user.email }
  });

  console.log(`\n✅ Commit created: ${sha}`);

  // Show new log
  const newCommits = await git.log({ fs, dir, depth: 3 });
  console.log(`\n=== Recent Log (top 3) ===`);
  for (const c of newCommits) {
    console.log(`  ${c.oid.slice(0, 8)} ${c.commit.message.trim().split("\n")[0]}`);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
