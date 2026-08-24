import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
  // NO `treeshake`. tsup implements it as a post-build Rollup pass over the
  // esbuild output, and Rollup strips module-level directives it did not put
  // there — which silently removes the "use client" banner below and breaks
  // every Next.js App Router consumer. The package is already
  // `sideEffects: false`, so the consumer's own bundler shakes it fine.
  external: ["react", "react/jsx-runtime"],
  // Next.js App Router: the whole package is a client component.
  banner: { js: '"use client";' },
});
