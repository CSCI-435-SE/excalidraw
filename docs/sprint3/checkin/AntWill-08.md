# Sprint 3 Individual Check-in

**Code PR:** [#156 — feat(editor): image filter appearance controls (#61)](https://github.com/CSCI-435-SE/excalidraw/pull/156)

What have you implemented so far, and what remains?

I have finished my first of three pull requests, "Add Image Appearance Controls" (Issue #61). This is the one that I did without the use of testing. It replaces the single grayscale toggle with a filter stack for each image: grayscale, a color shift that can rotate the hue or tint toward a hue, and brightness, contrast and saturation adjustments. It also adds a new Image Filters panel and copy/paste of filters between images, and old scenes are migrated when loaded. I built it with AI help, and the AI logs are attached to the PR. I have also started the base for our team feature, "multiple pages in one drawing," which is split into 12 GitHub sub-issues with plans in Zulip and Google Docs. What remains is my other two PRs, including the mutation-testing work.

What is one thing you learned about testing in your project?

I learned that changing a data model means testing old data as well as the new feature. Replacing the old filter: "grayscale" field with a filter stack could have broken drawings people had already saved. So I wrote tests that load scenes in the old format and check that they migrate correctly, and that bad values fall back to safe defaults. I also learned that one feature can have several renderers: the canvas, SVG export and a Safari fallback. Putting all the filter ranges and clamping in one shared module meant I could test the logic once and trust all three to agree. Excalidraw's snapshot tests also caught UI changes I hadn't meant to make.

What is one risk to finishing your work by Nov 19, and what will you do about it?

The biggest risk is time. With a week left, I still have two PRs to finish, both of them needing mutation testing, plus my part of the multi-page team feature. Mutation testing is slow and may show weak tests that take extra time to fix. Merge conflicts are also likely, because several teammates are working in the same core files for the pages feature. To manage this, I'll start the mutation-testing as early as possible and run the mutation tool on a small issue first. I'll also rebase on master as often as possible and stay in close contact with my team on Zulip so we find conflicts early.
