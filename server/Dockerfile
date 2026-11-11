# Poco Loco game server for Tequity (Xanadu). Build from the repo root:
#   docker build -f server/Dockerfile -t ghcr.io/slotify/games/<provider>:v1.0.0 .
# No npm dependencies: only math/ (the game maths) and server/ are copied in.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production ENVIRONMENT=production PORT=8080
COPY math/ math/
COPY server/package.json server/package.json
COPY server/src/ server/src/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server/src/index.mjs"]
