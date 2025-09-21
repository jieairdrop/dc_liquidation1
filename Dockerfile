# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Expose the port (Northflank uses this for health checks)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
