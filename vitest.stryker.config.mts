import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config.mts";

// Test files that exercise the code mutated by `stryker.config.mjs`
// (issue #159: page clearing mode, clear canvas options, page navigation).
// Keeping this list focused keeps mutation runs fast and avoids unrelated
// flaky suites failing Stryker's initial test run.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "packages/excalidraw/tests/pages.test.tsx",
        "packages/excalidraw/tests/shortcuts.test.tsx",
        "packages/excalidraw/tests/excalidraw.test.tsx",
        "packages/excalidraw/tests/search.test.tsx",
        "packages/excalidraw/components/DefaultSidebar.test.tsx",
      ],
    },
  }),
);
