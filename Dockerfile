FROM public.ecr.aws/docker/library/node:20-slim AS base
WORKDIR /app
RUN npm config set strict-ssl false
RUN npm install -g pnpm@10.27.0 && pnpm config set strict-ssl false

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
COPY shared/package.json ./shared/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY api ./api
COPY web ./web
COPY shared ./shared
RUN pnpm run build:shared && pnpm --filter @ship/api build && pnpm --filter @ship/web build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY api/package.json ./api/
COPY web/package.json ./web/
COPY shared/package.json ./shared/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm store prune

FROM public.ecr.aws/docker/library/node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY web/package.json ./web/
COPY shared/package.json ./shared/
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/api/node_modules ./api/node_modules
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 8080

WORKDIR /app/api
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
