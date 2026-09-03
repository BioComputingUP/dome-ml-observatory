# Build context is the REPO ROOT, not this directory:
#   docker build -f observatory-ui/Dockerfile -t observatory-ui .
#
# observatory-ui/scripts/sync-schema.js (run automatically by npm's prebuild-prod hook below)
# reaches up to ../../schema/ for the vocab and facet-stats files this app ships -- exactly like
# the existing local build already does. A context scoped to
# observatory-ui/ alone can't see schema/ at all: Docker refuses to COPY anything outside the
# build context. Root context is why this Dockerfile COPYs schema/ and observatory-ui/ as two
# separate, explicit steps rather than one blanket `COPY . .`.
#
# Exactly two containers in this whole project, by design -- this one and observatory-ws.
# No shared "core" package, no gateway/connector service in between (DOME Registry's npm
# file:-linked -core package was specifically checked and rejected as the thing to avoid).

# ---- Stage 1: build the Angular app ----
FROM node:24-alpine AS build

WORKDIR /app

# schema/ first, alone -- copying it separately (not as part of a blanket COPY) means Docker's
# layer cache only invalidates this step when the schema/vocab actually changes, not on every
# unrelated observatory-ui source edit.
COPY schema/ ./schema/

COPY observatory-ui/package.json observatory-ui/package-lock.json ./observatory-ui/
RUN cd observatory-ui && npm ci

COPY observatory-ui/ ./observatory-ui/
RUN cd observatory-ui && npm run build-prod

# ---- Stage 2: serve with nginx ----
FROM nginx:alpine

# outputPath in observatory-ui/angular.json lands the build flat at dist/ (no nested
# dist/<project>/browser/ folder) -- this path assumes that; if that config ever changes, this
# COPY needs to change with it.
COPY --from=build /app/observatory-ui/dist /usr/share/nginx/html
COPY observatory-ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not "localhost" -- confirmed by testing inside a running container that wget
# resolves "localhost" to the IPv6 loopback first and gets refused there (nginx here only binds
# IPv4, per nginx.conf's plain `listen 80;`), even though the container is otherwise healthy and
# reachable fine over IPv4. Sidesteps the resolution question entirely rather than also adding an
# IPv6 listener just to satisfy the healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
