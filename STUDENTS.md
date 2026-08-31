# Excalidraw — Student Setup Guide

This is a **course fork of [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)** — the
open-source **virtual whiteboard** for sketching hand-drawn-style diagrams (React + TypeScript,
Vite, Yarn workspaces). The same code powers <https://excalidraw.com>.

📚 **Official documentation:** <https://docs.excalidraw.com>

---

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| **Node.js** | **18 or newer** (LTS recommended) | Check with `node -v`. |
| **Yarn** | **1.22 (classic)** | Pinned via `packageManager` — just run `corepack enable` once and the right version is used automatically. |
| **Git** | any recent | |

> 💡 **New to the Canvas API?** Excalidraw draws every shape directly onto an HTML `<canvas>` element rather than using the DOM. MDN's [Canvas tutorial](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/tutorial) is a concise intro to how it works — worth 30 minutes before reading the renderer code.

> 📖 **Codebase walkthrough:** [`dev-docs/docs/codebase/`](dev-docs/docs/codebase/) in this repo contains architecture notes for each major subsystem (element types, renderer, history, collaboration). Read it before picking a task.

Works the same on Windows, macOS, and Linux — no database or Docker needed.

---

## 2. Install & run

```bash
git clone <your-team-fork-url>
cd excalidraw

corepack enable      # once — activates the pinned Yarn
yarn                 # install dependencies
yarn start           # dev server for the app
```

Open the URL Vite prints (typically **http://localhost:3000**) — you get the full whiteboard,
hot-reloading as you edit the code.

Useful variants:

```bash
yarn build           # production build of the app (excalidraw-app/build)
yarn start:example   # builds the packages and runs a minimal embedding example
```

---

## 3. Run the tests

```bash
yarn test                     # vitest in watch mode (app + packages)
yarn test:app --watch=false   # single full pass, CI-style
yarn test:typecheck           # TypeScript (tsc)
yarn test:code                # ESLint (zero warnings allowed)
yarn test:other               # Prettier formatting check
yarn test:all                 # everything above, in one go

yarn fix                      # auto-fix formatting + lint issues
```

Run `yarn test:all` before you push — it's what the CI expects to pass.

---

---

## Contributing workflow

All team members have write access to this repository, so the team uses a **branch-based** workflow — not forks. Here is the background and the commands.

**Why not forks?** Forking is the standard model for contributing to open-source projects where you _don't_ have write access: you fork to your own GitHub account, clone your fork, and open a PR from your fork back to the original. You will encounter this when contributing to the upstream project. But for your course team — where everyone has write access to the shared repo — it just adds confusion: two clones on your machine, two remotes to keep in sync, merge conflicts that are harder to reason about.

**Branch-based workflow** is what most professional teams use internally. You clone the shared repo once, create a short-lived branch for each issue, push the branch back to the same repo, and open a PR from that branch into `main`. One clone, one remote, full PR workflow.

### For each issue you work on

```bash
# One-time setup: clone the team repo (skip if already done)
git clone https://github.com/CSCI-435-SE/excalidraw.git
cd excalidraw

# Before starting each issue: make sure you are on a fresh main
git checkout main
git pull origin main

# Create a branch named for the issue
git checkout -b feat/issue-17-dark-mode      # new feature
git checkout -b fix/issue-42-toast-dismiss   # bug fix

# ... make your changes, run tests ...

# Stage and commit
git add <the files you changed>
git commit -m "feat: add dark mode toggle (#17)"

# Push the branch to the team repo
git push origin feat/issue-17-dark-mode
```

After pushing, GitHub shows a **"Compare & pull request"** banner on the repository page. Click it to open a PR from your branch into `main`. Fill in the description (what changed and why), reference the issue (`Closes #17`), and request a review from a teammate.

**Branch naming:**

| Prefix | Use for |
|---|---|
| `feat/issue-<N>-short-description` | new features |
| `fix/issue-<N>-short-description` | bug fixes |
| `chore/short-description` | docs, config, dependency updates |

> ⚠️ **`main` is protected — direct pushes are blocked.** All changes go through a reviewed PR. If you accidentally commit to `main` locally, move your changes to a branch before pushing:
>
> ```bash
> git checkout -b fix/issue-42-my-fix   # create branch from your current state
> git checkout main
> git reset --hard origin/main          # revert local main to match remote
> ```

**After your PR is merged**, delete the branch to keep the repo tidy:

```bash
git checkout main
git pull origin main
git branch -d feat/issue-17-dark-mode
```

## 4. Project documentation & policies (required reading)

📚 **Official documentation:** <https://docs.excalidraw.com> — the developer docs for the editor
package and the app (press **`?`** inside the app for the shortcut list).

Excalidraw has its own established contribution processes. They are **not restated here** — you
are responsible for finding, reading, and following them from the sources below:

| You must take care of | Where to find it |
| --- | --- |
| How to use the tool | <https://docs.excalidraw.com> |
| Code review process | [Contributing guide](https://docs.excalidraw.com/docs/introduction/contributing) |
| Bug / issue resolution process | [Contributing guide](https://docs.excalidraw.com/docs/introduction/contributing) |
| Pull request conventions & PR policies | [Contributing guide](https://docs.excalidraw.com/docs/introduction/contributing) (see [CONTRIBUTING.md](CONTRIBUTING.md)) |
| AI policies | Check the [contributing guide](https://docs.excalidraw.com/docs/introduction/contributing) for the project's current stance before submitting AI-assisted work |
