// @ts-check
import { execSync } from "node:child_process";

import base from "./stryker.config.mjs";

/**
 * Mutation testing for issue #158 (page deletion), built on NotaThomas's #159
 * setup (`stryker.config.mjs`).
 * Run with: yarn test:mutation stryker.158.config.mjs
 */

// source files changed by #158
const FILES = [
  "packages/excalidraw/pages.ts",
  "packages/excalidraw/components/App.tsx",
  "packages/excalidraw/components/LayerUI.tsx",
  "packages/excalidraw/components/Pages.tsx",
  "packages/excalidraw/components/PageDeleteDialog.tsx",
  "packages/excalidraw/components/PageRangeSelect.tsx",
];

// mutate only the lines #158 added or changed, taken from git so the ranges
// stay right if the code moves; compares the working tree to where the branch
// left master
const forkPoint = execSync("git merge-base origin/master HEAD")
  .toString()
  .trim();
const mutate = FILES.flatMap((file) =>
  execSync(`git diff -U0 ${forkPoint} -- ${file}`)
    .toString()
    .split("\n")
    .flatMap((line) => {
      const match = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
      const count = match ? Number(match[2] ?? 1) : 0;
      const start = match ? Number(match[1]) : 0;
      return count ? [`${file}:${start}-${start + count - 1}`] : [];
    }),
);

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate,
  vitest: { ...base.vitest, configFile: "vitest.stryker.158.config.mts" },
  // speed: module-level (static) mutants rerun every test, so skip them;
  // the after-run reuses the before-run's results for unchanged code/tests
  ignoreStatic: true,
  incremental: true,
  incrementalFile: "reports/mutation/158-incremental.json",
  concurrency: 8,
  htmlReporter: { fileName: "reports/mutation/158-mutation.html" },
  jsonReporter: { fileName: "reports/mutation/158-mutation.json" },
};
