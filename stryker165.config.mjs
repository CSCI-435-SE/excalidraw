// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "yarn",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.mts",
    related: true,
  },
  coverageAnalysis: "perTest",
  testFiles: ["packages/excalidraw/tests/pagePersistence.test.tsx"],
  reporters: ["progress", "clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  mutate: [
    "packages/excalidraw/actions/actionExport.tsx:199-248",
    "packages/excalidraw/actions/actionExport.tsx:434-434",
    "packages/excalidraw/actions/types.ts:32-32",
    "packages/excalidraw/appState.ts:314-315",
    "packages/excalidraw/components/App.tsx:2764-2770",
    "packages/excalidraw/components/App.tsx:3327-3388",
    "packages/excalidraw/components/App.tsx:3638-3638",
    "packages/excalidraw/components/App.tsx:4334-4340",
    "packages/excalidraw/components/App.tsx:14050-14050",
    "packages/excalidraw/components/App.tsx:14206-14206",
    "packages/excalidraw/data/json.ts:59-81",
    "packages/excalidraw/data/restore.ts:1272-1276",
    "packages/excalidraw/types.ts:66-66",
    "packages/excalidraw/types.ts:351-353",
    "packages/excalidraw/types.ts:1060-1060",
  ],
  concurrency: 2,
  timeoutMS: 60000,
};
export default config;
