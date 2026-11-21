# Mutation testing: Issue #62 -- Implement Image Filter Transformations

**PR(s):** [#172](https://github.com/CSCI-435-SE/excalidraw/pull/172) **Tool:** StrykerJS **Config:** [stryker.config.mjs](../../../stryker.config.mjs) **Command:** `yarn test:mutation` **Reports:** [before](reports/62-tristanraab-before.json) · [after](reports/62-tristanraab-after.json) **Mutation score:** before 46.14% → after 46.37%

## Surviving mutants

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
| --- | --- | --- | --- |
| `packages/element/src/imageFilters.ts:89` | `isImageFilterType` guard → `true` | Test gap | Unknown filter types should be rejected. No test asserts that an unknown type is ignored instead of reaching filter construction. |
| `packages/element/src/imageFilters.ts:96` | finite-number guard → `true` | Equivalent | The existing restore test supplies the string `"x"` and an invalid numeric value; `clamp` still rejects/coerces invalid values to the default in both branches for these inputs. |
| `packages/element/src/imageFilters.ts:127` | `Array.isArray(filters)` guard → `false` | Test gap | Before the rerun, no direct test supplied `null` or an object. The new test kills this mutant by requiring non-array input to normalize to `[]`. |
| `packages/element/src/imageFilters.ts:133` | filter truthy guard → `true` | Test gap | Primitive values should not be treated as filter objects. The existing tests do not directly exercise a primitive in `normalizeImageFilters`. |
| `packages/element/src/imageFilters.ts:133` | `filter && typeof filter === "object"` → `filter \|\| typeof filter === "object"` | Test gap | This accepts additional primitive/filter-like values that should be rejected; no test distinguishes the original guard from the mutant. |
| `packages/element/src/imageFilters.ts:134` | object guard → `true` | Equivalent | The following `isImageFilterType` check rejects values with no valid filter `type`, so this mutant has no observable result for existing filter inputs. |
| `packages/element/src/imageFilters.ts:154` | adjustments guard → `false` | Test gap | No direct test passes `null` or a primitive into `normalizeImageAdjustments`; the mutant would attempt to process the invalid value. |
| `packages/element/src/imageFilters.ts:205` | grayscale matrix coefficient expression changed | Test gap | Pixel fallback tests use only a few exact RGB values. The tests do not cover enough representative channels to distinguish this coefficient mutation. |
| `packages/element/src/imageFilters.ts:206` | grayscale matrix coefficient expression changed | Test gap | The mutation changes the blue-channel calculation, but the current assertions do not exercise this coefficient across a sufficiently varied pixel set. |
| `packages/element/src/imageFilters.ts:210` | loop comparison `i <= 3` → `i >= 3` | Equivalent? | The loop runs for only three RGB channels; this mutant's comparison does not change the actual iterated indices in this implementation. |
| `packages/element/src/imageFilters.ts:219-227` | hue/grayscale matrix coefficient signs changed | Test gap | Exact hue and grayscale pixel assertions cover the matrices, but several individual coefficient mutations produce no rounded visible difference for the small test palette. A stronger per-coefficient or reference-matrix test is needed. |
| `packages/element/src/imageFilters.ts:232-255` | hue/saturation matrix coefficients changed | Test gap | The tests cover one hue-rotation result and some rounded values, not enough independently varied RGB inputs to detect every coefficient mutation. |
| `packages/element/src/renderElement.ts:565-571` | image cache strings changed to `""` | Test gap | No test distinguishes the returned cache keys used for filtered image variants. |
| `packages/element/src/renderElement.ts:578-581` | global opacity calculations changed | Test gap | The test suite does not assert image rendering at combined frame and element opacity values where these mutations change the alpha result. |

## New or strengthened test

Commit: [de576276](https://github.com/CSCI-435-SE/excalidraw/commit/de576276b107db7a3115047546470c6314a1d110) · Test: [imageFilter.test.tsx › `defaults non-array filter data to no filters`](/packages/element/tests/imageFilter.test.tsx) · Kills: [imageFilters.ts:127](../../../../packages/element/src/imageFilters.ts#L127)

## Questions

1. What did the surviving mutants reveal about your tests?

   They revealed that most tests covered valid filter application and the known restore examples, but not invalid untrusted data passed directly to normalization helpers. They also showed that pixel-matrix tests were too sparse: changing an individual coefficient can survive on a few rounded RGB examples even when broader requirements are implicit.

2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.

   Not for the new test. The expected value for non-array filter data is derived from the existing requirement that restored/untrusted data is sanitized and unsupported data cannot alter rendering. Several surviving matrix mutants may require exact color values not stated in the issue, so they were not converted into requirements-only assertions.

3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?

   AI assistance was used to create the Stryker configurationt. I verified the test by rerunning Stryker. I also checked the final report directly to confirm killed survivor ids.
