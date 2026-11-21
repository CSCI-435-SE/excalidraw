// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: "yarn",
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.mts",
    related: true,
  },
  testFiles: ["packages/element/tests/imageFilter.test.tsx"],
  reporters: ["progress", "clear-text", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  mutate: [
    "packages/element/src/imageFilters.ts",
    "packages/element/src/renderElement.ts",
    "packages/element/src/types.ts",
  ],
  concurrency: 2,
};
export default config;
