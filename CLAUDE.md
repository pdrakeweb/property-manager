# Property Manager — Claude Instructions

## Worktree Setup

### .env file
When working in a git worktree (any `.claude/worktrees/` directory), the `.env` file
will not be present because it is gitignored. **Always copy it from the main project
root before running the dev server or build:**

```bash
cp "$(git rev-parse --show-toplevel)/../.env" . 2>/dev/null || true
```

The `.env` file contains `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_SECRET`,
`VITE_OPENROUTER_KEY`, and other runtime config that Vite reads from the project root.
Without it, the login screen will show credential input fields and OAuth will fail.

### Sync
We should always sync before starting any new set of work to ensure we are not working on outdated code due to parallel iplementation.  At session start or when starting a new implementation in an existing session, run `git fetch origin && git log --oneline HEAD..origin/<base-branch>` to check if the worktree is behind. If it is, rebase onto origin/<base-branch> before doing any work.

## Dev Server

- `npm run dev` — starts Vite with HMR on localhost:5173
- Build: `npx vite build` (use `/c/nvm4w/nodejs/npx.cmd` on this machine)
- The npm binary is at `/c/nvm4w/nodejs/npm`

*IMPORTANT* When working in a worktree and not directly in the main source directory, choose an available port (5170-5179) and run on that port to avoid conflicts:
`npm run dev -- --port 5176`

## Important Rules

### Bash Command Style
Never chain commands with && or ; operators. Run them as separate bash calls instead.


## Key Architecture Decisions

- Local-first: all data in localStorage via `localIndex.ts`, synced to Google Drive
- Settings use `src/store/settings.ts` (`getSetting`/`setSetting`) — never read raw localStorage for OpenRouter key or HA settings
- Dark mode: use CSS component classes from `index.css` (`card-surface`, `modal-surface`, `input-surface`, etc.) — never use bare `bg-white` without a `dark:` variant
- OAuth: PKCE flow with optional client_secret for "Web application" client type
- OAuth scope: `drive.file` (app-created files only), not full `drive`
