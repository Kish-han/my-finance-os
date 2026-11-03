import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Normalize root to uppercase drive letter on Windows to prevent
    // module deduplication failures with Vitest v5 on case-sensitive paths.
    root: fileURLToPath(new URL("./", import.meta.url)),
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
