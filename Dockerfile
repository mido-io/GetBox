# Dockerfile - production-ready
FROM node:20-bullseye-slim

# Install dependencies needed by some native modules
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    git \
    python3 \
    build-essential \
 && ln -sf /usr/bin/python3 /usr/bin/python \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./

# Install deps (ffmpeg-static and yt-dlp-exec will provide binaries)
RUN npm ci --production

# copy app
COPY . .

# build next
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
