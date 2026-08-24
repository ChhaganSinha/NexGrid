import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The two NexGrid packages are installed with `file:` specifiers, which npm
// materialises as symlinks into ../../packages. Two consequences worth the
// three lines of config:
//
//  * `dedupe` — a symlinked package resolves `react` relative to its REAL
//    path, so without this a second copy of React can be pulled in and hooks
//    blow up with "Invalid hook call".
//  * `optimizeDeps.exclude` — the linked packages are plain ESM already, and
//    excluding them means an edit + rebuild in packages/react shows up here on
//    the next reload instead of being frozen into the pre-bundle.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["@nexgrid/react", "@nexgrid/core"],
  },
  server: {
    port: 5173,
  },
});
