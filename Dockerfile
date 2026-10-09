FROM node:26-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY app/src ./src
COPY app/public ./public
COPY app/migrations ./migrations

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
