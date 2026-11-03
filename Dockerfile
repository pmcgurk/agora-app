FROM node:22-alpine

# OpenSSL: Prisma's schema engine. ffmpeg: cuts free video previews.
RUN apk add --no-cache openssl ffmpeg

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
