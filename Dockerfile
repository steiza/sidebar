# Use the official Node.js image as the base image
FROM node:23-alpine

# Set the working directory
RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY --chown=node:node package*.json index.html server.js styles.css ./

# Install dependencies
RUN npm install

# Expose the port the app runs on
EXPOSE 2025

# Command to run the application
CMD ["node", "server.js"]
