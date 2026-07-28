FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
COPY shared ../shared
EXPOSE 3004
CMD ["node", "dist/main.js"]