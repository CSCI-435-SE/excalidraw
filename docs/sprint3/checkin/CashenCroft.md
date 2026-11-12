# Sprint 3 Individual Check-in

**Code PR:** [#154 — feat(editor): local collaborator lock / visible-only mode (#81)](https://github.com/CSCI-435-SE/excalidraw/pull/154) (open, ready for review)

## 1. What have you implemented so far, and what remains?

I have implemented a compartmentalized functionality to visibility and intractability, so that the user can choose to keep a peers drawing visible, but not directly modifiable. This allows users to work together without messing up collaborators work. Added functional UI to flush the feature out.

I have yet to implement the layering functionality, nor have I implemented the default behavior settings for users to manage joining members.

## 2. What is one thing you learned about testing in your project?

Styling an advanced prompt which extra failsafe checks in can help prevent AI from going rogue and implementing past your expectations. This heavily limits intent debt, and allows for easier conversational coverage of issues in a properly structured "planning" phase.

## 3. What is one risk to finishing your work by Nov 19, and what will you do about it?

I risk conflicting with future and previous implementation of client-to-client communication while I implement new features. If issues have conflicting ideas on how visibility and filter will work (i.e., one sub-issue believes disabled peers shouldn't be able to see the user that disabled them, this breaks previous implementation logic and tests.) I will focus on understanding and properly prompting AI so that there is a clear and distinct path going forward with implementation of my sub-issues.
