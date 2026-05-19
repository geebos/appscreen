# App Store Screenshot Generator
# Node.js container with built-in static file serving

FROM node:20-alpine

LABEL maintainer="App Store Screenshot Generator"
LABEL description="Browser-based tool for creating App Store marketing screenshots"

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy application code
COPY src/ src/

# Create data directories for runtime storage
RUN mkdir -p /app/data/projects /app/data/images /app/data/fonts

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Start server
CMD ["node", "src/server/server.js"]
