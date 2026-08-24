// Ship the shared stylesheet inside this package's dist so script-tag and
// ASP.NET consumers get JS + CSS from one place.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "core", "styles", "nexgrid.css");
const dest = join(here, "..", "dist", "nexgrid.css");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);
