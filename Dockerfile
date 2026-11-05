FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    CONFIG_DIR=/app/config \
    DATA_DIR=/app/data
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js config.example.yml ./
COPY public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server.js"]
