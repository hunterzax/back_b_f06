# ---------- Stage 1: deps (dev deps included for build) ----------
    FROM node:22-alpine AS deps
    WORKDIR /app
    
    # Install deps
    COPY package.json package-lock.json ./
    RUN npm ci
    
    # Prisma schema (needed for generate)
    COPY prisma ./prisma/
    COPY type ./type/
    COPY public ./public/
    RUN npx prisma generate
    
    # ---------- Stage 2: build ----------
    FROM node:22-alpine AS build
    WORKDIR /app
    
    # Bring node_modules and prisma from deps
    COPY --from=deps /app/node_modules ./node_modules
    COPY --from=deps /app/prisma ./prisma
    COPY --from=deps /app/public ./public
    COPY --from=deps /app/type ./type
    
    # Copy configs + source (include nest-cli.json so assets are copied)
    COPY tsconfig.json tsconfig.build.json* nest-cli.json package.json ./
    COPY src ./src
    
    # Build TS -> dist (nest-cli will copy **/*.proto to dist)
    RUN npm run build
    
    # Prune to production deps (removes dev deps after build)
    RUN npm prune --omit=dev
    
    # ---------- Stage 3: production ----------
    FROM node:22-alpine AS prod
    WORKDIR /app
    
    # Copy prod deps and built app
    COPY --from=build /app/node_modules ./node_modules
    COPY --from=build /app/dist ./dist
    COPY --from=build /app/prisma ./prisma
    COPY --from=deps /app/public ./public
    COPY --from=build /app/type ./type
    COPY package.json ./
    
    # Optional: modclean only cleans node_modules; safe but not required
    # RUN npm install -g modclean && modclean --run --ignore="*.bin/*,*.sh"
    RUN npm install -g pm2
    
    # Run docker
    COPY entrypoint.sh /app/entrypoint.sh
    RUN chmod +x /app/entrypoint.sh
    ENTRYPOINT ["/app/entrypoint.sh"]
    # Start
    # CMD ["npm", "run", "start:prod"]
    CMD ["pm2-runtime", "dist/src/main.js", "-i", "max"]
    
    