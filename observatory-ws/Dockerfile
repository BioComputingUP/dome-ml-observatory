# Build context is the REPO ROOT, not this directory:
#   docker build -f observatory-ws/Dockerfile -t observatory-ws .
#
# src/common/schema-version.ts reads ../schema/CURRENT relative to its own cwd (exactly like
# `npm run start:dev` run from observatory-ws/ does locally) -- a context scoped to observatory-ws/
# alone can't see schema/ at all: Docker refuses to COPY anything outside the build context. Both
# stages below keep schema/ and observatory-ws/ as SIBLING directories under /app, exactly
# matching this repo's own top-level layout, so schema-version.ts's existing relative-path lookup
# needs no code change for Docker.
#
# Exactly two containers in this whole project, by design -- this one and observatory-ui.
# See that Dockerfile's header.

# ---- Stage 1: install deps and compile TypeScript ----
FROM node:24-alpine AS build

WORKDIR /app

# schema/ alone first, same layer-cache reasoning as observatory-ui/Dockerfile: this build stage
# doesn't itself read schema/ (no build-time schema step here, unlike the ui's sync-schema.js) --
# it exists here purely so the runtime stage below can COPY --from=build it.
COPY schema/ ./schema/

COPY observatory-ws/package.json observatory-ws/package-lock.json ./observatory-ws/
RUN cd observatory-ws && npm ci

COPY observatory-ws/ ./observatory-ws/
RUN cd observatory-ws && npm run build

# ---- Stage 2: production node_modules + compiled dist only, non-root ----
FROM node:24-alpine AS runtime

ENV NODE_ENV=production

# WORKDIR is observatory-ws/, not /app -- deliberately matches this repo's own relative layout
# (schema/ one level up, as a SIBLING) because src/common/schema-version.ts resolves
# schema/CURRENT via `resolve(process.cwd(), '../schema/CURRENT')` as one of its two candidate
# paths -- the exact relationship `npm run start:dev` already relies on locally. Keeping it
# identical here means zero changes to schema-version.ts.
WORKDIR /app/observatory-ws

COPY observatory-ws/package.json observatory-ws/package-lock.json ./
# --omit=dev: the dev-inclusive install measures 305MB locally (@nestjs/cli, jest, ts-node,
# eslint, typescript, ...) -- none of it belongs in an image that only ever runs `node dist/main`.
# Fresh install here rather than pruning stage 1's node_modules: simpler, and guarantees no
# build-only artifact leaks into the runtime image.
RUN npm ci --omit=dev

COPY --from=build /app/observatory-ws/dist ./dist
COPY --from=build /app/schema /app/schema

# Alpine's official node image ships a built-in `node` user/group (uid/gid 1000) for exactly
# this -- a long-lived, network-facing container has no reason to run as root.
RUN chown -R node:node /app/observatory-ws /app/schema
USER node

# Documentation only -- EXPOSE doesn't enforce anything. What actually matters is main.ts calling
# app.listen(port, '0.0.0.0') with PORT=3000 (see .env / configuration.ts) on the shared Compose
# network. Fixed at 3000 because observatory-ui/nginx.conf hardcodes "observatory-ws:3000" as its
# proxy target -- do not change this without changing that file too.
EXPOSE 3000

# Liveness only (/api/health, never /api/health/ready) -- same reasoning as
# HealthController's own doc comment: a VPN blip to the database server must not restart-loop this container,
# only make /api/records etc fail per-request while the process stays up.
#
# node -e rather than wget/curl: avoids depending on either being present in node:24-alpine
# (unlike observatory-ui/Dockerfile, which can rely on nginx:alpine shipping wget) -- reuses the
# Node runtime the image already requires, zero added dependency. Reads PORT from the container's
# own environment so it stays correct even if PORT is ever overridden.
#
# 127.0.0.1, not "localhost" -- observatory-ui/Dockerfile hit exactly this bug: wget/busybox
# resolves "localhost" to the IPv6 loopback first and gets refused against an IPv4-only listener
# on an otherwise-healthy container. Sidestepped here the same way.
#
# start-period=60s: measured live (bare process, pre-container) at 15-40s before /api/health
# becomes reachable -- FacetsService and StatsService's OnModuleInit hooks do real Mongo work
# (loading ~36k facet values across 4 fields, one $facet aggregation over 827k docs) serially
# before Nest calls app.listen(). Measured worst case (the database server unreachable, every warm-up step
# timing out in sequence) is ~40s containerised, so 60s leaves real margin. RE-MEASURE if any
# more sequential boot-time warm-up is ever added, and raise it if boot approaches it.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD node -e "const http=require('http');const p=process.env.PORT||3000;http.get('http://127.0.0.1:'+p+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Exec form, matching npm run start:prod's own command (node dist/main) -- Ivan's exact
# convention, so the non-Docker REDACTED-HOST path stays identical to what this image runs.
CMD ["node", "dist/main"]
