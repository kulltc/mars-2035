FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY client/package.json client/

RUN npm ci --workspace=shared --workspace=client

COPY shared/ shared/
COPY client/ client/

RUN npx tsc --build shared/tsconfig.json
RUN npm run build -w client

FROM nginx:alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
