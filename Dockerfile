# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Mi Cursada — imagen multi-stage sobre Next.js standalone.
# La carpeta datos/ NO va adentro de la imagen: se monta como
# volumen en runtime (ver docker-compose.yml).
# ─────────────────────────────────────────────────────────────
ARG NODE_VERSION=22-alpine

# ── deps ─────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# Sólo los manifests: así la capa de npm ci se cachea mientras no cambien.
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ──────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ puede no existir en un clon limpio; el COPY del runner la necesita.
RUN mkdir -p public
# El build no necesita datos/: el código tolera su ausencia (lib/datos-locales.ts
# devuelve vacío si los archivos no están).
RUN npm run build

# ── runner ───────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    CURSADA_DATOS_DIR=/app/datos

# Usuario sin privilegios.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Punto de montaje de los datos, con dueño correcto para que el server
# pueda ESCRIBIR los overlays (horarios, avisos, materias-extra, etc.).
RUN mkdir -p /app/datos && chown -R nextjs:nodejs /app/datos

USER nextjs
EXPOSE 3000
VOLUME ["/app/datos"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
