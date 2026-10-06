# ---------- 构建阶段：node:20-alpine 安装依赖并执行 Angular 生产构建（零错误） ----------
FROM node:20-alpine AS builder

WORKDIR /app

# 先只拷贝依赖清单，利用 Docker 层缓存加速重复构建
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# 再拷贝源码与 Angular 构建配置
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY public ./public
COPY src ./src

# npm run build = ng build（含 AOT 模板类型检查，必须零错误）
RUN npm run build

# ---------- 运行阶段：nginx:alpine 托管静态产物 ----------
FROM nginx:alpine AS runner

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*
# Angular 17+ 的 application builder 产出目录为 dist/<项目名>/browser
# 本项目 angular.json 的 outputPath 为 dist/gbbrewhouse，浏览器产物在 dist/gbbrewhouse/browser
COPY --from=builder /app/dist/gbbrewhouse/browser /usr/share/nginx/html

# 权限归一化：COPY 以 root 执行会原样保留宿主文件权限位，若交付目录里的静态资源
# （如 public/favicon.svg）是 0600，nginx worker（nginx 用户）读不到就会返回 403。
# 这里统一放开读权限与目录遍历权限，保证静态资源一定可被 worker 读取。
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
