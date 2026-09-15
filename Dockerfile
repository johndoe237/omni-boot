FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
RUN npm install --global omniroute@3.8.49
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY config ./config
COPY certs/Flaretunnel-MITM-CA.crt /app/certs/Flaretunnel-MITM-CA.crt
COPY certs/Flaretunnel-TRANSPORT-CA.crt /app/certs/Flaretunnel-TRANSPORT-CA.crt
COPY docker-entrypoint.sh ./docker-entrypoint.sh
ENV NODE_EXTRA_CA_CERTS=/app/certs/Flaretunnel-MITM-CA.crt
RUN chmod +x ./docker-entrypoint.sh
RUN npm run build
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
