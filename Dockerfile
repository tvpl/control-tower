FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
RUN addgroup -S tower && adduser -S tower -G tower && chown -R tower:tower /app
USER tower
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/public/fonts ./public/fonts
RUN addgroup -S tower && adduser -S tower -G tower && chown -R tower:tower /app
USER tower
CMD ["node", "dist/worker.mjs"]


# Isolated integration runner; never part of web/worker runtime images.
FROM build AS infra-check
RUN apk add --no-cache postgresql16-client
CMD ["node", "--import", "tsx", "scripts/verify-postgres.ts", "prepare"]

FROM runtime AS web
