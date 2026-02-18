FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN npm ci --workspace=shared --workspace=server

COPY shared/ shared/
COPY server/ server/

RUN npx tsc --build shared/tsconfig.json

EXPOSE 3000

CMD ["node", "--import", "tsx", "server/src/index.ts"]
