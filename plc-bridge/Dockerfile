FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
# Copia por defecto; en el servidor docker-compose.yml monta encima el
# bridge.conf del proyecto, asi un cambio solo pide reiniciar, no reconstruir.
# Sin ENV aqui: una variable de entorno le ganaria a bridge.conf.
COPY bridge.conf ./bridge.conf

EXPOSE 4036

CMD ["node", "src/index.js"]
