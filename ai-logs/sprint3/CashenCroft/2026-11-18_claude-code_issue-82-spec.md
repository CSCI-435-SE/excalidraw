# Issue #82 spec draft (Claude, 2026-11-18T18:54:16.567Z)

Tool: Claude (Claude desktop app, Code tab). Excerpt of the session limited to the request for the #82 issue spec and the response; prompts and responses are verbatim, tool calls are listed by name and description.

---

_**User**_

Ok, im working on my next PR. You remember the rules for formatting correct? Can you give me an updated issue for Issue #82? You can reference the parent issue and #81 for how to build it properly

---

_**Assistant (tool use)**_: `Bash` - Read issue 82, parent 14, and sub-issues

---

_**Assistant (tool use)**_: `Bash` - Read relevant memories and frame rendering hints

---

_**Assistant**_

Here's #82 in the same format as #81. I based it on the parent #14 ("a layering to people's text so priority could be set per user's criteria") and built it on top of #116 and #81. Anything in `[brackets]` is a choice I made for you; check those first.

## 1. Issue body: paste over #82's description

```markdown
# Issue Description

## Summary

Adds **per-collaborator layering** to the collaborator dropdown from #116/#81. Each collaborator (including me and the "unknown / miscellaneous" bucket) can be placed in a **Front**, **Normal**, or **Back** layer. On my screen, everything in the Front layer is drawn above everything in Normal, which is drawn above everything in Back. Inside each layer, the shared drawing order is kept.

Like visibility and locking, this is local to my client. It never changes the shared drawing order, the elements, or what other collaborators see.

## User Story

**As a** collaborator in a shared session, **I want** to bring one collaborator's drawings in front of everyone else's on my own screen, **so that** their work doesn't get lost behind other people's drawings.

## User Scenario

A user is reviewing a teammate's diagram in a busy room, but other collaborators have drawn large shapes on top of it. Instead of moving or deleting anyone's work, they open the collaborator dropdown and set the teammate to **Front**. The teammate's diagram is now drawn on top on their screen, and clicking where the drawings overlap selects the teammate's element they can see. Later they press **Reset layers** and the original order returns. Nobody else in the room sees any change.

---

# Issue Classification

## Scope

**Generic:** Medium

**Specific:** Lesser Medium (5 points)

**Reason:** Builds on #116 and #81: ownership (`customData.creatorId`), the per-collaborator dropdown, and local-only AppState are already in place. This issue adds one more local per-collaborator value and a single pure ordering function, and applies it everywhere drawing order matters: canvas rendering, hit-testing (so the element you click is the one you see on top), and export. It also adds a layer control to each dropdown row. It touches the renderer and hit-test paths, which #81 did not, so it is larger than #81, but it needs no new ownership, sync, or server work.

---

# Expectations

## Acceptance Criteria

- [ ] **Criteria A: Per-collaborator layer control.** Each row in the collaborator dropdown, including my own row and the "unknown / miscellaneous" bucket, has a Front / Normal / Back control. Everyone starts in Normal. A **Reset layers** action puts everyone back in Normal.
- [ ] **Criteria B: Layer ordering.** On my canvas, every element from a Front collaborator is drawn above every Normal element, and every Normal element is drawn above every Back element. Within the same layer, elements keep the shared drawing order. When everyone is in Normal, the canvas looks exactly as it would without this feature.
- [ ] **Criteria C: What I click matches what I see.** Where elements overlap, clicking selects the element drawn on top in my local layering. If that element is locked (#81), the click passes through to the next interactive element underneath, as in #81 Criteria D.
- [ ] **Criteria D: Attached elements stay together.** A text label bound to a container is always drawn directly with its container, even if the label and container have different creators. Elements inside a frame are still clipped to that frame.
- [ ] **Criteria E: Shared-state integrity.** Changing layers changes no element (`index` and `version` stay the same) and sends nothing new to other collaborators. Other collaborators see the shared order. My own "Bring forward / Send backward" actions still change the shared order as before, and on my screen they take effect within the element's layer.
- [ ] **Criteria F: Local and non-persistent.** Layer settings apply only to my client, aren't added to undo/redo history, and reset when the page reloads, matching visibility (#116) and locking (#81).
- [ ] **Criteria G: Works with visibility and locking.** A hidden collaborator keeps their layer and is drawn in it when shown again. Locking or unlocking a collaborator doesn't change their layer, and changing a layer doesn't change their lock.
- [ ] **Criteria H: Export follows my view.** PNG/SVG export uses my local layering, the same way #116 exports reflect my local visibility. [Choice: export follows my view rather than the shared order.]

## Resolved Questions

- **How are elements tied to collaborators?** Through `customData.creatorId` from #116; untagged and never-seen creators use the miscellaneous bucket.
- **Can I change my own layer?** Yes. Unlike locking, layering my own drawings is useful (for example, sending my own sketches to the back).
- **What happens to z-order inside a layer?** The shared drawing order is kept, so the existing z-order actions still work inside each layer (Criteria B, E).
- **Do settings persist?** No. They reset on reload, like visibility and locking (Criteria F).

---

# Extra

## Out of Scope

- Changing the shared drawing order (element `index`) for anyone.
- A full ranked list of every collaborator (for example, drag-to-reorder). The stored value is designed to support this later (see the Design comment).
- Per-element priority (layering individual elements rather than collaborators).
- Default layers for new joining users (#83).
- Syncing or saving layer preferences.

## Related

- **Depends on:** #116 (visibility, ownership, dropdown) and #81 (locking; interaction rules for Criteria C)
- **Design decisions:** see the Design comment below

## Head Issue

Issue (#14): Allow a togglable Layer in which all users are compartmentalized by interactivity and visibility.
```

