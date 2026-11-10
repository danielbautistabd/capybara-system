FROM node:20-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm install prisma@5.22.0
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push; node src/server.js"]
