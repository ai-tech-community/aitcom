import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "workers/**/*.test.ts"],
    exclude: ["challenge-build-mcp-tool/**"],
    setupFiles: ["./src/test/setup.ts"],
    // DB integration tests share one test database, and some passes (the
    // magazine auto-draft sweep) read every row in it, so files that write
    // to it must not run side by side. Normal runs stay parallel.
    fileParallelism: process.env.RUN_DB_TESTS !== "1",
  },
});
