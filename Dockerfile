FROM node:22-alpine AS base

# Instalar dependencias necesarias
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar resto del código
COPY . .

# Generar cliente prisma y construir
RUN npx prisma generate && npm run build

# Imagen final ligera
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copiar solo lo necesario
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./package.json

# Puerto por defecto de Astro SSR
EXPOSE 4321
CMD ["npm", "run", "start"]
