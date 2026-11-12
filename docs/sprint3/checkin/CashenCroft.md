# Sprint 3 Individual Check-in

**Code PR:** [#154 — feat(editor): local collaborator lock / visible-only mode (#81)](https://github.com/CSCI-435-SE/excalidraw/pull/154) (open, ready for review)

## 1. What have you implemented so far, and what remains?

I have implemented issue #81, a carryover of #80 that adds a per-collaborator lock (visible-only mode) on top of the visibility controls from #116. Locked collaborators' drawings stay visible but cannot be selected, moved, resized, rotated, deleted, erased, or text-edited on my client, and nothing is synced to other users. The state logic, enforcement at the selection and eraser chokepoints, and the dropdown UI are done, with 134 tests and a Test Evidence table covering every acceptance criterion; PR #154 is open and CI passes. What remains is the code review and merge, my remaining Sprint 3 issue(s), and the mutation testing deliverable (D6) on the files changed by #154.

## 2. What is one thing you learned about testing in your project?

I learned that a test asserting that something did not happen can pass for the wrong reason. Many of my tests check that a locked element is not selected or moved, but those would also pass if the click or drag never reached the canvas at all. Adding a "control" test for each case, where the same action is done on an unlocked element and does work, proves the test setup is real. I also learned to take expected values from the acceptance criteria instead of the code's output, and that CI can fail from flaky upstream tests (an animation outliving `flowchart.test.tsx`) even when every test passes.

## 3. What is one risk to finishing your work by Nov 19, and what will you do about it?

The biggest risk is mutation testing. Getting StrykerJS running on a large monorepo like Excalidraw can take real setup time, and if the right tests are not selected, mutants can be reported as surviving when they are actually covered. To reduce this, I will set up Stryker this week on the files changed by #154, starting with `packages/element/src/ownership.ts`, which is pure logic and quick to mutate. I will ask teammates whether anyone already has a working configuration, and contact the TA early with my errors and AI log if I get blocked.