## 2. Design comment: post on #82

```markdown
## Design

| Field | Description |
| --- | --- |
| Decision | Store a numeric layer priority per collaborator (`collaboratorLayerPriority: Map<creatorId, number>` in AppState; Back = -1, Normal = 0 / missing, Front = 1; never persisted, exported in state, or synced). One pure function in `element/ownership.ts`, `orderByCollaboratorLayer(elements, appState)`, does a stable sort by priority, keeps bound text with its container, and is used by the renderer, hit-testing, and export. |
| Alternates Considered | 1. A three-value enum (`"front" \| "normal" \| "back"`) instead of a number. 2. Reorder the actual scene, changing each element's shared `index` (fractional index) to move a collaborator's elements to the front. |
| Rationale | A number gives the same three-layer UI today, but a future issue can offer a full ranking (1, 2, 3…) without changing the stored shape or the sort, whereas an enum would have to be replaced. Alternative 2 is rejected: `index` is shared scene data, so reordering it would sync to every collaborator, create undo entries, and break Criteria E. A stable sort keeps the shared order within each layer, so existing z-order actions keep working (Criteria B). |
| Consequences | Every place that depends on drawing order must use the same ordered list, or what's drawn and what's clicked would disagree (Criteria C), so the ordering lives in one function with its own unit tests. Sorting adds a small per-render cost, avoided entirely when every priority is Normal (the function returns the original array). |
```

## Before you paste

- **Check the bracketed choice in Criteria H.** I had export follow your local view, to match how #116 handles hidden elements in exports. If you'd rather exports use the shared order, change H and the matching sentence in the Design comment.
- **Choose the scope.** I put it at **Lesser Medium (5)**, not the current Greater Medium (8). #81 grew to about 500 lines of code from a Small estimate, and this one also touches rendering and hit-testing, so 5 is defensible. 8 might get reclassified as overstated. Remember you need about two mediums' worth of points in total.
- **Get a new spec review before coding.** The current #82 has placeholder ACs ("Criteria A requirements"), so AntWill-08 needs to review this version and say what they checked.
- **Timing:** everything is due **tomorrow, Nov 19**, and that includes D6 mutation testing for #81. If #82 can't be reviewed, built and merged by tomorrow night, tell your team and plan it as Sprint 4 carryover rather than rushing it.
