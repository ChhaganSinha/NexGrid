import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "..", "test");

const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith(".test.mjs") || f.endsWith(".test.js"))
  .map((f) => path.join(testDir, f));

if (testFiles.length === 0) {
  console.warn("No test files found in", testDir);
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit",
});

process.exit(result.status ?? (result.error ? 1 : 0));
