---
name: deploy
description: >
  Deploys the DOME Observatory to production the usual way: confirm the pushed commit's images
  exist in the lab registry (CI builds them), then recreate both containers on the production
  host with `docker compose up --pull always`, then verify the live site. Also covers restarting
  observatory-ws alone after a corpus load, and rolling back to an earlier image. Trigger on
  "deploy", "redeploy", "deploy it now", "ship it", "push this live", "update production",
  "restart the API after the load", or "roll back the deploy". Only when the user asks for a
  deploy or restart in the current request -- never as a side effect of another task.
---

# Deploy

Production is two containers, `observatory-ws` and `observatory-ui`, run by
`docker-compose-prod.yml` on the lab's production host. Pushing to `main` builds the images; one
manual command, run from this machine, deploys them. That split is deliberate: CI never deploys
(see the header of `.github/workflows/docker-build-prod-push.yml`, and `ci.yml`'s "Never add a
deploy job"). Don't add a deploy job to CI.

When the user says "deploy", do the steps below without further ceremony. The request is the
authorisation (AGENTS.md: never deploy *unless* asked in the current request).

## What already happens on every push to `main`

1. `CI` (`ci.yml`) runs lint, tests and builds for both apps.
2. Once CI succeeds, `Build and push production images` (`docker-build-prod-push.yml`) builds both
   images and pushes each as `:latest` and `:<short sha>` to
   `registry.biocomputingup.it/dome-ml-observatory/`. It logs in with the repository Actions
   secrets `DOCKER_USERNAME` / `DOCKER_PASSWORD`.

So by the time a pushed commit has gone green, its images are in the registry and deploying is
just step 3 below.

## Steps

### 1. The tree is committed and pushed

```bash
git status --short          # must be empty
git fetch -q && git log --oneline origin/main..HEAD   # must be empty
```

Other agents work in this checkout at the same time. Never deploy uncommitted work: if the tree is
dirty, stop and ask whose changes they are.

### 2. The images for that commit exist

```bash
gh run list --workflow docker-build-prod-push.yml --limit 3
```

The newest run must be `completed success` for HEAD's commit. CI skips docs-only pushes, so if
HEAD touched only Markdown, the newest run can be for the last code commit, and that is fine.

- Still running: `gh run watch <run id>`, then continue.
- Failed or missing: fix the cause, or, as a fallback, build and push from this machine with a
  clean tree (needs a local `docker login registry.biocomputingup.it`):
  `docker compose -f docker-compose-build.yml build --push observatory-ws observatory-ui`

### 3. Deploy

From the repo root:

```bash
docker -c <production context> compose -f docker-compose-prod.yml up -d --pull always
```

- `<production context>` is the Docker context that points at the production host
  (`docker context ls`). Its name is in the maintainer's private notes, not in this public repo.
- The compose file reads the **root `.env`** on this machine and sends it as `observatory-ws`'s
  environment. That file is the production configuration: gitignored, never committed, never
  printed. A deploy from a machine without it would start the API without its configuration.
- Both containers are recreated. The API is unavailable for about 40–50 s while it warms up; that
  is expected.

### 4. Verify

```bash
B=https://observatory.dome-ml.org
for i in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' $B/api/health/ready)" = 200 ] && break; sleep 5; done
curl -s $B/api/health/ready
```

Then check whatever the change touched: `curl` the endpoint, or load the page in a real browser
(headless Chrome `--dump-dom` works for rendered-DOM checks). Report what you checked.

## Restart only (after a corpus load)

Every load in `dome-ml-observatory-triage` needs this: `FacetsService` loads at boot with no TTL.

```bash
docker -c <production context> compose -f docker-compose-prod.yml restart observatory-ws
```

Then wait for `/api/health/ready` as in step 4.

## Roll back

Every build is also tagged `:<short sha>`. To put an earlier one back, retag it as `:latest` and
deploy:

```bash
R=registry.biocomputingup.it/dome-ml-observatory/dome-ml-observatory
for app in ws ui; do
  docker pull "$R-$app:<short sha>"
  docker tag "$R-$app:<short sha>" "$R-$app:latest"
  docker push "$R-$app:latest"
done
docker -c <production context> compose -f docker-compose-prod.yml up -d --pull always
```

A later push to `main` overwrites `:latest` again. For a lasting rollback, revert the commit on
`main` instead.

## When the Docker command fails locally

- `permission denied while trying to connect to the docker API`: check `command -v docker`. The
  snap Docker CLI cannot use `ssh://` contexts; the working CLI is a static binary earlier on
  `PATH`. The error message names the wrong machine.
- SSH prompts or fails: the key needs to be loaded in the agent (`ssh-add -l`).

## Not the usual deploy

`npm run deploy-prod-quick` rsyncs a UI build to `$DEPLOY_TARGET` with `--delete`. It is the
deployment path for hosting without Docker (CONTRIBUTING.md), not this one.
