import base from "./vitest.config.mts";

export default {
  ...base,
  test: {
    ...base.test,
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
};
