# Mutation testing: Issue #165 -- Implement Multi-Page Saving and Loading

**PR(s):** [#182](https://github.com/CSCI-435-SE/excalidraw/pull/182) **Tool:** StrykerJS **Config:** [stryker165.config.mjs](../../../stryker165.config.mjs) **Command:** `yarn test:mutation` **Reports:** [before](reports/165-tristanraab-before.json) · [after](reports/165-tristanraab-after.json) **Mutation score:** before 42.39% → after 56.52%

## Surviving mutants

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
| --- | --- | --- | --- |
| `packages/excalidraw/actions/actionExport.tsx:211` | `try/catch`-related conditional changed to `true` | Test gap | Export cancellation and host callback failures are not exercised in the page-persistence test set. |
| `packages/excalidraw/actions/actionExport.tsx:214` | export error log text changed to `""` | Test gap | The test checks saved data, not whether an export callback error reports the original diagnostic text. |
| `packages/excalidraw/actions/actionExport.tsx:220` | catch fallback object changed to `{}` | Test gap | No test drives a thrown export callback and verifies the resolved export payload remains usable. |
| `packages/excalidraw/actions/actionExport.tsx:224` | resolve payload object changed to `{}` | Test gap | The existing save test does not exercise the data promise's failure/catch path or assert the fallback payload. |
| `packages/excalidraw/actions/actionExport.tsx:230` | catch block body removed | Test gap | A host export callback can throw, but no test verifies recovery and resolution in this branch. |
| `packages/excalidraw/actions/actionExport.tsx:231` | `error?.name === "AbortError"` changed to `true` or `false` | Equivalent for this UI path? | The host callback test does not provide AbortError behavior; however the requirement for saving is to remain recoverable, so this branch is only diagnostic behavior, not document persistence. |
| `packages/excalidraw/actions/actionExport.tsx:434` | `loadedScene` flag changed to `false` | Test gap | The load action test does not directly assert that scene loading marks its result for page restoration. |
| `packages/excalidraw/components/App.tsx:2769` | `getPagesForPersistence` arrow changed to `undefined` | Test gap | The export test invokes saving, but could be more explicit that current active-page state is saved back into `pages` before persistence. |
| `packages/excalidraw/components/App.tsx:3329` | optional chain on `appState.pages` removed | Test gap | The malformed-page test covers invalid page records, but not an entirely absent `appState`/pages value at this exact access. |
| `packages/excalidraw/components/App.tsx:3356` | fallback page array changed to `["Stryker was here"]` | Equivalent or test gap? | A legacy single-page load test exercises the fallback; the placeholder must be a page object, and would be filtered or fail shape checks, so this mutant may have no observable valid behavior. |
| `packages/excalidraw/components/App.tsx:3333` | page filter guards changed to `true`, `false`, or inverted checks | Test gap | The malformed-record test now exercises valid versus invalid records and kills several mutations in this predicate in the after run. |
| `packages/excalidraw/components/App.tsx:3348` | active-page fallback condition changed to `false` | Test gap | The malformed/active-page test distinguishes whether an unknown active page ID falls back to the first valid page. It was killed in the after run. |

## New or strengthened test

Commit: [d20619de](https://github.com/CSCI-435-SE/excalidraw/commit/d20619de23f9d68ba728d1d9525f63b09679cba9) · Test: [pagePersistence.test.tsx › `ignores malformed persisted pages and keeps only valid page records`](/packages/excalidraw/tests/pagePersistence.test.tsx) · Kills: [App.tsx:3348](../../../../packages/excalidraw/components/App.tsx#L3348), plus nine additional former survivors in the `syncActionResult` restore path

## Questions

1. What did the surviving mutants reveal about your tests?

   The survivors show that the happy-path round trip and legacy single-page fallback are covered, but host-export failures, malformed `appState`, and several restore edge cases are not asserted strongly. The new malformed-page test closes gaps in the restored-page predicate and fallback behavior.

2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.

   The malformed-page test is based on the persistence requirement that restored documents contain valid page records and reject legacy or invalid values. It does not add requirements invented solely from implementation. Export error text survivors are not promoted to requirements because the issue specifies persistence behavior, not exact diagnostics.

3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?

   AI assistance was used to narrow the Stryker configuration to Issue 165's merged changed ranges. I verified by rerunning Stryker. I also checked the final report directly to confirm killed survivor ids.
