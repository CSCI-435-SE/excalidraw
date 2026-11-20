# Mutation testing: Issue #159 -- Implement Page Clearing

**PR(s):** Not opened yet (branch `feat/issue-159-page-clearing`) **Tool:** StrykerJS 10.1.1 with `@stryker-mutator/vitest-runner` **Config:** [stryker.config.mjs](../../../stryker.config.mjs) + [vitest.stryker.config.mts](../../../vitest.stryker.config.mts) **Command:** `yarn test:mutation` **Reports:** [before](reports/159-NotaThomas-before.json) · [after](reports/159-NotaThomas-after.json) **Mutation score:** before 69.67% → after 90.40%

Stryker mutates only the lines changed for #159 (listed as line ranges in `mutate`), and Vitest runs the five test files that exercise them: `pages.test.tsx`, `shortcuts.test.tsx`, `excalidraw.test.tsx`, `search.test.tsx` and `DefaultSidebar.test.tsx`.

| Run    | Mutants | Killed | Survived | No coverage | Score  |
| ------ | ------- | ------ | -------- | ----------- | ------ |
| Before | 211     | 147    | 62       | 2           | 69.67% |
| After  | 198     | 179    | 17       | 2           | 90.40% |

The after run has fewer mutants because I removed code whose mutants could not change any behavior: an always-true page-count check, an unused CSS modifier class, a conditional around resetting the confirmation, and a redundant `scope: "canvas"` argument.

## Surviving mutants

The table lists the 19 mutants still alive in the after report (17 survived, 2 no coverage). Line numbers refer to the after report. Paths are under `packages/excalidraw/`.

| Location (file:line) | Mutation | Equivalent or test gap? | Why |
| --- | --- | --- | --- |
| `components/App.tsx:2777` | `getActivePageId` returns `undefined` | Equivalent | Its only caller is the "clear canvas and all pages" action, which filters out the current page. With `undefined`, the current page is also passed to `clearPages`, but the action clears that page in the same step anyway. The result is identical and still undoes in one step. |
| `components/App.tsx:2788` | `page.id !== this.activePageId` → `true` | Equivalent | This also empties the current page's saved copy in `this.pages`. That copy is stale while the page is open, and `saveActivePage` overwrites it from the scene before anything reads it. |
| `components/App.tsx:2825` | `!state.pageClearingSelection` → `false`; guard body → `{}` (no coverage) | Equivalent (unreachable) | `togglePageForClearing` is only called from the page checkboxes, which only render in clearing mode, so the selection is never `null` when it runs. |
| `components/App.tsx:2845` | `!selection?.length` → `false`; `?.` → `.`; guard body → `{}` (no coverage) | Equivalent (unreachable) | The Clear button is disabled when nothing is selected, and clearing an empty list of pages changes nothing. |
| `actions/actionCanvas.tsx:100` | `.filter(...)` removed; `id !== activePageId` → `true` | Equivalent | Same as `App.tsx:2777`: the current page is cleared twice in one step, with the same result and the same single undo step. |
| `components/ActiveConfirmDialog.tsx:17` | `!activeConfirmDialog` → `false`; body → `{}` | Equivalent | When no dialog is open (`null`), execution falls past the `"clearCanvas"` check to the final `return null`. |
| `components/ActiveConfirmDialog.tsx:21` | `activeConfirmDialog === "clearCanvas"` → `true` | Equivalent | The atom's type is `"clearCanvas" \| null`, and `null` has already returned at line 17. |
| `components/ActiveConfirmDialog.tsx:34` | action source `"ui"` → `""` | Equivalent (for the requirements) | The source string only goes to analytics (`trackAction`); nothing the user sees changes. Killing it would mean mocking analytics. |
| `components/ConfirmDialog.tsx:33` | default `className` `""` → `"Stryker was here!"` | Equivalent | It adds an extra CSS class that no stylesheet uses. |
| `components/ConfirmDialog.tsx:42` | `setIsLibraryMenuOpen(false)` → `true` | Test gap | After any confirm-dialog button is clicked, the Library tab's "…" dropdown would be left open. This is upstream behavior I moved into `runAndRefocus`; it isn't part of #159's requirements, and no test opens the Library after a dialog. |
| `components/ConfirmDialog.tsx:51` | `container?.focus()` → `container.focus()` | Equivalent | The Excalidraw container always exists while a dialog is mounted. |
| `components/Pages.tsx:158` | `useState(false)` → `useState(true)` for the pending confirmation | Test gap (minor) | The reset effect sets it back to `false` right after mount. But if the Pages panel remounts while clearing mode is on (closing and reopening the sidebar), the confirm dialog could render for one frame first. No test checks for the dialog right after reopening the sidebar. |
| `components/Pages.tsx:216` | `"page-navigation__item"` → `""` on clearing-mode page buttons | Test gap (visual only) | The buttons would lose their base styling. The tests check the `--current` and `--selected` modifier classes but not the base class. |
| `appState.ts:255` | storage config `{ browser: false, export: false, server: false }` → `{}` | Equivalent | The storage filter treats a missing config the same as "don't store" (`propConfig?.[exportType]` is falsy). The three `false → true` mutants on this line were killed. |

