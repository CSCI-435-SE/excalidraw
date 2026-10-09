## Design

Issue #45

| Field | Description |
| --- | --- |
| Decision | Path tool mimic functionality of line for path and point drawing but is not a addition of it. |
| Alternatives considered | 1. Extend the existing line tool to support motion paths. 2. Create a motion line tool which act complete different from line tool. |
| Rationale | A dedicated path tool keeps motion-path functionality separate from regular line drawing while allowing users to use familiar line and point-drawing interactions. |
| Consequences | It requires maintaining a separate path-drawing tool and its associated behavior. |
