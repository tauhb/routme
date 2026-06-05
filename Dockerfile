FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY src/dashboard ./src/dashboard
RUN mkdir -p data && \
    echo '{"accounts":[]}' > data/accounts.json && \
    echo '{"logs":[]}' > data/logs.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
