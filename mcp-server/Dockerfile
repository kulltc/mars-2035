FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY mcp-server/package.json mcp-server/

RUN npm ci --workspace=shared --workspace=mcp-server

COPY shared/ shared/
COPY mcp-server/ mcp-server/

RUN npx tsc --build shared/tsconfig.json

EXPOSE 3001

CMD ["node", "--import", "tsx", "mcp-server/src/index.ts"]
