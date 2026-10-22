# Sprint 2 Individual Check-in

## 1. What did you implement so far in the sprint, and what remains?

So far, I have worked on the gradient color picker feature for Excalidraw. The goal is to make selecting gradient colors more intuitive while maintaining compatibility with the existing color picker and application behavior. I have also worked on ensuring that gradient settings persist correctly rather than being lost when the application state changes. Remaining work includes testing the implementation across different use cases, checking edge cases, addressing bugs discovered during testing, and ensuring that the feature integrates cleanly with the existing codebase.

## 2. What is one thing you learned about the codebase or about software engineering practice?

I learned that implementing a feature in an existing codebase requires understanding how components interact rather than treating each component as an isolated piece. In Excalidraw, changes to the color picker can affect state management, rendering, and compatibility with existing functionality. I also learned the importance of understanding existing patterns before introducing changes, because a solution that works in isolation may still cause problems elsewhere in the application.

## 3. What is one thing you would do differently?

I would spend more time tracing the relevant component and state-management flow before beginning implementation. Understanding where values are stored, how they are passed between components, and how changes are persisted would help me identify potential integration issues earlier. I would also establish smaller test cases as I implement each part of the feature instead of waiting until several pieces are connected. This would make debugging more manageable and help me catch compatibility problems sooner.