## New or strengthened test

Commit: [3b0de04e](https://github.com/CSCI-435-SE/excalidraw/commit/3b0de04e232c94dcffcedd2f9241b548a7322a72) · Test: `packages/excalidraw/tests/pages.test.tsx › pages › clearing mode details › indicates the current page and the selected pages only while clearing` · Kills (before-report lines): `components/Pages.tsx:179`, `:193`, `:195`, `:200`, `:204`, `:218`

This test covers three acceptance criteria. The clearing header, the checkboxes and the "Current" badge appear only in clearing mode. Only the page you are on is marked as current. A selected page shows a check mark and the selected style, and an unselected page does not.

The same commit adds 11 more tests that kill other former survivors, for example:

- `clearing mode details › clears only the current page when it is the only one selected` kills `App.tsx:2802` (cleared elements must not stay selected).
- `clearing mode details › refreshes the previews of cleared pages that aren't open` kills `App.tsx:2809` and `:2811` (the re-render after clearing pages that aren't open).
- `clearing mode details › drops a pending confirmation when clearing mode is closed` kills `Pages.tsx:165` and `:169`.
- `sidebar docking › doesn't dock the pages sidebar outside clearing mode` and `› doesn't dock other sidebar tabs during clearing mode` kill `DefaultSidebar.tsx:95` and `:96`.
- `clear canvas dialog › keeps everything when cancelled` and `› closes after clearing only the current page` kill `ActiveConfirmDialog.tsx:32`, `:39` and `:42`.
- `clearing mode details › never stores clearing mode with the drawing` kills the three `appState.ts:255` boolean mutants.

## Questions

1. **What did the surviving mutants reveal about your tests?** My first tests checked end results, such as which pages ended up empty, but rarely the states in between. Of the 62 survivors in the first run, most were in UI feedback the acceptance criteria require but no test asserted: the "Current" badge, the check marks, the clearing-mode header, the confirmation's page count, and dialogs closing after Confirm or Cancel. Others were design rules no test checked: when the sidebar docks, keeping clearing mode out of saved and exported state, clearing the selection after a clear, and refreshing previews of pages that aren't open. A few survivors showed the code itself could be simpler, so I removed four pieces of code that could not change behavior. Writing the new tests also exposed a test-isolation problem: the Clear canvas dialog's open/closed flag lives in a jotai store shared by every editor, so a dialog left open by one test leaked into the next. The page tests now reset it in `beforeEach`.

2. **Did any surviving mutant point to an assertion whose expected value was not based on the requirements? Explain.** Yes, in two ways. First, while writing the test that kills the undo-related mutants for "clear canvas and all pages", my first expected value was that one undo would bring back every element on the current page. That assumption came from me, not from the requirements or from how Excalidraw works. The test failed because the helper had added that element outside undo history, and Excalidraw's undo can only restore changes it recorded. I changed the test to add an element in its own history step and expect only that element back. Second, several assertions I added test design decisions rather than the written acceptance criteria. Examples: cleared elements are deselected (`App.tsx:2802`), clearing mode is never saved (`appState.ts:255`), and the sidebar docks only for the pages tab in clearing mode (`DefaultSidebar.tsx:95–96`). The criteria only say the menu should open "to the side so that the user can still see the page", so docking is my reading of that criterion. These are reasonable expectations, but they come from the implementation, and the team should confirm them.

3. **If you used AI to configure the tool, analyze survivors, or write tests, what did it produce and what did you verify or correct?** I used Claude Code (Claude Opus 5.5) for all three. It installed StrykerJS and the Vitest runner, wrote `stryker.config.mjs` and `vitest.stryker.config.mts`, ran both mutation runs, classified the survivors in the table above, made the four code simplifications, and wrote the 12 new tests. Corrections made to the AI output along the way:

   - The first configuration left `excalidraw-app/` out of Stryker's sandbox copy. The dry run then failed because the test helpers import from it, so that exclusion was removed.
   - The undo test's expected value was wrong and was corrected (see question 2).
   - After the code simplifications moved lines, the `mutate` line ranges were recomputed from the diff so the re-run covers the same changed code.
   - Two commit messages misread Stryker's summary table, reporting "2 timeout" where the table meant "2 no coverage". The messages were corrected, and the counts above come straight from the JSON reports.
   - The JSON reports were reformatted for readability, and their parsed content was checked against Stryker's original output.

   Each test change was verified by running the five Stryker test files, plus typecheck and lint, before the re-run.
