import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  // The TableX packages are installed with `file:` specifiers, so they live
  // OUTSIDE this app's folder (npm symlinks them from ../../packages). Pointing
  // the tracing root at the repository root lets Next follow those links when
  // it works out which files a build needs, and silences the "inferred your
  // workspace root" warning.
  //
  // Delete this once you install `@nexgrid/react` from a registry — a normal
  // Next.js app needs no configuration at all to use TableX.
  outputFileTracingRoot: join(here, "..", ".."),
};

export default nextConfig;
