# Dockerfile for Lumina admin unified backend
FROM node:20-slim

WORKDIR /app/back_end/admin_backend

# Copy package manifest and install production dependencies first for cache efficiency
COPY back_end/admin_backend/package.json ./
RUN npm install --production

# Copy the rest of the repository into the image
WORKDIR /app
COPY . .
WORKDIR /app/back_end/admin_backend

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "src/unifiedServer.js"]
