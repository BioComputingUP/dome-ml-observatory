#!/usr/bin/env sh
# Build observatory-ui and rsync dist/ to a deployment target.
#
# The target is NOT baked into this repository. Set DEPLOY_TARGET to an rsync destination:
#
#   DEPLOY_TARGET=user@host:/var/www/dome-ml-observatory/dist/ npm run deploy-prod-quick
#
# Export it from your shell profile if you deploy regularly. This publishes immediately, with
# --delete, and has no staging step: anything in the destination that is not in dist/ is removed.
set -eu

if [ -z "${DEPLOY_TARGET:-}" ]; then
  cat >&2 <<'MSG'
deploy-prod-quick: DEPLOY_TARGET is not set.

Set it to the rsync destination for the built frontend, for example:

  DEPLOY_TARGET=user@host:/var/www/dome-ml-observatory/dist/ npm run deploy-prod-quick

Nothing has been built or copied.
MSG
  exit 1
fi

# printf, not echo -- echo's handling of backslash escapes differs between dash and bash-as-sh,
# so the escape codes print literally on macOS if echo is used.
cyan() { printf '\033[0;36m%s\033[0m\n' "$1"; }

cyan "Building observatory-ui (build-prod) ..."
npm run build-prod

cyan "Rsyncing dist/ to ${DEPLOY_TARGET} ..."
rsync -av --delete dist/ "${DEPLOY_TARGET}"

cyan "deploy-prod-quick: done."
