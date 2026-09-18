# Team Name
Team Sketch

# Team Members
Alex (@tuna-fisher)
Anthony (@AntWill-08)
Brian (@Thomas2839)
Cashen (@CashenCroft)
Thomas (@NotaThomas)
Tristan (@tristanraab)

# Project
Excalidraw 

# Project Overview
<img width="840" height="481" alt="840x560" src="https://github.com/user-attachments/assets/635e7a5a-80a4-4fba-8b5c-91fd02a16362" />
<img width="840" height="480" alt="840x560" src="https://github.com/user-attachments/assets/5158ab06-0ae6-4469-a59c-def800efddf6" />

What it does / users: Excalidraw is a virtual whiteboard for sketching with real-time multi-user collaboration. Users range from individual users to teams doing brainstorming, diagramming, and remote whiteboarding
Main features: shapes, freedraw, text, arrows/lines with binding, image embeds, an infinite pannable/zoomable canvas, styling (stroke/fill/opacity/fonts), grouping/layering, undo/redo history, live multiplayer collaboration, and export/import (PNG, SVG, .excalidraw JSON).
Main components & interactions: the packages/excalidraw React component renders the canvas and UI and owns scene/element state; excalidraw-app wraps that component into the full excalidraw.com app, adding collaboration (sockets/server sync), local persistence, anetry, element types, math, utils) lives inpackages/common, packages/element, packages/math, and packages/utils, which both the library and app depend on.       
Technologies: TypeScript, React, Vite (app) and esbuild (packages), Yarn workspaces, Vitest for testing, Rough.js for  the hand-drawn rendering style, and a collabrver + storage) for real-time sync inexcalidraw-app.                           
Code organization: monorepo via Yarn workspaces — packages/excalidraw/ (published library), excalidraw-app/ (web app), packages/common|element|math|utils (core shatJS and browser-script integration samples), dev-docs/docs/codebase/ (architecture notes on elements, renderer, history, collaboration).
Contribution/review workflow: branch per issue (feat/issue-<N>-..., fix/issue-<N>-..., chore/...) off an upmaster, PR into master (direct pushes blockeiew, CI checks + manual staging test beforemerge, semantic commit prefixes (feat, fix, docs, etc.)
Issue standards: issues are filed in GitHub Issues, labeled by type (bug, enhancement), and referenced from branches/commits/PRs by number (e.g., Closes #17) so triage and status tracking stay linked to the code that resolves them.


# Feature Backlog Summary

The team created **25 issues** during Sprint 0 (5 closed, 18 still open). Issues cluster into a few recurring themes:

- **Precision & fine-grained control** — replacing fixed presets with sliders/numeric input (stroke width -  #5, font size #23, zoom #3, line width #16, duplicate offset #31).
- **Shape & drawing tools** — new stamps and rendering options (triangle stamp #4, shape masking #11, gradients #12, image filters #37, more fonts #40).
- **Selection & organization** — element grouping #33, snap-to-grid #32, select-beneath #21, fill-bucket - targeting #22.
- **Collaboration & view mode** — layer visibility/interactivity #14, keyboard panning in view mode #8 (closed), element motion #18.
- **Bugs & UX polish** — web embeds rendering on top #17, pointer-jump artifacts at high zoom #6, export/
- clear confirmations #1 #2 (closed)).

Top features the team wants to pursue

1. [Add element grouping system (#33)](https://github.com/CSCI-435-SE/excalidraw/issues/33)
2. [Allow users to snap objects to grid (#32)](https://github.com/CSCI-435-SE/excalidraw/issues/32)
3. [Prevent web embeds from always appearing on top (#17)](https://github.com/CSCI-435-SE/excalidraw/issues/17)
4. [Support for hyperlinks (#15)](htexcalidraw/issues/15)
5. [Add "duplicate with offset" option (#31)](https://github.com/CSCI-435-SE/excalidraw/issues/31)

# Standards Document Summary
We for the most part accepted the current standards document but made a few modifications to allow for the use of AI and proper citing of AI usage. CI wan't fully followed due to an error in it.
Full document: [standards.md](standards.md)

Key conventions adopted from the existing project guidelines:
- TypeScript/React/Vite monorepo conventions, PascalCase/camelCase/ALL_CAPS naming, Prettier + ESLint enforced via `yarn fix`.
- Branch-per-issue workflow (`feat/issue-<N>-...`, `fix/issue-<N>-...`, `chore/...`) with PRs into a protected `master`, semantic commit prefixes, and one required teammate review.
- `yarn test:all` expected before pushing; CI checks and manual staging tests required before merge.

Deviations/adaptations made by the team:
- **AI tool use is explicitly permitted** and must be logged (code, debugging, understanding the codebase, drafting docs/PRs, design discussions).
- **AI usage must be disclosed in every PR description** (start or end), including a "no AI used" note when applicable.
- `size-limit` CI check is currently broken and is treated as a known, ignorable failure for Sprint 0.


# Completed PRs

| PR | Issue | Author | Reviewer(s) | Status | Description |
| --- | --- | --- | --- | --- | ---
| [#39](https://github.com/CSCI-435-SE/excalidraw/pull/39) | [#10](https://github.com/CSCI-435-SE/excalidraw/issues/10) | AntWill-08 | CashenCroft | Merged | Fill mechanic now works for closed shapes drawn with the arrow tool, matching existing line-tool behavior. |
| [#38](https://github.com/CSCI-435-SE/excalidraw/pull/38) | [#8](https://github.com/CSCI-435-SE/excalidraw/issues/8) | CashenCroft | AntWill-08 | Merged | Added unit tests for `requestAnimationFrame`-driven keyboard panning in View Mode. |
| [#36](https://github.com/CSCI-435-SE/excalidraw/pull/36) | [#2](https://github.com/CSCI-435-SE/excalidraw/issues/2) | CashenCroft | AntWill-08 | Merged | Toast notification confirms successful image export; suppressed on user cancellation. |
| [#30](https://github.com/CSCI-435-SE/excalidraw/pull/30) | [#9](https://github.com/CSCI-435-SE/excalidraw/issues/9) | tuna-fisher | CashenCroft | Merged | URL and document title now reflect the currently saved file name. |
| [#28](https://github.com/CSCI-435-SE/excalidraw/pull/28) | [#23](https://github.com/CSCI-435-SE/excalidraw/issues/23) | tristanraab | AntWill-08 | Merged | Replaced the 4-option font size picker with a slider that allows any value plus presets. |
| [#27](https://github.com/CSCI-435-SE/excalidraw/pull/27) | [#4](https://github.com/CSCI-435-SE/excalidraw/issues/4) | tuna-fisher | AntWill-08 | Merged | Added a selectable, transformable triangle stamp with full color/fill support. |
| [#24](https://github.com/CSCI-435-SE/excalidraw/pull/24) | [#8](https://github.com/CSCI-435-SE/excalidraw/issues/8) | CashenCroft | AntWill-08 | Merged | Added smooth, zoom-scaled keyboard panning in View Mode (with Shift speed boost). |
| [#20](https://github.com/CSCI-435-SE/excalidraw/pull/20) | [#5](https://github.com/CSCI-435-SE/excalidraw/issues/5) | AntWill-08 | tristanraab | Merged | Replaced the 3-option stroke width picker with a draggable slider showing a live value. |
| [#19](https://github.com/CSCI-435-SE/excalidraw/pull/19) | [#3](https://github.com/CSCI-435-SE/excalidraw/issues/3) | tristanraab | AntWill-08 | Merged | Split zoom shortcuts into a normal step and a 1% fine-zoom step. |
| [#41](https://github.com/CSCI-435-SE/excalidraw/pull/41) | [#31](https://github.com/CSCI-435-SE/excal
idraw/issues/31) | NotaThomas | CashenCroft  | Merged | Adds a "duplicate rotated..." option to the element context menu. |
| [#35](https://github.com/CSCI-435-SE/excalidraw/pull/35) | [#17](https://github.com/CSCI-435-SE/excalidraw/issues/17) | Thomas2839 | CashenCroft  | Reviewed | Web embeds default to layering under drawings instead of always on top. |
| [#34](https://github.com/CSCI-435-SE/excalidraw/pull/34) | [#16](https://github.com/CSCI-435-SE/excalidraw/issues/16) | Thomas2839 | CashenCroft  | Reviewed | Adds a copy/paste shortcut that only transfers an element's line width. |

# AI tool usage
Alex: (@tuna-fisher)
AI Logs Folder: ai-logs/sprint0/@tuna-fisher/

Anthony Williams (@AntWill-08)
AI Logs Folder: ai-logs/sprint0/AntWill-08/

Tools Used: Claude (Course Claude Team Plan)
Tasks Assisted: Unit test, assist in code implementations, and git workflows and finding CI issue.
Summary: My AI usage was primary for speeding up coding and test implementing process, helping learn to naviagte the repo, and understanding error in CI.

Brian: (@Thomas2839)
AI Logs Folder: ai-logs/sprint0/@Thomas2839/

Cashen Croft (@CashenCroft)
AI Logs Folder: ai-logs/sprint0/CashenCroft/

Tools Used: Claude (Course Claude Team Plan)
Tasks Assisted: Unit test mocking, TypeScript fixes, and git workflows.
Summary: Detailed session transcripts and key takeaways are documented in the folder linked above. Focused on bug fixing on test cases, with back and forth with Claude. Looked mainly into errors caused by failures in front-end information transfers.

Thomas: (@NotaThomas)
AI Logs Folder: ai-logs/sprint0/@NotaThomas/


Tristan: (@tristanraab)
AI Logs Folder: ai-logs/sprint0/@tristanraab/


# Release
v0.1.0-csci435-s0

# Risks and Challenges
The hardest aspect of sprint 0 was communication ,it served as a massive slowdown for creating enough issue and getting PR up in time for review.

# Sprint 1 Ideas

- Pursue the top backlog items ident (#33), snap-to-grid (#32), the web-embed layering fix (#17), hyperlink support (#15), and duplicate-with-offset (#31).
- Land the still-open Sprint 0 PRs (t 1 work starts from a clean, merged baseline.
- Fix or replace the broken `bundle-size-check'
- Set up a clearer AI-logging process/tooling so session logs are reliably captured and saved to `ai-logs/sprint0/<username>/`.
