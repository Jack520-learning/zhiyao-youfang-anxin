import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const url = "http://127.0.0.1:8788";
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

function runBuild() {
  const result = spawnSync(npm, ["run", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: isWindows
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function isServerReady() {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(800)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function openBrowser() {
  const command = isWindows
    ? "cmd.exe"
    : process.platform === "darwin"
      ? "open"
      : "xdg-open";
  const args = isWindows ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    cwd: root,
    stdio: "ignore",
    detached: true
  });
  child.on("error", () => {
    console.log(`请在浏览器中打开 ${url}`);
  });
  child.unref();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await isServerReady()) {
      openBrowser();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.warn(`服务启动较慢，请稍后手动打开 ${url}`);
}

if (await isServerReady()) {
  openBrowser();
  process.exit(0);
}

runBuild();

const server = spawn(npm, ["start"], {
  cwd: root,
  stdio: "inherit",
  shell: isWindows
});

void waitForServer();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}

server.on("error", (error) => {
  console.error("无法启动网站服务：", error.message);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exit(code ?? 0);
});
