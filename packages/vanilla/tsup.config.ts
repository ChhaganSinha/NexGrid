import { defineConfig } from "tsup";

export default defineConfig([
  // Library build: core stays external (it is a real dependency).
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2020",
    treeshake: true,
  },
  // Browser bundle for script-tag / ASP.NET usage: core inlined, global `TableX`.
  {
    entry: { tablex: "src/index.ts" },
    format: ["iife"],
    globalName: "TableX",
    minify: true,
    sourcemap: true,
    target: "es2018",
    noExternal: [/@nexgrid\/core/],
  },
]);
