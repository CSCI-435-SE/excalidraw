import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config.mts";

// Test files that exercise the code mutated by `stryker.82.config.mjs`
// (issue #82: collaborator layering), plus the #116, #81 and #84 tests that
// cover the same two files.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        "packages/element/src/__tests__/ownership.test.ts",
        "packages/element/src/__tests__/ownershipLock.test.ts",
        "packages/element/src/__tests__/ownershipLayer.test.ts",
        "packages/element/src/__tests__/coOwnership.test.ts",
        "packages/excalidraw/tests/collaboratorVisibility.test.tsx",
        "packages/excalidraw/tests/collaboratorLock.test.tsx",
        "packages/excalidraw/tests/collaboratorLayer.test.tsx",
        "packages/excalidraw/tests/coOwnership.test.tsx",
        "excalidraw-app/tests/collabVisibility.test.tsx",
        "excalidraw-app/tests/collabLayer.test.tsx",
        "excalidraw-app/tests/visibleExports.test.tsx",
      ],
    },
  }),
);
