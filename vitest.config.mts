import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["src/test/load-env.ts"],
    // Integration test files share one hosted database and one of them writes to it briefly,
    // so files run one at a time; the unit suite is small enough not to notice.
    fileParallelism: false,
    // Integration tests round-trip to the hosted project.
    testTimeout: 20_000,
  },
});
