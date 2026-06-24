FROM node:24-slim AS build

WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json vitest.config.ts ./
COPY packages ./packages
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
