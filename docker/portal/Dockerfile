FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages packages
RUN HUSKY=0 pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @mentormama/portal build

FROM caddy:2.11.9-alpine
COPY --chown=10001:10001 docker/caddy/static.Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=10001:10001 /workspace/apps/portal/dist /srv
ENV XDG_DATA_HOME=/tmp/caddy/data XDG_CONFIG_HOME=/tmp/caddy/config
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health/live || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
