# Portable image so the app can run on any host (Fly.io, Railway, a VPS, etc.).
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "start"]
