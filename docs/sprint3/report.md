# Team Name

Team Sketch

# Team Members

Alex (@tuna-fisher) Anthony (@AntWill-08) Cashen (@CashenCroft) Thomas (@NotaThomas) Tristan (@tristanraab)

# Project

Excalidraw [https://github.com/CSCI-435-SE/excalidraw.git]

# Sprint Overview

The team planned to complete 15 issues during Sprint 3, all listed on the Sprint 3 milestone. Two image filter sub-issues (#63 and #64) were closed without their own PR, as their changes were delivered through the other image filter sub-issues. Most issues continued Sprint 2's large parent issues, the collaborator controls (#14) and the image filter system (#60), while a new parent issue for multiple pages in one drawing (#149), assigned by the TA, took up a large share of the sprint.

The team delivered collaborator controls (a visible-only lock mode, per-collaborator layer ordering, and a default for newcomers with locally saved settings), shared ownership for elements edited by several collaborators, custom font uploads, image appearance controls and filter transformations, and the first page features: creating and navigating pages, deleting pages, clearing pages, and naming pages. Work covered both front-end tools and the collaboration layer. The sprint also added stricter processes: specs reviewed before coding, a test evidence table in every PR, mutation testing, and a suite health review.

14 of the 15 issues were completed. Page reordering (#162), which has no PR yet, is carried over to Sprint 4. Issues were larger and more connected than in Sprint 2, so stacked branches caused merge conflicts and several PRs merged close to the deadline. Specs that changed during implementation were amended on their issues and re-approved by reviewers, and AI usage stayed efficient, with logs kept for implementation, reviews and specs.

# Sprint Backlog Summary

[Sprint 3 Milestone](https://github.com/CSCI-435-SE/excalidraw/milestone/3)

| Issue Title | Owner | Estimated Points | Scope | Status |
| --- | --- | --- | --- | --- |
| [#165 — Implement Multi-Page Saving and Loading](https://github.com/CSCI-435-SE/excalidraw/issues/165) | tristanraab | 3 | Small | Merged |
| [#162 — Implement Page Reordering](https://github.com/CSCI-435-SE/excalidraw/issues/162) | AntWill-08 | 3 | Small | Closed |
| [#160 — Implement Page Naming and Customization](https://github.com/CSCI-435-SE/excalidraw/issues/160) | AntWill-08 | 5 | Medium | Merged |
| [#159 — Implement Page Clearing](https://github.com/CSCI-435-SE/excalidraw/issues/159) | NotaThomas | 5 | Medium | Merged |
| [#158 — Implement Page Deletion](https://github.com/CSCI-435-SE/excalidraw/issues/158) | tuna-fisher | 5 | Medium | Merged |
| [#157 — Implement Page Creation and Navigation](https://github.com/CSCI-435-SE/excalidraw/issues/157) | tristanraab | 8 | Medium | Merged |
| [#140 — Add More Font Options](https://github.com/CSCI-435-SE/excalidraw/issues/140) | tuna-fisher | 5 | Medium | Merged |
| [#84 — Implement Group-Project Element Functionality](https://github.com/CSCI-435-SE/excalidraw/issues/84) | NotaThomas | 8 | Medium | Merged |
| [#83 — Ensure Default Behaviors for New Users](https://github.com/CSCI-435-SE/excalidraw/issues/83) | CashenCroft | 5 | Medium | Merged |
| [#82 — Add User Priority and Layering](https://github.com/CSCI-435-SE/excalidraw/issues/82) | CashenCroft | 8 | Medium | Merged |
| [#81 — Implement Per-User Visible-Only Toggle](https://github.com/CSCI-435-SE/excalidraw/issues/81) | CashenCroft | 3 | Small | Merged |
| [#64 — Add Image Filter Persistence](https://github.com/CSCI-435-SE/excalidraw/issues/64) | tristanraab | 3 | Small | Closed |
| [#63 — Update Image Rendering and Export](https://github.com/CSCI-435-SE/excalidraw/issues/63) | tristanraab | 8 | Medium | Closed |
| [#62 — Implement Image Filter Transformations](https://github.com/CSCI-435-SE/excalidraw/issues/62) | tristanraab | 5 | Medium | Merged |
| [#61 — Add Image Appearance Controls](https://github.com/CSCI-435-SE/excalidraw/issues/61) | AntWill-08 | 8 | Medium | Merged |

# Requirements and Design

Each issue's spec was written and reviewed before coding started. Specs covered a Summary, User Story and User Scenario, testable Acceptance Criteria, Out of Scope, and Open Questions. Before implementation, a teammate posted a review comment on the issue stating what they checked: whether each acceptance criterion is clear and testable, which cases were covered, and whether the scope fits.

Design followed previous sprints implementation, where architecture and design were cloned off of existing UI, tools, and persistence infrastructure to keep concise, clear code that followed a logical and similar flow to existing tools and was structurally similar to base Excalidraw. Any completely new implementations were told to keep close to the architecture and infrastructure of Excalidraw’s existing features, and modifications were made if implementation became too unidentifiable from our project. All design decisions were handled in Issue comments or PR comments so there is no Design Markdown this sprint.

# Completed Issues

| Issue Title | Issue Owner (Posted/Updated & Implement) | Associated PR(s): Link, Author, Reviewer(s), Status | Brief Description of Changes |
| --- | --- | --- | --- |
| [#61 — Add Image Appearance Controls](https://github.com/CSCI-435-SE/excalidraw/issues/61) | AntWill-08 | [PR #156](https://github.com/CSCI-435-SE/excalidraw/pull/156) — Author: Anthony (@AntWill-08); Reviewer: Tristan (@tristanraab); Merged | Expands the image filter system with a color shift filter and controls for configuring filters and appearance adjustments independently per image while editing. |
| [#62 — Implement Image Filter Transformations](https://github.com/CSCI-435-SE/excalidraw/issues/62) | AntWill-08/tristanraab | [PR #172](https://github.com/CSCI-435-SE/excalidraw/pull/172) — Author: Tristan (@tristanraab); Reviewer: Anthony (@AntWill-08); Merged | Adds filter transformations that change how an image is displayed, including color inversion and blur. |
| [#63 — Update Image Rendering and Export](https://github.com/CSCI-435-SE/excalidraw/issues/63) | AntWill-08/tristanraab | Closed; no linked PR, completed through other image filter subissues | Ensures applied filters and transformations display correctly and are preserved when drawings are rendered or exported. |
| [#64 — Add Image Filter Persistence](https://github.com/CSCI-435-SE/excalidraw/issues/64) | AntWill-08/tristanraab | Closed; no linked PR, completed through other image filter subissues | Ensures image filters and transformations are saved with the image element and restored correctly when a drawing is reopened, copied, or persisted. |
| [#81 — Implement Per-User Visible-Only Toggle](https://github.com/CSCI-435-SE/excalidraw/issues/81) | AntWill-08/CashenCroft | [PR #154](https://github.com/CSCI-435-SE/excalidraw/pull/154) — Author: Cashen (@CashenCroft); Reviewer: Tristan (@tristanraab); Merged | Completes #80's interactivity criteria by adding a visible-only (locked) mode: a collaborator's drawings stay visible but can't be selected, edited, moved, resized, erased, or deleted from the local client. |
| [#82 — Add User Priority and Layering](https://github.com/CSCI-435-SE/excalidraw/issues/82) | AntWill-08/CashenCroft | [PR #180](https://github.com/CSCI-435-SE/excalidraw/pull/180) — Author: Cashen (@CashenCroft); Reviewer: Anthony (@AntWill-08); Merged | Adds per-collaborator layer ordering: a Layering switch in the collaborator dropdown, with drag-and-drop and arrow controls, applied to rendering, selection and export on this client only. |
| [#83 — Ensure Default Behaviors for New Users](https://github.com/CSCI-435-SE/excalidraw/issues/83) | AntWill-08/CashenCroft | [PR #186](https://github.com/CSCI-435-SE/excalidraw/pull/186) — Author: Cashen (@CashenCroft); Reviewer: Thomas (@NotaThomas); Merged | Adds a "New collaborators" setting (Visible / Locked / Hidden, default Locked) applied to collaborators the first time they're seen, places newcomers below everyone already in the layer order, and saves the collaborator dropdown's settings locally so they survive a reload. |
| [#84 — Implement Group-Project Element Functionality](https://github.com/CSCI-435-SE/excalidraw/issues/84) | AntWill-08/NotaThomas | [PR #170](https://github.com/CSCI-435-SE/excalidraw/pull/170) — Author: Thomas (@NotaThomas); Reviewer: Alex (@tuna-fisher); Merged | Adds shared ownership for elements edited by multiple collaborators, so a shared item stays visible and controllable if any of its co-owners are set to visible or interactive. |
| [#140 — Add More Font Options](https://github.com/CSCI-435-SE/excalidraw/issues/140) | CashenCroft/tuna-fisher | [PR #171](https://github.com/CSCI-435-SE/excalidraw/pull/171) — Author: Alex (@tuna-fisher); Reviewer: Anthony (@AntWill-08); Merged | Lets users add their own custom fonts, including fonts that support more languages and writing systems, for more flexibility in text elements. |
| [#157 — Implement Page Creation and Navigation](https://github.com/CSCI-435-SE/excalidraw/issues/157) | AntWill-08/tristanraab | [PR #178](https://github.com/CSCI-435-SE/excalidraw/pull/178) — Author: Tristan (@tristanraab); Reviewer: Alex (@tuna-fisher); Merged | Adds the ability to create pages within a drawing and switch between them through a page navigation panel on the right side, with a miniature preview of each page. |
| [#158 — Implement Page Deletion](https://github.com/CSCI-435-SE/excalidraw/issues/158) | AntWill-08/tuna-fisher | [PR #183](https://github.com/CSCI-435-SE/excalidraw/pull/183) — Author: Alex (@tuna-fisher); Reviewer: Anthony (@AntWill-08); Merged | Lets users delete individual or multiple selected pages, with safeguards against accidental data loss. |
| [#159 — Implement Page Clearing](https://github.com/CSCI-435-SE/excalidraw/issues/159) | AntWill-08/NotaThomas | [PR #181](https://github.com/CSCI-435-SE/excalidraw/pull/181) — Author: Thomas (@NotaThomas); Reviewer: Alex (@tuna-fisher); Merged | Lets users remove all elements from individual pages, multiple selected pages, or all pages without deleting the pages themselves. |
| [#160 — Implement Page Naming and Customization](https://github.com/CSCI-435-SE/excalidraw/issues/160) | AntWill-08 | [PR #184](https://github.com/CSCI-435-SE/excalidraw/pull/184) — Author: Anthony (@AntWill-08); Reviewer: Tristan (@tristanraab); Merged | Adds page reordering to new page system. |
| [#162 — Implement Page Reordering](https://github.com/CSCI-435-SE/excalidraw/issues/162) | AntWill-08 | [PR #192](https://github.com/CSCI-435-SE/excalidraw/pull/192) — Author: Anthony (@AntWill-08); Reviewer: Trs (@CashenCroft); Merged | Saves every page, its settings and the active page with the drawing, so they come back after a reload or when a saved file is reopened. Older single-page files still open as one page. |
| [#165 — Implement Multi-Page Saving and Loading](https://github.com/CSCI-435-SE/excalidraw/issues/165) | AntWill-08/tristanraab | [PR #182](https://github.com/CSCI-435-SE/excalidraw/pull/182) — Author: Tristan (@tristanraab); Reviewer: Cashen (@CashenCroft); Merged | Saves every page, its settings and the active page with the drawing, so they come back after a reload or when a saved file is reopened. Older single-page files still open as one page. |

# Test Strategy

Our team used automated tests alongside individual implementation and review of tests manually and in conjunction with automated tests to check new behavior and existing functionality against pre-existing code to check for regression. Testing was focusing significantly more heavily in correlation to shifting ideals from checking code line-by-line, to checking test functionality and coverage, alongside flow diagrams to check proper implementation, regression checks, and fringe cases to newer implementation, and whatever could arise in the integration of newer features.

# Midpoint report

[Midpoint report for team Sketch](https://github.com/CSCI-435-SE/excalidraw/tree/master/docs/sprint3/checkin)

# Mutation Test

Each member's D6 mutation testing write-up:

Alex (@tuna-fisher): [158-tuna-fisher.md](https://github.com/CSCI-435-SE/excalidraw/blob/master/docs/sprint3/mutation/158-tuna-fisher.md)

Thomas (@NotaThomas): [159-NotaThomas.md](https://github.com/CSCI-435-SE/excalidraw/blob/master/docs/sprint3/mutation/159-NotaThomas.md)

Cashen (@CashenCroft): [82-CashenCroft.md](https://github.com/CSCI-435-SE/excalidraw/blob/master/docs/sprint3/mutation/82-CashenCroft.md)

Anthony (@AntWill-08): [LINK]

Tristan (@tristanraab): [LINK]

# Suite Health

Runner: Vitest, from CI's Tests workflow (.github/workflows/test.yml: yarn test:app, runs on every push to master). Areas listed are the ones our issues changed.

| Suite | Command / CI | Sprint 2 (v0.1.0-csci435-s2, 692f35bc) | End of Sprint 3 (master, 6a5a6892) |
| --- | --- | --- | --- |
| excalidraw-app (collaboration) | Tests workflow, yarn test:app | 9 files: 55 passed, 0 failed, 0 skipped | 15 files: 127 passed, 0 failed, 0 skipped |
| packages/excalidraw (editor, pages, fonts, image filters) | same | 85 files: 1319 passed, 0 failed, 11 skipped | 101 files: 1753 passed, 0 failed, 11 skipped |
| packages/element (ownership, layering, co-ownership) | same | 31 files: 624 passed, 0 failed, 36 skipped | 35 files: 774 passed, 0 failed, 36 skipped |
| packages/common | same | 7 files: 107 passed, 0 failed, 0 skipped | 8 files: 113 passed, 0 failed, 0 skipped |
| All (Vitest summary line) | same | Test Files 142 passed (142); Tests 2150 passed, 47 skipped, 1 todo (2198) [run](https://github.com/CSCI-435-SE/excalidraw/actions/runs/41002579546) | Test Files 169 passed (169); Tests 2812 passed, 47 skipped, 1 todo (2860) [run](https://github.com/CSCI-435-SE/excalidraw/actions/runs/44669722216) |

Failures by cause: CI has 0 failures at both points, so no failures were introduced by our team. Failures seen only when running locally:

Environment-specific (Windows): 3 exportToSvg snapshots in packages/excalidraw/tests/scene/export.test.ts fail on Windows because setupTests.ts builds a font path that doesn't resolve there. They pass in CI. Issue: [#189](https://github.com/CSCI-435-SE/excalidraw/issues/189)

Flaky (upstream): flowchart.test.tsx sometimes fails with "window is not defined" under yarn test:coverage and passes on a re-run. Issue: [#190](https://github.com/CSCI-435-SE/excalidraw/issues/190)

Skipped tests: 47 skipped and 1 todo at both points, all from upstream Excalidraw. The same 31 skip/todo calls exist at our Sprint 0 tag and now, so our team added none.

Disabled CI checks: the size-limit workflow was removed in Sprint 2 (5e8829c5) because it was broken, as noted in our Sprint 0 standards. Issue with the reason: [#191](https://github.com/CSCI-435-SE/excalidraw/issues/191)

# AI tool usage

Alex: (@tuna-fisher) [AI Logs Folder:](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint3/tuna-fisher)

**Used Claude Code for…**

agentic implementation of sprint3 issues + bugcatching when doing reviews. Also had it write tests, and have trained it to run mutants on said tests as well (outside of StrykerJS/mutation writeup requirements). Additionally, it had stage files for me (because it's faster and I'm bad at filename memorization. Manually reviewed generated code (minimal changes), and then manually tested all user functionality, and made sure everything passed the test suite before every of my 11 commits. additionally performing rebasing/reimplementation of another user's code (merge conflict) using Claude Code.

**Sessions Logged:** 4

\*_Patterns:_

Used claude code for the same reasons in all sprints, however acted more autonomously than sequentially (I would have it perform one process/item while I manually checked/handled/tested another process/item

Anthony Williams (@AntWill-08)

[AI Logs Folder:](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint3/AntWill-08)

**Used Claude Code for…**

Testing, Implementation, Debugging, rarely pushing issues

**Sessions Logged:** 3

**Patterns:** The way I have used ai has stayed the same through the sprints. Testing, implementing and rarely pushing.

Cashen Croft (@CashenCroft) [AI Logs Folder:](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint3/CashenCroft)

**Used Claude Code for…**

Agentic implementation of my assigned Sprint 3 issues, plus architectural analysis, debugging, code review, specs, PRs, and test development. I used Claude Code to finish the collaborator controls started in Sprint 2. That covered a visible-only (locked) interactivity mode (#81), per-collaborator layer ordering with drag-and-drop and arrow controls (#82), and a newcomer default with locally saved menu settings (#83). For each issue, I reviewed the generated changes and traced how they connected to Excalidraw’s existing collaborator dropdown, app state, element ownership model, rendering pipeline, hit-testing, export, and tests. Because all three issues built on the ownership and visibility foundation from #80/PR #116, I made sure each one reused those abstractions instead of duplicating logic. I also kept every preference local to the client and separate from shared scene data, and preserved existing behavior when the features are turned off.

**Sessions Logged:**

Claude Code sessions documenting implementation, design decisions, debugging, code review, and testing for both assigned issues. This also covered mutation testing, drafting of PR’s and specs. All were listed in their respective format, with spec getting its own individual ai-log. All were stored in the expected area. (7 total chats: 1 for 81, 3 for 82, 2 for 83, and 1 for PR review)

**Patterns:**

I used an iterative implementation-and-review workflow, focusing on architectural consistency and data integrity. Issues #81–83 all extended the collaborator dropdown from #80/PR #116, so I reused that ownership model (customData.creatorId) and the central visibility rule instead of adding new logic. For Issue #81, I added a local visible-only (locked) state per collaborator and checked it at the existing hit-testing, selection, eraser, and binding points, so hidden collaborators are always non-interactive. For Issue #82, I added per-collaborator layer ordering through one pure ordering function, applied consistently to rendering, hit-testing, and export so the element you click is the one you see on top. For Issue #83, I added a newcomer default (Visible/Locked/Hidden) and local persistence for the menu’s settings. All three keep local preferences separate from shared scene data, so other collaborators are never affected. Compared with Sprint 1, I used agentic AI more efficiently, documented design decisions more explicitly, and traced changes across components and rendering logic to validate correctness and reduce regressions. I also relied more on visual tracing in the Claude Code terminal to follow data flow and chain effects. As with #80, I worked in large incremental steps and tested state and ordering logic by manually injecting values into the webpage before building the more invasive UI controls, such as the drag-and-drop layer list.

Thomas: (@NotaThomas) [AI Logs Folder:](excalidraw/ai-logs/sprint3/NotaThomas at master · CSCI-435-SE/excalidraw)

**Tools used**: Claude code for scoping, implementation, testing, review assistance

**Sessions Logged**: 5

**Patterns**: I used claude code to assist me with both my issues (#159 and #84). I used AI similarly to how I used it in previous sprints by using it for scoping, implementation, and test generation/verification. I used AI more extensively than in previous sprints by having it review PRs I was reviewing, and then comparing its review against a review that I had done separately to see if the two reviews agreed, and if I missed anything/had to make any adjustments. Similarly to previous sprints, I had the AI first describe how it would go about making the change that I requested (change was based on issue and acceptance criteria), I would then read the AI’s thought process and make any modifications that I deemed necessary. I would then allow the AI to implement the changes and test them. I would then manually test the changes for UI features to ensure that they met acceptance criteria and worked as intended, along with running the test suite.

Tristan: (@tristanraab) [AI Logs Folder:](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint3/tristanraab)

Tools used: Copilot for implementation, creating tests, and bug fixing

Sessions Logged: 3

Patterns: I used AI to implement all three of my issues (#172) (#178) (#182). My approach to AI usage in this sprint was similar to the previous sprints. I had AI assist me with the initial implementation of the issue and then went back and fixed all the errors that it made. During this sprint, I found that the AI was very useful and made few errors.

# Release

v0.1.0-csci435-s3

[Release 2](https://github.com/CSCI-435-SE/excalidraw/releases/tag/v0.1.0-csci435-s3)

# Risks and Retrospective

Communication has stayed decent since sprint 3. Issues have gotten significantly harder, and PR’s have gotten more difficult to create, leading to some backlog and unexpected breaks in time. Miscommunication wasn’t a major factor for these failings, although stacked issues caused merge conflicts which left some collaborators spending significant time merging branches and spending time fusing redundant code.

Issues were implemented, and although quantity went down, quality of PR’s, specs, and test cases went up for most peers. Overall issues were easier to review and logs and flow were easier to understand. Skimming and secondary summary did become more important as PR’s could become extensively long (>3k words). This was more of an issue with expected criteria, rather than user error.

Possible future risks cover less understanding of issues, due to bloat of specs and PR’s, assuming criteria grows in complexity. Summarization and secondary AI models become more important to utilize to cover over peers 1000’s of lines of code changes, which leads to possible pitfalls into technical debt, although intent debt stays in a similar spot. The risk mainly revolves around managing understanding of code, through tests and flowcharts, without missing possible work-around roots and architectural drift through redundant and unnecessary files with the shortening of time allocated to individual file review.

# Sprint 4 Plan

During sprint 3, we focused on implementing existing continuation of big project issues like client-to-client communication additions, and image filtering. We also covered issues assigned to us by the TA, being implementing pages, which was a heavy workload addition and took a significant amount of our time in sprint 3. Issues focused mainly on large overhauling issues, rather than previous simplistic tool additions and bug fixes. Some issues were rewritten as a better understanding of the repo made certain additions trivial addendums to previous/future issues and or obsolete with previous infrastructure.

The back-end client-to-client communication was fully understood, and peers voted on how administrative features would function going further in. Since the current firebase setup is a single relay point, group members are still deliberating on whether implementation of administrative features is a worthwhile addition going into sprint 4, or if working on previous small features more valid for an upgrade to Excalidraw. Right now we are leaning towards adding small administrative features with stamps to the creator of the chat room, which add helpful functionality to free Excalidraw users.

For Sprint 4, we want to continue working on parent issues with remaining subissues, any newly mentioned features by the TA, and any issues that wrap up a clean feel for Excalidraw as a whole. At the end of sprint 4 we want no incompleted parent issues, and tools that feel useful and applicable to increase QOL of user experience and make the application more accessible to the common user.
