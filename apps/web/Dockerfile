FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
COPY shared ../shared
EXPOSE 3000
CMD ["node", "dist/main.js"]