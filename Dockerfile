FROM node:18-alpine
WORKDIR /app

# Copy server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy all project files
COPY . .

EXPOSE 3001

WORKDIR /app/server
CMD ["node", "server.js"]
