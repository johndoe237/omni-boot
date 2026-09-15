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
# This bundle contains two independent roots: MITM validates target-domain
# certificates, while TRANSPORT validates the HTTPS proxy listener. They are
# concatenated only for Node's trust-store format; the CA files remain separate.
RUN cat /app/certs/Flaretunnel-MITM-CA.crt /app/certs/Flaretunnel-TRANSPORT-CA.crt > /app/certs/omni-trust-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/omni-trust-bundle.pem
RUN chmod +x ./docker-entrypoint.sh
RUN npm run build
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
