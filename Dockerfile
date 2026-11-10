FROM node:22-alpine

# OpenSSL: Prisma's schema engine. ffmpeg: cuts free video previews. A font: lets the favicon draw a
# creator's initial.
RUN apk add --no-cache openssl ffmpeg ttf-dejavu

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Optional: docker build --build-arg GIT_SHA=$(git rev-parse HEAD) shows the commit next to the version.
ARG GIT_SHA=
ENV GIT_SHA=${GIT_SHA}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
 && chmod +x docker-entrypoint.sh \
 && chown -R node:node /app/.next

# Run as the unprivileged "node" user that ships with the base image.
ENV NODE_ENV=production
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
