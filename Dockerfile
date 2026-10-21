# Use Node 22 Debian Bookworm slim
FROM node:22-bookworm-slim

# Install Chromium, FFmpeg, fonts, and essential dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    openssl \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV NODE_ENV=production \
    DOCKER=true \
    HOST=0.0.0.0 \
    PORT=10000 \
    FLOW_HEADLESS=true \
    FLOW_EMBEDDED_WORKER=true \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY package.json ./

# Create data and profiles directories
RUN mkdir -p /app/data /app/profiles && chmod 700 /app/data /app/profiles

# Expose default ports (10000 for Render, 8787 for local, 7860 for Hugging Face)
EXPOSE 10000 8787 7860

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT:-10000}/healthz || exit 1

# Launch the server
CMD ["node", "src/server.js"]
