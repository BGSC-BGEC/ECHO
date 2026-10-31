# Game server image. Build from repo root: docker build -f deploy/Dockerfile -t echo-server .
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev --ignore-scripts
COPY packages/shared packages/shared
COPY server/src server/src
COPY server/tsconfig.json server/
ENV NODE_ENV=production PORT=8787 ECHO_DB=/data/echo.db
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "--import", "tsx", "server/src/main.ts"]
