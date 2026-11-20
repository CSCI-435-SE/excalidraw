// @ts-check
import base from "./stryker.config.mjs";

/**
 * Mutation testing for issue #82 (collaborator layering), built on
 * NotaThomas's #159 setup (`stryker.config.mjs`).
 * Run with: yarn test:mutation stryker.82.config.mjs
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  ...base,
  vitest: { ...base.vitest, configFile: "vitest.stryker.82.config.mts" },
  mutate: [
    "packages/element/src/ownership.ts",
    "packages/excalidraw/scene/visibility.ts",
  ],
  htmlReporter: { fileName: "reports/mutation/82/mutation.html" },
  jsonReporter: { fileName: "reports/mutation/82/mutation.json" },
};
