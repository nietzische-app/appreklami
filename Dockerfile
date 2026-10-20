# Render API (Express + Remotion CLI + headless Chrome + ffmpeg). Not for Netlify - run it on a VPS (Hetzner), Fly.io, Railway...
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates fonts-dejavu-core fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libgbm1 libcups2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .
RUN npx remotion browser ensure && mkdir -p public/renders storage/jobs

ENV NODE_ENV=production PORT=3000 DEFAULT_PLAN=free \
    CORS_ORIGIN=https://admirable-sundae-231bb4.netlify.app
EXPOSE 3000
CMD ["npm", "start"]
