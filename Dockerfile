FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation libnss3-tools util-linux python3 python3-venv ffmpeg && rm -rf /var/lib/apt/lists/*
COPY scripts/transcription-requirements.txt /tmp/transcription-requirements.txt
RUN python3 -m venv /opt/cota-transcribe && /opt/cota-transcribe/bin/pip install --no-cache-dir -r /tmp/transcription-requirements.txt && rm /tmp/transcription-requirements.txt
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 CHROME_PATH=/usr/bin/chromium DATA_DIR=/app/data PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
