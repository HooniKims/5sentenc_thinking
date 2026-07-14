import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase",
              test: /node_modules[\\/]\.pnpm[\\/](?:@firebase\+|firebase@|re2js@)/,
              entriesAware: true,
              entriesAwareMergeThreshold: 32 * 1024,
              includeDependenciesRecursively: false,
              maxSize: 450 * 1024
            },
            {
              name: "three",
              test: /node_modules[\\/]\.pnpm(?:[\\/]three@|[\\/]@react-three\+|[\\/]three-stdlib@)/,
              entriesAware: true,
              entriesAwareMergeThreshold: 32 * 1024,
              includeDependenciesRecursively: false,
              maxSize: 450 * 1024
            }
          ]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"]
  }
});
