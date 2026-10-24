FROM oven/bun:1-slim
WORKDIR /app
COPY dist/index.js ./index.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "index.js"]
