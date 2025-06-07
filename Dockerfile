# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies required for Playwright
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, including devDependencies needed for the build process
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Prune devDependencies after build to reduce size of node_modules for production
RUN npm prune --production

# Stage 2: Production image
FROM mcr.microsoft.com/playwright:v1.52.0-noble

# Set environment to production
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy built application, production node_modules from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Expose the port the app runs on
EXPOSE 3002

# Define the command to run the application
CMD ["npm", "start"]