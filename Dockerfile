FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

COPY . .

EXPOSE 10000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
