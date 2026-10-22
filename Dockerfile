# Imagen única para api, worker y mocks; el comando se elige en docker-compose.
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY core ./core
COPY api ./api
COPY worker ./worker
COPY mocks ./mocks
COPY db ./db
COPY web/dist ./web/dist
USER node
ENV NODE_ENV=production
CMD ["node", "api/src/servidor.js"]
