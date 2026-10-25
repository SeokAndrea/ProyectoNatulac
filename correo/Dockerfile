FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY servidor.mjs ./
CMD ["node", "servidor.mjs"]
