FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run check && npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_STORAGE=/var/data/events.sqlite
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/data && chown node:node /var/data
USER node
EXPOSE 3000
CMD ["npm", "start"]
