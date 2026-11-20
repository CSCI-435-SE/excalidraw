# Mutation testing: Issue #158 -- Implement Page Deletion

**PR(s):** #TODO (not opened yet) **Tool:** StrykerJS 9.6.1 with `@stryker-mutator/vitest-runner` **Config:** [stryker.158.config.mjs](../../../stryker.158.config.mjs) + [vitest.stryker.158.config.mts](../../../vitest.stryker.158.config.mts), built on NotaThomas's #159 setup ([stryker.config.mjs](../../../stryker.config.mjs)) **Command:** `yarn test:mutation stryker.158.config.mjs` **Reports:** [before](reports/158-tuna-fisher-before.json) · [after](reports/158-tuna-fisher-after.json) **Mutation score:** before 91.98% → after 96.23%

Stryker mutates only the lines changed for #158 (computed from `git diff` against the branch's fork point from master) in `pages.ts`, `App.tsx`, `LayerUI.tsx`, `Pages.tsx`, `PageDeleteDialog.tsx` and `PageRangeSelect.tsx`. Vitest runs the two test files that exercise them: `tests/pages.test.tsx` and `pages.test.ts`. Static (module-level) mutants are skipped (`ignoreStatic`).

| Run    | Mutants | Killed | Timeout | Survived | No coverage | Score  |
| ------ | ------- | ------ | ------- | -------- | ----------- | ------ |
| Before | 213     | 194    | 1       | 16       | 1           | 91.98% |
| After  | 213     | 203    | 1       | 7        | 1           | 96.23% |

## Surviving mutants

Line numbers refer to the reports. Paths are under `packages/excalidraw/`.

### Still alive in the after report

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
| --- | --- | --- | --- |
| `components/App.tsx:772` | `"clear"` → `""` | Equivalent | The page selection mode starts as `"clear"`. The code only ever checks for `"delete"`, so `""` behaves exactly like `"clear"`, and entering clearing mode sets the value again before anything reads it. |
| `components/App.tsx:2848` | `"clear"` → `""` | Equivalent | Entering clearing mode resets the mode after deleting mode was used. Any value other than `"delete"` shows clearing mode, so `""` can't be told apart from `"clear"`. Removing the line entirely is caught by `deleting mode › clearing mode still clears after deleting mode was used`. |
| `components/App.tsx:2902` | `!selection?.length` → `false` | Equivalent (unreachable) | `deleteSelectedPages` is only called from the Delete button, which is disabled when no page is ticked, so the empty-selection guard never runs through the UI. #159 has the same verdict for the matching guard in its clearing code. |
| `components/App.tsx:2902` | `selection?.length` → `selection.length` | Equivalent (unreachable) | The selection is only `null` outside a selection mode, and the Delete button only exists inside one, so `?.` and `.` never behave differently. |
| `components/App.tsx:2902` | guard body → `{}` (no coverage) | Equivalent (unreachable) | This is the body of the same guard. No test reaches it because the UI can't call `deleteSelectedPages` with an empty selection. |
| `pages.ts:74` | `"No pages selected for deletion"` → `""` | Test gap (minor) | The unit test `rejects an empty selection` checks that `deletePages` throws, not what the message says. The message is only for developers. Pinning its exact text would take the expected value from the code, not the requirements, so I left it. |
| `pages.ts:78` | `` `Cannot delete unknown page ${id}` `` → ` `` ` | Test gap (minor) | Same as `pages.ts:74`. `rejects unknown page ids` checks that it throws, not the message. |
| `pages.ts:83` | `` `Active page ${activePageId} does not exist` `` → ` `` ` | Test gap (minor) | Same as `pages.ts:74`. `rejects an unknown active page` checks that it throws, not the message. |

