# Stage 1: Builder
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
# Ensures that we leverage Docker's cache for dependencies
COPY package*.json ./

# Install all dependencies, including devDependencies needed for the build process
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the TypeScript code
# This command should compile TypeScript to JavaScript, typically into a 'dist' folder
RUN npm run build

# Prune devDependencies after build to reduce size of node_modules for production
RUN npm prune --production

# Stage 2: Production image
FROM node:18-alpine

# Set environment to production
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy built application (e.g., dist folder) and production node_modules from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./

# Expose the port the app runs on.
# Your application listens on process.env.PORT || 3000.
# This EXPOSE instruction is for documentation; the actual port is set by the app
# and mapped in docker-compose.yml.
EXPOSE 3002

# Define the command to run the application
# This should correspond to the "start" script in your package.json (e.g., "node dist/index.js")
CMD ["npm", "start"]
