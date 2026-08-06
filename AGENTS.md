# AGENTS.md

Guidance for any AI coding agent (Claude, Copilot, Cursor, etc.) working in this repository.
Read this fully before making changes. If something here conflicts with what you observe in
the code, trust the code and update this file.

## What this is

`dome-ml` — an **Angular 9** single-page app (TypeScript) for the DOME-ML / OSAI project.
It is largely static content plus one data-driven page (`ai_ecosystem`) that renders a YAML
registry fetched from another repo. There is no backend in this repo.

## Agent skills — use these instead of improvising

This repo ships its own Claude Code skills under [.claude/skills/](.claude/skills/). If
you're Claude Code (or a tool that reads the same convention), check there before hand-rolling
a multi-step workflow — they encode the exact sequencing and guardrails this file describes,
so use them instead of re-deriving the steps.

- **[osai-ecosystem-deploy](.claude/skills/osai-ecosystem-deploy/SKILL.md)** — the canonical
  pull → commit → push → build → deploy cycle for the ecosystem YAML (wraps
  `scripts/update_yaml.py` below). Trigger phrases: "pull the OSAI ecosystem", "update the
  ecosystem list and deploy", "sync ecosystem and push". User-triggered only; it ends with a
  live production deploy, so it should never run proactively or unprompted.

If your tooling can't load `SKILL.md` files (non-Claude-Code agents), the same steps are
written out in plain prose inside that file — read it directly, it's just markdown.

## Environment

- Node: this project pins `lts/fermium` (Node 14) in `.nvmrc`, matching Angular 9 / the
  `@angular-devkit/build-angular@0.1000.x` toolchain it was built against. Run `nvm use`
  before installing or building if `nvm` is available. If you're on a newer Node (this
  environment often has Node 20 by default) and can't switch, be aware some scripts pass
  `NODE_OPTIONS=--openssl-legacy-provider` specifically to keep the old Webpack/OpenSSL combo
  working — don't drop that flag from `start`/`build-dev`/`build-prod`.
- Install deps with `npm ci`, **never `npm install`** — the README calls this out explicitly
  because a bare install can silently upgrade/break the pinned Angular 9 toolchain. If you
  need to add or bump a dependency, do it deliberately (edit `package.json`, then
  `npm install <pkg>@<version>`), not as a side effect of an unrelated task.
- Python 3 is used only for the two maintenance scripts in `scripts/` (see below). They need
  `requests` and `pyyaml`.

## Common commands

```bash
nvm use && npm ci        # install
npm run start             # dev server, http://localhost:4200
npm run build-dev         # dev build -> dist/
npm run build-prod        # production build -> dist/ (--prod --build-optimizer)
npm test                  # karma/jasmine unit tests
npm run lint              # tslint
npm run deploy-prod-quick # build-prod, then rsync dist/ to the REDACTED-HOST production host
```

`npm run deploy-prod-quick` **pushes straight to the live production server** over rsync with
`--delete`. Never run it as a side effect of something else, on uncommitted/unreviewed
changes, or without the user explicitly asking to deploy right now.

## Repo layout

- `src/app/` — one folder per route/feature (`about`, `ai_ecosystem`, `dome_registry`,
  `guidelines`, `home-page`, `news`, `pathways`, `navbar`, `footer`, `header`, ...). Angular 9
  style: NgModule-based, no standalone components.
- `src/components/`, `src/pages/` — a few newer additions that don't follow the
  per-feature-folder convention above; match whichever pattern the nearest existing sibling
  uses rather than inventing a third one.
- `src/assets/data/content-items.json` — hand-maintained news/event feed consumed by the
  `news` feature. Entries are plain objects (`type`, `date`, `title`, `description`, `link`,
  `linkText`, `linkIcon`, `tags`); follow the existing shape and keep `date` as a
  human-readable string like the surrounding entries, not ISO.
- `src/assets/ecosystem_components_list.yml` — **generated data, not hand-edited.** It's a
  mirror of the upstream `data/ecosystem_components_list.yml` in
  [BioComputingUP/OSAI_ecosystem](https://github.com/BioComputingUP/OSAI_ecosystem), fetched by
  `scripts/update_yaml.py` and loaded client-side at runtime
  (`src/app/ai_ecosystem/ai_ecosystem.component.ts`, via `js-yaml`) — it is **not** bundled
  through `angular.json` assets processing, it's fetched with `HttpClient` at
  `assets/ecosystem_components_list.yml`. Don't hand-edit it; re-run the script instead.
- `scripts/update_yaml.py` — pulls the latest ecosystem YAML from GitHub raw and overwrites
  the local copy, after diffing to skip no-op updates. Run it with plain `python3
  scripts/update_yaml.py` (needs `requests`, `pyyaml`). For the full publish cycle (commit,
  push, build, deploy) use the
  [osai-ecosystem-deploy](.claude/skills/osai-ecosystem-deploy/SKILL.md) skill rather than
  chaining these steps manually.
- `scripts/validate_yaml.py` — sanity-parses that YAML file; run after updating it.
- `scripts/convert_images.py` — image conversion helper for `src/assets/img*`.

## Things that have gone wrong before — don't reintroduce these

- **`update_yaml.py` writes timestamped backup files** (`ecosystem_components_list.yml.backup_*`)
  next to the real file on every run where content changed. `src/assets/*.backup_*` is
  gitignored (fixed after 8+ of them ended up committed by accident), so `git add` won't pick
  them up — but they still bite you a second way: `dist/assets/` is a wholesale copy of
  `src/assets/` at build time, so a leftover backup file gets bundled into the production build
  and rsynced to the live site even though git never saw it. Delete
  `src/assets/*.backup_*` before running a prod build/deploy. The
  [osai-ecosystem-deploy](.claude/skills/osai-ecosystem-deploy/SKILL.md) skill does this for
  you as one of its steps.
- **`dist/` is gitignored and must stay that way** — it's a build artifact, not committed. If
  `git status` ever shows files under `dist/` as trackable, something is wrong (e.g. a stray
  `git add -A`); undo it, don't commit it.
- **Don't run `npm install` to "fix" a dependency issue** — this Angular 9 project's lockfile
  is easy to break with an unpinned install. Use `npm ci`.

## Making changes safely

- Match the existing Angular 9 idioms already in the file you're editing (constructor
  injection, `ngOnInit`, RxJS subscribe patterns) rather than introducing newer
  Angular/RxJS patterns (standalone components, `inject()`, signals) that don't exist
  anywhere else in this codebase and won't compile against this toolchain.
- Run `npm run lint` and `npm test` before considering a change done, and `npm run build-prod`
  before anything that will be deployed — this project has no CI, so these local checks are
  the only gate.
- Keep content edits (news items, ecosystem YAML, about-page copy, images) and code edits
  as separate, clearly-described commits where practical — this repo's history is mostly
  small, focused commits and mixed "code + random content" commits are harder to review/revert.
- Never run `npm run deploy-prod-quick` (or manually rsync to `REDACTED-HOST`) without the user
  explicitly asking for a deploy in the current request.
