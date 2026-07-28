FROM node:18-alpine
WORKDIR /app
RUN mkdir -p /app/shared
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
EXPOSE 3002
CMD ["node", "src/main.js"]