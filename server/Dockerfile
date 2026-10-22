# The backup API (server/main.ts) for Railway. Build from the repo root:
#   docker build -f server/Dockerfile .
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY server ./server
# progress.db lives on a Railway volume mounted at /data
ENV DB_PATH=/data/progress.db NODE_NO_WARNINGS=1
CMD ["node", "server/main.ts"]
