# Issue #83 spec draft (Claude, 2026-11-19T06:51:15.731Z)

Tool: Claude (Claude desktop app, Code tab). Excerpt of a session, limited to the request for the #83 branch and issue spec, the clarifying questions and answers, and the spec draft. Prompts and responses are verbatim; tool calls are listed by name and description, without their outputs.

---

_**User**_

Can you make a new branch for issue #83, and start writing the spec. Do it the same as last time, and capture right after this message to show prompting that it was generated through claude code. You are allowed to reference previous subissues and parent issues for examples. Ask me for any clarifications before commiting the Spec.

---

_**Assistant (tool use)**_: `Bash` - Read issue 83, issue 84, and PR 180 state

---

_**Assistant (tool use)**_: `Bash` - Create the #83 branch from latest master

---

_**Assistant (tool use)**_: `AskUserQuestion`, asking:

- #83: What should the default for newly joining collaborators offer? (Interactivity requires visibility, per #81, so 'hidden but interactive' can't exist.)
  - Visible / Locked / Hidden (Recommended): One 3-way choice: newcomers appear normally, appear but locked (visible-only, #81), or start hidden (#116). Matches the valid states.
  - Visible / Hidden only: Simpler: just choose whether newcomers start hidden. No locked option.
  - Two separate switches: A 'visible' switch and an 'interactive' switch, with interactive disabled while visible is off.
- #83: Who counts as a 'new' collaborator that the default applies to?
  - First time seen in this room (Recommended): Anyone not yet in #116's collaborator directory. Someone who left and rejoins keeps whatever you set for them.
  - Anyone who joins: The default is re-applied every time someone (re)joins, even if you'd changed their setting before.
- #83: When I change the default, what happens to collaborators already in the room?
  - Only future newcomers (Recommended): Existing collaborators keep their current settings; the existing Show all / Hide all / Lock all controls cover them.
  - Apply to everyone now: Changing the default also changes every current collaborator (except me).
- #83: Should the default setting survive a page reload?
  - Yes, remember it (Recommended): Saved locally as a preference, so a team lead doesn't have to set it every session. Per-collaborator hide/lock still reset on reload as in #116/#81.
  - No, reset on reload: Same as visibility, locking and layering: everything local resets on reload.

---

_**User** (sent while the assistant was working)_

Newcomers should appear last right above miscellanous if layering is turned on and they join. They should be visible but locked.

New is anyoone who is first seen

ONly future newcomers

yes, remember preference locally. This should build in a baseline persistance for all these settings in this menu.

---

_**Assistant**_

Thanks, that settles all four questions. Two of your answers change earlier features, so I've written them into the spec explicitly:

- **Persistence:** "reset on reload" was an AC in #116, #81 (G) and #82 (F). #83 now replaces that with saving locally.
- **Newcomers when layering is on:** #82's Criteria H put newcomers at the very bottom. #83 changes it to **directly above Miscellaneous**.

I read "visible but locked" as the **default value** of a setting that still offers Visible, Locked and Hidden, since #83's summary asks for a _configurable_ default. Tell me if you meant locked should be the only behavior.

## 1. Issue body: paste over #83's description

```markdown
# Issue Description

## Summary

Adds a **default for newcomers** and **saved settings** to the collaborator dropdown from #116, #81 and #82.

- **Newcomer default.** A "New collaborators" setting (**Visible / Locked / Hidden**, default **Locked**) decides how a collaborator is treated the first time this client sees them. With the default, newcomers' drawings are visible but can't be selected or edited (#81's visible-only mode) until I unlock them.
- **Newcomers in the layer order.** While layering is on (#82), a newcomer is placed last, **directly above "unknown / miscellaneous"**.
- **Saved settings.** This menu's settings are remembered locally across page reloads: the newcomer default, hidden collaborators, locked collaborators, the Layering switch, and the layer order.

Like the rest of this menu, everything is local to my client. It never changes the shared scene or what other collaborators see.

## User Story

**As a** collaborator in a busy or open room, **I want** people I see for the first time to start visible but locked on my screen, and my visibility, lock and layering choices to be remembered, **so that** newcomers can't be accidentally edited or clutter my view, and I don't have to set everything up again each session.

## User Scenario

A team lead runs a design session in a shared room. Before anyone new arrives, the "New collaborators" setting is already on Locked (the default). When a new student joins and starts drawing, the lead can see the student's work but can't accidentally select or move it. Because layering is on, the student is placed just above Miscellaneous in the layer order. The lead unlocks the student once they've settled in. The next day, the lead reopens the room: the layering order, the hidden and locked collaborators, and the newcomer setting are all as they left them. Nobody else in the room sees any of these settings.

---

# Issue Classification

## Scope

**Generic:** Medium

**Specific:** Lesser Medium (5 points)

**Reason:** Builds on #116 (collaborator directory, which already records each collaborator the first time they're seen, and is already saved per room), #81 (locking) and #82 (layer order). This issue adds one setting, applies it at the point the directory records a new collaborator, changes where newcomers enter the layer order, and adds a small local persistence layer that saves and restores this menu's settings. It touches no element data, sync, or server code.

---

# Expectations

## Acceptance Criteria

- [ ] **Criteria A: Newcomer default setting.** The collaborator dropdown has a "New collaborators" setting with three options: Visible, Locked, Hidden. It defaults to **Locked**.
- [ ] **Criteria B: Applied to first-seen collaborators.** When this client sees a collaborator for the first time (they aren't in the collaborator directory yet), they start in the chosen state: Visible → visible and interactive; Locked → visible but locked; Hidden → hidden (and therefore locked, per #81). A collaborator seen before (in the directory, even if they left) is not affected when they rejoin.
- [ ] **Criteria C: Only future newcomers.** Changing the setting doesn't change any collaborator already seen. The existing Show all / Hide all / Lock all / Unlock all controls still work for them.
- [ ] **Criteria D: Newcomers in the layer order.** While layering is on, a newcomer is added directly above "unknown / miscellaneous" (below every collaborator already in the order). Several newcomers are added in join order. This replaces #82's Criteria H ("added to the bottom").
- [ ] **Criteria E: Me and Miscellaneous.** The setting never applies to me or to the "unknown / miscellaneous" bucket.
- [ ] **Criteria F: Settings are remembered.** After a page reload, the newcomer default, hidden collaborators, locked collaborators, the Layering switch and the layer order are restored as I left them. [Choice: the newcomer default is one preference for all rooms; the other settings are saved per room, like #116's directory.] This replaces the "resets on reload" criteria of #116, #81 (G) and #82 (F).
- [ ] **Criteria G: Local only.** Saved settings stay on this device. They are never synced to other collaborators, included in exported files or shared links, or added to undo/redo history.
- [ ] **Criteria H: Shared-state integrity.** Applying the default or restoring saved settings changes no element (`index` and `version` stay the same) and sends nothing new to other collaborators.
- [ ] **Criteria I: Safe restore.** Saved settings that refer to collaborators no longer known, or that are unreadable or from an older version, are ignored without errors, falling back to the defaults. [Choice: hiding my own drawings is not restored on reload, so a room never opens stuck in view mode (#116 forces view mode while my own drawings are hidden).]

## Resolved Questions

- **Who is "new"?** Anyone this client sees for the first time, meaning they aren't in #116's collaborator directory yet.
- **Does changing the default affect people already here?** No, only future newcomers (Criteria C).
- **Where do newcomers go in the layer order?** Directly above Miscellaneous (Criteria D).
- **Can the default control what the newcomer sees?** No. Like the rest of #14, it only changes what _I_ see on my own screen.

---

# Extra

## Out of Scope

- Controlling what other collaborators see, or any server-side permissions.
- Syncing settings between devices or accounts.
- Notifying me when a newcomer joins.
- Per-room newcomer defaults.
- Changes to how ownership, co-ownership (#84) or the layer ordering rule itself work.

## Related

- **Depends on:** #116 (directory, visibility), #81 (locking), #82 (layer order; PR #180, which this issue changes in Criteria D)
- **Design decisions:** see the Design comment below

## Head Issue

Issue (#14): Allow a togglable Layer in which all users are compartmentalized by interactivity and visibility. (#14: "A default for new joining users so that you don't have to see all users.")
```

## 2. Design comment: post on #83

```markdown
## Design

| Field | Description |
| --- | --- |
| Decision | Save this menu's settings in **localStorage**, alongside #116's per-room collaborator directory: one entry per room for hidden collaborators, locked collaborators, the Layering switch and the layer order, plus one global entry for the newcomer default. They're read when a room loads and written when they change, through one small module with a version number. AppState keeps these fields `browser`/`export`/`server` `false`, so they still never reach exports or sync; persistence is handled separately. |
| Alternates Considered | 1. Mark the fields `browser: true` in AppState, so Excalidraw's existing local save stores them. 2. Store them in IndexedDB. |
| Rationale | Alternative 1 saves AppState as one global blob, not per room, so a hidden collaborator in one room would carry into every other room. It also mixes these settings with the scene save, where they're easy to leak into files. Alternative 2 is asynchronous and heavier than needed for a few small lists. A per-room localStorage entry matches how #116 already stores the directory, is synchronous at load, and keeps all this menu's persistence in one place. |
| Consequences | Saved settings can refer to collaborators who never return; they're kept in the room's entry (small) and ignored if unknown. A version number lets later issues add settings without breaking old entries. Hiding my own drawings is deliberately not restored (Criteria I). |
```

## Check these before posting

1. **Default value vs only behavior.** I made Locked the default of a three-way setting. If you meant newcomers should _always_ be visible but locked, Criteria A and B get simpler and the setting goes away.
2. **Criteria F:** the newcomer default applies to **all rooms**, while hidden, locked and layering are saved **per room**. Saving hidden or locked people globally would carry them into unrelated rooms.
3. **Criteria I:** hiding your **own** drawings isn't restored after a reload. Otherwise a room could reopen stuck in #116's forced view mode.
4. **Scope:** I moved it from Small (3) to **Lesser Medium (5)**, because the persistence layer is new work.
5. **It depends on #180.** Criteria D changes #82's code, and the dropdown differs between `master` and #180. Start implementing only after #180 merges, then merge `master` into this branch.

## The AI log

Once you confirm or change the spec, I'll export this exchange (your #83 request through the final spec) as a word-for-word excerpt. It will be named `ai-logs/sprint3/CashenCroft/2026-11-19_claude-code_issue-83-spec.md`, formatted with Prettier, and committed as the **first commit** on `feat/issue-83-default-behaviors-for-new-users`. Nothing is committed yet; the branch currently matches `master`.

---

_**User**_

No you cant pull from main you need to pull from my branch for now, since i need what we already implemented.

---

_**Assistant (tool use)**_: `Bash` - Rebase the empty #83 branch onto the #82 branch

---

_**Assistant (tool use)**_: `Bash` - Point the #83 branch at the #82 branch's tip

---

_**Assistant**_

Done. `feat/issue-83-default-behaviors-for-new-users` now starts from your #82 branch at `9c010122`, which is the same commit locally and on GitHub. So it already has layering, the #81 locking, the #84 integration and the export-freeze fix.

- **Nothing was lost.** The #83 branch had no commits of its own yet, so I just moved it to the #82 branch's latest commit. Your untracked files (`docs/showcase2/README.md`, `pr-82.md` and Stryker's local `reports/` folder) are untouched.
- **When you open the #83 PR,** it will show all of #82's commits until #180 merges. You can either:
  - target the PR at `feat/issue-82-user-priority-and-layering`, so it shows only #83's changes, or
  - wait for #180 to merge, then merge `master` into this branch and target `master`.
- **If #180 changes during review,** for example a reviewer asks for edits, merge the updated #82 branch into this one before building on those parts.

The spec still needs your confirmation. Once you say it's good, or tell me what to change, I'll make the word-for-word AI log excerpt of this #83 exchange and commit it as the first commit on this branch.
