---
name: osai-ecosystem-deploy
description: >
  Pulls the latest OSAI ecosystem registry YAML from the upstream
  BioComputingUP/OSAI_ecosystem repo into src/assets/ecosystem_components_list.yml,
  commits and pushes the change if there is one, then builds the production bundle
  and deploys it to the REDACTED-HOST production host via rsync. This is the canonical,
  repeatable version of the pull → commit → push → build → deploy cycle for
  dome-ml-osai-ui — use it instead of improvising the steps by hand. Trigger on
  requests like "pull the OSAI ecosystem", "update the ecosystem list and deploy",
  "sync ecosystem and push", "run the ecosystem update script", "use the script to
  pull the latest osai ecosystem", or "build and deploy the site" in this repo. Only
  run when the user explicitly asks for a sync/update/deploy in the current request
  — never run it proactively, speculatively, or on a schedule, since the final step
  pushes live to the production site.
---

# osai-ecosystem-deploy

Runs the full cycle this repo uses to publish upstream OSAI ecosystem changes:
pull the registry YAML → commit → push → build → deploy. All commands below run
from the repository root. See [AGENTS.md](../../../AGENTS.md) at the repo root for
the broader repo conventions this skill assumes (Node/npm rules, what's generated
vs. hand-edited, why the deploy step is dangerous).

## Preconditions

1. Run `git status --porcelain` first. If it shows changes unrelated to this cycle
   (e.g. someone's mid-edit on `content-items.json` or app code), **stop and ask the
   user** whether to include them, exclude them, or hold off — do not silently sweep
   unrelated work into this commit or carry it into a production deploy.
2. Confirm you're on `main` (or ask the user before running this on any other
   branch) and that it's not behind `origin/main` — `git pull` first if it is, so
   the push in step 3 doesn't fail or need a merge.

## Steps

1. **Pull the latest YAML.**
   ```bash
   python3 scripts/update_yaml.py
   ```
   It diffs against the upstream raw file itself and no-ops if nothing changed. If
   it does update, it also writes a local timestamped backup
   (`src/assets/ecosystem_components_list.yml.backup_<timestamp>`) — this is
   gitignored, expected, and cleaned up in step 5. Do not `git add` it.

2. **Validate.**
   ```bash
   python3 scripts/validate_yaml.py
   ```
   Confirms the updated file still parses as YAML before it goes anywhere near git
   or a build.

3. **Check whether anything changed.**
   ```bash
   git status --porcelain -- src/assets/ecosystem_components_list.yml
   ```
   - If empty: nothing to publish. Report "already up to date" to the user and stop
     — do not commit, push, build, or deploy on a no-op.
   - If non-empty: read `git diff -- src/assets/ecosystem_components_list.yml` and
     summarize what was added/changed/removed (new entries are appended, so look for
     new `- id:` blocks) — you'll want this for the commit message and the final
     report to the user.

4. **Commit and push.**
   ```bash
   git add src/assets/ecosystem_components_list.yml
   git commit -m "OSAI ecosystem YAML update - <short summary of new entries>"
   git push origin main
   ```
   Only stage the ecosystem YAML file here unless the user has explicitly asked you
   to bundle other reviewed changes into the same commit.

5. **Clean up local backup files before building.** `dist/` is a wholesale copy of
   `src/assets`, so any leftover `.backup_*` file gets bundled into the build and
   rsynced to production even though it's gitignored from version control:
   ```bash
   rm -f src/assets/ecosystem_components_list.yml.backup_*
   ```

6. **Build and deploy.**
   ```bash
   npm run deploy-prod-quick
   ```
   This runs `build-prod` (production Angular build) and then rsyncs `dist/` to
   `REDACTED-DEPLOY-TARGET:/var/www/dome-ml-osai/dist/` with `--delete`. This is a live,
   hard-to-reverse push to the production site — only run it as part of this skill
   when the user's request in this turn actually called for a deploy, not just a
   pull/commit/push.

   If you haven't already confirmed SSH works non-interactively this session, a
   quick sanity check avoids hanging on a password prompt:
   ```bash
   timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 REDACTED-DEPLOY-TARGET 'echo SSH_OK' 2>&1
   ```

## Report back

Tell the user, concisely: what new/changed entries came from upstream (from step
3's diff read), the commit hash, and confirmation that build + deploy succeeded (or
exactly where it failed, if it did — don't guess or claim success on a step that
errored).

## Guardrails (see AGENTS.md for the full rationale)

- Never `npm install` to fix a build problem here — use `npm ci`.
- Never commit `.backup_*` files or anything under `dist/`.
- Never force-push, and never skip the diff-read in step 3 — don't commit changes
  you haven't looked at, even if they're "just" the generated YAML.
- If step 4's push fails (e.g. remote moved on), stop and resolve it (rebase/pull)
  rather than force-pushing.
