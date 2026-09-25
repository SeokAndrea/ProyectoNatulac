FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PLC_MODO=simulacion
ENV PLC_BRIDGE_PUERTO=4036
ENV PLC_BRIDGE_INTERVALO_MS=200

EXPOSE 4036

CMD ["node", "src/index.js"]
