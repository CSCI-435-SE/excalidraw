# Mutation testing: Issue #82 -- Add User Priority and Layering

|  |  |
| --- | --- |
| **PR** | #180 |
| **Issue** | [#82 Add User Priority and Layering](https://github.com/CSCI-435-SE/excalidraw/issues/82) |
| **Tool** | StrykerJS 10.1.1 (`@stryker-mutator/core`) with the Vitest runner (`@stryker-mutator/vitest-runner` 10.1.1) |
| **Configuration** | [`stryker.config.json`](../../../stryker.config.json), [`vitest.stryker.config.mts`](../../../vitest.stryker.config.mts) |
| **Command** | `npx stryker run` (after checking the test set passes with `npx vitest run --config vitest.stryker.config.mts`) |
| **Reports** | Before: [`reports/82-CashenCroft-before.json`](reports/82-CashenCroft-before.json) · After: [`reports/82-CashenCroft-after.json`](reports/82-CashenCroft-after.json) |
| **Run against** | `feat/issue-82-user-priority-and-layering` at `0232722d` ("82 merge implementation": after merging `master` with #84). The "after" run adds the new tests from [`5e3cd2c3`](https://github.com/CSCI-435-SE/excalidraw/commit/5e3cd2c3). |
| **Mutation score** | **86.51% → 87.74%** (killed 494 → 501, survived 69 → 66, no coverage 8 → 4, of 571 mutants; 0 timeouts, 0 errors) |

## What was mutated, and why only these files

- **`packages/element/src/ownership.ts`**: #82's ordering rule and its helpers:
  - `orderElementsByCollaboratorLayer`, the single function that rendering, hit-testing, binding and export all use;
  - `getDefaultCollaboratorLayerOrder`, `getCollaboratorLayerOrder` and `moveCollaboratorLayer`.
- **`packages/excalidraw/scene/visibility.ts`**: `getCollaboratorLayerRows`, which builds the rows of the layered list in the dropdown.

These two files hold all of #82's decision logic, which was kept pure on purpose so it could be mutation-tested. The rest of #82 is wiring that only calls that logic: `App.tsx`, `Renderer.ts`, the export functions, the actions, and the dropdown component. Those are covered by the integration and component tests in the test set. Mutating `App.tsx` (about 14,000 lines) against the editor tests would take hours and mostly hit code unrelated to #82.

Both files also contain code from #116 (visibility), #81 (locking) and #84 (co-ownership). Each surviving mutant was attributed to its feature with `git blame` on its line.

**Test set** (from `vitest.stryker.config.mts`): the unit, editor and collaboration tests of #116, #81, #84 and #82. That's 11 files and 396 tests at the "before" run.

| File                  | Score before | Score after |
| --------------------- | ------------ | ----------- |
| `ownership.ts`        | 87.17%       | 87.89%      |
| `scene/visibility.ts` | 84.67%       | 87.33%      |
| **All**               | **86.51%**   | **87.74%**  |

**Surviving or uncovered mutants by feature (before):**

- #82: 9
- #84: 38
- #116: 21
- #81: 9

As agreed for this PR, tests were added only for #82's mutants.

## Surviving mutants

**Classification:**

- **Test gap:** a test could tell the mutant from the original, but none did.
- **Equivalent:** the mutant behaves exactly like the original, so no test can kill it.

Ids are the mutant ids in the "after" report.

| # | Feature | Location | Mutation | Before → after | Classification | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | #82 | `ownership.ts:340` (id 127) | `collaboratorDirectory?.keys() ?? []` → `["Stryker was here"]` | Survived → **Killed** | Test gap | No test built the default order without a directory (outside a room), so a stray id in it went unnoticed. |
| 2 | #82 | `ownership.ts:343` (id 132) | `collaborators?.values() ?? []` → `["Stryker was here"]` | Survived → Survived | **Equivalent** | The placeholder entries are strings, which have no `.id`, so the `if (collaborator.id)` check on the next line skips them: the result is identical. |
| 3 | #82 | `ownership.ts:344` (id 134) | `if (collaborator.id)` → `if (true)` | Survived → **Killed** | Test gap | No test had a live collaborator without an id (still connecting); the mutant put `undefined` into the order. |
| 4 | #82 | `ownership.ts:434` (id 186) | missing bucket `?? -1` → `?? +1` | Survived → **Killed** | Test gap | The AC H test compared a missing creator only with a row ranked above +1, never with the bottom row. |
| 5 | #82 | `ownership.ts:420` (id 176) | `order.length - 1 - index` → `order.length + 1 - index` | Survived → Survived | **Equivalent** | It adds 2 to every rank, but only the _relative_ order of ranks matters, and missing buckets (−1) still rank lowest. A possible future cleanup is to write ranks as `-index`, which removes this mutant; product code wasn't changed during review. |
| 6 | #82 | `visibility.ts:234` (id 497) | previously-seen loop body → `{}` | No coverage → **Killed** | Test gap | No test had a previously seen collaborator while layering is on. |
| 7 | #82 | `visibility.ts:235` (id 499) | previously-seen row → `{}` | No coverage → **Killed** | Test gap | Same gap as #6. |
| 8 | #82 | `visibility.ts:235` (id 500) | `"previouslySeen"` → `""` | No coverage → **Killed** | Test gap | Same gap as #6; the row's section label was never checked. |
| 9 | #82 | `visibility.ts:241` (id 506) | `rowsById.get(id) ?? []` → `["Stryker was here"]` | No coverage → **Killed** | Test gap | No test had an id in the order without a collaborator row (e.g. one pruned from the directory). |
| 10 | #116 | `ownership.ts:160` (id 54) | `if (!hiddenCollaboratorIds?.size)` → `if (false)` | Survived (not addressed) | Test gap | With an empty hidden set the result is the same (`every` over the element's buckets is false). With no set at all, which the type allows, the mutant throws, and no test calls it without a set. |
| 11 | #116 | `ownership.ts:456` (id 197) | `visibility.hiddenCollaboratorIds?.size` → `.size` without `?.` | Survived (not addressed) | Test gap | No test calls `excludeElementsByHiddenCreators` without a hidden set (allowed by its type); the mutant would throw there. |
| 12 | #81 | `scene/visibility.ts:82` (id 429) | early-return condition in `getSelectionWithoutHiddenElements` → `false` | Survived (not addressed) | **Equivalent** | The early return is only a shortcut. With nothing hidden or locked, the rest of the function finds no selection to drop and also returns `null`. |
| 13 | #81 | `scene/visibility.ts:84` (id 434) | early-return block → `{}` | Survived (not addressed) | **Equivalent** | Same as #12: without the shortcut, the function still returns `null`. |
| 14 | #116 | `scene/visibility.ts:346` (id 575) | `(a.username ?? "")` → `(a.username && "")` | Survived (not addressed) | Test gap | The in-room rows are sorted by name, but no test adds collaborators out of alphabetical order and checks the sorted result. |

## New or strengthened tests

Commit: [`5e3cd2c3`](https://github.com/CSCI-435-SE/excalidraw/commit/5e3cd2c3).

Seven new tests target #82's code. Each is named after the acceptance criterion or the recorded decision its expected value comes from. None were derived from the code's output.

| Test | File | Kills |
| --- | --- | --- |
| "default: outside a room (no directory), me on top, then the live collaborators, miscellaneous last" | `packages/element/src/__tests__/ownershipLayer.test.ts` | #1 (id 127) |
| "default: a live collaborator without an id yet (still connecting) isn't listed" | `ownershipLayer.test.ts` | #3 (id 134) |
| "AC-H: elements of a creator missing from the order are drawn below even the bottom row" | `ownershipLayer.test.ts` | #4 (id 186) |
| "default: with no live collaborators given, the directory's join order, miscellaneous last" | `ownershipLayer.test.ts` | Nothing: its target, #2, turned out to be equivalent. It is kept because it checks real behavior (no live collaborators → directory order plus miscellaneous). |
| "AC-G: a collaborator who left keeps their place in the list, labelled Previously seen" | `packages/excalidraw/tests/collaboratorLayer.test.tsx` | #6, #7, #8 (ids 497, 499, 500) |
| "AC-A: lists every row in layer order, each with its section" | `collaboratorLayer.test.tsx` | Also detects #6–#8. Stryker credits the first test that kills a mutant, which was the dropdown test above. |
| "AC-A: an id in the order with no collaborator row (e.g. pruned from the directory) isn't listed" | `collaboratorLayer.test.tsx` | #9 (id 506) |

No tests for #84, #116 or #81 were added or changed.

## Questions

### 1. What did the surviving mutants reveal about your tests?

The default test cases I originally had made didn't include some fringe tests to check for scenarios that aren't expected to be possible (no directory, id-less collaborator, etc.) Previously seen rows also had no coverage, even with my constant checks. Core functionalities were all matched previously though.

### 2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.

Yes, #1-#3 mutants survived in getDefaultCollaboratorLayerOrder. To kill them I had to build tests with expected values like "me on top, then the live collaborators in join order, miscellaneous last" This wasn't in my requirements properly. The behavior had been set during implementation as I thought of more fringe cases, so this was a point of contention, even though I tried to be thorough. I fixed this by recording the default-order, reset, newcomer, and co-ownership decisions in a comment on #82, correcting the scenario, and asking the reviewer to confirm them, so the tests now cite issue discussion. Mutant #4, on the other hand, did come from AC H, and the reason it survived was a failure of logic, as the setup was made in a way where it never checked the "bottom" part of the requirement.

### 3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?

I had my Claude agent configure Stryker for me. It installed StrykerJS 10.1.1 with the Vitest runner. I told it to only cover the test files we modified, which encompassed ownership.ts and scene/visibility.ts. It used git blame to separate #82's 9 survivors from older code. It proposed a fix for all, which I reviewed and accepted after understanding why they happened. I chose to identify #5 as an equivalent, rather than refactor reviewed code. I required every expected value to come from the ACs. This is how the default-order requirement was found. I caught an AI mistake mislabeling #2 as a missing test. (this mutant is equivalent.) its .gitignore was blocking commits as well. I made sure the outputs matched expected criteria in the HTML.
