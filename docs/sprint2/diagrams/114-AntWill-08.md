**Class diagram**

1. Most central classes

BackgroundGradientPicker (modified). This is the hub of the solution. It was already the component that owns the gradient state (type, start/end colour, angle, stop positions). It turns that state into a CSS gradient string with createGradientBackground and passes it up through onChange. For issue #114 it took on new jobs:
- It hosts the colour wheel and the per-colour lightness sliders.
- It converts between how colours are stored (hex inside a CSS string) and how the user edits them (OKLCH), using colorToOklch and oklchToHex.
- It keeps stopCache so hue and chroma survive the round trip through hex.

To solve the issue I had to understand this class first, because it is where the old picker and the new wheel meet.

GradientColorWheel (new). This is the main new piece of UI. It turns pointer and keyboard input into an OKLCH hue and chroma: the angle sets the hue and the distance from the centre sets the chroma. It also draws the two A/B dots, each filled with its stop's colour. I made it a controlled component. It gets colors as props and only reports onChange(stop, oklch). It never handles hex or the element directly.

2. Most significant relationship

The most significant relationship is the composition BackgroundGradientPicker ◆— GradientColorWheel, together with its onChange(stop, oklch) callback.

It shows how ownership is split:
- The wheel controls only hue and chroma.
- The parent owns lightness (the sliders), the cache, converting to hex, and passing the result up.

This matters because the change stays local. The parent still emits the same CSS gradient string as before, so everything downstream needed no changes: Picker → ColorPicker → actionChangeBackgroundColor → the renderers. That covers undo/redo, SVG export and flipping too. Seeing this relationship explains why a whole new picking method could be added without touching the element model or the rendering code.

3. What I'd change

- Store gradient stops in a structured form instead of hex in a CSS string. stopCache only exists because hex can't keep a hue when chroma or lightness is 0. Storing stops in a structured or OKLCH form would remove that workaround. It would also make the "OKLCH" label honest, since the canvas currently still blends the two colours in sRGB.

**Sequence diagram**

1. Trigger and expected outcome

Trigger: with a shape selected and gradient enabled in the background picker, the user presses the pointer on the colour wheel and drags (A), then moves A's lightness slider (B).

Expected outcome:
- Dot A follows the pointer, and its fill is the new colour.
- A's hex input and lightness track update to match.
- The selected shape's backgroundColor becomes a new CSS gradient string with colour A at the chosen hue, chroma and lightness. The canvas redraws immediately and the change goes into undo history.

2. Most important steps

1. Turning pointer position into a colour: getColorFromPointer → onChange("a", oklch). New code. The wheel converts the pointer's angle to a hue and its distance from the centre to a chroma, keeps the stop's existing lightness, and reports the result to the parent. If the pointer lands on empty wheel space, getNearestStop picks which dot moves. Clicking a dot only selects it, so it doesn't jump.
2. Applying the change: applyGradient → createGradientBackground → onChange → actionChangeBackgroundColor.perform → re-render. Mostly existing code. The new hex goes into the existing CSS-string format. The existing action updates the selected elements with newElementWith and skips any where canHaveGradient is false. The existing canvas and SVG renderers then draw it. This step shows the new feature plugging into the existing pipeline without changing it.

3. Cases left out, and why

- Invalid or unparseable colour. If colorToOklch returns null, the picker falls back to {l:0, c:0, h:0}. I left this out because it's a one-line default, not an interaction.
- Out-of-gamut colours. The outer part of the wheel (chroma up to 0.37) can't be shown in sRGB, so oklchToHex lowers the chroma internally. This is a detail inside one call, not a message between objects.
- Edits from elsewhere. If colour A is changed through the hex input or the eyedropper, the cache check fails and A's colour is re-read from the hex. It's a separate flow from dragging on the wheel and would have cluttered the diagram.

**Cross-cutting:**

1. AI use and changes

AI was used to for the sake of planning out and deciding colour coding. It produced a plan for creating diagram with colours meant to represent old, new, or changed files. I verified connections and where code was called and already wknew which parts of the code were untouched but important, new, or modified from creating the issue.