### Survived the before run, killed in the after run

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
| --- | --- | --- | --- |
| `pages.ts:114` | regex `(\d+)` → `(\d)` (range start) | Test gap | range tests never used more than 7 pages, so a first range number w/ two digits was never tried. |
| `pages.ts:114` | regex `(\d+)` → `(\d)` (range end) | Test gap | Same gap for the second number of a range. |
| `components/PageDeleteDialog.tsx:31` | `labels.length === pages.length` → `true` | Test gap | The dialog would always say "A new blank page will be created", even when pages remain. The only test for the note's absence was removed when the old "Delete all but current" button was replaced by deleting mode. |
| `components/PageRangeSelect.tsx:18` | error id generator → `() => undefined` | Test gap | The error message would lose its id, so the field's `aria-describedby` would no longer point at it and screen readers wouldn't announce it. The tests checked the error text but not that link. |
| `components/PageRangeSelect.tsx:18` | `` `page-range-error-${nanoid()}` `` → ` `` ` | Test gap | Same gap: an empty id also breaks the `aria-describedby` link. |
| `components/PageRangeSelect.tsx:20` | `input.trim()` → `input` | Test gap | A field holding only spaces would show the "invalid" error instead of being treated as empty & no test typed only spaces |
| `components/Pages.tsx:276` | `pages.length < 2` → `pages.length <= 2` | Test gap | all but current" would be disabled with exactly two pages, where it should select the other page. The tests only tried three pages and one. |
| `components/Pages.tsx:340` | `isClearing && !isDeleting` → `true` | Test gap | in deleting mode the clear pages menu would open ontop of delete dialogue and then confirming would clear and not delete. kind of irrelevant bc its impossible to have both thru the app, but good catch incase a user manages to do both simultaneously due to packet loss. |
| `components/Pages.tsx:340` | `isClearing && !isDeleting` → `isClearing \|\| !isDeleting` | Test gap | Same gap as the mutant above: both dialogs open in deleting mode. |

## New or strengthened test

Commit: TODO (link the commit that adds the 5 tests) · Kills: see the table below

| Test | Kills |
| --- | --- |
| `pages.test.ts › parsePageRange › handles two-digit page numbers in drawings with 10+ pages` | `pages.ts:114` (both) |
| `tests/pages.test.tsx › deleting mode › doesn't promise a new blank page while some pages remain` | `PageDeleteDialog.tsx:31` |
| `tests/pages.test.tsx › deleting mode › opens only the delete confirmation, never the clear one` | `Pages.tsx:340` (both) |
| `tests/pages.test.tsx › all but current › is available as soon as there are two pages` | `Pages.tsx:276` |
| `tests/pages.test.tsx › select pages by number › treats a field of only spaces like an empty one` | `PageRangeSelect.tsx:20` |
| `tests/pages.test.tsx › select pages by number › links the error message to the field for screen readers` | `PageRangeSelect.tsx:18` (both) |

## Questions

1. What did the surviving mutants reveal about your tests?

   surviving mutants really revealed a lot of holes in numeric testing! mostly in the case of the ranges/number of pages deleted /cleared at once, which is kind of irrelevant because like a lot of breaks weren't really found regarding this as the numbers shouldn't really matter and edge cases were already accounted for, but it's still good to test for these edge cases. additionally, when switching modes (delete/clear), a lot of edge cases regarding switching to "null"/empty weren't checked, which is fair but like they all default to clear, which is fine because the user can just exit clearing mode if anything happened. the only gaps noticed were like minor things like not throwing something

2. Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.

   A couple did, like the aforementioned mode of "", or blank. There's no way to obtain this mode outside of entering the console, and it defaults to the clearing mode, which is irrelevant.

3. If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct? If AI was not used, write "N/A."

   used ai to configure the tool (i verified it based off of my teammate's config bc our issues closely overlapped), tests were written w ai - matches conventions for this repo. ai also did a first-pass survivor analysis bc mutants 10-17 (iirc) were determined to be easy enough to kill. I did some manual analysis but gaps in my knowledge were covered by ai.
