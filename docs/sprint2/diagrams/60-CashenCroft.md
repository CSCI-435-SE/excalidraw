# Issue #60 -- Implement Image Filter System

## Diagrams

- Class Diagram
- Sequence Diagram

---

## Q&A

### Class Diagram

1. **Among all the classes shown in the diagram, which 1–2 are most central to understanding the codebase and solving the issue? Explain what role each one plays.**

   `ExcalidrawImageElement` and `actionToggleImageGrayscale` are the most central components. `ExcalidrawImageElement` stores the filter state through its `filter: ImageFilter | null` field. This allows the filter to be enabled or removed without changing the original embedded image data. `actionToggleImageGrayscale` implements the user-facing behavior: it checks the selection, determines whether grayscale is currently applied, updates the element, and requests immediate history capture so that the operation supports undo and redo.

2. **What is the most significant relationship shown in the diagram? Explain what it represents in the system and why it matters for understanding the solution.**

   The most significant relationship is the dependency between `actionToggleImageGrayscale`, `ExcalidrawImageElement`, and the rendering modules. The action updates the element's filter state using `newElementWith`, while `renderElement` and `staticSvgScene` read that state to determine how the image should appear. This separates the image's stored state from its visual representation. It also means removing the filter restores the original appearance without needing to reconstruct or replace the image data.

3. **Looking back at your implementation, is there anything in this design you would change, and why?**

   I would consider centralizing the mapping between filter types and their rendering implementations as more filters are introduced. Currently, the canvas renderer and SVG exporter need separate logic to represent grayscale, and the Safari fallback requires pixel manipulation because the normal canvas filter path is unavailable. A shared filter definition or rendering abstraction could reduce duplicated logic and make future filters easier to implement consistently. For the current grayscale-only scope, however, the existing design keeps the change relatively localized. Possible additions and methods to keep architectural design stable while not writing an overabundant amount of work-around code should hopefully be possible with future sub-issues, but implementation of this issue likely should have started with a method that worked with SVG without work-arounds. (Didn’t realize SVG would be an issue until full implementation.)

---

### Sequence Diagram

1. **What user action or system event starts the sequence, and what is the expected outcome when it completes successfully?**

   The user action that starts the event sequence is a manual interaction with the toggle switch for grayscale in the individual-Image action UI sub-section. If one image is not being cropped and is the only thing selected, the action toggle will flip the filter for grayscale on/off. The canvas will then render the image with or without grayscale depending on the toggle being on or off. The original embedded image data remains unchanged in order to allow reversal and removal of filters.

2. **Identify the 2–3 most important steps in the sequence. For each one, describe what is happening and note whether it involves existing code or new/modified code from your solution.**

   - **Selection validation and action execution** _(New code)_: `actionToggleImageGrayscale` checks that exactly one image is selected and that cropping is inactive. Its `perform` method decides whether to set the filter to `"grayscale"` or `null`.
   - **Element update and history capture** _(New code integrated with existing infrastructure)_: The action uses the existing `newElementWith` helper to create an updated element and returns `CaptureUpdateAction.IMMEDIATELY`, allowing the change to participate in undo and redo.
   - **Rendering the filter** _(Modified code)_: `renderElement` reads the image's filter state and applies grayscale during drawing. It uses the canvas filter mechanism where supported and a temporary-canvas pixel conversion for Safari. The SVG exporter separately applies the filter to each element's group.

3. **What error cases or alternative paths are not shown in the diagram, and why did you leave them out?**

   The diagram does not detail image-loading failures, missing image data, or every possible rendering failure. Those cases are outside the main interaction being documented. It does show the ineligible-selection path because selection validation is important to the action's behavior. The Safari fallback is also included because it represents a meaningful alternative rendering path introduced by this implementation. A separate SVG export path is included to show that export uses the same filter state through a different renderer. The main focus was the flow of image data, so general pathways for rendering on the entire canvas were avoided (`App` -> `StaticCanvas`, etc.).

---

### Cross-Cutting

1. **If you used AI to create or check any part of the diagrams, describe what it produced, what you verified against the actual code, and what you had to correct or add. If AI was not used, write "N/A."**

   AI was used to help draft the UML diagrams. The proposed components, method names, and interaction flow were checked against the Issue #60 implementations manually, including `actionImageFilter.tsx`, `Actions.tsx`, `types.ts`, `renderElement.ts`, and `staticSvgScene.ts`. The diagrams distinguish existing infrastructure from new and modified code and include annotations explaining the separation between filter state and image data, the undo/redo integration, and the separate SVG rendering path. The final diagram was checked and had some strange artifacts that were modified to properly fit the expected flow seen within the changes made.
