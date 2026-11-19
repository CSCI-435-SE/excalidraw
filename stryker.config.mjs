// @ts-check
/**
 * Mutation testing for issue #159 (page clearing).
 * Run with: yarn test:mutation
 *
 * `mutate` lists only the lines changed for the issue, so the (very large)
 * files they live in are not mutated as a whole.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: "yarn",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.stryker.config.mts",
    // every test file in the config above should run for the dry run;
    // per-test coverage then picks the tests to run for each mutant
    related: false,
  },
  coverageAnalysis: "perTest",
  mutate: [
    "packages/excalidraw/actions/actionCanvas.tsx:96-101",
    "packages/excalidraw/actions/actionCanvas.tsx:126-126",
    "packages/excalidraw/appState.ts:102-102",
    "packages/excalidraw/appState.ts:255-255",
    "packages/excalidraw/components/ActiveConfirmDialog.tsx:15-49",
    "packages/excalidraw/components/App.tsx:2407-2413",
    "packages/excalidraw/components/App.tsx:2775-2852",
    "packages/excalidraw/components/ConfirmDialog.tsx:20-76",
    "packages/excalidraw/components/DefaultSidebar.tsx:92-96",
    "packages/excalidraw/components/LayerUI.tsx:483-496",
    "packages/excalidraw/components/Pages.tsx:129-302",
  ],
  // keep the sandbox copy small: docs, logs and build output aren't needed
  ignorePatterns: [
    "/docs",
    "/ai-logs",
    "/.specstory",
    "/examples",
    "**/dist",
    "**/build",
    "/coverage",
    "/reports",
  ],
  reporters: ["progress", "clear-text", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  concurrency: 6,
  timeoutMS: 30000,
  tempDirName: ".stryker-tmp",
};
