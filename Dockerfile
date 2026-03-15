FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g npm@11.11.0

COPY package.json package-lock.json ./
RUN npm ci

COPY public ./public
COPY src ./src

RUN npm run build

FROM nginx:1.29-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80
