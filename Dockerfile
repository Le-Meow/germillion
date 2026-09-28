FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs game.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node data/*.json data/*.txt ./data/
RUN mkdir -p var && chown node:node var
ENV HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
