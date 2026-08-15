FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the backend source code
COPY . .

# Expose port 5000 for the Express server
EXPOSE 5000

# Start the server with nodemon for live-reloading
CMD ["node", "src/server.js"]