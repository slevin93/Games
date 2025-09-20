# Build Stage 1
FROM node:22-alpine AS build
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the entire project
COPY . ./

# Build the project
RUN npm run build

# Build Stage 2 (Production image)
FROM node:22-alpine
WORKDIR /app

# Copy package.json for runtime dependencies
COPY package.json package-lock.json ./

# Install only production deps
RUN npm ci --omit=dev

# Copy built app from build stage
COPY --from=build /app/.output/ ./

# Configure server
ENV PORT=80
ENV HOST=0.0.0.0

EXPOSE 80

CMD ["node", "/app/server/index.mjs"]
