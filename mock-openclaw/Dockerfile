FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./

# Expose port (internal only - no host binding)
EXPOSE 3000

# Run as non-root user
RUN addgroup -g 1001 -S openclaw && \
    adduser -S -u 1001 -G openclaw openclaw

USER openclaw

CMD ["node", "server.js"]
