// Ship the shared stylesheet inside the built package so Angular consumers can
// add "node_modules/@nexgrid/angular/styles.css" to their styles array or
// `import "@nexgrid/angular/styles.css"`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "core", "styles", "nexgrid.css");
const dest = join(here, "..", "dist", "styles.css");
const distPkgPath = join(here, "..", "dist", "package.json");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);

if (existsSync(distPkgPath)) {
  const pkg = JSON.parse(readFileSync(distPkgPath, "utf8"));
  pkg.exports = pkg.exports || {};
  pkg.exports["./styles.css"] = "./styles.css";
  writeFileSync(distPkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Updated ${distPkgPath} exports with ./styles.css`);
}

