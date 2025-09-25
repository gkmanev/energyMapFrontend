# ---- Build (Vue) ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Create production build (dist/)
RUN npm run build

# ---- Run (Nginx) ----
FROM nginx:alpine
# Replace default site config with SPA-aware config
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
# Serve the built app
COPY --from=builder /app/dist /usr/share/nginx/html
# Nginx runs as PID 1 with its default entrypoint/cmd
