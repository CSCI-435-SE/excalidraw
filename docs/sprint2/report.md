\# Team Name

Team Sketch

\# Team Members

Alex (@tuna-fisher) Anthony (@AntWill-08) Cashen (@CashenCroft) Thomas (@NotaThomas) Tristan (@tristanraab)

\# Project

Excalidraw \[[https\://github.com/CSCI-435-SE/excalidraw.git](https://github.com/CSCI-435-SE/excalidraw.git)\]

\# Sprint Overview

The team planned to complete 12 issues during Sprint 2 (two medium and one small for 535 students and two medium for 435 students). Two additional sub-issues were closed, as their modifications were implemented in a previous sub-issue or as a consequence of a similar issue. Most subissues covered separate issues, with continuation of Sprint 1’s large parent issues being completed.

The team delivered several features across language accessibility, display bugfixes, grid layering, shape masking, gradient color picker, and client-to-client QOL features. Work mainly covered front-end tool usage, but client-to-client features were implemented and back-end was understood thoroughly with discussion on future client-to-client work. Additional work included AI usage documentation, midpoint, and diagrams.

All assigned issues have been completed. Two issues were closed and replaced with newer issues due to previous implementation as stated above, and one issue was split into two subissues as integration was more complex than originally expected. Workflow was significantly more efficient in this sprint, likely due to better timings with exams, and midpoints implementation. AI usage of students has gotten more efficient and effective, and team members are seen communicating better with both agents and peers with higher consistency.

\# Sprint Backlog Summary

\[Sprint 2 Milestone\]([https\://github.com/CSCI-435-SE/excalidraw/milestone/2](https://github.com/CSCI-435-SE/excalidraw/milestone/2))

\| Issue Title \| Owner \| Estimated Points \| Scope \| Status \|  
\|---\|---\|---:\|---\|---\|  
\| \[\#138 — Add Support for More Alphabets\](https\://github.com/CSCI-435-SE/excalidraw/issues/138) \| NotaThomas \| 8 \| Medium \| Merged \|  
\| \[\#115 — Dark Mode Also Inverts Element Colors\](https\://github.com/CSCI-435-SE/excalidraw/issues/115) \| tristianraab \| S4 \| Small \| Merged \|  
\| \[\#114 — Implement Gradient Color Picker\](https\://github.com/CSCI-435-SE/excalidraw/issues/114) \| AntWill-08 \| 8 \| Medium \| Merged \|  
\| \[\#80 — Implement Per-User Visibility & Interactivity Controls\](https\://github.com/CSCI-435-SE/excalidraw/issues/80) \| CashenCroft \| 8 \| Medium \| Merged \|  
\| \[\#74 — Add Mask Groups, Copy/Paste, and Persistence\](https\://github.com/CSCI-435-SE/excalidraw/issues/74) \| AntWill-08 \| 8 \| Medium \| Merged \|  
\| \[\#73 — Enhance Mask Transformations and Selection\](https\://github.com/CSCI-435-SE/excalidraw/issues/73) \| AntWill-08 \| 8 \| Medium \| Merged \|  
\| \[\#72 — Support Masked Content\](https\://github.com/CSCI-435-SE/excalidraw/issues/72) \| tuna-fisher \| 8 \| Medium \| Merged\|  
\| \[\#70 — Implement Basic Shape Masking\](https\://github.com/CSCI-435-SE/excalidraw/issues/70) \| tuna-fisher \| 8 \| Medium \| Merged \|  
\| \[\#60 — Implement Image Filter System\](https\://github.com/CSCI-435-SE/excalidraw/issues/60) \| CashenCroft \| 5 \| Medium \| Merged \|  
\| \[\#59 — Add Grid Layer and Interaction Behavior\](https\://github.com/CSCI-435-SE/excalidraw/issues/59) \| tristianraab \| 5 \| Medium \| Open \|  
\| \[\#58 — Implement Grid Snapping\](https\://github.com/CSCI-435-SE/excalidraw/issues/58) \| No-one (Completed by Other Issue) \| 5 \| Medium \| Closed \|  
\| \[\#17 — Prevent Web Embeds from Always Appearing on Top\](https\://github.com/CSCI-435-SE/excalidraw/issues/17) \| No-one (Closed as not Planned) \| 3 \| Small \| Closed \|  
\| \[\#7 — Add a HUD Size Slider to Preferences\](https\://github.com/CSCI-435-SE/excalidraw/issues/7) \| tristianraab \| S3 \| Medium \| Merged \|  
\| \[\#6 — Filter Initial Pointer Jumps to Remove Artifacts at Higher Zoom\](https\://github.com/CSCI-435-SE/excalidraw/issues/6) \| CashenCroft \| S3 \| Medium \| Merged \|

\# Requirements and Design

Specs handled before coding are the Out of Scope, Acceptance Criteria, User Scenario, Summary, User Story and the Open Question.

The design decisions along with their alternatives, rationals, and consequences are handled before or during implementation. All design decisions were handled in Issue comments or PR comments so there is no Design Markdown this sprint.

\# Completed Issues

\| Issue Title \| Issue Owner (Posted/Updated & Implement ) \| Associated PR(s): Link, Author, Reviewer(s), Status \| Brief Description of Changes \|  
\|---\|---\|---\|---\|  
\| \[\#6 — Filter initial pointer jumps to remove artifacts at higher zoom\](https\://github.com/CSCI-435-SE/excalidraw/issues/6) \| CashenCroft/NotaThomas \| \[PR \#126\](https\://github.com/CSCI-435-SE/excalidraw/pull/126) — Author: Thomas (@NotaThomas); Reviewer: Cashen (@CashenCroft); Merged \| Fixes issue where Excalidraw's freehand rendering engine produces sharp polygon-based artifacts and cuts along line borders when drawing a new stroke. \|  
\| \[\#7 — Add a HUD size slider to preferences.\](https\://github.com/CSCI-435-SE/excalidraw/issues/7) \| CashenCroft/tristanraab \| \[PR \#130\](https\://github.com/CSCI-435-SE/excalidraw/pull/130) — Author: Tristan (@tristanraab); Reviewer: Anthony (@AntWill-08); Merged \| Adds slider to resize the HUD menu manually for different window sizes \|  
\| \[\#59 — Add Grid Layer and Interaction Behavior\]([https\://github.com/CSCI-435-SE/excalidraw/issues/59](https://github.com/CSCI-435-SE/excalidraw/issues/59)) \| AntWill-08/tristanraab\| \[PR \#139\]([https\://github.com/CSCI-435-SE/excalidraw/pull/139](https://github.com/CSCI-435-SE/excalidraw/pull/139)) — Author: Tristan (@tristanraab ); Reviewer: Cashen (@CashenCroft ); Merged \| Implement the custom layering behavior required for the board grid. The grid should be able to appear above or below drawing content according to the user's chosen layer, while never becoming selectable as a normal top-level object. \|  
\| \[\#60 — Implement Image Filter System\](https\://github.com/CSCI-435-SE/excalidraw/issues/60) \| AntWill-08/CashenCroft \| \[PR \#131\](https\://github.com/CSCI-435-SE/excalidraw/pull/131) — Author: Cashen (@CashenCroft); Reviewer: Anthony (@AntWill-08); Merged \| Integrating image-filter controls with the existing image rendering and editing workflow while preserving the original image data and existing image functionality. \|  
\| \[\#70 — Implement Basic Shape Masking\](https\://github.com/CSCI-435-SE/excalidraw/issues/70) \| AntWill-08/tuna-fisher\| \[PR \#119\](https\://github.com/CSCI-435-SE/excalidraw/pull/119) — Author: Alex (@tuna-fisher); Reviewer: Anthony (@AntWill-08); Merged \| Introduces a new masking behavior that requires mask controls, clipping logic, and integration with existing element rendering and editing.\|  
\| \[\#72 — Support Masked Content\](https\://github.com/CSCI-435-SE/excalidraw/issues/72) \| AntWill-08/tuna-fisher\| \[PR \#142\](https\://github.com/CSCI-435-SE/excalidraw/pull/142) — Author: Alex (@tuna-fisher); Reviewer: Thomas (@NotaThomas); Merged \| Images can now be masked, the same way as shapes, arrows, freedraw and text and hidden parts of a masked element can no longer be clicked, hovered or dragged. \|  
\| \[\#73 — Enhance Mask Transformations and Selection \]([https\://github.com/CSCI-435-SE/excalidraw/issues/73](https://github.com/CSCI-435-SE/excalidraw/issues/73)) \| AntWill-08 \| \[PR \#141\]([https\://github.com/CSCI-435-SE/excalidraw/pull/141](https://github.com/CSCI-435-SE/excalidraw/pull/141)) — Author: Anthony (@AntWill-08); Reviewer: Thomas (@NotaThomas ); Merged \| A user creates a mask using one of the pre-built stamps and places content inside it. The user can then modify the mask's masking behavior, such as choosing whether the area inside or outside the mask is visible. \|  
\| \[\#74 — Add Mask Groups, Copy/Paste, and Persistence\](https\://github.com/CSCI-435-SE/excalidraw/issues/74) \| AntWill-08 \| \[PR \#135\](https\://github.com/CSCI-435-SE/excalidraw/pull/135) — Author: Anthony (@AntWill-08 ); Reviewer: Tristan (@tristanraab ); Merged \| Adapting Excalidraw's grouping behavior to preserve mask-to-element relationships, including groups containing multiple masks and masks that share elements.\|  
\| \[\#80 — Implement Per-User Visibility & Interactivity Controls\](https\://github.com/CSCI-435-SE/excalidraw/issues/80) \| AntWill-08/CashenCroft \| \[PR \#116\](https\://github.com/CSCI-435-SE/excalidraw/pull/116) — Author: Cashen (@CashenCroft ); Reviewer: Anthony (@AntWill-08 ); Merged \| Allow users to independently control which collaborators' drawings are visible and interactive on their own client.\|  
\| \[\#114 — Implement Gradient Color Picker\](https\://github.com/CSCI-435-SE/excalidraw/issues/114) \| AntWill-08 \| \[PR \#117\](https\://github.com/CSCI-435-SE/excalidraw/pull/117) — Author: Anthony (@AntWill-08); Reviewer: Alex (@tuna-fisher); Merged \| Add a new method for choosing colors in the gradient other than just letting user color pick from colors already on the canvas. The new method for choosing colors for the gradient tool is a color wheel with darkness sliders.\|  
\| \[\#115 — Dark mode also inverts element colors\](https\://github.com/CSCI-435-SE/excalidraw/issues/115) \| AntWill-08/tristanraab \| \[PR \#118\](https\://github.com/CSCI-435-SE/excalidraw/pull/118) — Author: Tristan (@tristanraab ); Reviewer: Anthony (@AntWill-08); Merged \| Excalidraw's dark mode seems to invert black and white across the entire application, including element fills, instead of just the background. For example, it changes light pinks to dark red when it is turned on.\|  
\| \[\#138 — Add support for more alphabets \]([https\://github.com/CSCI-435-SE/excalidraw/issues/138](https://github.com/CSCI-435-SE/excalidraw/issues/138)) \| NotaThomas \| \[PR \#145\]([https\://github.com/CSCI-435-SE/excalidraw/pull/145](https://github.com/CSCI-435-SE/excalidraw/pull/145)) — Author: Thomas (@NotaThomas); Reviewer: Anthony (@AntWill-08 ); Merged \| Adding support for selecting all Unicode characters regardless of keyboard you are using, which doesn't currently exist. \|  
\| \[\#17 — Prevent web embeds from always appearing on top\](https\://github.com/CSCI-435-SE/excalidraw/issues/17) \| NotaThomas\| Closed; invalid due to the implementation of another issue \| Web embeds always stack on top of other elements regardless of the stacking order. The app should allow users to render web embeds under other elements. \|  
\| \[\#58 — Implement Grid Snapping\](https\://github.com/CSCI-435-SE/excalidraw/issues/58) \| AntWill-08\| Closed; Completed due to parts being covered in other subissues \| Add optional snapping of elements to the grid. Which users can enable or disable grid snapping independently from grid visibility. Snapping should use the configured grid scale and work alongside Excalidraw's existing movement and alignment behavior. \|

\#Test Strategy

Our team used automated tests alongside individual implementation and review of tests to check new behavior and its functionality against pre-existing code. Test cases made by ai were reviewed line by line to understand implementation, alongside explanation by the agent to understand coverage and importance. Code implemented was reviewed by design flow of variables and location in the files directly to understand what changes occurred and how many files it affected.

Testing included:

- Unit and component tests for new functionality.
- Regression testing for existing editor behavior.
- Export tests for gradient and SVG behavior.
- Validation of configuration, persistence, and compatibility where applicable.
- CI checks for typechecking, linting, formatting, and automated tests.
- Individual checks to manually test functionality
- Individual review of code by a peer to check for errors missed by author & ai.

Bucket size being the only CI check has been removed due to incompatibility with yarn monorepo.

\# Midpoint report

\[Midpoint report for team Sketch\]([https\://github.com/CSCI-435-SE/excalidraw/tree/master/docs/sprint2/checkin](https://github.com/CSCI-435-SE/excalidraw/tree/master/docs/sprint2/checkin))

\# UML Diagrams

\[UML Link\] ([https\://github.com/CSCI-435-SE/excalidraw/tree/master/docs/sprint2/diagrams](https://github.com/CSCI-435-SE/excalidraw/tree/master/docs/sprint2/diagrams))  
Alex: Issue \#70  
Anthony: Issue \#114  
Cashen: Issue \#60  
Thomas: Issue \#138  
Tristan:Issue \#7

\# AI tool usage

Alex: (@tuna-fisher) \[AI Logs Folder:\]([https\://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/tuna-fisher](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint1/tuna-fisher))  
\*\*Used Claude Code\*\*  
\*\*Sessions Logged:\*\* 2  
\*\*Patterns:\*  
Used claude code for the same reasons in all sprints.

Anthony Williams (@AntWill-08)  
\[AI Logs Folder:\]([https\://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/AntWill-08](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/AntWill-08))  
\*\*Used Claude Code for…\*\*  
Testing, Implementation, Debugging, rarely pushing issues  
\*\*Sessions Logged:\*\* 3  
\*\*Patterns:\*\* In both Sprint 0 \- 2, I used Claude for the same reasons in all Sprints

Cashen Croft (@CashenCroft) \[AI Logs Folder:\](https\://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/CashenCroft)  
\*\*Used Claude Code for…\*\*  
Agentic implementation of assigned Sprint 2 issues, architectural analysis, debugging, code review, and test development. I used Claude Code to implement per-user visibility and interactivity controls (\#80) and a grayscale image filter system (\#60). For both issues, I reviewed the generated changes and traced how they interacted with Excalidraw’s existing components, application state, element models, rendering pipeline, and tests. I focused on preserving existing functionality and ensuring the new features followed the codebase’s established abstractions and separation of concerns.  
\*\*Sessions Logged:\*\*  
Claude Code sessions documenting implementation, design decisions, debugging, code review, and testing for both assigned issues. I maintained dedicated AI interaction logs for Issue \#80 and Issue \#60. (2) Utilized AI for a test fix for long runtimes on CI check server, but was not implemented and therefore still contained within the branch. (+1)  
\*\*Patterns:\*\*  
I used an iterative implementation-and-review workflow, focusing on architectural consistency and data integrity. For Issue \#80, I separated local collaborator visibility and interactivity preferences from shared scene data. For Issue \#60, I integrated grayscale filtering into the existing image-editing workflow without modifying the original image data. Compared with Sprint 1, I used agentic AI more efficiently, documented design decisions more explicitly, and traced changes across components and rendering logic to validate correctness and reduce regressions. I focused more on visual understanding to understand flow and the chain effects visually through the Claude Code terminal. I also completed issue \#80 in \~6 large steps with stop with manual non-UI based injection testing into the webpage to test stamping and variables before implementing invasive UI controls.

Thomas: (@NotaThomas) \[AI Logs Folder:\]([https\://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/NotaThomas](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint1/NotaThomas) )  
\*\*Tools used\*\*: Claude code for scoping, implementation, testing  
\*\*Sessions Logged\*\*: 3  
\*\*Patterns\*\*: I manually looked through the code for where I though I would need to make changes in order to solve my issues (\#6 and \#138). I then had the AI describe how it would go about implementing the change that I desired. When the AI’s description of the change matched what I believed needed to be done based on my own look through, I would allow the AI to implement the changes. I then had the AI assist me in making test cases, and I would also manually check that the feature worked as intended. All pushes and reviews were done manually. I used AI similarly to how I did in sprints 0 and 1\.

Tristan: (@tristanraab) \[AI Logs Folder:\]([https\://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint2/tristanraab](https://github.com/CSCI-435-SE/excalidraw/tree/master/ai-logs/sprint1/tristanraab) )  
Tools used: Copilot  
Sessions Logged: 2  
Patterns: I used AI to implement my two medium issues (\#7) (\#59), while I personally did my small issue (\#115) without AI. It took around the same time to do the medium issues as the small issue, but the small issue was less annoying to implement because with AI, a lot of the time I would have to go back and fix the code it wrote. I also used AI to help create my two UML diagrams, which really helped as I am not super familiar with formatting UML diagrams. Then, when it created the diagrams, I could go back and manually edit it to make small fixes when they were necessary.

\# Release  
v0.1.0-csci435-s2  
\[Release 2\]([https\://github.com/CSCI-435-SE/excalidraw/releases/tag/v0.1.0-csci435-s2](https://github.com/CSCI-435-SE/excalidraw/releases/tag/v0.1.0-csci435-s2))

\# Risks and Retrospective

Communication risks have severely lowered. While assignments are procrastinated, a noticeable uptick in when issues are completed has been noted. Risks related to communication have thankfully been mostly mitigated by this point. Bundle Size check has been dropped due to its incompatibility with the inherent characteristics of the mono-repo. Linting has not been an issue, past a miscommunication with excalidraw-room inclusion, but it was fixed.

Issues abandoned were implemented without issue, and most issues have been individual and user error.

Possible future risks cover mainly design philosophy in architectural design as our changes become more complex and innovative. The second biggest possible risk is the expanding risk of issues poorly covered by test cases, leading to future branch merges leading to failures of features not tracked by the issue, which could lead to silent bugs. To mitigate this possible risk we should likely focus on utilizing AI and external code-checkers to test coverage of newly implemented code.

\# Sprint 3 Plan

During Sprint 2, we implemented some of our most longstanding issues with Excalidraw. We also focused on completing a previously started large issues subissues and fully doing an entire other large issue. Besides that we started 2 new subissues focused on image filter editing and the other finally started the back end focus for client to client control on visibility and intractability. Lastly we broke issue 40 into 2 subissues to better handle it and completed 1 of the 2 of them this sprint.

The back-end client-to-client has been expanded and understood more. We still need deliberation whether client-based administration is worth implementation or a complete overhaul of the client-to-client connection. Our choice on how to go forward or whether we should scrap administrative features and stick to client-side QOL features will be decided and looked into for Sprint 3\.

For sprint 3 we want to continue these 3 large issues which are divided into an extra 9 subissue. As well as starting work on some more large issues since the last of the standalone medium and small issues were handled this sprint. We have no current reason to start more issues so we are focused on completing all that parts that these large issues are broken down into.
