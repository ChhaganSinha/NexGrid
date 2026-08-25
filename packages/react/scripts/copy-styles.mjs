// Re-export the shared stylesheet at this package's root so consumers can
// `import "@tablex/react/styles.css"` without also installing knowledge of
// the core package layout.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "core", "styles", "tablex.css");
const dest = join(here, "..", "styles.css");

copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);
