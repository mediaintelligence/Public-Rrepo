FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

RUN rm -rf ./*

COPY manifest.json ./
COPY icons/ ./icons/
COPY src/ ./src/
COPY README.md ./
COPY INSTALLATION_GUIDE.md ./

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
