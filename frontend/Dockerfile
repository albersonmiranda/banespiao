# Stage 1: Build the Angular application
FROM node:24.19.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=production

# Stage 2: Serve with Nginx
FROM nginx:1.30.4-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY default.conf.template /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=^(BACKEND_URL|NGINX_RESOLVER)$ BACKEND_URL=http://backend.railway.internal:8000 NGINX_RESOLVER=127.0.0.11
EXPOSE 80
