import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config.mts";

// Test files that exercise the code mutated by `stryker.158.config.mjs`
// (issue #158: page deletion, deleting mode, page range selection).
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "packages/excalidraw/tests/pages.test.tsx",
        // unit tests for deletePages / parsePageRange; without them those
        // helpers' mutants would be falsely reported as survivors
        "packages/excalidraw/pages.test.ts",
      ],
    },
  }),
);
