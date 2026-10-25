FROM node:20-alpine
WORKDIR /app
COPY server.js ./
COPY web ./web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
