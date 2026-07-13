import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const referenceProject = "/Volumes/exDisk/vibecoding project/17. AI_MC";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@ai-mc": resolve(referenceProject, "assets"),
      "@ai-mc-public": resolve(referenceProject, "public")
    }
  },
  server: {
    fs: { allow: [referenceProject] }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"]
  }
});
