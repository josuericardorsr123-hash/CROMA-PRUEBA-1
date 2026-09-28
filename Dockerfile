# syntax=docker/dockerfile:1.7
# ── Construcción ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY tsconfig.base.json tsconfig.json vitest.config.ts ./
RUN npm ci --no-audit --no-fund
RUN npm run build

# ── Ejecución ───────────────────────────────────────────────────────────────
# LibreOffice Writer (conversión a PDF y paginación real del índice), poppler
# (lectura y rasterizado), qpdf (segmentación) y Liberation (métrica de Times New Roman).
FROM node:22-bookworm-slim AS ejecucion
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui poppler-utils qpdf fonts-liberation fonts-dejavu-core ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    EM_DIR_DATOS=/datos \
    EM_DIR_WEB=/app/web \
    PORT=8080 \
    HOME=/tmp
WORKDIR /app
COPY --from=construccion /app/dist/api.mjs /app/dist/em.mjs ./
COPY --from=construccion /app/apps/web/dist ./web
RUN groupadd -r em && useradd -r -g em -d /app em && mkdir -p /datos && chown em:em /datos \
 && printf '#!/bin/sh\nexec node --disable-warning=ExperimentalWarning /app/em.mjs "$@"\n' > /usr/local/bin/em && chmod +x /usr/local/bin/em
USER em
VOLUME ["/datos"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--disable-warning=ExperimentalWarning", "/app/api.mjs"]
