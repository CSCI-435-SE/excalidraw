# Excalidraw

# Coding Conventions

## Language / Framework Style Guide

- Excalidraw is a **monorepo** using:
  - TypeScript
  - React
  - Vite
  - Yarn
- Use **TypeScript** for all new code.
- Prefer implementations without allocation where possible.
- Prefer performant implementations and trade RAM usage for fewer CPU cycles when there is a choice.
- Use functional React components with hooks.
- Keep components small and focused.

## Naming Conventions

- Use **PascalCase** for:
  - Component names
  - Interfaces
  - Type aliases
- Use **camelCase** for:
  - Variables
  - Functions
  - Methods
- Use **ALL_CAPS** for constants.

## Codebase Structure

```text
packages/excalidraw/
````

* Main React component library.
* Published to npm as `@excalidraw/excalidraw`.

```text
excalidraw-app/
```

* Full-featured web application used by `excalidraw.com`.

```text
packages/
```

* Contains core packages:

  * `@excalidraw/common`
  * `@excalidraw/element`
  * `@excalidraw/math`
  * `@excalidraw/utils`

```text
examples/
```

* Contains integration examples such as:

  * NextJS
  * Browser-script examples

```text
dev-docs/docs/codebase/
```

* Contains architecture notes for major subsystems, including:

  * Element types
  * Renderer
  * History
  * Collaboration

## Development Workflow

* Work in `packages/*` for editor features.
* Work in `excalidraw-app/` for application-specific features.
* Include `packages/math/src/types.ts` when writing math-related code.
* Use the project's `Point` type instead of `{ x, y }`.

# Linting & Formatting Tools

* Code formatting is automated via **Prettier**.
* Static analysis and syntax checks are enforced via **ESLint** for JavaScript/TypeScript.
* Linting runs automatically on every commit.
* Use `yarn fix` to automatically fix formatting and lint issues.

# Branching & Commit Conventions

## Branch Naming

* The team uses a **branch-based workflow**, not individual forks.
* Start each issue from an up-to-date `master` branch.
* Create a short-lived branch for each issue.
* Push the branch to the shared repository.
* Open a PR from the branch into `master`.
* Use the following branch prefixes:

  * `feat/issue-<N>-short-description` — new features.
  * `fix/issue-<N>-short-description` — bug fixes.
  * `chore/short-description` — documentation, configuration, and dependency updates.

### Example Branches

```text
feat/issue-17-dark-mode
fix/issue-42-toast-dismiss
```

* `master` is protected and direct pushes to `master` are blocked.

## Commit Message Format

Use semantic prefixes:

| Prefix     | Description                                                      |
| ---------- | ---------------------------------------------------------------- |
| `feat`     | New feature                                                      |
| `fix`      | Bug fix                                                          |
| `docs`     | Documentation-only change                                        |
| `style`    | Formatting or whitespace changes that do not affect code meaning |
| `refactor` | Code changes that neither fix a bug nor add a feature            |
| `perf`     | Performance improvements                                         |
| `test`     | Adding or correcting tests                                       |
| `build`    | Build system or external dependency changes                      |
| `ci`       | CI configuration and scripts                                     |
| `chore`    | Other changes that do not modify source or test files            |
| `revert`   | Reverting a previous commit                                      |

### Example Commit

```text
feat: add dark mode toggle (#17)
```

* Keep commits focused on the related change.

# Pull Request Process

## PR Restrictions

* Direct pushes to `master` are blocked.
* PRs should be created from branches in the shared repository.
* Contributors should check automated test results after submitting a PR.
* Issues reported by automated testing should be fixed before merging.

## Required Reviewers

* Request a review from a teammate.

## PR Description

A PR description should:

* Explain what changed.
* Explain why the change was made.
* Reference the related issue when applicable.
* Use issue-closing references such as `Closes #17`.

## Merge Criteria

Before merging:

* Automated tests pass.
* CI checks pass.
* Issues reported by automated testing are fixed.
* Changes are manually tested using the staging environment deployed for the PR.
* Larger features should be tested in multiple browsers when appropriate.
* Required code review is complete.

# Testing Expectations

## Tests for Changes

* Add tests for new features when appropriate.
* Add regression tests for bug fixes when practical.
* A regression test should ensure that a fixed bug does not return.
* Consider additional tests for changes that modify existing behavior.

## Minimum Expectations

Run the following checks as appropriate:

| Command                       | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `yarn test:all`               | Runs testing, type checking, linting, and formatting checks |
| `yarn test`                   | Runs Vitest in watch mode                                   |
| `yarn test:app --watch=false` | Runs a CI-style application test pass                       |
| `yarn test:typecheck`         | TypeScript type checking                                    |
| `yarn test:code`              | ESLint                                                      |
| `yarn test:other`             | Prettier formatting checks                                  |
| `yarn fix`                    | Automatically fixes formatting and lint issues              |

Additional expectations:

* Run `yarn test:all` before pushing.
* Manually test changes using the PR staging environment.
* Consider multiple-browser testing for larger features.

# AI Tool Use

## Tools Used

* Any AI tools may be used for development.
* The team mainly uses Claude, but other agents are allowed. **(Adaptation)**

## Logging Requirements

The team should log AI-assisted work involving:

* Writing, debugging, or reviewing code.
* Understanding the codebase, architecture, or an issue.
* Drafting issue reports, PR descriptions, or documentation.
* Discussing design decisions or tradeoffs.

## AI-Assisted PR

* The use of AI should be included in the PR description at the start or end of the description. **(Adaptation)**

# Definition of Done

## Completion Requirements

A change is considered complete when:

* Code is reviewed.
* Tests are passing.
* CI is green.
* All 6 checks pass.

  * **Note:** `size-limit` is currently broken and its failure can be ignored for Sprint 0.
* Documentation is updated.
* `yarn test:all` passes before pushing.