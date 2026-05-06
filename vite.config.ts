/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Use VITE_BASE=/your-repo-name/ for GitHub Pages project sites; "/" for user sites & Electron
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react") || id.includes("/scheduler/")) return "react";
          if (id.includes("zod")) return "schema";
          if (id.includes("@tanstack")) return "virtual";
          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
