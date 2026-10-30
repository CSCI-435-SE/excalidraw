# Issue #70 -- Basic Shape Masking

## Diagrams

- [Class Diagram](70-tuna-fisher-class.png)
- [Sequence Diagram](70-tuna-fisher-sequence.png)

---

## Q&A

### Class Diagram

1. **Among all the classes shown in the diagram, which 1–2 are most central to understanding the codebase and solving the issue? Explain what role each one plays.**

   ExcalidrawElement contains every item/shape on the canvas, and in this issue, maskId (goes on clipped element and holds id of mask) and maskEnabled(goes on the mask shape and says yes or no) both rely on these elements, and the entire masking system is built upon these two fields.

2. **What is the most significant relationship shown in the diagram? Explain what it represents in the system and why it matters for understanding the solution.**

   the arrow from excalidrawelement pointing back to itself (maskId) represents the core of the masking system. a clipped element is simply linked to their mask element (two elements hence the arrow pointing back unto itself), and a new 'mask' object isnt created, which is important bc removing/disabling is seamless because it's simply clearing the maskid, (same with undo/redo), and it makes rendering much simpler.

3. **Looking back at your implementation, is there anything in this design you would change, and why?**

   allowing only one maskid per element only allows one element per mask (obviously?), but I only really did this so it wouldn't encroach upon issue #72's bounds and it was a single line change to make it so it would.

---

### Sequence Diagram

1. **What user action or system event starts the sequence, and what is the expected outcome when it completes successfully?**

   select a shape -> enter masking mode thru any number of methods -> double click any number of targets -> double click off target(s) or click done -> target(s) are now drawn as being clipped to the mask!

2. **Identify the 2–3 most important steps in the sequence. For each one, describe what is happening and note whether it involves existing code or new/modified code from your solution.**

   - (new) actiontogglemask checks canbecome mask before entering picking mode
   - (new -- mostly..) actionapplymask sets targetmaskId, which is captured immediately so undo can be run if necessary

3. **What error cases or alternative paths are not shown in the diagram, and why did you leave them out?**

   ctrl+alt+g again cancels masking mode, doubleclick empty canvas also closes masking mode, didn't include them bc they were like incredibly short deadend routes.

---

### Cross-Cutting

1. **If you used AI to create or check any part of the diagrams, describe what it produced, what you verified against the actual code, and what you had to correct or add. If AI was not used, write "N/A."**

   drafted a diagram for lucidchart and then discovered plantUML, decided to transcribe it manually (so i actually understood how to use it) and revise it using ai.
