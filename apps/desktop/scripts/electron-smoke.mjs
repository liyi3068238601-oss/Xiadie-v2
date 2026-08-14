import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainBundlePath = join(appRoot, "out", "main", "index.js");
const mainBundle = await readFile(mainBundlePath, "utf8");
const unresolvedOptionalPeer = mainBundle.match(
  /Could not resolve "(?:bufferutil|utf-8-validate)" imported by "ws"/,
);
if (unresolvedOptionalPeer) {
  process.stderr.write(`desktop_smoke_failed unresolved_optional_peer=${unresolvedOptionalPeer[0]}\n`);
  process.exit(1);
}
const child = spawn(electronPath, [mainBundlePath], {
  cwd: appRoot,
  env: { ...process.env, XIADIE_DESKTOP_SMOKE: "1" },
  windowsHide: true,
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
const timeout = setTimeout(() => { child.kill(); }, 30_000);
const exitCode = await new Promise((resolve) => child.once("exit", (code) => resolve(code)));
clearTimeout(timeout);
const markers = stdout.match(/XIADIE_DESKTOP_SMOKE_READY/g) ?? [];
if (exitCode !== 0 || markers.length !== 1 || /uncaught exception/i.test(stderr)) {
  process.stderr.write(`desktop_smoke_failed code=${String(exitCode)} markers=${markers.length}\n${stderr}`);
  process.exit(1);
}
process.stdout.write("XIADIE_DESKTOP_SMOKE_READY\n");
